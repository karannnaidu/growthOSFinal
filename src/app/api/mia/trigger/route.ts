export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runSkill } from '@/lib/skills-engine'
import { createMiaDecision } from '@/lib/knowledge/intelligence'
import { callModel } from '@/lib/model-client'
import { loadSkill } from '@/lib/skill-loader'

// ---------------------------------------------------------------------------
// POST /api/mia/trigger — Mia's LLM-driven orchestration
//
// 1. Run Scout health-check
// 2. Gather context (platforms, health-check output, user instructions)
// 3. Call Gemini Flash with Mia's skill as system prompt
// 4. Parse Mia's dispatch decisions
// 5. Queue skills via pending_chain for chain-processor
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { brandId?: string; userMessage?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { brandId, userMessage } = body
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  const admin = createServiceClient()
  const { data: brand } = await admin.from('brands').select('id, owner_id, name').eq('id', brandId).single()
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  if (brand.owner_id !== user.id) {
    const { data: member } = await admin.from('brand_members').select('brand_id').eq('brand_id', brandId).eq('user_id', user.id).single()
    if (!member) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // 1. Run Scout health-check
  let healthOutput: Record<string, unknown> = {}
  let healthResult: { id: string; status: string; error?: string } | null = null
  try {
    const result = await runSkill({
      brandId,
      skillId: 'health-check',
      triggeredBy: 'mia',
      additionalContext: { source: userMessage ? 'user_request' : 'manual_trigger' },
    })
    healthResult = { id: result.id, status: result.status, error: result.error }
    healthOutput = result.output
  } catch (err) {
    console.error('[mia/trigger] health-check failed:', err)
  }

  // 2. Gather context
  const { data: creds } = await admin.from('credentials').select('platform').eq('brand_id', brandId)
  const platforms = (creds ?? []).map(c => c.platform)

  const { data: instructions } = await admin.from('knowledge_nodes')
    .select('properties')
    .eq('brand_id', brandId)
    .eq('node_type', 'instruction')
    .eq('is_active', true)

  const userInstructions = (instructions ?? [])
    .map(n => (n.properties as Record<string, unknown>)?.text as string)
    .filter(Boolean)

  // Check what already ran today
  const todayStart = `${new Date().toISOString().split('T')[0]}T00:00:00.000Z`
  const { data: todayRuns } = await admin.from('skill_runs')
    .select('skill_id')
    .eq('brand_id', brandId)
    .gte('created_at', todayStart)
    .eq('status', 'completed')
  const alreadyRan = (todayRuns ?? []).map(r => r.skill_id)

  // 3. Load Mia's skill and call LLM for dispatch decisions
  let miaSkillPrompt = ''
  try {
    const miaSkill = await loadSkill('mia-manager')
    miaSkillPrompt = miaSkill.sections.systemPrompt + '\n' + (miaSkill.sections.workflow || '')
  } catch {
    // Fallback if skill not found
    miaSkillPrompt = 'You are Mia, an AI marketing manager. Decide which skills to dispatch based on the health-check results.'
  }

  const userPrompt = [
    `## Brand: ${brand.name}`,
    `## Connected Platforms: ${platforms.length > 0 ? platforms.join(', ') : 'None'}`,
    `## Brand DNA: Available (onboarding completed)`,
    `## Health-Check Results:\n${JSON.stringify(healthOutput, null, 2).slice(0, 2000)}`,
    `## Skills Already Ran Today: ${alreadyRan.length > 0 ? alreadyRan.join(', ') : 'None'}`,
    userInstructions.length > 0 ? `## Active User Instructions:\n${userInstructions.map(i => '- ' + i).join('\n')}` : '',
    userMessage ? `## User Request: ${userMessage}` : '## Trigger: Daily review cycle',
    '',
    'Based on the above, decide which skills to dispatch. Return ONLY a JSON object with this structure:',
    '{"skills_to_run": ["skill-id-1", "skill-id-2"], "reasoning": "brief explanation", "message_to_user": "what to tell the user"}',
    'Only include skills that would be useful given the available data. Do not include skills that already ran today.',
  ].filter(Boolean).join('\n')

  let skillsToRun: string[] = []
  let reasoning = ''
  let messageToUser = ''

  try {
    const result = await callModel({
      model: 'gemini-2.5-flash',
      provider: 'google',
      systemPrompt: miaSkillPrompt,
      userPrompt,
      maxTokens: 1024,
      temperature: 0.3,
    })

    // Parse response
    let text = result.content.trim()
    const fenceMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/)
    if (fenceMatch) text = fenceMatch[1]!.trim()

    try {
      const parsed = JSON.parse(text) as { skills_to_run?: string[]; reasoning?: string; message_to_user?: string }
      skillsToRun = parsed.skills_to_run ?? []
      reasoning = parsed.reasoning ?? ''
      messageToUser = parsed.message_to_user ?? ''
    } catch {
      // If JSON parse fails, try to extract skill IDs from text
      console.warn('[mia/trigger] Failed to parse Mia LLM response, using fallback')
      skillsToRun = ['seo-audit', 'competitor-scan', 'ad-copy']
      reasoning = 'Fallback: standard daily cycle'
      messageToUser = 'Running standard daily review.'
    }
  } catch (err) {
    console.error('[mia/trigger] Mia LLM call failed:', err)
    skillsToRun = ['seo-audit', 'competitor-scan', 'ad-copy']
    reasoning = 'Fallback: LLM unavailable, running standard cycle'
    messageToUser = 'Running standard daily review.'
  }

  // Filter out already-ran skills
  const alreadyRanSet = new Set(alreadyRan)
  const filtered = skillsToRun.filter(s => !alreadyRanSet.has(s))

  // 4. Create mia_decision and queue pending_chain
  if (filtered.length > 0) {
    await createMiaDecision(brandId, {
      decision: 'auto_run',
      reasoning: reasoning || `Dispatching ${filtered.length} skills: ${filtered.join(', ')}`,
      follow_up_skills: filtered,
      pending_chain: filtered,
      target_agent: 'mia',
    })
  }

  return NextResponse.json({
    success: true,
    healthCheck: healthResult,
    queuedSkills: filtered,
    reasoning,
    message: messageToUser || (healthResult?.status === 'completed'
      ? `Health check complete. ${filtered.length} follow-up skills queued.`
      : `Health check ${healthResult?.status ?? 'skipped'}. ${filtered.length} follow-up skills queued.`),
  })
}

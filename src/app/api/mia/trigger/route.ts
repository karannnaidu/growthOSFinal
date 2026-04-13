export const maxDuration = 60 // Allow up to 60s for LLM call

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runSkill } from '@/lib/skills-engine'
import { createMiaDecision } from '@/lib/knowledge/intelligence'

// ---------------------------------------------------------------------------
// POST /api/mia/trigger — trigger Mia's daily review cycle
//
// 1. Runs health-check synchronously (Scout diagnoses the brand).
// 2. Queues a daily cycle of skills as pending_chain for the chain-processor
//    cron to pick up. Skills are selected based on available data — if Meta
//    is connected, ad skills run; if Brand DNA exists, brand skills run; etc.
// ---------------------------------------------------------------------------

/** Skills that only need Brand DNA / knowledge graph (no platform creds). */
const BRAND_DNA_SKILLS = [
  'seo-audit',           // hugo — always useful with Brand DNA
  'brand-voice-extractor', // aria — extracts/refines brand voice
  'competitor-scan',     // echo — uses competitor intel tools (env vars)
  'ad-copy',             // aria — generates ad copy from Brand DNA
]

/** Skills that benefit from Meta Ads connection. */
const META_SKILLS = [
  'creative-fatigue-detector', // aria — analyzes ad creative performance
]

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { brandId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { brandId } = body
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  // Verify access
  const admin = createServiceClient()
  const { data: brand } = await admin.from('brands').select('id, owner_id').eq('id', brandId).single()
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  if (brand.owner_id !== user.id) {
    const { data: member } = await admin.from('brand_members').select('brand_id').eq('brand_id', brandId).eq('user_id', user.id).single()
    if (!member) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // 1. Run health-check synchronously
  let healthResult: { id: string; status: string; error?: string } | null = null
  try {
    const result = await runSkill({
      brandId,
      skillId: 'health-check',
      triggeredBy: 'mia',
      additionalContext: { source: 'manual_trigger' },
    })
    healthResult = { id: result.id, status: result.status, error: result.error }
  } catch (err) {
    console.error('[mia/trigger] health-check failed:', err)
  }

  // 2. Build a daily cycle pending_chain based on available data
  const pendingChain: string[] = [...BRAND_DNA_SKILLS]

  // Check which platforms are connected
  const { data: creds } = await admin
    .from('credentials')
    .select('platform')
    .eq('brand_id', brandId)

  const platforms = new Set((creds ?? []).map(c => c.platform))

  if (platforms.has('meta')) {
    pendingChain.push(...META_SKILLS)
  }

  // Filter out skills that already ran today (avoid duplicates)
  const todayStart = `${new Date().toISOString().split('T')[0]}T00:00:00.000Z`
  const { data: todayRuns } = await admin
    .from('skill_runs')
    .select('skill_id')
    .eq('brand_id', brandId)
    .gte('created_at', todayStart)
    .eq('status', 'completed')

  const alreadyRan = new Set((todayRuns ?? []).map(r => r.skill_id))
  const filtered = pendingChain.filter(s => !alreadyRan.has(s))

  // 3. Create a mia_decision node with the pending chain for the chain-processor
  if (filtered.length > 0) {
    await createMiaDecision(brandId, {
      decision: 'auto_run',
      reasoning: `Daily cycle: dispatching ${filtered.length} skills (${filtered.join(', ')}).`,
      follow_up_skills: filtered,
      pending_chain: filtered,
      target_agent: 'mia',
    })
  }

  return NextResponse.json({
    success: true,
    healthCheck: healthResult,
    queuedSkills: filtered,
    message: healthResult?.status === 'completed'
      ? `Health check complete. ${filtered.length} follow-up skills queued.`
      : `Health check ${healthResult?.status ?? 'skipped'}. ${filtered.length} follow-up skills queued.`,
  })
}

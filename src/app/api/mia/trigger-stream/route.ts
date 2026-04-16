// src/app/api/mia/trigger-stream/route.ts

export const maxDuration = 300

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runSkill, type SkillProgressEvent } from '@/lib/skills-engine'
import { createMiaDecision } from '@/lib/knowledge/intelligence'
import { callModel } from '@/lib/model-client'
import { loadSkill } from '@/lib/skill-loader'

export async function POST(request: NextRequest): Promise<Response> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 })
  }

  const body = await request.json() as { brandId?: string; userMessage?: string }
  const { brandId, userMessage } = body
  if (!brandId) {
    return new Response(JSON.stringify({ error: 'brandId required' }), { status: 400 })
  }

  const admin = createServiceClient()
  const { data: brand } = await admin.from('brands').select('id, owner_id, name').eq('id', brandId).single()
  if (!brand) {
    return new Response(JSON.stringify({ error: 'Brand not found' }), { status: 404 })
  }
  if (brand.owner_id !== user.id) {
    const { data: member } = await admin.from('brand_members').select('brand_id').eq('brand_id', brandId).eq('user_id', user.id).single()
    if (!member) {
      return new Response(JSON.stringify({ error: 'Access denied' }), { status: 403 })
    }
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch { /* stream may be closed */ }
      }

      try {
        // 1. Run health-check with progress streaming
        send('status', { agent: 'scout', message: 'Starting health check...', phase: 'health-check' })

        let healthOutput: Record<string, unknown> = {}
        const healthResult = await runSkill(
          { brandId, skillId: 'health-check', triggeredBy: 'mia', additionalContext: { source: userMessage ? 'user_request' : 'manual_trigger' } },
          (event) => send('progress', event as unknown as Record<string, unknown>),
        )
        healthOutput = healthResult.output

        send('result', { agent: 'scout', skill: 'health-check', status: healthResult.status, score: healthOutput.overall_score })

        // 2. Mia decides what to do next
        send('status', { agent: 'mia', message: 'Reviewing health-check results...', phase: 'decision' })

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

        const todayStart = `${new Date().toISOString().split('T')[0]}T00:00:00.000Z`
        const { data: todayRuns } = await admin.from('skill_runs')
          .select('skill_id').eq('brand_id', brandId).gte('created_at', todayStart).eq('status', 'completed')
        const alreadyRan = (todayRuns ?? []).map(r => r.skill_id)

        // Load Mia's skill for LLM decision
        let miaPrompt = 'You are Mia, an AI marketing manager. Decide which skills to dispatch.'
        try {
          const miaSkill = await loadSkill('mia-manager')
          const fromSections = (miaSkill.sections.systemPrompt + '\n' + (miaSkill.sections.workflow || '')).trim()
          miaPrompt = fromSections.length > 200 ? fromSections : miaSkill.rawMarkdown.replace(/^---[\s\S]*?---\s*/m, '').trim()
        } catch { /* use fallback */ }

        const userPrompt = [
          `## Brand: ${brand.name}`,
          `## Platforms: ${platforms.length > 0 ? platforms.join(', ') : 'None'}`,
          `## Health-Check:\n${JSON.stringify(healthOutput, null, 2).slice(0, 2000)}`,
          `## Already Ran: ${alreadyRan.length > 0 ? alreadyRan.join(', ') : 'None'}`,
          userInstructions.length > 0 ? `## Instructions:\n${userInstructions.map(i => '- ' + i).join('\n')}` : '',
          userMessage ? `## User Request: ${userMessage}` : '## Trigger: Daily review',
          '\nReturn JSON: {"skills_to_run":["skill-id"],"reasoning":"...","message_to_user":"..."}',
        ].filter(Boolean).join('\n')

        const llmResult = await callModel({
          model: 'gemini-2.5-flash', provider: 'google',
          systemPrompt: miaPrompt, userPrompt, maxTokens: 1024, temperature: 0.3,
        })

        let skillsToRun: string[] = []
        let reasoning = ''
        let messageToUser = ''

        try {
          let text = llmResult.content.trim()
          const fm = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/)
          if (fm) text = fm[1]!.trim()
          const parsed = JSON.parse(text)
          skillsToRun = parsed.skills_to_run ?? []
          reasoning = parsed.reasoning ?? ''
          messageToUser = parsed.message_to_user ?? ''
        } catch {
          skillsToRun = ['seo-audit', 'competitor-scan', 'ad-copy']
          reasoning = 'Fallback: standard cycle'
          messageToUser = 'Running standard daily review.'
        }

        const filtered = skillsToRun.filter(s => !alreadyRan.includes(s))

        send('decision', {
          agent: 'mia',
          skills: filtered,
          reasoning,
          message: messageToUser,
        })

        // 3. Run each skill with streaming
        for (const skillId of filtered) {
          send('status', { agent: 'mia', message: `Dispatching ${skillId}...`, phase: 'dispatch' })

          try {
            const result = await runSkill(
              { brandId, skillId, triggeredBy: 'mia', additionalContext: { source: 'mia_cycle', health_check_output: healthOutput } },
              (event) => send('progress', event as unknown as Record<string, unknown>),
            )
            send('result', { agent: result.modelUsed, skill: skillId, status: result.status })
          } catch (err) {
            send('error', { skill: skillId, message: err instanceof Error ? err.message : 'Failed' })
          }
        }

        // Store decision
        if (filtered.length > 0) {
          await createMiaDecision(brandId, {
            decision: 'auto_run', reasoning, follow_up_skills: filtered,
            pending_chain: [], target_agent: 'mia',
          })
        }

        send('complete', { totalSkills: filtered.length, message: messageToUser })
      } catch (err) {
        send('error', { message: err instanceof Error ? err.message : 'Mia trigger failed' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  })
}

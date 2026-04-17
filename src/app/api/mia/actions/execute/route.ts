// src/app/api/mia/actions/execute/route.ts

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runSkill } from '@/lib/skills-engine'
import { loadSkill } from '@/lib/skill-loader'
import { callModel } from '@/lib/model-client'
import {
  type MiaAction,
  type SkillAction,
  validateAndSort,
} from '@/lib/mia-actions'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sseEvent(data: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
}

function errorSSE(code: string, message: string): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(sseEvent({ type: 'error', code, message }))
      controller.close()
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

// ---------------------------------------------------------------------------
// POST /api/mia/actions/execute
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  // 1. Auth
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return errorSSE('UNAUTHORIZED', 'Not authenticated')

  // 2. Parse body
  let body: { brandId?: string; conversationId?: string; actions?: MiaAction[] }
  try {
    body = await request.json()
  } catch {
    return errorSSE('VALIDATION_ERROR', 'Invalid JSON body')
  }

  const { brandId, conversationId, actions } = body
  if (!brandId || !conversationId || !actions || !Array.isArray(actions)) {
    return errorSSE('VALIDATION_ERROR', 'brandId, conversationId, and actions are required')
  }

  // 3. Brand access check
  const admin = createServiceClient()
  const { data: brand } = await admin
    .from('brands')
    .select('id, owner_id, name')
    .eq('id', brandId)
    .single()

  if (!brand) return errorSSE('NOT_FOUND', 'Brand not found')

  if (brand.owner_id !== user.id) {
    const { data: member } = await admin
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single()
    if (!member) return errorSSE('FORBIDDEN', 'Access denied')
  }

  // 4. Validate and sort actions
  const skillActions = actions.filter((a): a is SkillAction => a.type === 'skill')
  const validation = validateAndSort(skillActions)
  if (!validation.valid) {
    return errorSSE('VALIDATION_ERROR', validation.errors.join('; '))
  }

  // 5. Validate all skills exist and compute total credits
  let totalCreditsNeeded = 0
  for (const action of validation.sorted) {
    if (action.type !== 'skill') continue
    try {
      const skill = await loadSkill(action.skillId)
      totalCreditsNeeded += skill.credits
    } catch {
      return errorSSE('NOT_FOUND', `Skill "${action.skillId}" not found`)
    }
  }

  // 6. Pre-check wallet balance
  const { data: wallet } = await admin
    .from('wallets')
    .select('balance, free_credits, free_credits_expires_at')
    .eq('brand_id', brandId)
    .single()

  if (wallet && totalCreditsNeeded > 0) {
    const freeAvail =
      wallet.free_credits_expires_at && new Date(wallet.free_credits_expires_at) > new Date()
        ? (wallet.free_credits ?? 0)
        : 0
    const totalAvail = (wallet.balance ?? 0) + freeAvail
    if (totalAvail < totalCreditsNeeded) {
      return errorSSE(
        'INSUFFICIENT_CREDITS',
        `Need ${totalCreditsNeeded} credits, have ${totalAvail}`,
      )
    }
  }

  // 7. Stream execution
  const stream = new ReadableStream({
    async start(controller) {
      const outputs = new Map<string, Record<string, unknown>>()
      const failed = new Set<string>()
      const errors = new Map<string, string>()

      for (const action of validation.sorted) {
        if (action.type !== 'skill') continue

        // Check if any dependency failed
        const depFailed = action.dependsOn.some((dep) => failed.has(dep))
        if (depFailed) {
          failed.add(action.id)
          const skipMsg = 'Skipped — a dependency failed'
          errors.set(action.id, skipMsg)
          controller.enqueue(
            sseEvent({
              type: 'action_failed',
              actionId: action.id,
              skillId: action.skillId,
              agentId: action.agentId,
              error: skipMsg,
            }),
          )
          continue
        }

        // Emit start
        controller.enqueue(
          sseEvent({
            type: 'action_start',
            actionId: action.id,
            skillId: action.skillId,
            agentId: action.agentId,
          }),
        )

        // Build additional context from dependency outputs
        const depContext: Record<string, unknown> = {}
        for (const depId of action.dependsOn) {
          const depOutput = outputs.get(depId)
          if (depOutput) depContext[`_from_${depId}`] = depOutput
        }

        try {
          const result = await runSkill({
            brandId,
            skillId: action.skillId,
            triggeredBy: 'mia',
            additionalContext:
              Object.keys(depContext).length > 0 ? depContext : undefined,
          })

          if (result.status === 'completed') {
            outputs.set(action.id, result.output)
            controller.enqueue(
              sseEvent({
                type: 'action_complete',
                actionId: action.id,
                skillId: action.skillId,
                agentId: action.agentId,
                output: result.output,
                creditsUsed: result.creditsUsed,
              }),
            )
          } else {
            failed.add(action.id)
            const errMsg = result.error ?? 'Skill run failed'
            errors.set(action.id, errMsg)
            controller.enqueue(
              sseEvent({
                type: 'action_failed',
                actionId: action.id,
                skillId: action.skillId,
                agentId: action.agentId,
                error: errMsg,
              }),
            )
          }
        } catch (err) {
          failed.add(action.id)
          const errMsg = err instanceof Error ? err.message : 'Unexpected error'
          errors.set(action.id, errMsg)
          controller.enqueue(
            sseEvent({
              type: 'action_failed',
              actionId: action.id,
              skillId: action.skillId,
              agentId: action.agentId,
              error: errMsg,
            }),
          )
        }
      }

      // 8. Generate summary via LLM
      const outputSummary = Array.from(outputs.entries())
        .map(([id, out]) => {
          const action = validation.sorted.find((a) => a.id === id)
          return `## ${action?.type === 'skill' ? action.skillId : id}\n${JSON.stringify(out, null, 2)}`
        })
        .join('\n\n')

      const failedSummary =
        failed.size > 0
          ? `\n\nFailed actions:\n${Array.from(failed)
              .map((id) => {
                const action = validation.sorted.find((a) => a.id === id)
                const skillId = action?.type === 'skill' ? action.skillId : id
                const agentId = action?.type === 'skill' ? action.agentId : 'unknown'
                const err = errors.get(id) ?? 'Unknown error'
                return `- ${skillId} (${agentId}): ${err}`
              })
              .join('\n')}`
          : ''

      let summaryContent: string
      try {
        const summaryResult = await callModel({
          model: 'claude-sonnet-4-6',
          provider: 'anthropic',
          systemPrompt: `You are Mia, an AI marketing manager for ${brand.name ?? 'the brand'}. Summarize the skill results below for the user. Be concise, highlight key findings and next steps. If any actions failed, name the skill and the actual error (paraphrased if noisy) and suggest a next step. Do NOT include action blocks.`,
          userPrompt: `Skill results:\n\n${outputSummary}${failedSummary}\n\nProvide a concise summary for the user.`,
          maxTokens: 512,
          temperature: 0.5,
        })
        summaryContent = summaryResult.content
      } catch {
        summaryContent =
          outputs.size > 0
            ? 'Skills completed. Check the results above for details.'
            : 'No skills completed successfully.'
      }

      // Store summary as conversation message
      try {
        await admin.from('conversation_messages').insert({
          conversation_id: conversationId,
          role: 'assistant',
          content: summaryContent,
        })
      } catch {
        // Non-fatal
      }

      controller.enqueue(sseEvent({ type: 'summary', content: summaryContent, conversationId }))
      controller.enqueue(sseEvent({ type: 'done' }))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

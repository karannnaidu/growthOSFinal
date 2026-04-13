import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { callModel } from '@/lib/model-client'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Mia always uses Claude Sonnet (premium). */
const MIA_CHAT_MODEL = 'claude-sonnet-4-6'
const MIA_CHAT_PROVIDER = 'anthropic'

/** Limit conversation history to avoid token overflows. */
const MAX_HISTORY_MESSAGES = 20

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const MIA_CHAT_SYSTEM_PROMPT = `You are Mia, the AI marketing manager for {brandName}.

Your personality:
- Warm, confident, proactive
- You speak like a senior marketing strategist who genuinely cares about the brand
- You reference specific data and agent findings when available
- You suggest actions using the available skills when relevant

Brand context:
- Name: {brandName}
- Domain: {domain}
- Focus: {focusAreas}
- Plan: {plan}

Recent activity:
{recentSkillRunsSummary}

Available actions you can suggest:
- Run any skill (e.g., "Let me run a health check" → triggers health-check skill)
- Review pending items
- Check specific metrics

When suggesting actions, format them as:
[ACTION:skill-id] to indicate a triggerable skill

Keep responses concise but insightful. You're a busy marketing manager, not a verbose chatbot.`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSystemPrompt(
  brandName: string,
  domain: string,
  focusAreas: string,
  plan: string,
  recentSkillRunsSummary: string,
): string {
  return MIA_CHAT_SYSTEM_PROMPT
    .replace(/{brandName}/g, brandName)
    .replace(/{domain}/g, domain)
    .replace(/{focusAreas}/g, focusAreas)
    .replace(/{plan}/g, plan)
    .replace(/{recentSkillRunsSummary}/g, recentSkillRunsSummary)
}

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
      'Connection': 'keep-alive',
    },
  })
}

// ---------------------------------------------------------------------------
// POST /api/mia/chat
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  // 1. Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return errorSSE('UNAUTHORIZED', 'Not authenticated')

  // 2. Parse body
  let body: { brandId?: string; conversationId?: string; message?: string }
  try {
    body = await request.json()
  } catch {
    return errorSSE('VALIDATION_ERROR', 'Invalid JSON body')
  }

  const { brandId, conversationId: incomingConversationId, message } = body

  if (!brandId || typeof brandId !== 'string') {
    return errorSSE('VALIDATION_ERROR', 'brandId is required')
  }
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return errorSSE('VALIDATION_ERROR', 'message is required')
  }

  // 3. Brand access check
  const admin = createServiceClient()
  const { data: brand } = await admin
    .from('brands')
    .select('id, owner_id, name, domain, focus_areas, plan')
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

  // 4. Load or create conversation
  let conversationId: string

  if (incomingConversationId) {
    // Verify the conversation exists and belongs to this brand/user
    const { data: existingConv } = await admin
      .from('conversations')
      .select('id')
      .eq('id', incomingConversationId)
      .eq('brand_id', brandId)
      .single()

    if (!existingConv) return errorSSE('NOT_FOUND', 'Conversation not found')
    conversationId = existingConv.id as string
  } else {
    // Create a new conversation (service client bypasses RLS)
    const { data: newConv, error: convError } = await admin
      .from('conversations')
      .insert({
        brand_id: brandId,
        title: message.slice(0, 100),
      })
      .select('id')
      .single()

    if (convError || !newConv) {
      return errorSSE('INTERNAL_ERROR', 'Failed to create conversation')
    }
    conversationId = newConv.id as string
  }

  // 5. Load conversation history
  const { data: history } = await admin
    .from('conversation_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(MAX_HISTORY_MESSAGES)

  const conversationHistory = (history ?? []) as Array<{ role: string; content: string }>

  // 6. Store user message
  await admin.from('conversation_messages').insert({
    conversation_id: conversationId,
    role: 'user',
    content: message.trim(),
  })

  // 7. Build recent skill runs summary for Mia's context
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: recentRuns } = await supabase
    .from('skill_runs')
    .select('skill_id, status, triggered_by, created_at, agent')
    .eq('brand_id', brandId)
    .gte('created_at', twentyFourHoursAgo)
    .order('created_at', { ascending: false })
    .limit(10)

  const recentSkillRunsSummary =
    recentRuns && recentRuns.length > 0
      ? recentRuns
          .map(
            (r: Record<string, unknown>) =>
              `- ${r.skill_id} (${r.status}) by ${r.triggered_by ?? 'user'} via ${r.agent ?? 'unknown'} agent`,
          )
          .join('\n')
      : 'No recent skill runs in the last 24 hours.'

  // 8. Build system prompt with brand context
  const systemPrompt = buildSystemPrompt(
    (brand.name as string) ?? 'your brand',
    (brand.domain as string) ?? 'unknown',
    Array.isArray(brand.focus_areas)
      ? (brand.focus_areas as string[]).join(', ')
      : (brand.focus_areas as string) ?? 'general marketing',
    (brand.plan as string) ?? 'standard',
    recentSkillRunsSummary,
  )

  // 9. Build conversation history as user prompt context
  const historyText =
    conversationHistory.length > 0
      ? conversationHistory
          .map((m) => `${m.role === 'user' ? 'User' : 'Mia'}: ${m.content}`)
          .join('\n')
      : ''

  const userPrompt = historyText
    ? `${historyText}\nUser: ${message.trim()}`
    : message.trim()

  // 10. Stream the response via SSE
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send start event with conversationId
        controller.enqueue(sseEvent({ type: 'start', conversationId }))

        // Call Claude Sonnet via callModel (Mia always gets premium)
        const result = await callModel({
          model: MIA_CHAT_MODEL,
          provider: MIA_CHAT_PROVIDER,
          systemPrompt,
          userPrompt,
          maxTokens: 1024,
          temperature: 0.7,
        })

        // Store Mia's response in conversation_messages
        try {
          await admin.from('conversation_messages').insert({
            conversation_id: conversationId,
            role: 'assistant',
            content: result.content,
          })
        } catch (dbErr) {
          // Non-fatal — still return the response to the client
          console.warn('[Mia Chat] Failed to store assistant message:', dbErr)
        }

        // Send the message event
        controller.enqueue(
          sseEvent({
            type: 'message',
            content: result.content,
            model: result.model,
            conversationId,
          }),
        )

        // Send done event
        controller.enqueue(sseEvent({ type: 'done' }))
      } catch (err) {
        controller.enqueue(
          sseEvent({
            type: 'error',
            code: 'INTERNAL_ERROR',
            message: err instanceof Error ? err.message : 'Mia encountered an error',
          }),
        )
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

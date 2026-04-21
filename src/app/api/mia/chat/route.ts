import { NextRequest } from 'next/server'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { callModel } from '@/lib/model-client'
import { buildSkillsCatalog, type CatalogSkill } from '@/lib/mia-actions'
import { extractMemories, getRelevantMemories, type MiaMemory } from '@/lib/mia-memory'
import { emitMiaEvent } from '@/lib/mia-events'
import { loadAllSkills } from '@/lib/skill-loader'
import agentsJson from '../../../../../skills/agents.json'

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
- You can trigger agent skills to take action — not just talk

Brand context:
- Name: {brandName}
- Domain: {domain}
- Focus: {focusAreas}
- Plan: {plan}

## Connected platforms (source of truth — trust these over conversation history)

{connectedPlatforms}

Rules when a platform is CONNECTED:
- Never ask the user to paste numbers, CSVs, or screenshots from that platform.
- To answer questions about it, dispatch the owning agent's skill. It has direct read access.
- If the user doubts the connection, say "Meta is connected — let me pull it now" and trigger the skill.

Rules when a platform is NOT CONNECTED:
- Offer the integration page as the default path: "Connect Meta in Settings → Platforms."
- Manual data entry is allowed only as an explicit second option.

## Recent activity (last 24h — status only)

{recentSkillRunsSummary}

## What your team has said recently (last 30 days)

{agentDigest}

## What you remember about this brand

{memories}

## When to suggest a skill (trigger-based, not menu-based)

Default to leading with results, decisions, or creative output. Suggest a diagnostic/audit only when:
- The user explicitly asked for it or described a matching problem.
- A concrete signal warrants it: spend anomaly, revenue dip, new creatives live, new platform connected, competitor event, a completed brief ready to activate.
- The last run was stale AND a new decision depends on fresh data.

Re-run cool-downs (do NOT re-suggest inside these windows unless a fresh trigger above applies):
- health-check: 30 days
- anomaly-detection: 7 days
- customer-signal-analyzer: 7 days
- Any other audit / scan / scorer / analyzer: 14 days

If a diagnostic is inside its cool-down, prefer (a) surfacing results already in the digest, (b) dispatching a creative or decision skill, or (c) one specific clarifying question — never a blanket "let me run some checks". Brand owners lose trust when the same checks keep being re-run.

If the digest shows an agent is BLOCKED or FAILED, say so plainly and tell the user what to do (e.g. "Max is blocked because his Meta tool returned zero rows — check the ad account id in Settings").

{skillsCatalog}

Keep responses concise but insightful. You're a busy marketing manager, not a verbose chatbot.
When you include an actions block, still write a natural message explaining what you're about to do and why.`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSystemPrompt(
  brandName: string,
  domain: string,
  focusAreas: string,
  plan: string,
  connectedPlatforms: string,
  recentSkillRunsSummary: string,
  agentDigest: string,
  memories: string,
  skillsCatalog: string,
): string {
  return MIA_CHAT_SYSTEM_PROMPT
    .replace(/{brandName}/g, brandName)
    .replace(/{domain}/g, domain)
    .replace(/{focusAreas}/g, focusAreas)
    .replace(/{plan}/g, plan)
    .replace(/{connectedPlatforms}/g, connectedPlatforms)
    .replace(/{recentSkillRunsSummary}/g, recentSkillRunsSummary)
    .replace(/{agentDigest}/g, agentDigest)
    .replace(/{memories}/g, memories)
    .replace(/{skillsCatalog}/g, skillsCatalog)
}

function sseEvent(data: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
}

/** Extract a short, user-facing line from a completed skill's JSON output. */
function extractHeadline(output: unknown): string {
  if (!output || typeof output !== 'object') return ''
  const o = output as Record<string, unknown>

  // Prefer explicit fields skills commonly set
  for (const key of ['headline', 'summary', 'top_finding', 'recommendation', 'decision']) {
    const v = o[key]
    if (typeof v === 'string' && v.trim().length > 0) return v.slice(0, 200)
  }
  // Then any top-level string field
  for (const v of Object.values(o)) {
    if (typeof v === 'string' && v.trim().length > 0) return v.slice(0, 200)
  }
  // Then the first finding in a findings[] array
  if (Array.isArray(o.findings) && o.findings.length > 0) {
    const f = o.findings[0]
    if (typeof f === 'string') return f.slice(0, 200)
    if (f && typeof f === 'object') {
      const fr = f as Record<string, unknown>
      const cand = fr.title ?? fr.message ?? fr.summary
      if (typeof cand === 'string') return cand.slice(0, 200)
    }
  }
  return ''
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
        user_id: user.id,
        agent: 'mia',
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
  const { data: userMsgRow } = await admin
    .from('conversation_messages')
    .insert({
      conversation_id: conversationId,
      role: 'user',
      content: message.trim(),
      author_kind: 'user',
    })
    .select('id')
    .maybeSingle()

  // 6a. Emit a user_chat event so the Mia orchestrator wakes asynchronously.
  // The chat reply itself (Sonnet) handles the conversational turn; the wake
  // cycle handles side effects (new watches, skill dispatch, digest lines).
  // Non-blocking: emitMiaEvent swallows failures.
  void emitMiaEvent({
    brandId,
    eventType: 'user_chat',
    payload: {
      conversation_id: conversationId,
      user_message_id: userMsgRow?.id ?? null,
      message: message.trim().slice(0, 4000),
      user_id: user.id,
    },
  })

  // 6b. Platform connection status (source of truth for "is Meta connected?")
  const { getPlatformStatus, syncPlatformStatus } = await import('@/lib/mia-intelligence')
  let platformStatus = await getPlatformStatus(brandId)
  if (!platformStatus) {
    try { platformStatus = await syncPlatformStatus(brandId) } catch { platformStatus = null }
  }

  // Pull credential metadata so Mia can name the specific account/property
  // that's connected (otherwise Max et al. just see "Meta: connected" with
  // no idea which ad account they're operating on).
  const { data: credRows } = await admin
    .from('credentials')
    .select('platform, metadata')
    .eq('brand_id', brandId)

  const credMeta: Record<string, Record<string, unknown>> = {}
  for (const row of credRows ?? []) {
    credMeta[row.platform as string] = (row.metadata as Record<string, unknown>) ?? {}
  }

  const fmt = (label: string, connected: boolean, detail?: string | null): string => {
    if (!connected) return `${label}: not connected`
    return detail ? `${label}: connected (${detail})` : `${label}: connected`
  }

  const metaAdAcct = credMeta.meta?.ad_account_id as string | undefined
  const shopifyShop = credMeta.shopify?.shop as string | undefined
  const ga4Property =
    (credMeta.google_analytics?.property_display_name as string | undefined) ??
    (credMeta.google_analytics?.property_id as string | undefined)
  const gscSite =
    (credMeta.google?.gsc_site_url as string | undefined) ??
    (credMeta.search_console?.site_url as string | undefined)
  const klaviyoLists = credMeta.klaviyo?.lists_count as number | undefined

  const connectedPlatformsBlock = platformStatus
    ? [
        fmt('Meta Ads', !!platformStatus.meta, metaAdAcct ? `Ad Account: ${metaAdAcct.startsWith('act_') ? metaAdAcct : `act_${metaAdAcct}`}` : null),
        fmt('Shopify', !!platformStatus.shopify, shopifyShop ? `Shop: ${shopifyShop}` : null),
        fmt('GA4', !!platformStatus.ga4, ga4Property ? `Property: ${ga4Property}` : null),
        fmt('GSC', !!platformStatus.gsc, gscSite ? `Site: ${gscSite}` : null),
        fmt('Klaviyo', !!platformStatus.klaviyo, klaviyoLists != null ? `${klaviyoLists} lists` : null),
      ].join('\n')
    : 'Platform status unknown — verify in Settings → Platforms.'

  // 7. Build recent skill runs summary for Mia's context
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: recentRuns } = await admin
    .from('skill_runs')
    .select('skill_id, status, triggered_by, created_at, agent_id')
    .eq('brand_id', brandId)
    .gte('created_at', twentyFourHoursAgo)
    .order('created_at', { ascending: false })
    .limit(10)

  const recentSkillRunsSummary =
    recentRuns && recentRuns.length > 0
      ? recentRuns
          .map(
            (r: Record<string, unknown>) =>
              `- ${r.skill_id} (${r.status}) by ${r.triggered_by ?? 'user'} via ${r.agent_id ?? 'unknown'} agent`,
          )
          .join('\n')
      : 'No recent skill runs in the last 24 hours.'

  // 7b. 30-day agent activity digest — last completed run per skill + blocked/failed visibility
  const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: runs30d, error: runs30dError } = await admin
    .from('skill_runs')
    .select('skill_id, agent_id, status, output, error_message, blocked_reason, created_at')
    .eq('brand_id', brandId)
    .gte('created_at', thirtyDaysAgoIso)
    .order('created_at', { ascending: false })
    .limit(300)
  if (runs30dError) console.warn('[mia-chat] 30d digest query failed:', runs30dError)

  type Run30d = {
    skill_id: string
    agent_id: string | null
    status: string
    output: unknown
    error_message: string | null
    blocked_reason: string | null
    created_at: string
  }

  const firstBySkill = new Map<string, Run30d>()
  for (const r of (runs30d ?? []) as Run30d[]) {
    if (!firstBySkill.has(r.skill_id)) firstBySkill.set(r.skill_id, r)
  }

  const now = Date.now()
  const agentDigest = Array.from(firstBySkill.values())
    .slice(0, 12)
    .map((r) => {
      const days = Math.max(0, Math.floor((now - new Date(r.created_at).getTime()) / (24 * 60 * 60 * 1000)))
      const ago = days === 0 ? 'today' : `${days}d ago`
      const label = `${r.agent_id ?? 'unknown'}/${r.skill_id}`
      if (r.status === 'completed') {
        const headline = extractHeadline(r.output)
        return headline ? `- ${label} (${ago}, completed) — "${headline}"` : `- ${label} (${ago}, completed)`
      }
      if (r.status === 'blocked') {
        return `- ${label} (${ago}, BLOCKED: ${r.blocked_reason ?? 'unknown reason'})`
      }
      if (r.status === 'failed') {
        return `- ${label} (${ago}, FAILED: ${r.error_message ?? 'unknown error'})`
      }
      return `- ${label} (${ago}, ${r.status})`
    })
    .join('\n')

  const agentDigestBlock = agentDigest || 'No agent activity in the last 30 days.'

  // 7c. Retrieve durable memories for prompt injection
  let memories: MiaMemory[] = []
  try { memories = await getRelevantMemories(brandId, 20) } catch { memories = [] }

  const memoriesBlock = memories.length > 0
    ? memories.map((m) => `- [${m.kind}] ${m.content}`).join('\n')
    : 'No durable memories yet — anything the user tells you about their preferences, decisions, or context will be remembered across sessions.'

  // 8. Build system prompt with brand context.
  //    Load every skill definition so the catalog can surface name, requires,
  //    and mcp-tool-derived platform hints — otherwise Mia sees flat IDs and
  //    routes Meta questions to whichever skill has the nicest-sounding name
  //    instead of to the agent that owns the platform.
  const skillDefs = await loadAllSkills()
  const catalogSkillMap = new Map<string, CatalogSkill>()
  for (const [id, def] of skillDefs) {
    catalogSkillMap.set(id, {
      id: def.id,
      name: def.name,
      agent: def.agent,
      requires: def.requires,
      mcpTools: def.mcpTools,
    })
  }
  const skillsCatalog = buildSkillsCatalog(
    (agentsJson as Array<{ id: string; name: string; role?: string; skills: string[] }>),
    catalogSkillMap,
  )

  const systemPrompt = buildSystemPrompt(
    (brand.name as string) ?? 'your brand',
    (brand.domain as string) ?? 'unknown',
    Array.isArray(brand.focus_areas)
      ? (brand.focus_areas as string[]).join(', ')
      : (brand.focus_areas as string) ?? 'general marketing',
    (brand.plan as string) ?? 'standard',
    connectedPlatformsBlock,
    recentSkillRunsSummary,
    agentDigestBlock,
    memoriesBlock,
    skillsCatalog,
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
            author_kind: 'mia_reactive',
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

        // Schedule memory extraction after the response is sent. `after()`
        // uses waitUntil on Vercel so the serverless invocation isn't frozen
        // mid-extraction; on Node it runs post-response too. Extractor never
        // throws — .catch is belt-and-suspenders.
        const userMessageSnapshot = message.trim()
        const assistantMessageSnapshot = result.content
        after(() => {
          void extractMemories({
            brandId,
            userMessage: userMessageSnapshot,
            assistantMessage: assistantMessageSnapshot,
            sourceMessageId: null,
          }).catch((err) => console.warn('[mia-chat] memory extraction failed:', err))
        })
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

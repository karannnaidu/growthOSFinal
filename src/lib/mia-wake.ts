// Mia wake cycle — the single orchestration path.
//
// Called from:
//  - /api/cron/mia-heartbeat  (4x/day + onboarding bootstrap)
//  - /api/cron/mia-events-drain (event-driven wakes)
//  - /api/mia/chat (user_chat event, synchronous)
//
// Pipeline (all on one brand, per wake):
//   1. snapshot   — platforms, recent runs, open requests, open watches
//   2. sweep      — evaluate watches, get fired set
//   3. expire     — expire stale requests
//   4. catalog    — dynamic skill list, filter by platforms (+ Day-0 if fresh)
//   5. plan       — LLM picks skills, drafts watches/requests/digest/instants
//   6. persist    — write mia_decisions row (source-of-truth trace)
//   7. dispatch   — fan out: create watches, run skills, resolve requests,
//                   append digest, post instant messages
//
// Dry-run (options.dryRun === true) short-circuits at step 6: we write the
// decision row with status='dry_run' but skip all mutations so the pick can
// be inspected.

import { createServiceClient } from './supabase/service'
import { runSkill } from './skills-engine'
import { callModel } from './model-client'
import {
  buildMiaCatalog,
  filterByConnectedPlatforms,
  filterDay0Safe,
  renderCatalogForPrompt,
  type CatalogSkill,
  type MiaCatalog,
} from './mia-catalog'
import {
  createWatch,
  sweepWatches,
  type WatchRow,
  type WatchTriggerType,
} from './mia-watches'
import {
  expireStaleRequests,
  listOpenRequests,
  markActedOn,
  markDismissed,
  type MiaRequestRow,
} from './mia-requests'

type Client = ReturnType<typeof createServiceClient>

export type WakeSource =
  | 'heartbeat'
  | 'event:platform_connect'
  | 'event:skill_delta'
  | 'event:user_chat'
  | 'event:new_skill'
  | 'event:webhook'
  | 'onboarding'

export interface WakeOptions {
  brandId: string
  source: WakeSource
  /** User message text when source is event:user_chat. */
  userMessage?: string
  /** Event payload for event-driven wakes (forwarded to the planner). */
  eventPayload?: Record<string, unknown>
  /** If true, plan + persist the decision but skip dispatch. */
  dryRun?: boolean
}

export interface Pick {
  skill_id: string
  reason: string
  priority?: 'low' | 'medium' | 'high'
}

export interface NewWatchDraft {
  trigger_type: WatchTriggerType
  predicate: Record<string, unknown>
  resume_action: string
  resume_context?: string
  expires_in_hours?: number
}

export interface RequestResolutionDraft {
  request_id: string
  status: 'acted_on' | 'dismissed'
  resolution_payload?: Record<string, unknown>
}

export interface DigestLineDraft {
  kind: 'info' | 'action' | 'win' | 'risk' | 'ask'
  text: string
  source_skill_run_id?: string
  source_request_id?: string
}

export interface InstantMessageDraft {
  author_kind: 'mia_reactive' | 'mia_proactive'
  text: string
  inline_request_ids?: string[]
  inline_watch_ids?: string[]
}

interface PlannerOutput {
  picks: Pick[]
  new_watches: NewWatchDraft[]
  requests_to_resolve: RequestResolutionDraft[]
  digest_lines: DigestLineDraft[]
  instant_messages: InstantMessageDraft[]
  reasoning: string
}

export interface WakeResult {
  decisionId: string
  source: WakeSource
  pickCount: number
  watchesCreated: number
  requestsResolved: number
  instantsPosted: number
  digestLinesAppended: number
  dryRun: boolean
  reasoning: string
}

// ---------------------------------------------------------------------------
// Step 1 — snapshot
// ---------------------------------------------------------------------------
interface Snapshot {
  brandName: string
  brandId: string
  platforms: string[]
  hasAnyData: boolean
  /** completed skill_runs in the last 48h, newest first */
  recentRuns: Array<{ skill_id: string; created_at: string; status: string }>
  openRequests: MiaRequestRow[]
  openWatchesCount: number
  /** last N mia_decisions for context, newest first */
  recentDecisions: Array<{ id: string; triggered_at: string; picks: unknown; reasoning: string | null }>
}

async function snapshot(brandId: string, c: Client): Promise<Snapshot> {
  const [brandRes, credsRes, runsRes, reqsRes, watchesRes, decisionsRes] = await Promise.all([
    c.from('brands').select('id, name').eq('id', brandId).maybeSingle(),
    c.from('credentials').select('platform').eq('brand_id', brandId),
    c.from('skill_runs')
      .select('skill_id, created_at, status')
      .eq('brand_id', brandId)
      .gte('created_at', new Date(Date.now() - 48 * 3600_000).toISOString())
      .order('created_at', { ascending: false })
      .limit(30),
    listOpenRequests(brandId, c),
    c.from('watches')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brandId)
      .eq('status', 'open'),
    c.from('mia_decisions')
      .select('id, triggered_at, picked, reasoning')
      .eq('brand_id', brandId)
      .order('triggered_at', { ascending: false })
      .limit(5),
  ])

  const brandName = (brandRes.data?.name as string) ?? 'brand'
  const platforms = (credsRes.data ?? []).map((r: { platform: string }) => r.platform)
  const recentRuns = (runsRes.data ?? []) as Snapshot['recentRuns']
  const decisions = (decisionsRes.data ?? []).map(
    (d: { id: string; triggered_at: string; picked: unknown; reasoning: string | null }) => ({
      id: d.id,
      triggered_at: d.triggered_at,
      picks: d.picked,
      reasoning: d.reasoning,
    }),
  )

  return {
    brandName,
    brandId,
    platforms,
    hasAnyData: recentRuns.length > 0 || platforms.length > 0,
    recentRuns,
    openRequests: reqsRes,
    openWatchesCount: watchesRes.count ?? 0,
    recentDecisions: decisions,
  }
}

// ---------------------------------------------------------------------------
// Step 2 — prompt builder
// ---------------------------------------------------------------------------
function buildPlannerPrompt(args: {
  snap: Snapshot
  source: WakeSource
  userMessage?: string
  eventPayload?: Record<string, unknown>
  firedWatches: WatchRow[]
  catalog: CatalogSkill[]
}): { systemPrompt: string; userPrompt: string } {
  const { snap, source, userMessage, eventPayload, firedWatches, catalog } = args

  const systemPrompt = [
    'You are Mia, the single orchestrator for this brand.',
    'You decide which skills to run, what to watch for, which open requests are resolved, and what to say to the user.',
    '',
    'Rules:',
    '- Never invent skill ids — only pick from the catalog block below.',
    '- Prefer skills flagged effect=none for fresh brands with little data.',
    '- Never pick a skill whose requires=[...] list has a platform not in "Connected platforms".',
    '- Do not re-pick a skill that ran successfully in the last 24 hours unless data has meaningfully changed.',
    '- A wake can legitimately return zero picks. Empty is fine.',
    '- Watches are your way to defer work. Create watches instead of picking "later".',
    '- Always include a short reasoning field explaining why you picked (or skipped).',
    '- Instant messages are for high-priority signals only (platform asks, unblockers, emergencies). Everything else belongs in digest_lines.',
  ].join('\n')

  const catalogBlock = renderCatalogForPrompt(catalog)
  const openReqBlock = snap.openRequests.length
    ? snap.openRequests
        .map(r => `  - id=${r.id} type=${r.type} priority=${r.priority} reason="${r.reason}"`)
        .join('\n')
    : '  (none)'

  const firedBlock = firedWatches.length
    ? firedWatches
        .map(
          w =>
            `  - id=${w.id} trigger=${w.trigger_type} resume=${w.resume_action} evidence=${JSON.stringify(
              w.fired_predicate_eval ?? {},
            )}`,
        )
        .join('\n')
    : '  (none)'

  const runsBlock = snap.recentRuns.length
    ? snap.recentRuns.slice(0, 15).map(r => `  - ${r.skill_id} (${r.status}) @ ${r.created_at}`).join('\n')
    : '  (none)'

  const userPrompt = [
    `# Wake source: ${source}`,
    userMessage ? `# User message: ${userMessage}` : '',
    eventPayload ? `# Event payload: ${JSON.stringify(eventPayload).slice(0, 800)}` : '',
    '',
    `## Brand: ${snap.brandName}`,
    `## Connected platforms: ${snap.platforms.length ? snap.platforms.join(', ') : 'none'}`,
    `## Open requests:\n${openReqBlock}`,
    `## Fired watches:\n${firedBlock}`,
    `## Recent skill runs (48h):\n${runsBlock}`,
    `## Open watches count: ${snap.openWatchesCount}`,
    '',
    '## Catalog',
    catalogBlock,
    '',
    'Respond with ONLY a JSON object in this exact shape:',
    '{',
    '  "picks": [{"skill_id": "...", "reason": "...", "priority": "low|medium|high"}],',
    '  "new_watches": [{"trigger_type": "time_elapsed|data_accumulated|metric_crossed|request_acted_on|skill_ran", "predicate": {...}, "resume_action": "...", "resume_context": "...", "expires_in_hours": 72}],',
    '  "requests_to_resolve": [{"request_id": "...", "status": "acted_on|dismissed", "resolution_payload": {}}],',
    '  "digest_lines": [{"kind": "info|action|win|risk|ask", "text": "..."}],',
    '  "instant_messages": [{"author_kind": "mia_reactive|mia_proactive", "text": "...", "inline_request_ids": [], "inline_watch_ids": []}],',
    '  "reasoning": "one paragraph"',
    '}',
  ]
    .filter(Boolean)
    .join('\n')

  return { systemPrompt, userPrompt }
}

// ---------------------------------------------------------------------------
// Step 3 — parse + guardrail the planner output
// ---------------------------------------------------------------------------
function parsePlannerOutput(raw: string, catalog: MiaCatalog): PlannerOutput {
  let text = raw.trim()
  const fence = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/)
  if (fence) text = fence[1]!.trim()

  let parsed: Partial<PlannerOutput> = {}
  try {
    parsed = JSON.parse(text) as Partial<PlannerOutput>
  } catch {
    parsed = {}
  }

  const picks = Array.isArray(parsed.picks) ? parsed.picks : []
  const validPicks: Pick[] = []
  for (const p of picks) {
    if (!p || typeof p !== 'object') continue
    const id = (p as Pick).skill_id
    const reason = (p as Pick).reason
    if (typeof id !== 'string' || !catalog.skillById.has(id)) continue
    if (typeof reason !== 'string' || reason.length < 3) continue
    validPicks.push({ skill_id: id, reason, priority: (p as Pick).priority ?? 'medium' })
  }

  const newWatches = Array.isArray(parsed.new_watches) ? (parsed.new_watches as NewWatchDraft[]) : []
  const validWatches = newWatches.filter(
    w =>
      w &&
      typeof w.trigger_type === 'string' &&
      typeof w.resume_action === 'string' &&
      w.predicate && typeof w.predicate === 'object',
  )

  const resolutions = Array.isArray(parsed.requests_to_resolve)
    ? (parsed.requests_to_resolve as RequestResolutionDraft[]).filter(
        r => typeof r.request_id === 'string' && (r.status === 'acted_on' || r.status === 'dismissed'),
      )
    : []

  const digest = Array.isArray(parsed.digest_lines) ? (parsed.digest_lines as DigestLineDraft[]) : []
  const validDigest = digest.filter(
    d => d && typeof d.text === 'string' && d.text.length > 3 && typeof d.kind === 'string',
  )

  const instants = Array.isArray(parsed.instant_messages) ? (parsed.instant_messages as InstantMessageDraft[]) : []
  const validInstants = instants.filter(
    m =>
      m &&
      typeof m.text === 'string' &&
      m.text.length > 3 &&
      (m.author_kind === 'mia_reactive' || m.author_kind === 'mia_proactive'),
  )

  return {
    picks: validPicks,
    new_watches: validWatches,
    requests_to_resolve: resolutions,
    digest_lines: validDigest,
    instant_messages: validInstants,
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
  }
}

// ---------------------------------------------------------------------------
// Step 4 — persist decision trace (source of truth)
// ---------------------------------------------------------------------------
async function persistDecision(args: {
  c: Client
  brandId: string
  source: WakeSource
  contextSnapshot: Record<string, unknown>
  firedWatchIds: string[]
  plan: PlannerOutput
  modelVersion: string
  promptVersion: string
}): Promise<string> {
  const { c, brandId, source, contextSnapshot, firedWatchIds, plan, modelVersion, promptVersion } = args
  const { data, error } = await c
    .from('mia_decisions')
    .insert({
      brand_id: brandId,
      wake_source: source,
      context_snapshot: contextSnapshot,
      fired_watch_ids: firedWatchIds,
      picked: plan.picks,
      considered: [],
      rejected: [],
      new_watches_created: [],
      requests_resolved: [],
      digest_lines: plan.digest_lines,
      instant_messages: plan.instant_messages,
      reasoning: plan.reasoning,
      model_version: modelVersion,
      prompt_version: promptVersion,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

// ---------------------------------------------------------------------------
// Step 5 — dispatch side effects
// ---------------------------------------------------------------------------
async function dispatchEffects(args: {
  c: Client
  brandId: string
  decisionId: string
  plan: PlannerOutput
}): Promise<{ createdWatchIds: string[]; resolvedRequestIds: string[]; postedInstantIds: string[] }> {
  const { c, brandId, decisionId, plan } = args

  // 1. Resolve requests Mia concluded on.
  const resolvedIds: string[] = []
  for (const r of plan.requests_to_resolve) {
    try {
      if (r.status === 'acted_on') {
        await markActedOn(r.request_id, brandId, r.resolution_payload ?? null, c)
      } else {
        await markDismissed(r.request_id, brandId, c)
      }
      resolvedIds.push(r.request_id)
    } catch (e) {
      console.warn('[mia-wake] resolve request failed', r.request_id, e)
    }
  }

  // 2. Create new watches — attribute to this decision.
  const createdWatchIds: string[] = []
  for (const w of plan.new_watches) {
    try {
      const expiresAt = w.expires_in_hours
        ? new Date(Date.now() + w.expires_in_hours * 3600_000)
        : null
      const row = await createWatch(
        {
          brandId,
          triggerType: w.trigger_type,
          predicate: w.predicate,
          resumeAction: w.resume_action,
          resumeContext: w.resume_context,
          sourceDecisionId: decisionId,
          expiresAt,
        },
        c,
      )
      createdWatchIds.push(row.id)
    } catch (e) {
      console.warn('[mia-wake] create watch failed', w.resume_action, e)
    }
  }

  // 3. Post instant messages to chat.
  const postedInstantIds: string[] = []
  if (plan.instant_messages.length) {
    const { data: conv } = await c
      .from('conversations')
      .select('id')
      .eq('brand_id', brandId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const conversationId = conv?.id
    if (conversationId) {
      for (const m of plan.instant_messages) {
        const { data } = await c
          .from('conversation_messages')
          .insert({
            conversation_id: conversationId,
            role: 'assistant',
            content: m.text,
            author_kind: m.author_kind,
            source_decision_id: decisionId,
            inline_request_ids: m.inline_request_ids ?? null,
            inline_watch_ids: m.inline_watch_ids ?? null,
          })
          .select('id')
          .maybeSingle()
        if (data?.id) postedInstantIds.push(data.id as string)
      }
    }
  }

  // 4. Append digest lines to today's digest.
  if (plan.digest_lines.length) {
    const today = new Date().toISOString().slice(0, 10)
    // Upsert pattern: try insert, on conflict (brand, date) re-read and append.
    await c.from('mia_digests').upsert(
      {
        brand_id: brandId,
        digest_date: today,
        status: 'accumulating',
      },
      { onConflict: 'brand_id,digest_date' },
    )
    const { data: existing } = await c
      .from('mia_digests')
      .select('id, sections, source_decision_ids')
      .eq('brand_id', brandId)
      .eq('digest_date', today)
      .single()
    const sections = (existing?.sections ?? {}) as Record<string, DigestLineDraft[]>
    for (const line of plan.digest_lines) {
      const list = sections[line.kind] ?? []
      list.push(line)
      sections[line.kind] = list
    }
    const existingDecisionIds = Array.isArray(existing?.source_decision_ids)
      ? (existing?.source_decision_ids as string[])
      : []
    await c
      .from('mia_digests')
      .update({
        sections,
        source_decision_ids: [...existingDecisionIds, decisionId],
      })
      .eq('id', existing!.id)
  }

  // 5. Dispatch picked skills (triggeredBy='mia'). Runs sequentially — each
  // skill is async internally via chain-processor, so this stays fast.
  for (const p of plan.picks) {
    try {
      await runSkill({
        brandId,
        skillId: p.skill_id,
        triggeredBy: 'mia',
        additionalContext: { source_decision_id: decisionId, reason: p.reason },
      })
    } catch (e) {
      console.warn('[mia-wake] runSkill failed', p.skill_id, e)
    }
  }

  // 6. Patch the decision row with the resulting ids so the trace is complete.
  await c
    .from('mia_decisions')
    .update({
      new_watches_created: createdWatchIds,
      requests_resolved: resolvedIds,
    })
    .eq('id', decisionId)

  return { createdWatchIds, resolvedRequestIds: resolvedIds, postedInstantIds }
}

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------
const PROMPT_VERSION = 'mia-wake-v1'
const MODEL_ID = 'gemini-2.5-flash'
const MODEL_PROVIDER = 'google'

export async function runMiaWake(options: WakeOptions): Promise<WakeResult> {
  const c = createServiceClient()
  const { brandId, source, userMessage, eventPayload, dryRun } = options

  // 1. snapshot
  const snap = await snapshot(brandId, c)

  // 2. sweep watches (side effect: fires + expires them in DB)
  const firedWatches = await sweepWatches(brandId, c)

  // 3. expire stale requests
  await expireStaleRequests(brandId, c)

  // 4. catalog + filters
  const catalog = await buildMiaCatalog()
  let skills = filterByConnectedPlatforms(catalog.skills, new Set(snap.platforms))
  if (!snap.hasAnyData) {
    skills = filterDay0Safe(skills)
  }

  // 5. plan
  const { systemPrompt, userPrompt } = buildPlannerPrompt({
    snap,
    source,
    userMessage,
    eventPayload,
    firedWatches,
    catalog: skills,
  })

  let llmText = ''
  try {
    const result = await callModel({
      model: MODEL_ID,
      provider: MODEL_PROVIDER,
      systemPrompt,
      userPrompt,
      maxTokens: 2048,
      temperature: 0.3,
      jsonMode: true,
    })
    llmText = result.content
  } catch (e) {
    console.error('[mia-wake] planner call failed:', e)
    llmText = ''
  }

  // Use the full catalog (not the filtered list) when validating picks — the
  // filter above is advisory for the planner; the catalog map is what we
  // actually dispatch from. Skill-id presence is re-enforced here.
  const plan = parsePlannerOutput(llmText, catalog)

  // Drop any picks the filter would have rejected (e.g. platform-gated skills
  // on a fresh brand) — planner discipline isn't guaranteed, so enforce here.
  const allowedIds = new Set(skills.map(s => s.id))
  plan.picks = plan.picks.filter(p => allowedIds.has(p.skill_id))

  // 6. persist decision (always, even on dry run)
  const decisionId = await persistDecision({
    c,
    brandId,
    source,
    contextSnapshot: {
      brand_name: snap.brandName,
      platforms: snap.platforms,
      has_any_data: snap.hasAnyData,
      open_requests: snap.openRequests.length,
      open_watches: snap.openWatchesCount,
      recent_runs: snap.recentRuns.length,
      user_message: userMessage ?? null,
      event_payload: eventPayload ?? null,
    },
    firedWatchIds: firedWatches.map(w => w.id),
    plan,
    modelVersion: MODEL_ID,
    promptVersion: PROMPT_VERSION,
  })

  if (dryRun) {
    return {
      decisionId,
      source,
      pickCount: plan.picks.length,
      watchesCreated: 0,
      requestsResolved: 0,
      instantsPosted: 0,
      digestLinesAppended: plan.digest_lines.length,
      dryRun: true,
      reasoning: plan.reasoning,
    }
  }

  // 7. dispatch
  const effects = await dispatchEffects({ c, brandId, decisionId, plan })

  return {
    decisionId,
    source,
    pickCount: plan.picks.length,
    watchesCreated: effects.createdWatchIds.length,
    requestsResolved: effects.resolvedRequestIds.length,
    instantsPosted: effects.postedInstantIds.length,
    digestLinesAppended: plan.digest_lines.length,
    dryRun: false,
    reasoning: plan.reasoning,
  }
}

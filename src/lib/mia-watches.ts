// Watches — Mia's deferred intent, SQL-evaluable so heartbeat can fire them
// without an LLM call. A watch stores a finite predicate plus a resume
// action; heartbeat evaluates open watches, fires those whose predicate
// is true, and passes the fired set into the next planning prompt.
//
// Predicate shapes (validated at create time):
//   time_elapsed:      { hours: number } or { iso: string }   — fires when now >= created_at + hours (or now >= iso)
//   data_accumulated:  { resource: 'orders'|'campaigns', min_count: number, since?: 'iso' }
//   metric_crossed:    { metric: string, op: '>'|'<'|'>='|'<=', value: number }
//   request_acted_on:  { request_id: uuid } — fires when the request status becomes 'acted_on'
//   skill_ran:         { skill_id: string, since: 'created_at'|'iso', min_count?: number (default 1) }
//
// metric_crossed reads `brand_metrics_history` — a JSONB-keyed snapshot table.
// We fetch the latest row for the brand and extract `metrics->>metric` as a
// numeric. Any metric the brand's ingest pipeline stores is usable; unknown
// keys simply don't fire.

import { createServiceClient } from './supabase/service'

export type WatchTriggerType =
  | 'time_elapsed'
  | 'data_accumulated'
  | 'metric_crossed'
  | 'request_acted_on'
  | 'skill_ran'

export type WatchStatus = 'open' | 'fired' | 'expired' | 'cancelled'

export interface WatchRow {
  id: string
  brand_id: string
  trigger_type: WatchTriggerType
  predicate: Record<string, unknown>
  resume_action: string
  resume_context: string | null
  source_decision_id: string | null
  status: WatchStatus
  created_at: string
  expires_at: string | null
  fired_at: string | null
  fired_predicate_eval: Record<string, unknown> | null
}

type Client = ReturnType<typeof createServiceClient>

// ---------------------------------------------------------------------------
// Predicate validation — fail closed: unknown shapes are rejected at create.
// ---------------------------------------------------------------------------
function validatePredicate(type: WatchTriggerType, predicate: Record<string, unknown>) {
  switch (type) {
    case 'time_elapsed': {
      const hours = predicate['hours']
      const iso = predicate['iso']
      if (typeof hours !== 'number' && typeof iso !== 'string') {
        throw new Error('time_elapsed needs hours:number or iso:string')
      }
      if (typeof hours === 'number' && hours <= 0) {
        throw new Error('time_elapsed.hours must be > 0')
      }
      return
    }
    case 'data_accumulated': {
      const resource = predicate['resource']
      const minCount = predicate['min_count']
      if (typeof resource !== 'string') throw new Error('data_accumulated.resource required')
      if (!['orders', 'campaigns'].includes(resource)) {
        throw new Error(`data_accumulated.resource unsupported: ${resource}`)
      }
      if (typeof minCount !== 'number' || minCount <= 0) {
        throw new Error('data_accumulated.min_count must be > 0')
      }
      return
    }
    case 'metric_crossed': {
      const metric = predicate['metric']
      const op = predicate['op']
      const value = predicate['value']
      if (typeof metric !== 'string') throw new Error('metric_crossed.metric required')
      if (!['>', '<', '>=', '<='].includes(op as string)) {
        throw new Error('metric_crossed.op must be >,<,>=,<=')
      }
      if (typeof value !== 'number') throw new Error('metric_crossed.value must be number')
      return
    }
    case 'request_acted_on': {
      if (typeof predicate['request_id'] !== 'string') {
        throw new Error('request_acted_on.request_id required')
      }
      return
    }
    case 'skill_ran': {
      if (typeof predicate['skill_id'] !== 'string') {
        throw new Error('skill_ran.skill_id required')
      }
      return
    }
    default:
      throw new Error(`Unknown trigger type: ${type}`)
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
export interface CreateWatchInput {
  brandId: string
  triggerType: WatchTriggerType
  predicate: Record<string, unknown>
  resumeAction: string
  resumeContext?: string
  sourceDecisionId?: string
  expiresAt?: Date | null
}

export async function createWatch(input: CreateWatchInput, client?: Client): Promise<WatchRow> {
  validatePredicate(input.triggerType, input.predicate)
  const c = client ?? createServiceClient()

  const { data, error } = await c
    .from('watches')
    .insert({
      brand_id: input.brandId,
      trigger_type: input.triggerType,
      predicate: input.predicate,
      resume_action: input.resumeAction,
      resume_context: input.resumeContext ?? null,
      source_decision_id: input.sourceDecisionId ?? null,
      expires_at: input.expiresAt ? input.expiresAt.toISOString() : null,
    })
    .select('*')
    .single()

  if (error) throw error
  return data as WatchRow
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------
export async function listOpenWatches(brandId: string, client?: Client): Promise<WatchRow[]> {
  const c = client ?? createServiceClient()
  const { data, error } = await c
    .from('watches')
    .select('*')
    .eq('brand_id', brandId)
    .eq('status', 'open')
  if (error) throw error
  return (data ?? []) as WatchRow[]
}

// ---------------------------------------------------------------------------
// Predicate evaluators — one per trigger_type.
// Each returns either { fired: true, evidence } or { fired: false }.
// evidence goes into fired_predicate_eval for audit.
// ---------------------------------------------------------------------------

type Eval = { fired: true; evidence: Record<string, unknown> } | { fired: false }

async function evalTimeElapsed(watch: WatchRow): Promise<Eval> {
  const p = watch.predicate
  const created = new Date(watch.created_at).getTime()
  const now = Date.now()
  let target: number | null = null
  if (typeof p['hours'] === 'number') {
    target = created + (p['hours'] as number) * 3600 * 1000
  } else if (typeof p['iso'] === 'string') {
    target = new Date(p['iso'] as string).getTime()
  }
  if (target === null || isNaN(target)) return { fired: false }
  if (now >= target) {
    return { fired: true, evidence: { now: new Date(now).toISOString(), target: new Date(target).toISOString() } }
  }
  return { fired: false }
}

async function evalDataAccumulated(watch: WatchRow, c: Client): Promise<Eval> {
  const p = watch.predicate
  const resource = p['resource'] as string
  const minCount = p['min_count'] as number
  const sinceIso = (p['since'] as string) || watch.created_at

  const tableByResource: Record<string, { table: string; timeCol: string }> = {
    orders: { table: 'brand_csv_orders', timeCol: 'created_at' },
    campaigns: { table: 'campaigns', timeCol: 'created_at' },
  }
  const mapping = tableByResource[resource]
  if (!mapping) return { fired: false }

  const { count, error } = await c
    .from(mapping.table)
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', watch.brand_id)
    .gte(mapping.timeCol, sinceIso)
  if (error) return { fired: false }
  const n = count ?? 0
  if (n >= minCount) {
    return { fired: true, evidence: { count: n, threshold: minCount, since: sinceIso } }
  }
  return { fired: false }
}

async function evalMetricCrossed(watch: WatchRow, c: Client): Promise<Eval> {
  const p = watch.predicate
  const metric = p['metric'] as string
  const op = p['op'] as string
  const value = p['value'] as number

  const { data, error } = await c
    .from('brand_metrics_history')
    .select('metrics, date')
    .eq('brand_id', watch.brand_id)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return { fired: false }
  const rawMetrics = (data.metrics ?? {}) as Record<string, unknown>
  const raw = rawMetrics[metric]
  if (raw === undefined || raw === null) return { fired: false }
  const mv = Number(raw)
  if (!Number.isFinite(mv)) return { fired: false }
  const crossed =
    (op === '>' && mv > value) ||
    (op === '<' && mv < value) ||
    (op === '>=' && mv >= value) ||
    (op === '<=' && mv <= value)
  if (crossed) {
    return {
      fired: true,
      evidence: { metric, op, threshold: value, observed: mv, at: data.date },
    }
  }
  return { fired: false }
}

async function evalRequestActedOn(watch: WatchRow, c: Client): Promise<Eval> {
  const requestId = watch.predicate['request_id'] as string
  const { data, error } = await c
    .from('mia_requests')
    .select('status, resolved_at, resolution_payload')
    .eq('id', requestId)
    .maybeSingle()
  if (error || !data) return { fired: false }
  if (data.status === 'acted_on') {
    return {
      fired: true,
      evidence: { request_id: requestId, resolved_at: data.resolved_at, resolution_payload: data.resolution_payload },
    }
  }
  return { fired: false }
}

async function evalSkillRan(watch: WatchRow, c: Client): Promise<Eval> {
  const p = watch.predicate
  const skillId = p['skill_id'] as string
  const sinceIso = (p['since'] as string) || watch.created_at
  const minCount = (p['min_count'] as number | undefined) ?? 1

  const { count, error } = await c
    .from('skill_runs')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', watch.brand_id)
    .eq('skill_id', skillId)
    .eq('status', 'completed')
    .gte('created_at', sinceIso)
  if (error) return { fired: false }
  const n = count ?? 0
  if (n >= minCount) {
    return { fired: true, evidence: { skill_id: skillId, count: n, threshold: minCount, since: sinceIso } }
  }
  return { fired: false }
}

async function evaluateWatch(watch: WatchRow, c: Client): Promise<Eval> {
  switch (watch.trigger_type) {
    case 'time_elapsed': return evalTimeElapsed(watch)
    case 'data_accumulated': return evalDataAccumulated(watch, c)
    case 'metric_crossed': return evalMetricCrossed(watch, c)
    case 'request_acted_on': return evalRequestActedOn(watch, c)
    case 'skill_ran': return evalSkillRan(watch, c)
  }
}

// ---------------------------------------------------------------------------
// Sweep — evaluates all open watches for a brand, fires or expires them.
// Returns the fired rows for the caller to pass into planning.
// ---------------------------------------------------------------------------
export async function sweepWatches(brandId: string, client?: Client): Promise<WatchRow[]> {
  const c = client ?? createServiceClient()
  const open = await listOpenWatches(brandId, c)
  const fired: WatchRow[] = []
  const now = Date.now()

  for (const w of open) {
    // Expire first — an expired watch cannot fire.
    if (w.expires_at && new Date(w.expires_at).getTime() <= now) {
      await c
        .from('watches')
        .update({ status: 'expired' })
        .eq('id', w.id)
        .eq('status', 'open')
      continue
    }

    const result = await evaluateWatch(w, c)
    if (result.fired) {
      const { data } = await c
        .from('watches')
        .update({
          status: 'fired',
          fired_at: new Date().toISOString(),
          fired_predicate_eval: result.evidence,
        })
        .eq('id', w.id)
        .eq('status', 'open')
        .select('*')
        .maybeSingle()
      if (data) fired.push(data as WatchRow)
    }
  }

  return fired
}

// ---------------------------------------------------------------------------
// Cancel — used when the caller decides a watch is no longer relevant
// (e.g. user took a direct action that supersedes the deferred intent).
// ---------------------------------------------------------------------------
export async function cancelWatch(watchId: string, client?: Client): Promise<void> {
  const c = client ?? createServiceClient()
  const { error } = await c
    .from('watches')
    .update({ status: 'cancelled' })
    .eq('id', watchId)
    .eq('status', 'open')
  if (error) throw error
}

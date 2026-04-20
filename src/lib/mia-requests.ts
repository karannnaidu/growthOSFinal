// Mia requests — structured asks skills emit to the user (platform_connect,
// user_approval, data_needed, info_needed, creative_review). Lifecycle:
//   open → acted_on | dismissed | expired
//
// Skills do NOT block execution — they emit, then skill_runs stores the
// emitted ids in its `requests_emitted` column. The instant lane surfaces
// open high-priority requests into chat; the daily digest lists the rest.

import { createServiceClient } from './supabase/service'

export type MiaRequestType =
  | 'platform_connect'
  | 'user_approval'
  | 'data_needed'
  | 'info_needed'
  | 'creative_review'

export type MiaRequestPriority = 'low' | 'medium' | 'high' | 'critical'

export type MiaRequestStatus = 'open' | 'acted_on' | 'dismissed' | 'expired'

export interface MiaRequestRow {
  id: string
  brand_id: string
  emitted_by_skill_run_id: string | null
  type: MiaRequestType
  payload: Record<string, unknown>
  reason: string
  priority: MiaRequestPriority
  status: MiaRequestStatus
  created_at: string
  valid_until: string | null
  resolved_at: string | null
  resolved_by: string | null
  resolution_payload: Record<string, unknown> | null
}

type Client = ReturnType<typeof createServiceClient>

// ---------------------------------------------------------------------------
// Payload shape guards. Keeps type + payload aligned so the UI can render.
// ---------------------------------------------------------------------------
function validatePayload(type: MiaRequestType, payload: Record<string, unknown>) {
  switch (type) {
    case 'platform_connect': {
      const platform = payload['platform']
      if (typeof platform !== 'string' || !platform.length) {
        throw new Error('platform_connect.payload.platform required')
      }
      return
    }
    case 'user_approval': {
      const action = payload['action']
      if (typeof action !== 'string' || !action.length) {
        throw new Error('user_approval.payload.action required')
      }
      return
    }
    case 'data_needed': {
      const resource = payload['resource']
      if (typeof resource !== 'string') {
        throw new Error('data_needed.payload.resource required')
      }
      return
    }
    case 'info_needed': {
      const question = payload['question']
      if (typeof question !== 'string' || question.length < 5) {
        throw new Error('info_needed.payload.question required')
      }
      return
    }
    case 'creative_review': {
      const creativeId = payload['creative_id']
      if (typeof creativeId !== 'string') {
        throw new Error('creative_review.payload.creative_id required')
      }
      return
    }
    default:
      throw new Error(`Unknown request type: ${type}`)
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
export interface CreateRequestInput {
  brandId: string
  type: MiaRequestType
  payload: Record<string, unknown>
  reason: string
  priority?: MiaRequestPriority
  emittedBySkillRunId?: string
  validUntil?: Date | null
}

export async function createRequest(input: CreateRequestInput, client?: Client): Promise<MiaRequestRow> {
  if (!input.reason || input.reason.length < 3) {
    throw new Error('createRequest: reason is required (drives user-facing why)')
  }
  validatePayload(input.type, input.payload)
  const c = client ?? createServiceClient()

  const { data, error } = await c
    .from('mia_requests')
    .insert({
      brand_id: input.brandId,
      type: input.type,
      payload: input.payload,
      reason: input.reason,
      priority: input.priority ?? 'medium',
      emitted_by_skill_run_id: input.emittedBySkillRunId ?? null,
      valid_until: input.validUntil ? input.validUntil.toISOString() : null,
    })
    .select('*')
    .single()

  if (error) throw error
  return data as MiaRequestRow
}

// ---------------------------------------------------------------------------
// Emit from a skill run — convenience helper that (a) creates the request and
// (b) appends its id to skill_runs.requests_emitted in a single call. Skills
// use this instead of calling createRequest directly so the attribution
// trail is automatic.
// ---------------------------------------------------------------------------
export async function emitRequestFromRun(
  args: { skillRunId: string } & Omit<CreateRequestInput, 'emittedBySkillRunId'>,
  client?: Client,
): Promise<MiaRequestRow> {
  const c = client ?? createServiceClient()
  const { skillRunId, ...rest } = args
  const row = await createRequest({ ...rest, emittedBySkillRunId: skillRunId }, c)

  // Append id to the skill_run's requests_emitted array (jsonb). We read-
  // modify-write because there's no append operator for jsonb arrays in
  // supabase-js; contention is effectively zero (one writer per skill run).
  const { data: run, error: readErr } = await c
    .from('skill_runs')
    .select('requests_emitted')
    .eq('id', skillRunId)
    .maybeSingle()
  if (readErr) return row // non-fatal: request was created, attribution best-effort
  const existing = Array.isArray(run?.requests_emitted) ? (run?.requests_emitted as string[]) : []
  await c
    .from('skill_runs')
    .update({ requests_emitted: [...existing, row.id] })
    .eq('id', skillRunId)

  return row
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------
export async function listOpenRequests(brandId: string, client?: Client): Promise<MiaRequestRow[]> {
  const c = client ?? createServiceClient()
  const { data, error } = await c
    .from('mia_requests')
    .select('*')
    .eq('brand_id', brandId)
    .eq('status', 'open')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as MiaRequestRow[]
}

export async function listInstantLaneRequests(brandId: string, client?: Client): Promise<MiaRequestRow[]> {
  // Instant lane carries open + high/critical only. Everything else rolls up
  // into the daily digest.
  const all = await listOpenRequests(brandId, client)
  return all.filter(r => r.priority === 'high' || r.priority === 'critical')
}

// ---------------------------------------------------------------------------
// Resolve
// ---------------------------------------------------------------------------
export async function markActedOn(
  requestId: string,
  resolvedBy: string,
  resolutionPayload: Record<string, unknown> | null,
  client?: Client,
): Promise<void> {
  const c = client ?? createServiceClient()
  const { error } = await c
    .from('mia_requests')
    .update({
      status: 'acted_on',
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
      resolution_payload: resolutionPayload,
    })
    .eq('id', requestId)
    .eq('status', 'open')
  if (error) throw error
}

export async function markDismissed(
  requestId: string,
  resolvedBy: string,
  client?: Client,
): Promise<void> {
  const c = client ?? createServiceClient()
  const { error } = await c
    .from('mia_requests')
    .update({
      status: 'dismissed',
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
    })
    .eq('id', requestId)
    .eq('status', 'open')
  if (error) throw error
}

export async function expireStaleRequests(brandId: string, client?: Client): Promise<number> {
  const c = client ?? createServiceClient()
  const { data, error } = await c
    .from('mia_requests')
    .update({ status: 'expired', resolved_at: new Date().toISOString() })
    .eq('brand_id', brandId)
    .eq('status', 'open')
    .lt('valid_until', new Date().toISOString())
    .select('id')
  if (error) throw error
  return (data ?? []).length
}

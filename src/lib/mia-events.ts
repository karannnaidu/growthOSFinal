// Mia events bus — producers write rows here; the events-drain cron consumes
// them. Keeps hot paths (chat, webhooks, skill completion) free of Mia's
// planning latency: they emit an event and return immediately, and the
// orchestrator catches up on its own clock.
//
// Event types match mia_events.event_type CHECK constraint.

import { createServiceClient } from './supabase/service'

export type MiaEventType =
  | 'platform_connect'
  | 'skill_delta'
  | 'user_chat'
  | 'new_skill'
  | 'webhook'

export interface MiaEventRow {
  id: string
  brand_id: string
  event_type: MiaEventType
  payload: Record<string, unknown>
  processed: boolean
  processed_at: string | null
  triggered_wake_id: string | null
  created_at: string
}

type Client = ReturnType<typeof createServiceClient>

export async function emitMiaEvent(
  args: { brandId: string; eventType: MiaEventType; payload: Record<string, unknown> },
  client?: Client,
): Promise<MiaEventRow | null> {
  const c = client ?? createServiceClient()
  const { data, error } = await c
    .from('mia_events')
    .insert({
      brand_id: args.brandId,
      event_type: args.eventType,
      payload: args.payload,
    })
    .select('*')
    .single()
  if (error) {
    // Non-fatal — emitters should never break their own flow because the
    // bus is down. Log and move on; the drain cron will catch up next run.
    console.warn('[mia-events] emit failed:', error.message)
    return null
  }
  return data as MiaEventRow
}

export async function fetchUnprocessedEvents(
  limit = 50,
  client?: Client,
): Promise<MiaEventRow[]> {
  const c = client ?? createServiceClient()
  const { data, error } = await c
    .from('mia_events')
    .select('*')
    .eq('processed', false)
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as MiaEventRow[]
}

export async function markEventProcessed(
  eventId: string,
  triggeredWakeId: string | null,
  client?: Client,
): Promise<void> {
  const c = client ?? createServiceClient()
  await c
    .from('mia_events')
    .update({
      processed: true,
      processed_at: new Date().toISOString(),
      triggered_wake_id: triggeredWakeId,
    })
    .eq('id', eventId)
}

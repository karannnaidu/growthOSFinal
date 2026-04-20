// POST /api/cron/mia-events-drain
//
// Pulls unprocessed mia_events and triggers a wake per event. Runs frequently
// (Vercel cron minimum is 1 min). Groups consecutive events for the same
// brand into a single wake to avoid thrashing the planner.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { fetchUnprocessedEvents, markEventProcessed, type MiaEventRow, type MiaEventType } from '@/lib/mia-events'
import { runMiaWake, type WakeSource } from '@/lib/mia-wake'

export const maxDuration = 300

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${process.env.CRON_SECRET}`
}

const WAKE_SOURCE_BY_EVENT: Record<MiaEventType, WakeSource> = {
  platform_connect: 'event:platform_connect',
  skill_delta: 'event:skill_delta',
  user_chat: 'event:user_chat',
  new_skill: 'event:new_skill',
  webhook: 'event:webhook',
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createServiceClient()
  const events = await fetchUnprocessedEvents(100, admin)
  if (!events.length) {
    return NextResponse.json({ ok: true, processed: 0 })
  }

  // Group by brand so each brand wakes at most once per drain run.
  const byBrand = new Map<string, MiaEventRow[]>()
  for (const e of events) {
    const list = byBrand.get(e.brand_id) ?? []
    list.push(e)
    byBrand.set(e.brand_id, list)
  }

  const summary: Array<{ brandId: string; eventCount: number; decisionId: string | null; error?: string }> = []

  for (const [brandId, brandEvents] of byBrand) {
    // Pick the "most important" event to drive the wake source. user_chat
    // wins (it's synchronous-ish from the user's perspective), then webhook,
    // then platform_connect, then the rest.
    const priorityOrder: MiaEventType[] = ['user_chat', 'webhook', 'platform_connect', 'skill_delta', 'new_skill']
    const head = priorityOrder
      .map(t => brandEvents.find(e => e.event_type === t))
      .find(Boolean) ?? brandEvents[0]!

    const source = WAKE_SOURCE_BY_EVENT[head.event_type]
    const combinedPayload = {
      head_event_id: head.id,
      head_event_type: head.event_type,
      head_payload: head.payload,
      other_events: brandEvents.filter(e => e.id !== head.id).map(e => ({
        id: e.id,
        event_type: e.event_type,
        payload: e.payload,
      })),
    }

    try {
      const res = await runMiaWake({
        brandId,
        source,
        userMessage: head.event_type === 'user_chat' ? (head.payload.message as string | undefined) : undefined,
        eventPayload: combinedPayload,
      })
      // Mark all this brand's events processed under this wake.
      for (const e of brandEvents) {
        await markEventProcessed(e.id, res.decisionId, admin)
      }
      summary.push({ brandId, eventCount: brandEvents.length, decisionId: res.decisionId })
    } catch (err) {
      // Leave events unprocessed so the next drain retries.
      summary.push({ brandId, eventCount: brandEvents.length, decisionId: null, error: (err as Error).message })
    }
  }

  return NextResponse.json({ ok: true, processed: summary.length, summary })
}

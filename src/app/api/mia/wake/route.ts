// POST /api/mia/wake
//
// Manual wake trigger. Defaults to source='heartbeat' and dryRun=true so
// internal tools (admin, curl, a one-off script) can inspect what Mia
// *would* do without dispatching skills. Pass `dryRun: false` to actually
// run the cycle.
//
// Auth: requires an authenticated user who owns or is a member of the brand.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runMiaWake, type WakeSource } from '@/lib/mia-wake'

export const maxDuration = 300

const ALLOWED_SOURCES: WakeSource[] = [
  'heartbeat',
  'event:platform_connect',
  'event:skill_delta',
  'event:user_chat',
  'event:new_skill',
  'event:webhook',
  'onboarding',
]

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: { brandId?: string; source?: string; dryRun?: boolean; userMessage?: string; eventPayload?: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { brandId, userMessage, eventPayload } = body
  if (!brandId || typeof brandId !== 'string') {
    return NextResponse.json({ error: 'brandId required' }, { status: 400 })
  }

  const source = (body.source ?? 'heartbeat') as WakeSource
  if (!ALLOWED_SOURCES.includes(source)) {
    return NextResponse.json({ error: `Invalid source. Allowed: ${ALLOWED_SOURCES.join(', ')}` }, { status: 400 })
  }

  // Default to dry-run so someone probing the endpoint doesn't accidentally
  // dispatch real skills. Only `dryRun: false` dispatches.
  const dryRun = body.dryRun !== false

  const admin = createServiceClient()
  const { data: brand } = await admin
    .from('brands')
    .select('id, owner_id')
    .eq('id', brandId)
    .single()
  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  }
  if (brand.owner_id !== user.id) {
    const { data: member } = await admin
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single()
    if (!member) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
  }

  try {
    const result = await runMiaWake({ brandId, source, userMessage, eventPayload, dryRun })
    return NextResponse.json({ ok: true, dryRun, result })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}

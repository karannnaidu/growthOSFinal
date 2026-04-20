// GET /api/mia/wake-status?brandId=…&since=<ISO>
//
// Lightweight polling endpoint for mission-control. Returns the latest
// mia_decisions row for the brand since the given timestamp, plus all
// skill_runs since that timestamp — each enriched with the owning agent id
// resolved from the skill catalog (no brittle string-match in the client).
//
// Auth: requires an authenticated user who owns or is a member of the brand.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { buildMiaCatalog } from '@/lib/mia-catalog'

export const runtime = 'nodejs'

interface Pick {
  skill_id: string
  reason?: string
  priority?: string
}

interface DecisionPayload {
  id: string
  triggered_at: string
  reasoning: string | null
  picks: Array<Pick & { agent: string | null }>
}

interface RunPayload {
  id: string
  skill_id: string
  agent: string | null
  status: string
  blocked_reason: string | null
  created_at: string
  completed_at: string | null
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const url = new URL(request.url)
  const brandId = url.searchParams.get('brandId')
  const since = url.searchParams.get('since')
  if (!brandId) {
    return NextResponse.json({ error: 'brandId required' }, { status: 400 })
  }
  if (!since || Number.isNaN(Date.parse(since))) {
    return NextResponse.json({ error: 'valid since=<ISO timestamp> required' }, { status: 400 })
  }

  const admin = createServiceClient()
  const { data: brand } = await admin.from('brands').select('id, owner_id').eq('id', brandId).single()
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

  const catalog = await buildMiaCatalog()
  const agentFor = (skillId: string): string | null => catalog.skillById.get(skillId)?.agent ?? null

  const [decisionRes, runsRes] = await Promise.all([
    admin
      .from('mia_decisions')
      .select('id, triggered_at, picked, reasoning')
      .eq('brand_id', brandId)
      .gte('triggered_at', since)
      .order('triggered_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('skill_runs')
      .select('id, skill_id, status, blocked_reason, created_at, completed_at')
      .eq('brand_id', brandId)
      .gte('created_at', since)
      .order('created_at', { ascending: true }),
  ])

  const decisionRow = decisionRes.data as
    | { id: string; triggered_at: string; picked: unknown; reasoning: string | null }
    | null

  let decision: DecisionPayload | null = null
  if (decisionRow) {
    const rawPicks = Array.isArray(decisionRow.picked) ? (decisionRow.picked as Pick[]) : []
    decision = {
      id: decisionRow.id,
      triggered_at: decisionRow.triggered_at,
      reasoning: decisionRow.reasoning,
      picks: rawPicks.map(p => ({
        skill_id: p.skill_id,
        reason: p.reason,
        priority: p.priority,
        agent: agentFor(p.skill_id),
      })),
    }
  }

  const runs: RunPayload[] = ((runsRes.data ?? []) as Array<{
    id: string
    skill_id: string
    status: string
    blocked_reason: string | null
    created_at: string
    completed_at: string | null
  }>).map(r => ({
    id: r.id,
    skill_id: r.skill_id,
    agent: agentFor(r.skill_id),
    status: r.status,
    blocked_reason: r.blocked_reason,
    created_at: r.created_at,
    completed_at: r.completed_at,
  }))

  return NextResponse.json({ decision, runs })
}

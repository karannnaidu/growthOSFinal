// src/app/api/mia/chat-context/route.ts
//
// Returns the sidebar/context data for the Mia chat page:
// - brandContext: focus_areas + ai_preset (for "Engine Focus")
// - activeAgents: derived from skill_runs in the last 24h (for "Delegated Sub-Agents")
// - sources: connected platforms (for "Ingested Sources")
//
// Consolidated into one route so the chat page only pays one round-trip on load.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPlatformStatus, syncPlatformStatus, type PlatformStatus } from '@/lib/knowledge/intelligence'

// Window during which a run is still considered "running" when status=running.
const RUNNING_GRACE_MINUTES = 10
// Window during which completed runs mark an agent as "standby" (recently active).
const STANDBY_WINDOW_HOURS = 24
// Agents we care about surfacing in the sidebar — exclude Mia (she's the chat) and agents the user hasn't unlocked.
const DEFAULT_AGENTS = ['scout', 'aria', 'max', 'luna', 'hugo', 'sage', 'atlas', 'echo', 'nova', 'navi', 'penny']

interface ActiveAgent {
  agentId: string
  status: 'running' | 'standby' | 'idle'
}

function platformLabel(key: keyof PlatformStatus): string | null {
  switch (key) {
    case 'meta':
      return 'Meta Ads'
    case 'shopify':
      return 'Shopify'
    case 'ga4':
      return 'Google Analytics 4'
    case 'gsc':
      return 'Google Search Console'
    case 'klaviyo':
      return 'Klaviyo'
    default:
      return null
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  // 1. Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const brandId = request.nextUrl.searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  const admin = createServiceClient()

  // 2. Access check
  const { data: brand } = await admin
    .from('brands')
    .select('id, owner_id, focus_areas, ai_preset, plan')
    .eq('id', brandId)
    .single()

  if (!brand) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  if (brand.owner_id !== user.id) {
    const { data: member } = await admin
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single()
    if (!member) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  // 3. Brand context (Engine Focus)
  const focusAreas: string[] = Array.isArray(brand.focus_areas)
    ? (brand.focus_areas as string[])
    : brand.focus_areas
      ? String(brand.focus_areas)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : []

  const aiPreset = (brand.ai_preset as string | null) ?? (brand.plan as string | null) ?? ''

  // 4. Active agents — derive from skill_runs
  //    running: any run with status=running in the last 10 min
  //    standby: latest run status=completed/failed within 24h
  //    idle:    otherwise (or agent never ran)
  const windowStart = new Date(Date.now() - STANDBY_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
  const { data: runs } = await admin
    .from('skill_runs')
    .select('agent_id, status, created_at')
    .eq('brand_id', brandId)
    .gte('created_at', windowStart)
    .order('created_at', { ascending: false })
    .limit(100)

  const latestByAgent = new Map<string, { status: string; createdAt: string }>()
  for (const r of (runs ?? []) as Array<{ agent_id: string | null; status: string; created_at: string }>) {
    if (!r.agent_id) continue
    if (!latestByAgent.has(r.agent_id)) {
      latestByAgent.set(r.agent_id, { status: r.status, createdAt: r.created_at })
    }
  }

  const runningCutoff = Date.now() - RUNNING_GRACE_MINUTES * 60 * 1000
  const activeAgents: ActiveAgent[] = []
  for (const agentId of DEFAULT_AGENTS) {
    const entry = latestByAgent.get(agentId)
    if (!entry) {
      activeAgents.push({ agentId, status: 'idle' })
      continue
    }
    if (entry.status === 'running' && new Date(entry.createdAt).getTime() > runningCutoff) {
      activeAgents.push({ agentId, status: 'running' })
    } else {
      activeAgents.push({ agentId, status: 'standby' })
    }
  }

  // Sort: running first, then standby, then idle (stable within each bucket).
  const rank = (s: ActiveAgent['status']): number =>
    s === 'running' ? 0 : s === 'standby' ? 1 : 2
  activeAgents.sort((a, b) => rank(a.status) - rank(b.status))

  // 5. Ingested sources — connected platforms
  let platformStatus = await getPlatformStatus(brandId)
  if (!platformStatus) {
    try { platformStatus = await syncPlatformStatus(brandId) } catch { platformStatus = null }
  }

  const sources: string[] = []
  if (platformStatus) {
    for (const key of ['meta', 'shopify', 'ga4', 'gsc', 'klaviyo'] as const) {
      if (platformStatus[key]) {
        const label = platformLabel(key)
        if (label) sources.push(label)
      }
    }
  }

  return NextResponse.json({
    brandContext: { focusAreas, aiPreset },
    activeAgents,
    sources,
  })
}

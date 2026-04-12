// src/app/api/dashboard/context/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  getRecentMiaDecisions, getPlatformStatus,
  getAllAgentSetups, getAllInstructions,
} from '@/lib/knowledge/intelligence'

// 30-second in-memory cache per brand
const cache = new Map<string, { data: unknown; ts: number }>()
const CACHE_TTL = 30_000

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const brandId = request.nextUrl.searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  // Check cache
  const cached = cache.get(brandId)
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data)
  }

  const admin = createServiceClient()

  // Run all queries in parallel
  const [
    skillRunsResult,
    miaDecisions,
    platformStatus,
    agentSetups,
    instructions,
    notificationsResult,
    walletResult,
  ] = await Promise.all([
    admin.from('skill_runs')
      .select('id, agent_id, skill_id, status, model_used, credits_used, duration_ms, output, error_message, created_at')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false })
      .limit(20),
    getRecentMiaDecisions(brandId, 20),
    getPlatformStatus(brandId),
    getAllAgentSetups(brandId),
    getAllInstructions(brandId),
    admin.from('notifications')
      .select('id, type, agent_id, skill_id, title, body, is_read, created_at')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false })
      .limit(10),
    admin.from('wallets')
      .select('balance, free_credits, free_credits_expires_at')
      .eq('brand_id', brandId)
      .single(),
  ])

  const context = {
    skillRuns: skillRunsResult.data ?? [],
    miaDecisions,
    platformStatus,
    agentSetups,
    instructions,
    notifications: notificationsResult.data ?? [],
    wallet: walletResult.data ?? null,
  }

  // Cache
  cache.set(brandId, { data: context, ts: Date.now() })

  return NextResponse.json(context)
}

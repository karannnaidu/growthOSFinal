import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BriefingData {
  date: string
  metrics: {
    skillRunsToday: number
    autoCompletedCount: number
    needsReviewCount: number
    creditsUsedToday: number
  }
  needsReview: Record<string, unknown>[]
  autoCompleted: Record<string, unknown>[]
  recentInsights: Record<string, unknown>[]
  walletBalance: { balance: number; freeCredits: number } | null
  activeAgents: string[]
}

interface BriefingResponse {
  success: boolean
  data?: BriefingData
  error?: { code: string; message: string }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorResponse(code: string, message: string, status: number): NextResponse<BriefingResponse> {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

// ---------------------------------------------------------------------------
// GET /api/mia/briefing?brandId=xxx
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse<BriefingResponse>> {
  // 1. Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return errorResponse('UNAUTHORIZED', 'Not authenticated', 401)

  // 2. Parse query params
  const { searchParams } = new URL(request.url)
  const brandId = searchParams.get('brandId')

  if (!brandId) {
    return errorResponse('VALIDATION_ERROR', 'brandId query parameter is required', 400)
  }

  // 3. Brand access check
  const { data: brand } = await supabase
    .from('brands')
    .select('id, owner_id')
    .eq('id', brandId)
    .single()

  if (!brand) return errorResponse('NOT_FOUND', 'Brand not found', 404)

  if (brand.owner_id !== user.id) {
    const { data: member } = await supabase
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single()
    if (!member) return errorResponse('FORBIDDEN', 'Access denied', 403)
  }

  // 4. Compile morning briefing data
  const today: string = new Date().toISOString().split('T')[0] ?? new Date().toISOString().slice(0, 10)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // a. Recent skill runs (last 24h)
  const { data: recentRuns } = await supabase
    .from('skill_runs')
    .select('*')
    .eq('brand_id', brandId)
    .gte('created_at', twentyFourHoursAgo)
    .order('created_at', { ascending: false })
    .limit(20)

  const skillRuns = recentRuns ?? []

  // b. Unread notifications
  const { data: unreadNotifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('brand_id', brandId)
    .eq('read', false)
    .order('created_at', { ascending: false })

  const notifications = unreadNotifications ?? []

  // c. Wallet balance
  const { data: wallet } = await supabase
    .from('wallets')
    .select('balance, free_credits')
    .eq('brand_id', brandId)
    .single()

  // d. Needs review items: notifications where type='needs_review'
  const needsReview = notifications.filter(
    (n: Record<string, unknown>) => n.type === 'needs_review',
  )

  // e. Auto-completed items: skill runs triggered by mia with status=completed
  const autoCompleted = skillRuns.filter(
    (r: Record<string, unknown>) => r.triggered_by === 'mia' && r.status === 'completed',
  )

  // f. Recent insights: skill runs where agent='scout'
  const recentInsights = skillRuns.filter(
    (r: Record<string, unknown>) => r.agent === 'scout',
  )

  // g. Credits used today by all runs
  const todayStart = `${today}T00:00:00.000Z`
  const creditsUsedToday = skillRuns
    .filter((r: Record<string, unknown>) => {
      const createdAt = r.created_at as string | undefined
      return createdAt && createdAt >= todayStart
    })
    .reduce((sum: number, r: Record<string, unknown>) => sum + ((r.credits_used as number) ?? 0), 0)

  // h. Active agents: unique agent IDs from today's runs
  const agentSet = new Set<string>()
  for (const run of skillRuns) {
    const agent = (run as Record<string, unknown>).agent
    if (agent && typeof agent === 'string') {
      const createdAt = (run as Record<string, unknown>).created_at as string | undefined
      if (createdAt && createdAt >= todayStart) {
        agentSet.add(agent)
      }
    }
  }
  const activeAgents = Array.from(agentSet)

  // 5. Structure response
  const data: BriefingData = {
    date: today,
    metrics: {
      skillRunsToday: skillRuns.filter((r: Record<string, unknown>) => {
        const createdAt = r.created_at as string | undefined
        return createdAt && createdAt >= todayStart
      }).length,
      autoCompletedCount: autoCompleted.length,
      needsReviewCount: needsReview.length,
      creditsUsedToday,
    },
    needsReview: needsReview as Record<string, unknown>[],
    autoCompleted: autoCompleted as Record<string, unknown>[],
    recentInsights: recentInsights as Record<string, unknown>[],
    walletBalance: wallet
      ? { balance: wallet.balance ?? 0, freeCredits: wallet.free_credits ?? 0 }
      : null,
    activeAgents,
  }

  return NextResponse.json({ success: true, data })
}

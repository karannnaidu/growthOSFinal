// ---------------------------------------------------------------------------
// GET /api/admin/metrics
//
// Super-admin only: platform-wide stats.
// Returns: total brands, skill runs, credits used, estimated AI cost.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function checkSuperAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: role } = await supabase
    .from('platform_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin')
    .single()
  return !!role
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const isAdmin = await checkSuperAdmin(supabase, user.id)
  if (!isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // Run all counts in parallel
  const [brandsRes, skillRunsRes, creditsRes, agencyBrandsRes] = await Promise.all([
    supabase.from('brands').select('id', { count: 'exact', head: true }),
    supabase.from('skill_runs').select('id', { count: 'exact', head: true }),
    supabase
      .from('wallet_transactions')
      .select('amount')
      .eq('type', 'debit'),
    supabase
      .from('brands')
      .select('id', { count: 'exact', head: true })
      .eq('plan', 'agency'),
  ])

  const totalBrands = brandsRes.count ?? 0
  const totalSkillRuns = skillRunsRes.count ?? 0
  const totalAgencyBrands = agencyBrandsRes.count ?? 0

  const totalCreditsUsed = (creditsRes.data ?? []).reduce(
    (sum, row) => sum + Math.abs((row.amount as number) ?? 0),
    0,
  )

  // Rough AI cost estimate: 1 credit = $0.001
  const estimatedAiCostUsd = totalCreditsUsed * 0.001

  return NextResponse.json({
    totalBrands,
    totalSkillRuns,
    totalCreditsUsed,
    estimatedAiCostUsd,
    totalAgencyBrands,
  })
}

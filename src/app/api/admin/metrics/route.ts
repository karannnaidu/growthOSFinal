// ---------------------------------------------------------------------------
// GET /api/admin/metrics
//
// Super-admin only: platform-wide stats.
// Returns: total brands, skill runs, credits used, estimated AI cost.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Check admin role using service client (platform_roles may have RLS too)
  const admin = createServiceClient()
  const { data: role } = await admin
    .from('platform_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'super_admin')
    .single()

  if (!role) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // Use service client for all data queries — bypasses RLS circular dependency
  const [brandsRes, skillRunsRes, creditsRes, agencyBrandsRes] = await Promise.all([
    admin.from('brands').select('id', { count: 'exact', head: true }),
    admin.from('skill_runs').select('id', { count: 'exact', head: true }),
    admin
      .from('wallet_transactions')
      .select('amount')
      .eq('type', 'debit'),
    admin
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

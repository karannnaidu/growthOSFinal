// ---------------------------------------------------------------------------
// Admin Dashboard — /admin
//
// Platform-wide metrics, recent errors, and brand list.
// Super-admin only (enforced by layout.tsx).
// ---------------------------------------------------------------------------

import { createClient } from '@/lib/supabase/server'
import { AdminClientPage } from './client'

export default async function AdminPage() {
  const supabase = await createClient()

  // Fetch all data in parallel
  const [brandsRes, skillRunsRes, creditsRes, errorsRes, agencyCountRes] = await Promise.all([
    supabase
      .from('brands')
      .select('id, name, domain, plan, created_at, owner_id')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('skill_runs').select('id', { count: 'exact', head: true }),
    supabase.from('wallet_transactions').select('credits').eq('type', 'usage'),
    supabase
      .from('error_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('brands').select('id', { count: 'exact', head: true }).eq('plan', 'agency'),
  ])

  const brands = (brandsRes.data ?? []) as Array<{
    id: string
    name: string
    domain: string | null
    plan: string
    created_at: string
    owner_id: string
  }>

  const totalBrands = brands.length
  const totalSkillRuns = skillRunsRes.count ?? 0
  const totalAgencyBrands = agencyCountRes.count ?? 0

  const totalCreditsUsed = (creditsRes.data ?? []).reduce(
    (sum, row) => sum + Math.abs((row.credits as number) ?? 0),
    0,
  )

  const estimatedAiCostUsd = totalCreditsUsed * 0.001

  const errors = (errorsRes.data ?? []) as Record<string, unknown>[]

  const metrics = {
    totalBrands,
    totalSkillRuns,
    totalCreditsUsed,
    estimatedAiCostUsd,
    totalAgencyBrands,
  }

  return <AdminClientPage metrics={metrics} brands={brands} recentErrors={errors} />
}

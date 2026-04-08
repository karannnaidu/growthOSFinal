// ---------------------------------------------------------------------------
// Agency Dashboard — /dashboard/agency
//
// Only accessible for brands with plan='agency'.
// Shows sub-brand cards, cross-brand patterns, and a brand switcher.
// ---------------------------------------------------------------------------

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AgencyClientPage } from './client'

export default async function AgencyPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Resolve the user's agency brand
  const { data: agencyBrand } = await supabase
    .from('brands')
    .select('id, name, domain, plan, owner_id')
    .eq('owner_id', user.id)
    .eq('plan', 'agency')
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  // If no agency brand owned — check membership
  let resolvedBrand = agencyBrand
  if (!resolvedBrand) {
    const { data: memberBrands } = await supabase
      .from('brand_members')
      .select('brand_id')
      .eq('user_id', user.id)

    if (memberBrands && memberBrands.length > 0) {
      const memberBrandIds = memberBrands.map((m) => m.brand_id)
      const { data: found } = await supabase
        .from('brands')
        .select('id, name, domain, plan, owner_id')
        .in('id', memberBrandIds)
        .eq('plan', 'agency')
        .limit(1)
        .single()
      resolvedBrand = found
    }
  }

  if (!resolvedBrand) {
    // Not an agency account — redirect to main dashboard
    redirect('/dashboard')
  }

  // Fetch sub-brands
  const { data: subBrands } = await supabase
    .from('brands')
    .select('id, name, domain, plan, created_at')
    .eq('agency_parent_id', resolvedBrand.id)
    .order('created_at', { ascending: true })

  // Fetch wallet balances for sub-brands
  const subBrandIds = (subBrands ?? []).map((b) => b.id as string)
  let walletMap: Record<string, number> = {}
  if (subBrandIds.length > 0) {
    const { data: wallets } = await supabase
      .from('wallets')
      .select('brand_id, balance')
      .in('brand_id', subBrandIds)
    for (const w of wallets ?? []) {
      walletMap[w.brand_id as string] = (w.balance as number) ?? 0
    }
  }

  const brandsWithBalance = (subBrands ?? []).map((b) => ({
    id: b.id as string,
    name: b.name as string,
    domain: (b.domain as string) ?? null,
    plan: (b.plan as string) ?? 'starter',
    createdAt: b.created_at as string,
    balance: walletMap[b.id as string] ?? 0,
  }))

  // Fetch cross-brand patterns
  const { data: patterns } = await supabase
    .from('agency_patterns')
    .select('*')
    .eq('agency_brand_id', resolvedBrand.id)
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <AgencyClientPage
      agencyBrand={{
        id: resolvedBrand.id as string,
        name: resolvedBrand.name as string,
      }}
      subBrands={brandsWithBalance}
      patterns={(patterns ?? []) as Record<string, unknown>[]}
    />
  )
}

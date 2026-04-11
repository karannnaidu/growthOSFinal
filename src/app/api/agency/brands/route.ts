// ---------------------------------------------------------------------------
// GET /api/agency/brands?agencyBrandId=xxx
//
// Returns sub-brands that belong to the given agency brand.
// Auth: user must be owner or member of the agency brand.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const agencyBrandId = searchParams.get('agencyBrandId')

  if (!agencyBrandId) {
    return NextResponse.json({ error: 'agencyBrandId query param is required' }, { status: 400 })
  }

  // Verify the requesting user has access to the agency brand
  const admin = createServiceClient()
  const { data: agencyBrand } = await admin
    .from('brands')
    .select('id, owner_id, plan')
    .eq('id', agencyBrandId)
    .single()

  if (!agencyBrand) {
    return NextResponse.json({ error: 'Agency brand not found' }, { status: 404 })
  }

  if (agencyBrand.plan !== 'agency') {
    return NextResponse.json({ error: 'Brand is not an agency' }, { status: 400 })
  }

  if (agencyBrand.owner_id !== user.id) {
    const { data: membership } = await admin
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', agencyBrandId)
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
  }

  // Fetch sub-brands
  const { data: brands, error } = await supabase
    .from('brands')
    .select('id, name, domain, created_at, plan')
    .eq('agency_parent_id', agencyBrandId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[GET /api/agency/brands] Query error:', error)
    return NextResponse.json({ error: 'Failed to fetch agency brands' }, { status: 500 })
  }

  // Fetch wallet balances for each sub-brand
  const brandIds = (brands ?? []).map((b) => b.id)
  let wallets: Record<string, number> = {}

  if (brandIds.length > 0) {
    const { data: walletRows } = await supabase
      .from('wallets')
      .select('brand_id, balance')
      .in('brand_id', brandIds)

    for (const w of walletRows ?? []) {
      wallets[w.brand_id as string] = (w.balance as number) ?? 0
    }
  }

  const result = (brands ?? []).map((b) => ({
    ...b,
    balance: wallets[b.id as string] ?? 0,
  }))

  return NextResponse.json({ brands: result })
}

// ---------------------------------------------------------------------------
// POST /api/agency/brands/new
//
// Creates a new sub-brand under an agency.
// Request body: { agencyBrandId, name, domain }
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: { agencyBrandId?: string; name?: string; domain?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { agencyBrandId, name, domain } = body

  if (!agencyBrandId || !name) {
    return NextResponse.json({ error: 'agencyBrandId and name are required' }, { status: 400 })
  }

  // Verify user has access to the agency brand
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

  // Create the new sub-brand
  const { data: newBrand, error: brandError } = await supabase
    .from('brands')
    .insert({
      name,
      domain: domain ?? null,
      owner_id: user.id,
      agency_parent_id: agencyBrandId,
      plan: 'starter',
    })
    .select('id, name, domain, created_at, plan, agency_parent_id')
    .single()

  if (brandError) {
    console.error('[POST /api/agency/brands/new] Insert error:', brandError)
    return NextResponse.json({ error: 'Failed to create brand' }, { status: 500 })
  }

  // Create a wallet for the new brand with initial 0 balance
  const { error: walletError } = await supabase.from('wallets').insert({
    brand_id: newBrand.id,
    balance: 0,
    free_credits: 0,
  })

  if (walletError) {
    console.error('[POST /api/agency/brands/new] Wallet insert error:', walletError)
    // Brand created — wallet creation is non-fatal, continue
  }

  return NextResponse.json({ brand: newBrand }, { status: 201 })
}

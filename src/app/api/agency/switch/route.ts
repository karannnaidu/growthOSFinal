// ---------------------------------------------------------------------------
// POST /api/agency/switch
//
// Switches the active brand context for an agency user.
// Request body: { brandId }
// Returns brand data; the client is responsible for storing it in session/state.
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

  let body: { brandId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { brandId } = body

  if (!brandId) {
    return NextResponse.json({ error: 'brandId is required' }, { status: 400 })
  }

  // Verify the user has access to the target brand (owner or member)
  const admin = createServiceClient()
  const { data: brand } = await admin
    .from('brands')
    .select('id, name, domain, plan, agency_parent_id, owner_id')
    .eq('id', brandId)
    .single()

  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  }

  const isOwner = brand.owner_id === user.id
  let hasAccess = isOwner

  if (!isOwner) {
    const { data: membership } = await admin
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single()

    hasAccess = !!membership
  }

  if (!hasAccess) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  return NextResponse.json({
    brand: {
      id: brand.id,
      name: brand.name,
      domain: brand.domain,
      plan: brand.plan,
      agencyParentId: brand.agency_parent_id,
    },
  })
}

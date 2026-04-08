// ---------------------------------------------------------------------------
// GET /api/agency/patterns?agencyBrandId=xxx
//
// Returns cross-brand patterns detected for an agency.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  // Verify user has access to the agency brand
  const { data: agencyBrand } = await supabase
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
    const { data: membership } = await supabase
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', agencyBrandId)
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
  }

  // Fetch patterns
  const { data: patterns, error } = await supabase
    .from('agency_patterns')
    .select('*')
    .eq('agency_brand_id', agencyBrandId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[GET /api/agency/patterns] Query error:', error)
    return NextResponse.json({ error: 'Failed to fetch patterns' }, { status: 500 })
  }

  return NextResponse.json({ patterns: patterns ?? [] })
}

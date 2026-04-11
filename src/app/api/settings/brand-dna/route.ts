import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// ---------------------------------------------------------------------------
// GET /api/settings/brand-dna?brandId=xxx
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const brandId = request.nextUrl.searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'brandId is required' }, { status: 400 })

  // Use service client to bypass RLS
  const admin = createServiceClient()

  const { data: brand, error } = await admin
    .from('brands')
    .select('id, name, domain, owner_id, product_context, brand_guidelines')
    .eq('id', brandId)
    .single()

  if (error || !brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  }

  // Verify access
  if (brand.owner_id !== user.id) {
    const { data: membership } = await admin
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single()
    if (!membership) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  return NextResponse.json({
    brandId: brand.id,
    name: brand.name,
    domain: brand.domain,
    dna: brand.brand_guidelines ?? null,
    products: brand.product_context ?? [],
  })
}

// ---------------------------------------------------------------------------
// PATCH /api/settings/brand-dna — update brand DNA fields
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await request.json() as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const brandId = body.brandId as string
  if (!brandId) return NextResponse.json({ error: 'brandId is required' }, { status: 400 })

  const admin = createServiceClient()

  // Verify access
  const { data: brand } = await admin
    .from('brands')
    .select('id, owner_id')
    .eq('id', brandId)
    .single()

  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  if (brand.owner_id !== user.id) {
    const { data: membership } = await admin
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single()
    if (!membership) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const dna = body.dna as Record<string, unknown> | undefined
  const products = body.products as unknown[] | undefined

  const update: Record<string, unknown> = {}
  if (dna !== undefined) update.brand_guidelines = dna
  if (products !== undefined) update.product_context = products

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { error } = await admin
    .from('brands')
    .update(update)
    .eq('id', brandId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

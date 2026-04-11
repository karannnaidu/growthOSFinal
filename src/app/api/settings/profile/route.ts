// ---------------------------------------------------------------------------
// GET  /api/settings/profile?brandId=xxx  — return brand profile fields
// PATCH /api/settings/profile             — update brand profile fields
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// ---------------------------------------------------------------------------
// Auth + brand access helper
// ---------------------------------------------------------------------------

async function resolveBrand(adminClient: ReturnType<typeof createServiceClient>, userId: string, brandId: string) {
  const { data: brand } = await adminClient
    .from('brands')
    .select('id, owner_id')
    .eq('id', brandId)
    .single()

  if (!brand) return { error: 'Brand not found', status: 404 }

  if (brand.owner_id !== userId) {
    const { data: membership } = await adminClient
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', userId)
      .single()
    if (!membership) return { error: 'Access denied', status: 403 }
  }

  return { brand }
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const brandId = searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'brandId is required' }, { status: 400 })

  const admin = createServiceClient()
  const resolved = await resolveBrand(admin, user.id, brandId)
  if (resolved.error) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const { data: brand, error } = await supabase
    .from('brands')
    .select('name, domain, logo_url, focus_areas')
    .eq('id', brandId)
    .single()

  if (error || !brand) {
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 })
  }

  return NextResponse.json({
    name: brand.name ?? '',
    domain: brand.domain ?? '',
    logo_url: brand.logo_url ?? '',
    focus_areas: brand.focus_areas ?? [],
  })
}

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { brandId, name, domain, logo_url, focus_areas } = body as {
    brandId?: string
    name?: string
    domain?: string
    logo_url?: string
    focus_areas?: string[]
  }

  if (!brandId) return NextResponse.json({ error: 'brandId is required' }, { status: 400 })

  const admin = createServiceClient()
  const resolved = await resolveBrand(admin, user.id, brandId)
  if (resolved.error) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  // Build update payload — only include provided fields
  const updatePayload: Record<string, unknown> = {}
  if (name !== undefined) updatePayload.name = name.trim()
  if (domain !== undefined) updatePayload.domain = domain.trim()
  if (logo_url !== undefined) updatePayload.logo_url = logo_url.trim()
  if (focus_areas !== undefined) updatePayload.focus_areas = focus_areas

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from('brands')
    .update(updatePayload)
    .eq('id', brandId)
    .select('name, domain, logo_url, focus_areas')
    .single()

  if (error) {
    console.error('[PATCH /api/settings/profile] DB error:', error)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }

  return NextResponse.json({
    name: updated?.name ?? '',
    domain: updated?.domain ?? '',
    logo_url: updated?.logo_url ?? '',
    focus_areas: updated?.focus_areas ?? [],
  })
}

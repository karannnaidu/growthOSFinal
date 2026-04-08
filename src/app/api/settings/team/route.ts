// ---------------------------------------------------------------------------
// GET  /api/settings/team?brandId=xxx  — list brand_members
// POST /api/settings/team              — invite a new member
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Auth + brand access helper
// ---------------------------------------------------------------------------

async function resolveBrandWithRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  brandId: string,
) {
  const { data: brand } = await supabase
    .from('brands')
    .select('id, owner_id')
    .eq('id', brandId)
    .single()

  if (!brand) return { error: 'Brand not found', status: 404, isOwner: false }

  if (brand.owner_id === userId) return { brand, isOwner: true }

  const { data: membership } = await supabase
    .from('brand_members')
    .select('brand_id, role')
    .eq('brand_id', brandId)
    .eq('user_id', userId)
    .single()

  if (!membership) return { error: 'Access denied', status: 403, isOwner: false }

  return { brand, isOwner: false, role: membership.role as string }
}

// ---------------------------------------------------------------------------
// GET — list members
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const brandId = searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'brandId is required' }, { status: 400 })

  const resolved = await resolveBrandWithRole(supabase, user.id, brandId)
  if (resolved.error) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  // Fetch members, joining with profiles for email/name
  const { data: members, error } = await supabase
    .from('brand_members')
    .select('id, user_id, brand_id, role, created_at, profiles(email, full_name)')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[GET /api/settings/team] DB error:', error)
    return NextResponse.json({ error: 'Failed to fetch team' }, { status: 500 })
  }

  const formatted = (members ?? []).map((m) => {
    const profile = (m.profiles as unknown) as { email?: string; full_name?: string } | null
    return {
      id: m.id,
      user_id: m.user_id,
      brand_id: m.brand_id,
      role: m.role,
      email: profile?.email ?? null,
      full_name: profile?.full_name ?? null,
      created_at: m.created_at,
    }
  })

  return NextResponse.json({ members: formatted })
}

// ---------------------------------------------------------------------------
// POST — invite member
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { brandId, email, role } = body as {
    brandId?: string
    email?: string
    role?: string
  }

  if (!brandId) return NextResponse.json({ error: 'brandId is required' }, { status: 400 })
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }

  const normalizedRole = role === 'admin' ? 'admin' : 'member'

  // Access check — only owner or admins can invite
  const resolved = await resolveBrandWithRole(supabase, user.id, brandId)
  if (resolved.error) return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  if (!resolved.isOwner && resolved.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can invite members' }, { status: 403 })
  }

  // Look up the user by email in profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('email', email.toLowerCase().trim())
    .single()

  if (!profile) {
    // User doesn't exist yet — create a placeholder member record or return a user-friendly error
    return NextResponse.json(
      { error: 'No account found with that email. Ask them to sign up first.' },
      { status: 404 },
    )
  }

  // Check if already a member
  const { data: existing } = await supabase
    .from('brand_members')
    .select('id')
    .eq('brand_id', brandId)
    .eq('user_id', profile.id)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'User is already a team member.' }, { status: 409 })
  }

  // Insert member
  const { data: member, error: insertError } = await supabase
    .from('brand_members')
    .insert({
      brand_id: brandId,
      user_id: profile.id,
      role: normalizedRole,
    })
    .select('id, user_id, brand_id, role, created_at')
    .single()

  if (insertError) {
    console.error('[POST /api/settings/team] DB error:', insertError)
    return NextResponse.json({ error: 'Failed to add member' }, { status: 500 })
  }

  return NextResponse.json({
    member: {
      ...member,
      email: profile.email,
      full_name: profile.full_name,
    },
  })
}

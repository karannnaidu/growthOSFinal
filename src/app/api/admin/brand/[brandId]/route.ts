// ---------------------------------------------------------------------------
// GET /api/admin/brand/[brandId]
//
// Super-admin only: returns full brand detail for view-as-brand.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

async function checkSuperAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: role } = await supabase
    .from('platform_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin')
    .single()
  return !!role
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ brandId: string }> },
): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const isAdmin = await checkSuperAdmin(supabase, user.id)
  if (!isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { brandId } = await params

  const admin = createServiceClient()
  const { data: brand, error: brandError } = await admin
    .from('brands')
    .select('*')
    .eq('id', brandId)
    .single()

  if (brandError || !brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  }

  // Fetch wallet
  const { data: wallet } = await admin
    .from('wallets')
    .select('balance, free_credits, auto_recharge')
    .eq('brand_id', brandId)
    .single()

  // Recent skill runs
  const { data: recentRuns } = await admin
    .from('skill_runs')
    .select('id, skill_name, agent, status, credits_used, created_at')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
    .limit(10)

  // Member count
  const { count: memberCount } = await admin
    .from('brand_members')
    .select('brand_id', { count: 'exact', head: true })
    .eq('brand_id', brandId)

  return NextResponse.json({
    brand,
    wallet: wallet ?? null,
    recentRuns: recentRuns ?? [],
    memberCount: memberCount ?? 0,
  })
}

// ---------------------------------------------------------------------------
// GET /api/exports/runs?brandId=xxx
//
// Returns the last 50 skill runs for a brand.
// Uses the service client to bypass the RLS circular dependency on skill_runs
// (which references brands/brand_members that have recursive RLS policies).
//
// Response shape:
//   { runs: SkillRun[] }
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest): Promise<NextResponse> {
  // 1. Auth check via server client
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // 2. Query params
  const { searchParams } = new URL(request.url)
  const brandId = searchParams.get('brandId')

  if (!brandId) {
    return NextResponse.json({ error: 'brandId query param is required' }, { status: 400 })
  }

  // 3. Verify brand access using service client (bypasses RLS)
  const admin = createServiceClient()

  const { data: brand } = await admin
    .from('brands')
    .select('id, owner_id')
    .eq('id', brandId)
    .single()

  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  }

  if (brand.owner_id !== user.id) {
    const { data: membership } = await admin
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
  }

  // 4. Fetch skill runs via service client (bypasses RLS recursive policies)
  const { data: runs, error } = await admin
    .from('skill_runs')
    .select('id, skill_name, agent, status, created_at, output, credits_used')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[GET /api/exports/runs] DB error:', error)
    return NextResponse.json({ error: 'Failed to fetch skill runs' }, { status: 500 })
  }

  return NextResponse.json({ runs: runs ?? [] })
}

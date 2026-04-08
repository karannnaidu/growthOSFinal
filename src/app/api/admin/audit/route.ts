// ---------------------------------------------------------------------------
// GET /api/admin/audit?page=1&limit=20&brandId=xxx&userId=xxx
//
// Super-admin only: paginated audit trail.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function checkSuperAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: role } = await supabase
    .from('platform_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin')
    .single()
  return !!role
}

export async function GET(request: NextRequest): Promise<NextResponse> {
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

  const { searchParams } = new URL(request.url)
  const brandIdFilter = searchParams.get('brandId')
  const userIdFilter = searchParams.get('userId')
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
  const offset = (page - 1) * limit

  let query = supabase
    .from('audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (brandIdFilter) {
    query = query.eq('brand_id', brandIdFilter)
  }
  if (userIdFilter) {
    query = query.eq('user_id', userIdFilter)
  }

  const { data: entries, error, count } = await query

  if (error) {
    console.error('[GET /api/admin/audit] Query error:', error)
    return NextResponse.json({ error: 'Failed to fetch audit log' }, { status: 500 })
  }

  return NextResponse.json({ entries: entries ?? [], total: count ?? 0, page, limit })
}

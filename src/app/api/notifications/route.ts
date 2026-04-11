// ---------------------------------------------------------------------------
// GET /api/notifications?brandId=xxx&page=1&limit=20
//
// Returns paginated notifications for a brand.
//
// Response shape:
//   { notifications: Notification[], unreadCount: number }
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest): Promise<NextResponse> {
  // 1. Auth check
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
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
  const offset = (page - 1) * limit

  if (!brandId) {
    return NextResponse.json({ error: 'brandId query param is required' }, { status: 400 })
  }

  // 3. Verify brand access
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

  // 4. Fetch notifications
  const { data: notifications, error } = await supabase
    .from('notifications')
    .select('id, type, title, body, read, created_at, action_url, agent_id, skill_run_id')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[GET /api/notifications] Query error:', error)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }

  // 5. Unread count (separate query for accuracy across pages)
  const { count: unreadCount } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brandId)
    .eq('read', false)

  return NextResponse.json({
    notifications: notifications ?? [],
    unreadCount: unreadCount ?? 0,
    page,
    limit,
  })
}

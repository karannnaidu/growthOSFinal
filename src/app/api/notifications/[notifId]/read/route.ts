// ---------------------------------------------------------------------------
// PATCH /api/notifications/[notifId]/read
//
// Marks a single notification as read.
//
// Response shape:
//   { success: true }
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ notifId: string }>
}

export async function PATCH(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  // 1. Auth check
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // 2. Route param
  const { notifId } = await context.params

  if (!notifId) {
    return NextResponse.json({ error: 'notifId is required' }, { status: 400 })
  }

  // 3. Fetch the notification to verify brand ownership
  const { data: notification } = await supabase
    .from('notifications')
    .select('id, brand_id')
    .eq('id', notifId)
    .single()

  if (!notification) {
    return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
  }

  // 4. Verify the user owns the brand
  const { data: brand } = await supabase
    .from('brands')
    .select('id, owner_id')
    .eq('id', notification.brand_id)
    .single()

  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  }

  if (brand.owner_id !== user.id) {
    const { data: membership } = await supabase
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', notification.brand_id)
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
  }

  // 5. Mark as read
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notifId)

  if (error) {
    console.error('[PATCH /api/notifications/read] Update error:', error)
    return NextResponse.json({ error: 'Failed to mark notification as read' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

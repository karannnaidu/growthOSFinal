import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * GET /api/brands/me — resolve the current user's brand ID
 * Uses service client to bypass RLS recursive policy issues.
 */
export async function GET(): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const admin = createServiceClient()

  // Check owned brand first
  const { data: owned } = await admin
    .from('brands')
    .select('id, name')
    .eq('owner_id', user.id)
    .limit(1)
    .single()

  if (owned) {
    return NextResponse.json({ brandId: owned.id, name: owned.name })
  }

  // Check membership
  const { data: member } = await admin
    .from('brand_members')
    .select('brand_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (member) {
    return NextResponse.json({ brandId: member.brand_id })
  }

  return NextResponse.json({ error: 'No brand found' }, { status: 404 })
}

// src/app/api/preflight/run/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runPreflight } from '@/lib/preflight'

export const maxDuration = 60

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { brandId: string; force?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { brandId, force } = body
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  // Access check: user must own or be a member of this brand.
  const admin = createServiceClient()
  const { data: brand } = await admin.from('brands').select('id, owner_id').eq('id', brandId).single()
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  if (brand.owner_id !== user.id) {
    const { data: member } = await admin
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single()
    if (!member) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  try {
    const result = await runPreflight(brandId, { force: Boolean(force) })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[api/preflight/run]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Preflight failed' },
      { status: 500 },
    )
  }
}

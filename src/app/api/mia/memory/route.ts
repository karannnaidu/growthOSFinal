import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { listMemories, deleteMemory } from '@/lib/mia-memory'

async function assertAccess(userId: string, brandId: string): Promise<boolean> {
  const admin = createServiceClient()
  const { data: brand } = await admin.from('brands').select('owner_id').eq('id', brandId).single()
  if (!brand) return false
  if (brand.owner_id === userId) return true
  const { data: member } = await admin
    .from('brand_members').select('brand_id')
    .eq('brand_id', brandId).eq('user_id', userId).single()
  return !!member
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const brandId = new URL(request.url).searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })
  if (!(await assertAccess(user.id, brandId))) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  const memories = await listMemories(brandId)
  return NextResponse.json({ memories })
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { brandId?: string; memoryId?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { brandId, memoryId } = body
  if (!brandId || !memoryId) {
    return NextResponse.json({ error: 'brandId and memoryId required' }, { status: 400 })
  }
  if (!(await assertAccess(user.id, brandId))) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  const ok = await deleteMemory(brandId, memoryId)
  if (!ok) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const brandId = request.nextUrl.searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  // Verify brand access using service client to bypass RLS circular dependency
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

  const [nodesResult, edgesResult] = await Promise.all([
    admin
      .from('knowledge_nodes')
      .select('*')
      .eq('brand_id', brandId)
      .order('updated_at', { ascending: false }),
    admin
      .from('knowledge_edges')
      .select('*')
      .eq('brand_id', brandId),
  ])

  if (nodesResult.error) return NextResponse.json({ error: 'Failed to fetch knowledge nodes' }, { status: 500 })
  if (edgesResult.error) return NextResponse.json({ error: 'Failed to fetch knowledge edges' }, { status: 500 })

  return NextResponse.json({
    nodes: nodesResult.data ?? [],
    edges: edgesResult.data ?? [],
  })
}

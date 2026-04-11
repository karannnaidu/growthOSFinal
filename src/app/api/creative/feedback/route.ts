// ---------------------------------------------------------------------------
// POST /api/creative/feedback
//
// Record actual performance metrics for a creative by creating a
// knowledge_snapshot for the given node.
// Request: { brandId, creativeNodeId, metrics: { ctr, roas, impressions, conversions } }
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Auth
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { brandId, creativeNodeId, metrics } = body as {
    brandId?: string
    creativeNodeId?: string
    metrics?: { ctr?: number; roas?: number; impressions?: number; conversions?: number }
  }

  if (!brandId || !creativeNodeId || !metrics) {
    return NextResponse.json(
      { error: 'brandId, creativeNodeId, and metrics are required' },
      { status: 400 },
    )
  }

  // Brand access check
  const admin = createServiceClient()
  const { data: brand } = await admin
    .from('brands')
    .select('id, owner_id')
    .eq('id', brandId)
    .single()

  if (!brand) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (brand.owner_id !== user.id) {
    const { data: member } = await admin
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single()
    if (!member) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // 2. Verify creative node exists and belongs to brand
  const { data: node, error: nodeError } = await supabase
    .from('knowledge_nodes')
    .select('id, brand_id')
    .eq('id', creativeNodeId)
    .eq('brand_id', brandId)
    .single()

  if (nodeError || !node) {
    return NextResponse.json(
      { error: 'Creative node not found or does not belong to this brand' },
      { status: 404 },
    )
  }

  // 3. Create knowledge_snapshot with provided metrics
  const { error: snapshotError } = await supabase
    .from('knowledge_snapshots')
    .insert({
      node_id: creativeNodeId,
      metrics: {
        ctr: metrics.ctr ?? null,
        roas: metrics.roas ?? null,
        impressions: metrics.impressions ?? null,
        conversions: metrics.conversions ?? null,
      },
      captured_at: new Date().toISOString(),
    })

  if (snapshotError) {
    console.error('[POST /api/creative/feedback] Snapshot insert error:', snapshotError)
    return NextResponse.json(
      { error: 'Failed to record feedback', detail: snapshotError.message },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true })
}

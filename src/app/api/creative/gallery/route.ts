// ---------------------------------------------------------------------------
// GET /api/creative/gallery?brandId=X&page=1&limit=20
//
// Returns paginated creative assets from the knowledge graph with latest
// performance data from knowledge_snapshots.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest): Promise<NextResponse> {
  // 1. Auth
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse query params
  const { searchParams } = new URL(request.url)
  const brandId = searchParams.get('brandId')
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))

  if (!brandId) {
    return NextResponse.json({ error: 'brandId query param is required' }, { status: 400 })
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

  // 3. Query knowledge_nodes for creatives with latest snapshot data
  const offset = (page - 1) * limit

  const { data: nodes, error: nodesError, count } = await supabase
    .from('knowledge_nodes')
    .select('id, name, node_type, properties, created_at, source_skill, source_run_id', {
      count: 'exact',
    })
    .eq('brand_id', brandId)
    .in('node_type', ['ad_creative', 'video_asset'])
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (nodesError) {
    console.error('[GET /api/creative/gallery] Query error:', nodesError)
    return NextResponse.json({ error: 'Failed to fetch gallery' }, { status: 500 })
  }

  if (!nodes || nodes.length === 0) {
    return NextResponse.json({
      items: [],
      page,
      limit,
      total: count ?? 0,
    })
  }

  // 4. Fetch latest snapshots for returned nodes
  const nodeIds = nodes.map((n) => n.id)
  const { data: snapshots } = await supabase
    .from('knowledge_snapshots')
    .select('node_id, metrics, captured_at')
    .in('node_id', nodeIds)
    .order('captured_at', { ascending: false })

  // Build a map of nodeId -> latest snapshot metrics
  const snapshotMap = new Map<string, { metrics: any; captured_at: string }>()
  for (const snap of snapshots ?? []) {
    if (!snapshotMap.has(snap.node_id)) {
      snapshotMap.set(snap.node_id, {
        metrics: snap.metrics,
        captured_at: snap.captured_at,
      })
    }
  }

  // 5. Build response items
  const items = nodes.map((node) => {
    const snapshot = snapshotMap.get(node.id)
    return {
      id: node.id,
      name: node.name,
      nodeType: node.node_type,
      mediaUrl: node.properties?.media_url ?? null,
      properties: node.properties ?? {},
      createdAt: node.created_at,
      sourceSkill: node.source_skill,
      sourceRunId: node.source_run_id,
      performance: snapshot?.metrics ?? null,
      performanceUpdatedAt: snapshot?.captured_at ?? null,
    }
  })

  return NextResponse.json({
    items,
    page,
    limit,
    total: count ?? 0,
  })
}

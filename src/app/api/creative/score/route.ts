// ---------------------------------------------------------------------------
// POST /api/creative/score
//
// Score an existing creative from the knowledge graph using AI analysis.
// Request: { brandId, creativeNodeId }
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  gatherCreativeContext,
  scoreCreative,
} from '@/lib/creative-intelligence'

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
  const { brandId, creativeNodeId } = body as {
    brandId?: string
    creativeNodeId?: string
  }

  if (!brandId || !creativeNodeId) {
    return NextResponse.json(
      { error: 'brandId and creativeNodeId are required' },
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

  // 2. Load creative node
  const { data: node, error: nodeError } = await supabase
    .from('knowledge_nodes')
    .select('id, name, node_type, properties, brand_id')
    .eq('id', creativeNodeId)
    .eq('brand_id', brandId)
    .in('node_type', ['ad_creative', 'video_asset'])
    .single()

  if (nodeError || !node) {
    return NextResponse.json(
      { error: 'Creative node not found or does not belong to this brand' },
      { status: 404 },
    )
  }

  try {
    // 3. Gather context
    const context = await gatherCreativeContext(brandId)

    // 4. Score
    const copyText = node.properties?.copy_body
      ?? node.properties?.copy
      ?? node.name
    const imageUrl = node.properties?.media_url

    const score = await scoreCreative(
      brandId,
      { copyText, imageUrl },
      context,
    )

    return NextResponse.json({ score })
  } catch (err) {
    console.error('[POST /api/creative/score] Error:', err)
    return NextResponse.json(
      { error: 'Failed to score creative', detail: String(err) },
      { status: 500 },
    )
  }
}

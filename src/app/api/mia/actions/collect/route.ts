// src/app/api/mia/actions/collect/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

interface CollectRequest {
  brandId: string
  field: string
  value: string
  storeIn: 'brand_context' | 'agent_setup'
  agentId?: string
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Auth
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // 2. Parse body
  let body: Partial<CollectRequest>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { brandId, field, value, storeIn, agentId } = body
  if (!brandId || !field || value === undefined || !storeIn) {
    return NextResponse.json(
      { error: 'brandId, field, value, and storeIn are required' },
      { status: 400 },
    )
  }

  // 3. Brand access check
  const admin = createServiceClient()
  const { data: brand } = await admin
    .from('brands')
    .select('id, owner_id, product_context')
    .eq('id', brandId)
    .single()

  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  }

  if (brand.owner_id !== user.id) {
    const { data: member } = await admin
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single()
    if (!member) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
  }

  // 4. Store the value
  if (storeIn === 'brand_context') {
    const existing = (brand.product_context as Record<string, unknown>) ?? {}
    const updated = { ...existing, [field]: value }

    const { error } = await admin
      .from('brands')
      .update({ product_context: updated })
      .eq('id', brandId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else if (storeIn === 'agent_setup' && agentId) {
    // Upsert into brand_agents config
    const { data: existing } = await admin
      .from('brand_agents')
      .select('config')
      .eq('brand_id', brandId)
      .eq('agent_id', agentId)
      .single()

    const config = (existing?.config as Record<string, unknown>) ?? {}
    config[field] = value

    await admin.from('brand_agents').upsert(
      {
        brand_id: brandId,
        agent_id: agentId,
        config,
      },
      { onConflict: 'brand_id,agent_id' },
    )
  }

  return NextResponse.json({ success: true, field, stored: true })
}

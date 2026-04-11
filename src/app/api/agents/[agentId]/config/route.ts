// ---------------------------------------------------------------------------
// PATCH /api/agents/[agentId]/config
//
// Update brand-specific agent configuration (enabled, autoApprove, schedule).
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

interface PatchConfigBody {
  brandId: string
  enabled?: boolean
  autoApprove?: boolean
  schedule?: string | null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
): Promise<NextResponse> {
  const { agentId } = await params

  // 1. Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // 2. Parse body
  let body: Partial<PatchConfigBody>
  try {
    body = await request.json() as Partial<PatchConfigBody>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { brandId, enabled, autoApprove, schedule } = body
  if (!brandId) return NextResponse.json({ error: 'brandId is required' }, { status: 400 })

  // 3. Verify brand access
  const admin = createServiceClient()
  const { data: brand } = await admin
    .from('brands')
    .select('id, owner_id')
    .eq('id', brandId)
    .single()

  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  if (brand.owner_id !== user.id) {
    const { data: membership } = await admin
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single()
    if (!membership) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // 4. Fetch current record to merge config
  const { data: existing } = await supabase
    .from('brand_agents')
    .select('config')
    .eq('brand_id', brandId)
    .eq('agent_id', agentId)
    .single()

  const currentConfig = (existing?.config as Record<string, unknown> | null) ?? {}

  const updatedConfig: Record<string, unknown> = {
    ...currentConfig,
    ...(autoApprove !== undefined ? { auto_approve: autoApprove } : {}),
    ...(schedule !== undefined ? { schedule } : {}),
  }

  // 5. Upsert brand_agents
  const updatePayload: Record<string, unknown> = {
    brand_id: brandId,
    agent_id: agentId,
    config: updatedConfig,
  }
  if (enabled !== undefined) updatePayload.enabled = enabled

  const { error } = await supabase
    .from('brand_agents')
    .upsert(updatePayload, { onConflict: 'brand_id,agent_id' })

  if (error) {
    console.error('[PATCH /api/agents/[agentId]/config]', error.message)
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

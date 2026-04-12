// src/app/api/agents/[agentId]/setup/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRequirements, getAgentSetupConfig } from '@/lib/agent-setup'
import { upsertBrandData } from '@/lib/knowledge/intelligence'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { agentId } = await params
  const brandId = request.nextUrl.searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  const setup = getAgentSetupConfig(agentId)
  const result = await checkRequirements(brandId, agentId)

  return NextResponse.json({
    agentId,
    hasSetup: !!setup,
    chatPrompt: setup?.chat_prompt ?? null,
    ...result,
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { agentId } = await params
  let body: { brandId: string; entries: Array<{ key: string; value: unknown }> }
  try {
    body = await request.json() as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { brandId, entries } = body
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  const admin = createServiceClient()
  const { data: brand } = await admin.from('brands').select('id, owner_id').eq('id', brandId).single()
  if (!brand || brand.owner_id !== user.id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  for (const entry of entries ?? []) {
    const [, dataType] = entry.key.split(':')
    if (dataType) {
      await upsertBrandData(brandId, dataType, { value: entry.value }, 'manual')
    }
  }

  const result = await checkRequirements(brandId, agentId)
  return NextResponse.json({ success: true, ...result })
}

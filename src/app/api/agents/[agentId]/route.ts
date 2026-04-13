// ---------------------------------------------------------------------------
// GET /api/agents/[agentId]?brandId=xxx
//
// Returns agent config, recent skill runs, and brand-specific agent config.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { AgentConfig } from '@/lib/agent-spawner'

const AGENTS_JSON_PATH = path.join(process.cwd(), 'skills', 'agents.json')

function loadAllAgents(): AgentConfig[] {
  try {
    return JSON.parse(fs.readFileSync(AGENTS_JSON_PATH, 'utf-8')) as AgentConfig[]
  } catch {
    return []
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
): Promise<NextResponse> {
  const { agentId } = await params

  // 1. Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // 2. Read brandId param
  const { searchParams } = new URL(request.url)
  const brandId = searchParams.get('brandId')
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

  // 4. Load agent from agents.json
  const allAgents = loadAllAgents()
  const agent = allAgents.find((a) => a.id === agentId)
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  // 5. Query recent skill runs for this agent + brand
  //    Use service client because the user-session client can hit recursive RLS
  //    on skill_runs → brands → brand_members.  Brand access is already verified above.
  const { data: recentRuns } = await admin
    .from('skill_runs')
    .select('id, skill_id, status, output, model_used, credits_used, duration_ms, created_at, triggered_by, error_message')
    .eq('brand_id', brandId)
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(10)

  // 6. Query brand_agents for config
  const { data: brandAgent } = await supabase
    .from('brand_agents')
    .select('enabled, config')
    .eq('brand_id', brandId)
    .eq('agent_id', agentId)
    .single()

  const config = {
    enabled: brandAgent?.enabled ?? true,
    autoApprove: (brandAgent?.config as Record<string, unknown> | null)?.auto_approve ?? false,
    revealed: (brandAgent?.config as Record<string, unknown> | null)?.revealed ?? true,
  }

  return NextResponse.json({ agent, recentRuns: recentRuns ?? [], config })
}

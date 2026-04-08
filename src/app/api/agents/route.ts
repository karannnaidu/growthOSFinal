// ---------------------------------------------------------------------------
// GET /api/agents?brandId=xxx
//
// Returns the list of agents visible to a brand right now, respecting
// progressive reveal (Task 4.3).
//
// Response shape:
//   { agents: AgentConfig[] }
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { createClient } from '@/lib/supabase/server'
import { getRevealedAgents } from '@/lib/agent-reveal'
import type { AgentConfig } from '@/lib/agent-spawner'

// ---------------------------------------------------------------------------
// Agents.json loader (reuses the same file the spawner uses)
// ---------------------------------------------------------------------------

const AGENTS_JSON_PATH = path.join(process.cwd(), 'skills', 'agents.json')

function loadAllAgents(): AgentConfig[] {
  try {
    const raw = fs.readFileSync(AGENTS_JSON_PATH, 'utf-8')
    return JSON.parse(raw) as AgentConfig[]
  } catch (err) {
    console.error('[GET /api/agents] Failed to load agents.json:', err)
    return []
  }
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  // 1. Auth check
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // 2. Read + validate brandId query param
  const { searchParams } = new URL(request.url)
  const brandId = searchParams.get('brandId')

  if (!brandId) {
    return NextResponse.json({ error: 'brandId query param is required' }, { status: 400 })
  }

  // 3. Verify the user has access to this brand
  const { data: brand } = await supabase
    .from('brands')
    .select('id, owner_id')
    .eq('id', brandId)
    .single()

  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  }

  if (brand.owner_id !== user.id) {
    const { data: membership } = await supabase
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
  }

  // 4. Get the agent IDs that are currently revealed for this brand
  const revealedIds = await getRevealedAgents(brandId)
  const revealedSet = new Set(revealedIds)

  // 5. Load full agent configs and filter to revealed only
  const allAgents = loadAllAgents()
  const agents = allAgents.filter((a) => revealedSet.has(a.id))

  return NextResponse.json({ agents })
}

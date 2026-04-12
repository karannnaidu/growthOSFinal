export const maxDuration = 60 // Allow up to 60s for LLM call

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runSkill } from '@/lib/skills-engine'

// ---------------------------------------------------------------------------
// POST /api/mia/trigger — manually trigger Mia's daily cycle
//
// Runs Scout health-check first, then skills-engine auto-chains to Mia
// via the mia-orchestrator (which decides follow-up actions).
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { brandId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { brandId } = body
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  // Verify access
  const admin = createServiceClient()
  const { data: brand } = await admin.from('brands').select('id, owner_id').eq('id', brandId).single()
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  if (brand.owner_id !== user.id) {
    const { data: member } = await admin.from('brand_members').select('brand_id').eq('brand_id', brandId).eq('user_id', user.id).single()
    if (!member) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Run health-check synchronously (Vercel kills async work after response)
  try {
    const result = await runSkill({
      brandId,
      skillId: 'health-check',
      triggeredBy: 'mia',
      additionalContext: { source: 'manual_trigger' },
    })
    return NextResponse.json({
      success: true,
      runId: result.id,
      status: result.status,
      message: result.status === 'completed'
        ? 'Health check complete. Mia is reviewing findings.'
        : `Health check ${result.status}: ${result.error || 'unknown'}`,
    })
  } catch (err) {
    console.error('[mia/trigger] health-check failed:', err)
    return NextResponse.json({ error: 'Health check failed' }, { status: 500 })
  }
}

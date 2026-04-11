import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runSkill } from '@/lib/skills-engine'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiagnoseRequest {
  brandId: string
}

interface DiagnoseResponse {
  success: boolean
  skillRunId?: string
  error?: string
}

// ---------------------------------------------------------------------------
// POST /api/onboarding/diagnose
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
): Promise<NextResponse<DiagnoseResponse>> {
  // 1. Auth check
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
  }

  // 2. Parse body
  let body: Partial<DiagnoseRequest>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { brandId } = body

  if (!brandId || typeof brandId !== 'string') {
    return NextResponse.json({ success: false, error: 'brandId is required' }, { status: 400 })
  }

  // 3. Verify brand access (service client bypasses RLS recursive policy)
  const admin = createServiceClient()
  const { data: brand } = await admin
    .from('brands')
    .select('id, owner_id')
    .eq('id', brandId)
    .single()

  if (!brand) {
    return NextResponse.json({ success: false, error: 'Brand not found' }, { status: 404 })
  }

  if (brand.owner_id !== user.id) {
    const { data: membership } = await admin
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single()
    if (!membership) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
    }
  }

  // 4. Insert a pending skill_runs record so we can return the ID immediately
  const { data: pendingRun, error: insertErr } = await admin
    .from('skill_runs')
    .insert({
      brand_id: brandId,
      agent_id: 'scout',
      skill_id: 'health-check',
      model_used: 'pending',
      model_tier: 'cheap',
      credits_used: 0,
      input: { source: 'onboarding' },
      output: {},
      status: 'running',
      triggered_by: 'user',
      chain_depth: 0,
      duration_ms: 0,
    })
    .select('id')
    .single()

  if (insertErr || !pendingRun) {
    return NextResponse.json({ success: false, error: 'Failed to create skill run' }, { status: 500 })
  }

  const skillRunId = pendingRun.id

  // 5. Fire-and-forget: run the skill async, update the record on completion
  runSkill({
    brandId,
    skillId: 'health-check',
    triggeredBy: 'user',
    additionalContext: { source: 'onboarding' },
  })
    .then(async (result) => {
      await admin
        .from('skill_runs')
        .update({
          status: result.status,
          output: result.output,
          model_used: result.modelUsed,
          credits_used: result.creditsUsed,
          duration_ms: result.durationMs,
          error_message: result.error ?? null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', skillRunId)
    })
    .catch(async (err) => {
      console.error('[onboarding/diagnose] runSkill error:', err)
      await admin
        .from('skill_runs')
        .update({
          status: 'failed',
          error_message: err instanceof Error ? err.message : String(err),
          completed_at: new Date().toISOString(),
        })
        .eq('id', skillRunId)
    })

  return NextResponse.json({ success: true, skillRunId })
}

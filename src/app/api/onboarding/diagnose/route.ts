import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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

  // 3. Verify brand access
  const { data: brand } = await supabase
    .from('brands')
    .select('id, owner_id')
    .eq('id', brandId)
    .single()

  if (!brand) {
    return NextResponse.json({ success: false, error: 'Brand not found' }, { status: 404 })
  }

  if (brand.owner_id !== user.id) {
    const { data: membership } = await supabase
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single()
    if (!membership) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
    }
  }

  // 4. Trigger Scout's health-check skill
  // The skill run is intentionally async (fire-and-forget from the UI's perspective).
  // The client can poll GET /api/skills/runs?brandId=X to track status.
  let skillRunId: string | undefined
  try {
    const result = await runSkill({
      brandId,
      skillId: 'scout-health-check',
      triggeredBy: 'user',
      additionalContext: { source: 'onboarding' },
    })
    skillRunId = result.id || undefined
  } catch (err) {
    // Non-fatal: return a partial success so the UI can still show the
    // simulated diagnosis view even if the skill engine is unavailable.
    console.error('[onboarding/diagnose] runSkill error:', err)
    return NextResponse.json({ success: true, skillRunId: undefined })
  }

  return NextResponse.json({ success: true, skillRunId })
}

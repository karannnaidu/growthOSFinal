import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runSkill, type SkillRunResult } from '@/lib/skills-engine'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RunSkillRequest {
  skillId: string
  brandId: string
  additionalContext?: Record<string, unknown>
}

interface RunSkillResponse {
  success: boolean
  data?: SkillRunResult
  error?: { code: string; message: string }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorResponse(code: string, message: string, status: number): NextResponse<RunSkillResponse> {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

// ---------------------------------------------------------------------------
// POST /api/skills/run
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse<RunSkillResponse>> {
  // 1. Verify auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return errorResponse('UNAUTHORIZED', 'Not authenticated', 401)

  // 2. Parse request body
  let body: Partial<RunSkillRequest>
  try {
    body = await request.json()
  } catch {
    return errorResponse('VALIDATION_ERROR', 'Invalid JSON body', 400)
  }

  const { skillId, brandId, additionalContext } = body

  if (!skillId || typeof skillId !== 'string') {
    return errorResponse('VALIDATION_ERROR', 'skillId is required', 400)
  }
  if (!brandId || typeof brandId !== 'string') {
    return errorResponse('VALIDATION_ERROR', 'brandId is required', 400)
  }

  // 3. Verify user has access to the brand
  const admin = createServiceClient()
  const { data: brand } = await admin
    .from('brands')
    .select('id, owner_id')
    .eq('id', brandId)
    .single()

  if (!brand) return errorResponse('NOT_FOUND', 'Brand not found', 404)

  if (brand.owner_id !== user.id) {
    const { data: membership } = await admin
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single()
    if (!membership) return errorResponse('FORBIDDEN', 'Access denied', 403)
  }

  // 4. Run skill via skills engine
  let result: SkillRunResult
  try {
    result = await runSkill({
      brandId,
      skillId,
      triggeredBy: 'user',
      additionalContext: additionalContext as Record<string, unknown> | undefined,
    })
  } catch (err) {
    return errorResponse(
      'INTERNAL_ERROR',
      err instanceof Error ? err.message : 'Unexpected error running skill',
      500,
    )
  }

  // Map skill engine errors to appropriate HTTP codes
  if (result.status === 'failed') {
    const msg = result.error ?? 'Skill run failed'
    if (msg.includes('Insufficient credits')) {
      return errorResponse('INSUFFICIENT_CREDITS', msg, 402)
    }
    if (msg.includes('not found')) {
      return errorResponse('NOT_FOUND', msg, 404)
    }
    // Other failures are still returned as 200 with the result so callers
    // can inspect result.status and result.error
  }

  // 5. Return the result
  return NextResponse.json({ success: true, data: result })
}

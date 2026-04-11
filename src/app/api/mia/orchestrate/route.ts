import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { miaOrchestrate, type OrchestrationResult } from '@/lib/mia-orchestrator'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrchestrateRequest {
  brandId: string
  skillRunId: string
  skillId: string
  output: Record<string, unknown>
}

interface OrchestrateResponse {
  success: boolean
  data?: OrchestrationResult
  error?: { code: string; message: string }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorResponse(code: string, message: string, status: number): NextResponse<OrchestrateResponse> {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

// ---------------------------------------------------------------------------
// POST /api/mia/orchestrate
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse<OrchestrateResponse>> {
  // 1. Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return errorResponse('UNAUTHORIZED', 'Not authenticated', 401)

  // 2. Parse body
  let body: Partial<OrchestrateRequest>
  try {
    body = await request.json()
  } catch {
    return errorResponse('VALIDATION_ERROR', 'Invalid JSON body', 400)
  }

  const { brandId, skillRunId, skillId, output } = body

  if (!brandId || typeof brandId !== 'string') {
    return errorResponse('VALIDATION_ERROR', 'brandId is required', 400)
  }
  if (!skillRunId || typeof skillRunId !== 'string') {
    return errorResponse('VALIDATION_ERROR', 'skillRunId is required', 400)
  }
  if (!skillId || typeof skillId !== 'string') {
    return errorResponse('VALIDATION_ERROR', 'skillId is required', 400)
  }
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return errorResponse('VALIDATION_ERROR', 'output must be an object', 400)
  }

  // 3. Brand access check
  const admin = createServiceClient()
  const { data: brand } = await admin
    .from('brands')
    .select('id, owner_id')
    .eq('id', brandId)
    .single()

  if (!brand) return errorResponse('NOT_FOUND', 'Brand not found', 404)

  if (brand.owner_id !== user.id) {
    const { data: member } = await admin
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single()
    if (!member) return errorResponse('FORBIDDEN', 'Access denied', 403)
  }

  // 4. Call Mia orchestrator
  let result: OrchestrationResult
  try {
    result = await miaOrchestrate(brandId, skillRunId, skillId, output)
  } catch (err) {
    return errorResponse(
      'INTERNAL_ERROR',
      err instanceof Error ? err.message : 'Mia orchestration failed',
      500,
    )
  }

  return NextResponse.json({ success: true, data: result })
}

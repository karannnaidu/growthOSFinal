import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkillRun {
  id: string
  brand_id: string
  agent_id: string
  skill_id: string
  model_used: string
  model_tier: string
  credits_used: number
  input: Record<string, unknown>
  output: Record<string, unknown>
  status: string
  error_message: string | null
  triggered_by: string
  parent_run_id: string | null
  chain_depth: number
  duration_ms: number
  completed_at: string | null
  created_at: string
}

interface SkillRunsResponse {
  success: boolean
  data?: {
    runs: SkillRun[]
    total: number
    page: number
    limit: number
  }
  error?: { code: string; message: string }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorResponse(code: string, message: string, status: number): NextResponse<SkillRunsResponse> {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

// ---------------------------------------------------------------------------
// GET /api/skills/runs
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse<SkillRunsResponse>> {
  // 1. Verify auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return errorResponse('UNAUTHORIZED', 'Not authenticated', 401)

  // 2. Get query params
  const { searchParams } = request.nextUrl
  const brandId = searchParams.get('brandId')
  const pageParam = searchParams.get('page')
  const limitParam = searchParams.get('limit')

  if (!brandId) {
    return errorResponse('VALIDATION_ERROR', 'brandId query parameter is required', 400)
  }

  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(limitParam ?? '20', 10) || 20))
  const offset = (page - 1) * limit

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

  // 4. Query skill_runs table (paginated) — use service client to bypass RLS
  //    (auth check + brand ownership already verified above)
  const { data: runs, error: runsError, count } = await admin
    .from('skill_runs')
    .select('*', { count: 'exact' })
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (runsError) {
    return errorResponse('INTERNAL_ERROR', runsError.message, 500)
  }

  // 5. Return paginated results
  return NextResponse.json({
    success: true,
    data: {
      runs: (runs ?? []) as SkillRun[],
      total: count ?? 0,
      page,
      limit,
    },
  })
}

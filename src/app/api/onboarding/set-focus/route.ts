import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { initializeBrandAgents } from '@/lib/agent-reveal'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SetFocusRequest {
  brandId: string
  focusAreas: string[]
}

interface SetFocusResponse {
  success: boolean
  error?: string
}

// ---------------------------------------------------------------------------
// POST /api/onboarding/set-focus
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
): Promise<NextResponse<SetFocusResponse>> {
  // 1. Auth check
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
  }

  // 2. Parse body
  let body: Partial<SetFocusRequest>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { brandId, focusAreas } = body

  if (!brandId || typeof brandId !== 'string') {
    return NextResponse.json({ success: false, error: 'brandId is required' }, { status: 400 })
  }
  if (!Array.isArray(focusAreas)) {
    return NextResponse.json({ success: false, error: 'focusAreas must be an array' }, { status: 400 })
  }

  // 3. Verify brand ownership
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

  // 4. Update focus_areas
  const { error: updateError } = await supabase
    .from('brands')
    .update({ focus_areas: focusAreas })
    .eq('id', brandId)

  if (updateError) {
    return NextResponse.json(
      { success: false, error: updateError.message },
      { status: 500 },
    )
  }

  // 5. Initialize progressive agent reveal for this brand
  try {
    await initializeBrandAgents(brandId, focusAreas)
  } catch (err) {
    // Non-fatal — log and continue; agents can be initialized on next request
    console.error('[set-focus] initializeBrandAgents error:', err)
  }

  return NextResponse.json({ success: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConnectRequest {
  brandId: string
  apiKey: string
}

interface ConnectResponse {
  success: boolean
  data?: { status: string; lists: number }
  error?: { code: string; message: string }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorResponse(
  code: string,
  message: string,
  status: number,
): NextResponse<ConnectResponse> {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

// ---------------------------------------------------------------------------
// POST /api/platforms/klaviyo/connect
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse<ConnectResponse>> {
  // 1. Auth check
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return errorResponse('UNAUTHORIZED', 'Not authenticated', 401)

  // 2. Parse request body
  let body: Partial<ConnectRequest>
  try {
    body = await request.json()
  } catch {
    return errorResponse('VALIDATION_ERROR', 'Invalid JSON body', 400)
  }

  const { brandId, apiKey } = body

  if (!brandId || typeof brandId !== 'string') {
    return errorResponse('VALIDATION_ERROR', 'brandId is required', 400)
  }
  if (!apiKey || typeof apiKey !== 'string') {
    return errorResponse('VALIDATION_ERROR', 'apiKey is required', 400)
  }

  // 3. Brand access check
  const { data: brand } = await supabase
    .from('brands')
    .select('id, owner_id')
    .eq('id', brandId)
    .single()

  if (!brand) return errorResponse('NOT_FOUND', 'Brand not found', 404)

  if (brand.owner_id !== user.id) {
    const { data: membership } = await supabase
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single()
    if (!membership) return errorResponse('FORBIDDEN', 'Access denied', 403)
  }

  // 4. Validate API key by calling Klaviyo
  let listsCount = 0
  try {
    const klaviyoResponse = await fetch('https://a.klaviyo.com/api/lists', {
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        revision: '2024-02-15',
      },
    })

    if (!klaviyoResponse.ok) {
      if (klaviyoResponse.status === 401 || klaviyoResponse.status === 403) {
        return errorResponse('INVALID_API_KEY', 'Klaviyo API key is invalid or unauthorized', 401)
      }
      console.error(
        '[Klaviyo Connect] Klaviyo API returned error:',
        klaviyoResponse.status,
        await klaviyoResponse.text(),
      )
      return errorResponse('KLAVIYO_ERROR', 'Failed to validate Klaviyo API key', 502)
    }

    const listsData = (await klaviyoResponse.json()) as {
      data?: unknown[]
      meta?: { total?: number }
    }

    listsCount = listsData.meta?.total ?? listsData.data?.length ?? 0
  } catch (err) {
    console.error('[Klaviyo Connect] Validation error:', err)
    return errorResponse('KLAVIYO_ERROR', 'Failed to reach Klaviyo API', 502)
  }

  // 5. Store credentials
  const { error: credError } = await supabase.from('credentials').upsert(
    {
      brand_id: brandId,
      platform: 'klaviyo',
      access_token: apiKey,
      metadata: { lists_count: listsCount },
    },
    { onConflict: 'brand_id,platform' },
  )

  if (credError) {
    console.error('[Klaviyo Connect] Failed to store credentials:', credError)
    return errorResponse('DB_ERROR', 'Failed to store credentials', 500)
  }

  return NextResponse.json({ success: true, data: { status: 'connected', lists: listsCount } })
}

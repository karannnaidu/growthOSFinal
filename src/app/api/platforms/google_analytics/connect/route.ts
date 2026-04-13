import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { syncPlatformStatus } from '@/lib/knowledge/intelligence'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConnectRequest {
  brandId: string
  property_id: string
  refresh_token: string
}

interface ConnectResponse {
  success: boolean
  data?: { status: string; propertyId: string }
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
// POST /api/platforms/google_analytics/connect
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

  const { brandId, property_id, refresh_token } = body

  if (!brandId || typeof brandId !== 'string') {
    return errorResponse('VALIDATION_ERROR', 'brandId is required', 400)
  }
  if (!property_id || typeof property_id !== 'string') {
    return errorResponse('VALIDATION_ERROR', 'GA4 Property ID is required', 400)
  }
  if (!refresh_token || typeof refresh_token !== 'string') {
    return errorResponse('VALIDATION_ERROR', 'OAuth refresh token is required', 400)
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
    const { data: membership } = await admin
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single()
    if (!membership) return errorResponse('FORBIDDEN', 'Access denied', 403)
  }

  // 4. Validate refresh token by exchanging for an access token
  const clientId = process.env.GOOGLE_CLIENT_ID ?? ''
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? ''

  let accessToken: string | null = null
  let expiresAt: string | null = null

  if (clientId && clientSecret) {
    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token,
          grant_type: 'refresh_token',
        }),
      })

      if (!tokenRes.ok) {
        const err = await tokenRes.text()
        console.error('[GA Connect] Token exchange failed:', tokenRes.status, err)
        return errorResponse('INVALID_TOKEN', 'Refresh token is invalid or expired', 401)
      }

      const tokenData = (await tokenRes.json()) as {
        access_token?: string
        expires_in?: number
      }

      accessToken = tokenData.access_token ?? null
      expiresAt = tokenData.access_token
        ? new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000).toISOString()
        : null
    } catch (err) {
      console.error('[GA Connect] Token validation error:', err)
      return errorResponse('VALIDATION_ERROR', 'Failed to validate refresh token', 502)
    }
  }

  // 5. Store credentials
  const { error: credError } = await supabase.from('credentials').upsert(
    {
      brand_id: brandId,
      platform: 'google_analytics',
      access_token: accessToken ?? refresh_token,
      refresh_token,
      expires_at: expiresAt,
      metadata: { property_id },
    },
    { onConflict: 'brand_id,platform' },
  )

  if (credError) {
    console.error('[GA Connect] Failed to store credentials:', credError)
    return errorResponse('DB_ERROR', 'Failed to store credentials', 500)
  }

  await syncPlatformStatus(brandId).catch(err =>
    console.warn('[GA Connect] Platform status sync failed:', err)
  )

  return NextResponse.json({
    success: true,
    data: { status: 'connected', propertyId: property_id },
  })
}

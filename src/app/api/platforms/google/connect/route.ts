import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConnectRequest {
  brandId: string
}

interface ConnectResponse {
  success: boolean
  data?: { redirectUrl: string }
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
// POST /api/platforms/google/connect
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

  const { brandId } = body

  if (!brandId || typeof brandId !== 'string') {
    return errorResponse('VALIDATION_ERROR', 'brandId is required', 400)
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

  // 4. Build Google OAuth URL
  const googleClientId = process.env.GOOGLE_CLIENT_ID
  if (!googleClientId) {
    return errorResponse('CONFIG_ERROR', 'Google Client ID not configured', 500)
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    `https://${request.headers.get('host') ?? 'localhost:3000'}`

  const redirectUri = `${appUrl}/api/platforms/google/callback`

  const scopes = [
    'https://www.googleapis.com/auth/analytics.readonly',
    'https://www.googleapis.com/auth/adwords.readonly',
    'https://www.googleapis.com/auth/webmasters.readonly',
  ].join(' ')

  const params = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    access_type: 'offline',
    prompt: 'consent',
    state: brandId,
  })

  const redirectUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

  return NextResponse.json({ success: true, data: { redirectUrl } })
}

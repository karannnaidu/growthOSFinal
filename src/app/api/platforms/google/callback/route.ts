import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// GET /api/platforms/google/callback
// Query params from Google: code, state
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)

  const code = searchParams.get('code')
  const state = searchParams.get('state') // brandId
  const errorParam = searchParams.get('error')

  const failUrl = '/dashboard/settings?error=google_failed'

  // Handle OAuth denial
  if (errorParam) {
    console.error('[Google Callback] OAuth error:', errorParam)
    return NextResponse.redirect(new URL(failUrl, request.url))
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL(failUrl, request.url))
  }

  const googleClientId = process.env.GOOGLE_CLIENT_ID
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!googleClientId || !googleClientSecret) {
    console.error('[Google Callback] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured')
    return NextResponse.redirect(new URL(failUrl, request.url))
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    `https://${request.headers.get('host') ?? 'localhost:3000'}`

  const redirectUri = `${appUrl}/api/platforms/google/callback`

  // 1. Exchange code for tokens
  let accessToken: string
  let refreshToken: string | null = null
  let expiresAt: string | null = null

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    })

    if (!tokenResponse.ok) {
      console.error(
        '[Google Callback] Token exchange failed:',
        tokenResponse.status,
        await tokenResponse.text(),
      )
      return NextResponse.redirect(new URL(failUrl, request.url))
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
      error?: string
    }

    if (!tokenData.access_token) {
      console.error('[Google Callback] No access_token in response', tokenData)
      return NextResponse.redirect(new URL(failUrl, request.url))
    }

    accessToken = tokenData.access_token
    refreshToken = tokenData.refresh_token ?? null

    if (tokenData.expires_in) {
      expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    }
  } catch (err) {
    console.error('[Google Callback] Token exchange error:', err)
    return NextResponse.redirect(new URL(failUrl, request.url))
  }

  // 2. Store credentials
  const brandId = state
  const supabase = await createClient()

  const { error: credError } = await supabase.from('credentials').upsert(
    {
      brand_id: brandId,
      platform: 'google',
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      metadata: {},
    },
    { onConflict: 'brand_id,platform' },
  )

  if (credError) {
    console.error('[Google Callback] Failed to store credentials:', credError)
    return NextResponse.redirect(new URL(failUrl, request.url))
  }

  // 3. Redirect to settings
  return NextResponse.redirect(new URL('/dashboard/settings?connected=google', request.url))
}

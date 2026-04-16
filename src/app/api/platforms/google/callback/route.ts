import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncPlatformStatus } from '@/lib/knowledge/intelligence'
import {
  listGa4Properties,
  listGoogleAdsCustomers,
  type Ga4Property,
  type GoogleAdsCustomer,
} from '@/lib/google-admin'

// ---------------------------------------------------------------------------
// GET /api/platforms/google/callback
// Query params from Google: code, state
// ---------------------------------------------------------------------------

export const GOOGLE_OAUTH_PENDING_COOKIE = 'google_oauth_pending'

interface PendingOAuthPayload {
  brandId: string
  accessToken: string
  refreshToken: string | null
  expiresAt: string | null
  properties: Ga4Property[]
  adsCustomers: GoogleAdsCustomer[]
}

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

  const brandId = state
  const supabase = await createClient()

  // 2. Auto-discover GA4 properties and Google Ads accessible customers
  const properties = await listGa4Properties(accessToken).catch((err) => {
    console.warn('[Google Callback] GA4 discovery failed:', err)
    return [] as Ga4Property[]
  })

  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  const adsCustomers = devToken
    ? await listGoogleAdsCustomers(accessToken, devToken).catch((err) => {
        console.warn('[Google Callback] Google Ads discovery failed:', err)
        return [] as GoogleAdsCustomer[]
      })
    : []

  // 3. Always persist the raw Google OAuth credentials (used for Ads /
  //    Search Console etc.) under platform='google'.
  const { error: googleCredError } = await supabase.from('credentials').upsert(
    {
      brand_id: brandId,
      platform: 'google',
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      metadata: {
        ads_customers: adsCustomers,
      },
    },
    { onConflict: 'brand_id,platform' },
  )

  if (googleCredError) {
    console.error('[Google Callback] Failed to store google credentials:', googleCredError)
    return NextResponse.redirect(new URL(failUrl, request.url))
  }

  // 4. Handle GA4 property routing
  if (properties.length === 1) {
    const only = properties[0]!
    const { error: gaCredError } = await supabase.from('credentials').upsert(
      {
        brand_id: brandId,
        platform: 'google_analytics',
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        metadata: {
          property_id: only.propertyId,
          property: only.property,
          property_display_name: only.displayName,
          account_display_name: only.accountDisplayName,
        },
      },
      { onConflict: 'brand_id,platform' },
    )
    if (gaCredError) {
      console.error('[Google Callback] Failed to store GA credentials:', gaCredError)
      return NextResponse.redirect(new URL(failUrl, request.url))
    }

    await syncPlatformStatus(brandId).catch((err) =>
      console.warn('[callback] Platform status sync failed:', err),
    )

    return NextResponse.redirect(
      new URL('/onboarding/platforms?connected=google', request.url),
    )
  }

  if (properties.length > 1) {
    // Stash discovery result in a short-lived httpOnly cookie and redirect
    // the user to the picker page.
    const payload: PendingOAuthPayload = {
      brandId,
      accessToken,
      refreshToken,
      expiresAt,
      properties,
      adsCustomers,
    }

    await syncPlatformStatus(brandId).catch((err) =>
      console.warn('[callback] Platform status sync failed:', err),
    )

    const response = NextResponse.redirect(
      new URL('/onboarding/platforms/google/select', request.url),
    )
    response.cookies.set(GOOGLE_OAUTH_PENDING_COOKIE, JSON.stringify(payload), {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 10, // 10 minutes
    })
    return response
  }

  // 5. No GA4 properties found — tokens are stored, but no property to select.
  await syncPlatformStatus(brandId).catch((err) =>
    console.warn('[callback] Platform status sync failed:', err),
  )

  return NextResponse.redirect(
    new URL('/onboarding/platforms?connected=google&ga4=none', request.url),
  )
}

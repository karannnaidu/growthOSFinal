import { NextRequest, NextResponse } from 'next/server'
import { syncPlatformStatus } from '@/lib/knowledge/intelligence'

// ---------------------------------------------------------------------------
// GET /api/platforms/meta/callback
// Query params from Meta: code, state
// ---------------------------------------------------------------------------

export const META_OAUTH_PENDING_COOKIE = 'meta_oauth_pending'

export interface MetaAdAccount {
  id: string
  name: string
  account_status: number
  currency?: string
}

interface PendingMetaOAuthPayload {
  brandId: string
  accessToken: string
  returnTo: string
  accounts: MetaAdAccount[]
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)

  const code = searchParams.get('code')
  const stateRaw = searchParams.get('state')
  const errorParam = searchParams.get('error')

  // Decode state (base64url JSON with brandId + returnTo)
  let brandId = ''
  let returnTo = '/dashboard/settings/platforms'
  try {
    const decoded = JSON.parse(Buffer.from(stateRaw || '', 'base64url').toString())
    brandId = decoded.brandId || ''
    returnTo = decoded.returnTo || '/dashboard/settings/platforms'
  } catch {
    // Legacy: state might be plain brandId
    brandId = stateRaw || ''
  }

  const failUrl = `${returnTo}?error=meta_failed`

  // Handle OAuth denial
  if (errorParam) {
    console.error('[Meta Callback] OAuth error:', errorParam, searchParams.get('error_description'))
    return NextResponse.redirect(new URL(failUrl, request.url))
  }

  if (!code || !brandId) {
    return NextResponse.redirect(new URL(failUrl, request.url))
  }

  const metaAppId = process.env.META_APP_ID
  const metaAppSecret = process.env.META_APP_SECRET

  if (!metaAppId || !metaAppSecret) {
    console.error('[Meta Callback] META_APP_ID or META_APP_SECRET not configured')
    return NextResponse.redirect(new URL(failUrl, request.url))
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    `https://${request.headers.get('host') ?? 'localhost:3000'}`

  const redirectUri = `${appUrl}/api/platforms/meta/callback`

  // 1. Exchange code for short-lived access token
  let shortLivedToken: string
  try {
    const tokenParams = new URLSearchParams({
      client_id: metaAppId,
      redirect_uri: redirectUri,
      client_secret: metaAppSecret,
      code,
    })

    const tokenResponse = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?${tokenParams.toString()}`,
    )

    if (!tokenResponse.ok) {
      console.error(
        '[Meta Callback] Short-lived token exchange failed:',
        tokenResponse.status,
        await tokenResponse.text(),
      )
      return NextResponse.redirect(new URL(failUrl, request.url))
    }

    const tokenData = (await tokenResponse.json()) as { access_token?: string; error?: unknown }
    if (!tokenData.access_token) {
      console.error('[Meta Callback] No access_token in short-lived token response', tokenData)
      return NextResponse.redirect(new URL(failUrl, request.url))
    }

    shortLivedToken = tokenData.access_token
  } catch (err) {
    console.error('[Meta Callback] Short-lived token exchange error:', err)
    return NextResponse.redirect(new URL(failUrl, request.url))
  }

  // 2. Exchange short-lived token for long-lived token
  let longLivedToken: string
  try {
    const longTokenParams = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: metaAppId,
      client_secret: metaAppSecret,
      fb_exchange_token: shortLivedToken,
    })

    const longTokenResponse = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?${longTokenParams.toString()}`,
    )

    if (!longTokenResponse.ok) {
      console.error(
        '[Meta Callback] Long-lived token exchange failed:',
        longTokenResponse.status,
        await longTokenResponse.text(),
      )
      return NextResponse.redirect(new URL(failUrl, request.url))
    }

    const longTokenData = (await longTokenResponse.json()) as {
      access_token?: string
      error?: unknown
    }
    if (!longTokenData.access_token) {
      console.error('[Meta Callback] No access_token in long-lived token response', longTokenData)
      return NextResponse.redirect(new URL(failUrl, request.url))
    }

    longLivedToken = longTokenData.access_token
  } catch (err) {
    console.error('[Meta Callback] Long-lived token exchange error:', err)
    return NextResponse.redirect(new URL(failUrl, request.url))
  }

  // 3. Discover ad accounts
  let accounts: MetaAdAccount[] = []
  try {
    const adAccountsResponse = await fetch(
      `https://graph.facebook.com/v19.0/me/adaccounts?access_token=${encodeURIComponent(longLivedToken)}&fields=id,name,account_status,currency`,
    )

    if (adAccountsResponse.ok) {
      const adAccountsData = (await adAccountsResponse.json()) as {
        data?: MetaAdAccount[]
      }
      accounts = adAccountsData.data ?? []
    } else {
      console.warn(
        '[Meta Callback] Failed to fetch ad accounts:',
        adAccountsResponse.status,
        await adAccountsResponse.text(),
      )
    }
  } catch (err) {
    console.warn('[Meta Callback] Ad accounts fetch error (non-fatal):', err)
  }

  // 4. Use service client (OAuth callback may not have user cookie)
  const { createServiceClient } = await import('@/lib/supabase/service')
  const admin = createServiceClient()

  // 5a. Zero accounts — persist tokens anyway so the user isn't locked out.
  if (accounts.length === 0) {
    const { error: credError } = await admin.from('credentials').upsert(
      {
        brand_id: brandId,
        platform: 'meta',
        access_token: longLivedToken,
        metadata: { ad_account_id: null },
      },
      { onConflict: 'brand_id,platform' },
    )
    if (credError) {
      console.error('[Meta Callback] Failed to store credentials (0 accounts):', credError)
      return NextResponse.redirect(new URL(failUrl, request.url))
    }

    await syncPlatformStatus(brandId).catch((err) =>
      console.warn('[callback] Platform status sync failed:', err),
    )

    return NextResponse.redirect(
      new URL(`${returnTo}?connected=meta&adaccount=none`, request.url),
    )
  }

  // 5b. Exactly one account — auto-select.
  if (accounts.length === 1) {
    const only = accounts[0]!
    const { error: credError } = await admin.from('credentials').upsert(
      {
        brand_id: brandId,
        platform: 'meta',
        access_token: longLivedToken,
        metadata: { ad_account_id: only.id },
      },
      { onConflict: 'brand_id,platform' },
    )

    if (credError) {
      console.error('[Meta Callback] Failed to store credentials:', credError)
      return NextResponse.redirect(new URL(failUrl, request.url))
    }

    await syncPlatformStatus(brandId).catch((err) =>
      console.warn('[callback] Platform status sync failed:', err),
    )

    return NextResponse.redirect(
      new URL('/onboarding/platforms?connected=meta', request.url),
    )
  }

  // 5c. 2+ accounts — stash in cookie and redirect to picker.
  const payload: PendingMetaOAuthPayload = {
    brandId,
    accessToken: longLivedToken,
    returnTo,
    accounts,
  }

  const response = NextResponse.redirect(
    new URL('/onboarding/platforms/meta/select', request.url),
  )
  response.cookies.set(META_OAUTH_PENDING_COOKIE, JSON.stringify(payload), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10, // 10 minutes
  })
  return response
}

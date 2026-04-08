import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyShopifyHmac, pullShopifyProducts, pullShopifyOrdersSummary } from '@/lib/shopify'

// ---------------------------------------------------------------------------
// GET /api/platforms/shopify/callback
// Query params from Shopify: code, shop, hmac, state, timestamp
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)

  const code = searchParams.get('code')
  const shop = searchParams.get('shop')
  const hmac = searchParams.get('hmac')
  const state = searchParams.get('state') // brandId
  const timestamp = searchParams.get('timestamp')

  const failUrl = '/dashboard/settings?error=shopify_failed'

  // 1. Basic parameter validation
  if (!code || !shop || !hmac || !state || !timestamp) {
    return NextResponse.redirect(new URL(failUrl, request.url))
  }

  // 2. Verify HMAC signature
  const secret = process.env.SHOPIFY_API_SECRET
  if (!secret) {
    console.error('[Shopify Callback] SHOPIFY_API_SECRET not configured')
    return NextResponse.redirect(new URL(failUrl, request.url))
  }

  const queryParams: Record<string, string> = {}
  searchParams.forEach((value, key) => {
    queryParams[key] = value
  })

  const isValid = verifyShopifyHmac(queryParams, secret)
  if (!isValid) {
    console.error('[Shopify Callback] HMAC verification failed for shop:', shop)
    return NextResponse.redirect(new URL(failUrl, request.url))
  }

  // 3. Exchange code for access token
  const apiKey = process.env.SHOPIFY_API_KEY
  if (!apiKey) {
    console.error('[Shopify Callback] SHOPIFY_API_KEY not configured')
    return NextResponse.redirect(new URL(failUrl, request.url))
  }

  let accessToken: string
  try {
    const tokenResponse = await fetch(
      `https://${shop}/admin/oauth/access_token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: apiKey,
          client_secret: secret,
          code,
        }),
      },
    )

    if (!tokenResponse.ok) {
      console.error(
        '[Shopify Callback] Token exchange failed:',
        tokenResponse.status,
        await tokenResponse.text(),
      )
      return NextResponse.redirect(new URL(failUrl, request.url))
    }

    const tokenData = (await tokenResponse.json()) as { access_token?: string }
    if (!tokenData.access_token) {
      console.error('[Shopify Callback] No access_token in response')
      return NextResponse.redirect(new URL(failUrl, request.url))
    }

    accessToken = tokenData.access_token
  } catch (err) {
    console.error('[Shopify Callback] Token exchange error:', err)
    return NextResponse.redirect(new URL(failUrl, request.url))
  }

  // 4. Store token in credentials table
  // state param carries the brandId (set during connect)
  const brandId = state
  const supabase = await createClient()

  const { error: credError } = await supabase.from('credentials').upsert(
    {
      brand_id: brandId,
      platform: 'shopify',
      access_token: accessToken,
      metadata: { shop },
    },
    { onConflict: 'brand_id,platform' },
  )

  if (credError) {
    console.error('[Shopify Callback] Failed to store credentials:', credError)
    return NextResponse.redirect(new URL(failUrl, request.url))
  }

  // 5. Pull initial data (non-fatal — redirect to success even if partial failure)
  try {
    await pullShopifyProducts(brandId, shop, accessToken)
  } catch (err) {
    console.error('[Shopify Callback] Failed to pull products:', err)
    // Continue — credentials are stored, data can be re-synced later
  }

  try {
    await pullShopifyOrdersSummary(brandId, shop, accessToken)
  } catch (err) {
    console.error('[Shopify Callback] Failed to pull orders summary:', err)
    // Continue
  }

  // 6. Redirect to onboarding or dashboard
  // Check brand onboarding status to decide where to send them
  const { data: brand } = await supabase
    .from('brands')
    .select('onboarding_completed, onboarding_step')
    .eq('id', brandId)
    .single()

  const successUrl =
    brand && !brand.onboarding_completed
      ? '/onboarding/focus'
      : '/dashboard/settings?connected=shopify'

  return NextResponse.redirect(new URL(successUrl, request.url))
}

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { syncPlatformStatus } from '@/lib/knowledge/intelligence'
import type { Ga4Property, GoogleAdsCustomer } from '@/lib/google-admin'
import { GOOGLE_OAUTH_PENDING_COOKIE } from '../callback/route'

// ---------------------------------------------------------------------------
// POST /api/platforms/google/select
//
// Called from the picker page at /onboarding/platforms/google/select.
// Reads the `google_oauth_pending` cookie set by the OAuth callback,
// persists the user's chosen GA4 property (and optional Ads customer),
// clears the cookie, and redirects back to /onboarding/platforms.
// ---------------------------------------------------------------------------

interface PendingOAuthPayload {
  brandId: string
  accessToken: string
  refreshToken: string | null
  expiresAt: string | null
  properties: Ga4Property[]
  adsCustomers: GoogleAdsCustomer[]
}

interface SelectResponse {
  success: boolean
  error?: { code: string; message: string }
}

function errorResponse(
  code: string,
  message: string,
  status: number,
): NextResponse<SelectResponse> {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

export async function POST(request: NextRequest): Promise<NextResponse<SelectResponse>> {
  // 1. Auth check
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return errorResponse('UNAUTHORIZED', 'Not authenticated', 401)

  // 2. Load pending OAuth payload from cookie
  const cookieStore = await cookies()
  const raw = cookieStore.get(GOOGLE_OAUTH_PENDING_COOKIE)?.value
  if (!raw) {
    return errorResponse('EXPIRED', 'No pending Google OAuth — please reconnect.', 400)
  }

  let pending: PendingOAuthPayload
  try {
    pending = JSON.parse(raw) as PendingOAuthPayload
  } catch {
    return errorResponse('VALIDATION_ERROR', 'Invalid pending payload', 400)
  }

  // 3. Parse submitted selection (accept JSON or form-encoded)
  let propertyId: string | undefined
  let customerId: string | undefined

  const contentType = request.headers.get('content-type') ?? ''
  try {
    if (contentType.includes('application/json')) {
      const body = (await request.json()) as {
        property_id?: string
        customer_id?: string
      }
      propertyId = body.property_id
      customerId = body.customer_id
    } else {
      const form = await request.formData()
      const p = form.get('property_id')
      const c = form.get('customer_id')
      propertyId = typeof p === 'string' ? p : undefined
      customerId = typeof c === 'string' ? c : undefined
    }
  } catch {
    return errorResponse('VALIDATION_ERROR', 'Invalid request body', 400)
  }

  if (!propertyId) {
    return errorResponse('VALIDATION_ERROR', 'property_id is required', 400)
  }

  // 4. Validate the chosen property is in the pending set
  const chosenProperty = pending.properties.find((p) => p.propertyId === propertyId)
  if (!chosenProperty) {
    return errorResponse('VALIDATION_ERROR', 'Unknown GA4 property selected', 400)
  }

  const chosenCustomer = customerId
    ? pending.adsCustomers.find((c) => c.customerId === customerId)
    : undefined

  // 5. Persist GA4 credential
  const { error: gaCredError } = await supabase.from('credentials').upsert(
    {
      brand_id: pending.brandId,
      platform: 'google_analytics',
      access_token: pending.accessToken,
      refresh_token: pending.refreshToken,
      expires_at: pending.expiresAt,
      metadata: {
        property_id: chosenProperty.propertyId,
        property: chosenProperty.property,
        property_display_name: chosenProperty.displayName,
        account_display_name: chosenProperty.accountDisplayName,
      },
    },
    { onConflict: 'brand_id,platform' },
  )

  if (gaCredError) {
    console.error('[Google Select] Failed to store GA credentials:', gaCredError)
    return errorResponse('DB_ERROR', 'Failed to store credentials', 500)
  }

  // 6. If an Ads customer was chosen, update the google credential's metadata
  if (chosenCustomer) {
    const { error: adsErr } = await supabase.from('credentials').upsert(
      {
        brand_id: pending.brandId,
        platform: 'google',
        access_token: pending.accessToken,
        refresh_token: pending.refreshToken,
        expires_at: pending.expiresAt,
        metadata: {
          ads_customers: pending.adsCustomers,
          selected_customer_id: chosenCustomer.customerId,
          selected_customer_resource: chosenCustomer.resourceName,
        },
      },
      { onConflict: 'brand_id,platform' },
    )
    if (adsErr) {
      console.error('[Google Select] Failed to update google ads selection:', adsErr)
      // non-fatal
    }
  }

  await syncPlatformStatus(pending.brandId).catch((err) =>
    console.warn('[Google Select] Platform status sync failed:', err),
  )

  // 7. Clear cookie
  cookieStore.delete(GOOGLE_OAUTH_PENDING_COOKIE)

  // 8. Respond — client will redirect.
  return NextResponse.json({ success: true })
}

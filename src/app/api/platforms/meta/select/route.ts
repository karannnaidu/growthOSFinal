import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { syncPlatformStatus } from '@/lib/knowledge/intelligence'
import { META_OAUTH_PENDING_COOKIE, type MetaAdAccount } from '../callback/route'

// ---------------------------------------------------------------------------
// POST /api/platforms/meta/select
//
// Called from the picker page at /onboarding/platforms/meta/select.
// Reads the `meta_oauth_pending` cookie set by the OAuth callback,
// persists the user's chosen Meta ad account, clears the cookie, and returns
// { ok: true }. The client redirects back to /onboarding/platforms.
// ---------------------------------------------------------------------------

interface PendingMetaOAuthPayload {
  brandId: string
  accessToken: string
  returnTo: string
  accounts: MetaAdAccount[]
}

interface SelectResponse {
  ok: boolean
  error?: { code: string; message: string }
}

function errorResponse(
  code: string,
  message: string,
  status: number,
): NextResponse<SelectResponse> {
  return NextResponse.json({ ok: false, error: { code, message } }, { status })
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
  const raw = cookieStore.get(META_OAUTH_PENDING_COOKIE)?.value
  if (!raw) {
    return errorResponse('EXPIRED', 'No pending Meta OAuth — please reconnect.', 400)
  }

  let pending: PendingMetaOAuthPayload
  try {
    pending = JSON.parse(raw) as PendingMetaOAuthPayload
  } catch {
    return errorResponse('VALIDATION_ERROR', 'Invalid pending payload', 400)
  }

  // 3. Parse submitted selection (JSON or form-encoded)
  let adAccountId: string | undefined
  const contentType = request.headers.get('content-type') ?? ''
  try {
    if (contentType.includes('application/json')) {
      const body = (await request.json()) as { adAccountId?: string }
      adAccountId = body.adAccountId
    } else {
      const form = await request.formData()
      const v = form.get('adAccountId')
      adAccountId = typeof v === 'string' ? v : undefined
    }
  } catch {
    return errorResponse('VALIDATION_ERROR', 'Invalid request body', 400)
  }

  if (!adAccountId) {
    return errorResponse('VALIDATION_ERROR', 'adAccountId is required', 400)
  }

  // 4. Validate the chosen account is in the pending set
  const chosen = pending.accounts.find((a) => a.id === adAccountId)
  if (!chosen) {
    return errorResponse('VALIDATION_ERROR', 'Unknown Meta ad account selected', 400)
  }

  // 5. Persist Meta credential — use service client since the cookie already
  //    authenticates the pending OAuth context.
  const { createServiceClient } = await import('@/lib/supabase/service')
  const admin = createServiceClient()

  const { error: credError } = await admin.from('credentials').upsert(
    {
      brand_id: pending.brandId,
      platform: 'meta',
      access_token: pending.accessToken,
      metadata: { ad_account_id: chosen.id },
    },
    { onConflict: 'brand_id,platform' },
  )

  if (credError) {
    console.error('[Meta Select] Failed to store credentials:', credError)
    return errorResponse('DB_ERROR', 'Failed to store credentials', 500)
  }

  await syncPlatformStatus(pending.brandId).catch((err) =>
    console.warn('[Meta Select] Platform status sync failed:', err),
  )

  // 6. Clear cookie
  cookieStore.delete(META_OAUTH_PENDING_COOKIE)

  // 7. Respond — client will redirect.
  return NextResponse.json({ ok: true })
}

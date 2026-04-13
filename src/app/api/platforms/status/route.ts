import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PlatformStatus =
  | { connected: true; connectedAt: string; [key: string]: unknown }
  | { connected: false }

interface StatusResponse {
  success: boolean
  data?: Record<string, PlatformStatus>
  error?: { code: string; message: string }
}

// Known platforms — extend as more are added
const KNOWN_PLATFORMS = ['shopify', 'meta', 'google', 'google_analytics', 'klaviyo', 'snapchat', 'chatgpt_ads'] as const

type KnownPlatform = (typeof KNOWN_PLATFORMS)[number]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorResponse(
  code: string,
  message: string,
  status: number,
): NextResponse<StatusResponse> {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

// Derive platform-specific extra fields from stored metadata
function buildPlatformStatus(
  platform: string,
  row: { created_at?: string; metadata?: Record<string, unknown> | null },
): PlatformStatus {
  const connectedAt = row.created_at ?? new Date().toISOString()
  const meta = row.metadata ?? {}

  switch (platform) {
    case 'shopify':
      return {
        connected: true,
        connectedAt,
        shop: (meta.shop as string | undefined) ?? null,
      }
    case 'meta':
      return {
        connected: true,
        connectedAt,
        adAccountId: (meta.ad_account_id as string | undefined) ?? null,
      }
    case 'klaviyo':
      return {
        connected: true,
        connectedAt,
        listsCount: (meta.lists_count as number | undefined) ?? null,
      }
    case 'google_analytics':
      return {
        connected: true,
        connectedAt,
        propertyId: (meta.property_id as string | undefined) ?? null,
      }
    default:
      return { connected: true, connectedAt }
  }
}

// ---------------------------------------------------------------------------
// GET /api/platforms/status?brandId=xxx
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse<StatusResponse>> {
  // 1. Auth check
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return errorResponse('UNAUTHORIZED', 'Not authenticated', 401)

  // 2. Parse query params
  const { searchParams } = new URL(request.url)
  const brandId = searchParams.get('brandId')

  if (!brandId) {
    return errorResponse('VALIDATION_ERROR', 'brandId query parameter is required', 400)
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

  // 4. Query credentials for this brand (service client bypasses RLS)
  const { data: credentials, error: credError } = await admin
    .from('credentials')
    .select('platform, created_at, metadata')
    .eq('brand_id', brandId)

  if (credError) {
    console.error('[Platform Status] Failed to query credentials:', credError)
    return errorResponse('DB_ERROR', 'Failed to fetch platform status', 500)
  }

  // 5. Build status map — start with all platforms disconnected
  const statusMap: Record<string, PlatformStatus> = {}
  for (const platform of KNOWN_PLATFORMS) {
    statusMap[platform] = { connected: false }
  }

  // Overlay connected platforms
  for (const row of credentials ?? []) {
    const platform = row.platform as KnownPlatform
    statusMap[platform] = buildPlatformStatus(platform, row)
  }

  return NextResponse.json({ success: true, data: statusMap })
}

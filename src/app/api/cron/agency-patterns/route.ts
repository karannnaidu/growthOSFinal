// ---------------------------------------------------------------------------
// POST /api/cron/agency-patterns
//
// Aggregates cross-brand patterns for agency-tier brands and updates the
// agency_patterns table.
//
// Stub implementation: queries brands with plan='agency', logs them, and
// inserts/updates placeholder aggregate records. Full ML-based pattern
// extraction will be wired in a future phase.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${process.env.CRON_SECRET}`
}

// ---------------------------------------------------------------------------
// Supabase service-role client
// ---------------------------------------------------------------------------

function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Fetch all agency-tier brands
  const { data: agencyBrands, error } = await supabase
    .from('brands')
    .select('id, name, plan')
    .eq('plan', 'agency')

  if (error) {
    console.error('[cron/agency-patterns] Failed to fetch agency brands:', error)
    return NextResponse.json({ error: 'Failed to fetch agency brands' }, { status: 500 })
  }

  if (!agencyBrands || agencyBrands.length === 0) {
    console.log('[cron/agency-patterns] No agency brands found')
    return NextResponse.json({ ok: true, message: 'No agency brands', processed: 0 })
  }

  console.log(
    `[cron/agency-patterns] Found ${agencyBrands.length} agency brand(s):`,
    agencyBrands.map((b) => b.id),
  )

  // Stub: upsert a pattern record for each agency brand
  // In a future phase this will compute real cross-brand aggregates
  const now = new Date().toISOString()
  const upsertPayloads = agencyBrands.map((brand) => ({
    brand_id: brand.id,
    computed_at: now,
    patterns: {
      stub: true,
      note: 'Placeholder until full cross-brand ML aggregation is implemented',
      brand_count: agencyBrands.length,
    },
  }))

  const { error: upsertError } = await supabase
    .from('agency_patterns')
    .upsert(upsertPayloads, { onConflict: 'brand_id' })

  if (upsertError) {
    // Non-fatal: table might not exist yet — log and continue
    console.warn('[cron/agency-patterns] agency_patterns upsert failed (non-fatal):', upsertError.message)
  }

  return NextResponse.json({
    ok: true,
    processed: agencyBrands.length,
    brandIds: agencyBrands.map((b) => b.id),
  })
}

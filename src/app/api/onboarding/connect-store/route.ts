import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConnectStoreRequest {
  name: string
  domain: string
  logoUrl?: string
}

interface ConnectStoreResponse {
  success: boolean
  brandId?: string
  error?: string
}

// ---------------------------------------------------------------------------
// POST /api/onboarding/connect-store
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ConnectStoreResponse>> {
  // 1. Auth check
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
  }

  // 2. Parse body
  let body: Partial<ConnectStoreRequest>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, domain, logoUrl } = body

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ success: false, error: 'name is required' }, { status: 400 })
  }
  if (!domain || typeof domain !== 'string' || domain.trim().length === 0) {
    return NextResponse.json({ success: false, error: 'domain is required' }, { status: 400 })
  }

  // Sanitise domain
  const cleanDomain = domain
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .toLowerCase()

  // 3. Create the brand record
  const { data: brand, error: brandError } = await supabase
    .from('brands')
    .insert({
      name: name.trim(),
      domain: cleanDomain,
      logo_url: logoUrl ?? null,
      owner_id: user.id,
      plan: 'free',
    })
    .select('id')
    .single()

  if (brandError || !brand) {
    return NextResponse.json(
      { success: false, error: brandError?.message ?? 'Failed to create brand' },
      { status: 500 },
    )
  }

  const brandId = brand.id

  // 4. Create wallet with 100 free credits (30-day expiry)
  const { error: walletError } = await supabase.from('wallets').insert({
    brand_id: brandId,
    balance: 0,
    free_credits: 100,
    free_credits_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  })

  if (walletError) {
    // Non-fatal — brand was created; log but continue
    console.error('[onboarding/connect-store] wallet create error:', walletError.message)
  }

  return NextResponse.json({ success: true, brandId })
}

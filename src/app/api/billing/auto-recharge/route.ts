// ---------------------------------------------------------------------------
// PATCH /api/billing/auto-recharge
//
// Toggles auto-recharge setting for a brand's wallet.
//
// Request body:
//   {
//     brandId: string,
//     autoRecharge: boolean,
//     threshold?: number,   // balance level that triggers recharge
//     amount?: number,      // credits to purchase when threshold hit
//   }
// Response: { autoRecharge: boolean, threshold: number | null, amount: number | null }
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  // 1. Auth check
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // 2. Parse body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { brandId, autoRecharge, threshold, amount } = body as {
    brandId?: string
    autoRecharge?: boolean
    threshold?: number
    amount?: number
  }

  if (!brandId) {
    return NextResponse.json({ error: 'brandId is required' }, { status: 400 })
  }

  if (typeof autoRecharge !== 'boolean') {
    return NextResponse.json({ error: 'autoRecharge (boolean) is required' }, { status: 400 })
  }

  // 3. Verify brand access
  const admin = createServiceClient()
  const { data: brand } = await admin
    .from('brands')
    .select('id, owner_id')
    .eq('id', brandId)
    .single()

  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  }

  if (brand.owner_id !== user.id) {
    const { data: membership } = await admin
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
  }

  // 4. Build update payload
  const updatePayload: Record<string, unknown> = { auto_recharge: autoRecharge }

  if (threshold !== undefined) {
    if (!Number.isFinite(threshold) || threshold < 0) {
      return NextResponse.json({ error: 'threshold must be a non-negative number' }, { status: 400 })
    }
    updatePayload.auto_recharge_threshold = threshold
  }

  if (amount !== undefined) {
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
    }
    updatePayload.auto_recharge_amount = amount
  }

  // 5. Upsert wallet row
  const { data: wallet, error } = await supabase
    .from('wallets')
    .upsert({ brand_id: brandId, ...updatePayload }, { onConflict: 'brand_id' })
    .select('auto_recharge, auto_recharge_threshold, auto_recharge_amount')
    .single()

  if (error) {
    console.error('[PATCH /api/billing/auto-recharge] DB error:', error)
    return NextResponse.json({ error: 'Failed to update auto-recharge settings' }, { status: 500 })
  }

  return NextResponse.json({
    autoRecharge: wallet?.auto_recharge ?? autoRecharge,
    threshold: wallet?.auto_recharge_threshold ?? null,
    amount: wallet?.auto_recharge_amount ?? null,
  })
}

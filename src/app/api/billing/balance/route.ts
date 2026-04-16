// ---------------------------------------------------------------------------
// GET /api/billing/balance?brandId=xxx
//
// Returns the current wallet balance and usage stats for a brand.
//
// Response shape:
//   {
//     total: number,              // balance + free_credits (pre-computed for UI)
//     free_credits: number,       // snake_case (matches DB column)
//     balance: number,            // paid credits only
//     freeCredits: number,        // DEPRECATED — legacy camelCase alias, same as free_credits
//     freeCreditsExpiresAt: string | null,
//     autoRecharge: boolean,
//     autoRechargeThreshold: number | null,
//     autoRechargeAmount: number | null,
//     creditsUsedToday: number,
//     creditsUsedThisMonth: number,
//   }
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest): Promise<NextResponse> {
  // 1. Auth check
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // 2. Query params
  const { searchParams } = new URL(request.url)
  const brandId = searchParams.get('brandId')

  if (!brandId) {
    return NextResponse.json({ error: 'brandId query param is required' }, { status: 400 })
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

  // 4. Fetch wallet (use service client — user client hits recursive RLS)
  const { data: wallet } = await admin
    .from('wallets')
    .select(
      'balance, free_credits, free_credits_expires_at, auto_recharge, auto_recharge_threshold, auto_recharge_amount',
    )
    .eq('brand_id', brandId)
    .single()

  // 5. Compute usage stats from wallet_transactions
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  // Credits used today (sum of 'debit' transactions — skills engine writes type='debit')
  const { data: todayRows } = await admin
    .from('wallet_transactions')
    .select('amount')
    .eq('brand_id', brandId)
    .eq('type', 'debit')
    .gte('created_at', startOfToday)

  const creditsUsedToday = (todayRows ?? []).reduce(
    (sum, row) => sum + Math.abs(row.amount ?? 0),
    0,
  )

  // Credits used this month
  const { data: monthRows } = await admin
    .from('wallet_transactions')
    .select('amount')
    .eq('brand_id', brandId)
    .eq('type', 'debit')
    .gte('created_at', startOfMonth)

  const creditsUsedThisMonth = (monthRows ?? []).reduce(
    (sum, row) => sum + Math.abs(row.amount ?? 0),
    0,
  )

  const balance = wallet?.balance ?? 0
  const freeCredits = wallet?.free_credits ?? 0

  return NextResponse.json({
    total: balance + freeCredits,
    free_credits: freeCredits,
    balance,
    // Legacy camelCase alias — kept so any older consumer doesn't break.
    freeCredits,
    freeCreditsExpiresAt: wallet?.free_credits_expires_at ?? null,
    autoRecharge: wallet?.auto_recharge ?? false,
    autoRechargeThreshold: wallet?.auto_recharge_threshold ?? null,
    autoRechargeAmount: wallet?.auto_recharge_amount ?? null,
    creditsUsedToday,
    creditsUsedThisMonth,
  })
}

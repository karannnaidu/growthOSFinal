// ---------------------------------------------------------------------------
// GET /api/billing/transactions?brandId=xxx&page=1&limit=20
//
// Returns paginated wallet transaction history for a brand.
//
// Response shape:
//   {
//     transactions: WalletTransaction[],
//     page: number,
//     limit: number,
//     total: number,
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
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
  const offset = (page - 1) * limit

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

  // 4. Fetch paginated transactions (service client — RLS recursion on user client)
  const { data: rawTransactions, error, count } = await admin
    .from('wallet_transactions')
    .select(
      'id, type, amount, balance_after, description, stripe_payment_id, created_at',
      { count: 'exact' },
    )
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  // Map DB column names to what the frontend expects
  const transactions = (rawTransactions ?? []).map((tx) => ({
    id: tx.id,
    type: tx.type === 'debit' ? 'usage' : tx.type,
    credits: tx.amount ?? 0,
    balance_after: tx.balance_after,
    description: tx.description,
    stripe_payment_intent_id: tx.stripe_payment_id,
    created_at: tx.created_at,
  }))

  if (error) {
    console.error('[GET /api/billing/transactions] DB error:', error)
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }

  return NextResponse.json({
    transactions,
    page,
    limit,
    total: count ?? 0,
  })
}

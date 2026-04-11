// ---------------------------------------------------------------------------
// POST /api/billing/top-up
//
// Creates a Stripe Checkout Session for purchasing a credit pack.
//
// Request body: { brandId: string, credits: 500 | 1000 | 2500 | 5000 }
// Response:     { checkoutUrl: string }
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Lazy Stripe client — only instantiated during request handling, not at build time.
function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!)
}

// Credit pack pricing: credits -> { priceInCents, name }
const CREDIT_PACKS: Record<number, { priceInCents: number; name: string }> = {
  500:  { priceInCents: 1500, name: '500 Credits' },   // $15
  1000: { priceInCents: 2500, name: '1,000 Credits' }, // $25
  2500: { priceInCents: 5000, name: '2,500 Credits' }, // $50
  5000: { priceInCents: 8000, name: '5,000 Credits' }, // $80
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Auth check
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // 2. Parse and validate request body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { brandId, credits } = body as { brandId?: string; credits?: number }

  if (!brandId) {
    return NextResponse.json({ error: 'brandId is required' }, { status: 400 })
  }

  if (!credits || !(credits in CREDIT_PACKS)) {
    return NextResponse.json(
      { error: 'credits must be one of: 500, 1000, 2500, 5000' },
      { status: 400 },
    )
  }

  // 3. Verify brand access
  const admin = createServiceClient()
  const { data: brand } = await admin
    .from('brands')
    .select('id, owner_id, name')
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

  // 4. Get or create Stripe customer
  const { data: wallet } = await supabase
    .from('wallets')
    .select('stripe_customer_id')
    .eq('brand_id', brandId)
    .single()

  let stripeCustomerId: string | null = wallet?.stripe_customer_id ?? null

  if (!stripeCustomerId) {
    // Fetch user email for customer creation
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', user.id)
      .single()

    const stripe = getStripe()
    const customer = await stripe.customers.create({
      email: profile?.email ?? user.email ?? undefined,
      name: profile?.full_name ?? undefined,
      metadata: { brandId, userId: user.id },
    })
    stripeCustomerId = customer.id

    // Upsert wallet with new customer id
    await supabase
      .from('wallets')
      .upsert(
        { brand_id: brandId, stripe_customer_id: stripeCustomerId },
        { onConflict: 'brand_id' },
      )
  }

  // 5. Build Checkout Session
  // Safe: we validated `credits in CREDIT_PACKS` above
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const pack = CREDIT_PACKS[credits]!
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const stripe = getStripe()

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: pack.name,
            description: `${credits.toLocaleString()} credits for ${brand.name}`,
          },
          unit_amount: pack.priceInCents,
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    metadata: { brandId, credits: String(credits) },
    success_url: `${appUrl}/dashboard/billing?success=true`,
    cancel_url: `${appUrl}/dashboard/billing?canceled=true`,
  })

  return NextResponse.json({ checkoutUrl: session.url })
}

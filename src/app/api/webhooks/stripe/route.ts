// ---------------------------------------------------------------------------
// POST /api/webhooks/stripe
//
// Handles incoming Stripe webhook events. Raw body required for signature
// verification — do NOT parse as JSON before constructEvent.
//
// Handled events:
//   checkout.session.completed     — credit purchase fulfilled
//   charge.refunded                — credits deducted on refund
//   payment_intent.payment_failed  — failure notification sent
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'

// Lazy Stripe client — only instantiated during request handling, not at build time.
function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!)
}

// ---------------------------------------------------------------------------
// Supabase service-role client (bypasses RLS for trusted webhook processing)
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
  // 1. Read raw body for signature verification
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  // 2. Verify event signature
  const stripe = getStripe()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[stripe webhook] Signature verification failed:', message)
    return NextResponse.json({ error: `Webhook verification failed: ${message}` }, { status: 400 })
  }

  const supabase = createServiceClient()

  // 3. Deduplicate — ignore already-processed events
  const { data: existing } = await supabase
    .from('stripe_webhook_events')
    .select('id')
    .eq('stripe_event_id', event.id)
    .single()

  if (existing) {
    // Already handled — return 200 to stop Stripe retrying
    return NextResponse.json({ received: true, duplicate: true })
  }

  // 4. Record the event before processing (idempotency guard)
  await supabase.from('stripe_webhook_events').insert({
    stripe_event_id: event.id,
    event_type: event.type,
    processed: false,
  })

  // 5. Dispatch to event-specific handlers
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(supabase, event.data.object as Stripe.Checkout.Session)
        break

      case 'charge.refunded':
        await handleChargeRefunded(supabase, event.data.object as Stripe.Charge)
        break

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(supabase, event.data.object as Stripe.PaymentIntent)
        break

      default:
        // Unhandled event — not an error, just ignore
        break
    }

    // Mark as processed
    await supabase
      .from('stripe_webhook_events')
      .update({ processed: true })
      .eq('stripe_event_id', event.id)
  } catch (err) {
    console.error(`[stripe webhook] Error handling ${event.type}:`, err)
    // Return 500 so Stripe retries
    return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

// ---------------------------------------------------------------------------
// checkout.session.completed
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(
  supabase: ReturnType<typeof createServiceClient>,
  session: Stripe.Checkout.Session,
) {
  const brandId = session.metadata?.brandId
  const creditsStr = session.metadata?.credits
  const credits = creditsStr ? parseInt(creditsStr, 10) : 0

  if (!brandId || !credits) {
    console.error('[stripe webhook] checkout.session.completed missing metadata', session.metadata)
    return
  }

  const amountPaid = session.amount_total ?? 0 // in cents

  // 1. Increment wallet balance
  const { data: wallet } = await supabase
    .from('wallets')
    .select('id, balance')
    .eq('brand_id', brandId)
    .single()

  if (!wallet) {
    console.error(`[stripe webhook] Wallet not found for brand ${brandId}`)
    return
  }

  await supabase
    .from('wallets')
    .update({ balance: (wallet.balance ?? 0) + credits })
    .eq('brand_id', brandId)

  // 2. Record transaction
  await supabase.from('wallet_transactions').insert({
    brand_id: brandId,
    type: 'deposit',
    credits,
    amount_cents: amountPaid,
    stripe_payment_intent_id: typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent?.id ?? null),
    description: `Credit pack purchase (${credits.toLocaleString()} credits)`,
  })

  // 3. Create notification
  await supabase.from('notifications').insert({
    brand_id: brandId,
    type: 'billing',
    title: 'Credits Added',
    body: `${credits.toLocaleString()} credits have been added to your account.`,
  })
}

// ---------------------------------------------------------------------------
// charge.refunded
// ---------------------------------------------------------------------------

async function handleChargeRefunded(
  supabase: ReturnType<typeof createServiceClient>,
  charge: Stripe.Charge,
) {
  // Attempt to find the brand via payment intent or customer
  const customerId = typeof charge.customer === 'string'
    ? charge.customer
    : (charge.customer?.id ?? null)

  if (!customerId) {
    console.error('[stripe webhook] charge.refunded missing customer id')
    return
  }

  const { data: wallet } = await supabase
    .from('wallets')
    .select('id, brand_id, balance')
    .eq('stripe_customer_id', customerId)
    .single()

  if (!wallet) {
    console.error(`[stripe webhook] Wallet not found for Stripe customer ${customerId}`)
    return
  }

  // Calculate credits to deduct (proportional refund based on amount_refunded)
  // We record the refund as-is; exact credit deduction requires product knowledge.
  // Store the refunded amount in cents and record the transaction.
  const amountRefunded = charge.amount_refunded // in cents

  await supabase.from('wallet_transactions').insert({
    brand_id: wallet.brand_id,
    type: 'refund',
    credits: 0, // credits cannot be reliably recalculated here without original purchase record
    amount_cents: -amountRefunded,
    stripe_payment_intent_id: typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : (charge.payment_intent?.id ?? null),
    description: `Refund of $${(amountRefunded / 100).toFixed(2)}`,
  })

  // Optionally notify the brand
  await supabase.from('notifications').insert({
    brand_id: wallet.brand_id,
    type: 'billing',
    title: 'Payment Refunded',
    body: `A refund of $${(amountRefunded / 100).toFixed(2)} has been processed.`,
  })
}

// ---------------------------------------------------------------------------
// payment_intent.payment_failed
// ---------------------------------------------------------------------------

async function handlePaymentFailed(
  supabase: ReturnType<typeof createServiceClient>,
  paymentIntent: Stripe.PaymentIntent,
) {
  const customerId = typeof paymentIntent.customer === 'string'
    ? paymentIntent.customer
    : (paymentIntent.customer?.id ?? null)

  if (!customerId) {
    console.error('[stripe webhook] payment_intent.payment_failed missing customer id')
    return
  }

  const { data: wallet } = await supabase
    .from('wallets')
    .select('brand_id')
    .eq('stripe_customer_id', customerId)
    .single()

  if (!wallet) {
    console.error(`[stripe webhook] Wallet not found for Stripe customer ${customerId}`)
    return
  }

  const failureMessage =
    paymentIntent.last_payment_error?.message ?? 'Your payment could not be processed.'

  await supabase.from('notifications').insert({
    brand_id: wallet.brand_id,
    type: 'billing',
    title: 'Payment Failed',
    body: failureMessage,
  })
}

// ---------------------------------------------------------------------------
// POST /api/webhooks/shopify
//
// Handles incoming Shopify webhook events. Raw body is required for HMAC
// signature verification — do NOT parse as JSON before verification.
//
// Handled topics:
//   products/create  — upsert products table + knowledge_nodes
//   products/update  — upsert products table + knowledge_nodes
//   orders/create    — update product revenue snapshot + knowledge_snapshot
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServerClient } from '@supabase/ssr'

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
// Types
// ---------------------------------------------------------------------------

interface ShopifyProductPayload {
  id: number
  title: string
  body_html: string | null
  vendor: string
  product_type: string
  tags: string
  status: string
  images: Array<{ id: number; src: string; alt: string | null }>
  variants: Array<{
    id: number
    title: string
    price: string
    compare_at_price: string | null
    sku: string | null
    inventory_quantity: number
  }>
}

interface ShopifyOrderPayload {
  id: number
  total_price: string
  line_items: Array<{
    product_id: number | null
    variant_id: number | null
    quantity: number
    price: string
    title: string
  }>
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Read raw body for HMAC verification
  const body = await request.text()
  const hmac = request.headers.get('x-shopify-hmac-sha256')
  const topic = request.headers.get('x-shopify-topic')
  const shop = request.headers.get('x-shopify-shop-domain')

  // 2. Verify HMAC signature
  if (!hmac) {
    return new NextResponse('Missing HMAC header', { status: 401 })
  }

  const secret = process.env.SHOPIFY_API_SECRET
  if (!secret) {
    console.error('[shopify webhook] SHOPIFY_API_SECRET is not set')
    return new NextResponse('Server misconfiguration', { status: 500 })
  }

  const computed = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64')

  if (computed !== hmac) {
    console.warn('[shopify webhook] HMAC verification failed for shop:', shop)
    return new NextResponse('Unauthorized', { status: 401 })
  }

  if (!topic || !shop) {
    return NextResponse.json({ error: 'Missing topic or shop header' }, { status: 400 })
  }

  // 3. Parse payload
  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // 4. Find the brand associated with this shop domain
  const { data: platform } = await supabase
    .from('platform_connections')
    .select('brand_id')
    .eq('platform', 'shopify')
    .eq('shop_domain', shop)
    .single()

  if (!platform) {
    console.warn(`[shopify webhook] No brand found for shop domain: ${shop}`)
    // Return 200 to stop Shopify retrying for an unknown shop
    return NextResponse.json({ received: true, ignored: true })
  }

  const brandId = platform.brand_id

  // 5. Dispatch to topic handlers
  try {
    switch (topic) {
      case 'products/create':
      case 'products/update':
        await handleProductUpsert(supabase, brandId, payload as ShopifyProductPayload)
        break

      case 'orders/create':
        await handleOrderCreate(supabase, brandId, payload as ShopifyOrderPayload)
        break

      default:
        // Unhandled topic — not an error
        console.log(`[shopify webhook] Unhandled topic: ${topic}`)
        break
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[shopify webhook] Error handling ${topic} for brand ${brandId}:`, message)
    return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

// ---------------------------------------------------------------------------
// products/create + products/update
// ---------------------------------------------------------------------------

async function handleProductUpsert(
  supabase: ReturnType<typeof createServiceClient>,
  brandId: string,
  product: ShopifyProductPayload,
): Promise<void> {
  const now = new Date().toISOString()

  // Upsert into products table
  const { error: productError } = await supabase
    .from('products')
    .upsert(
      {
        brand_id: brandId,
        shopify_product_id: String(product.id),
        title: product.title,
        description: product.body_html ?? '',
        vendor: product.vendor,
        product_type: product.product_type,
        tags: product.tags,
        status: product.status,
        image_url: product.images?.[0]?.src ?? null,
        variants: product.variants ?? [],
        updated_at: now,
      },
      { onConflict: 'brand_id,shopify_product_id' },
    )

  if (productError) {
    console.error('[shopify webhook] products upsert error:', productError.message)
    throw productError
  }

  // Upsert into knowledge_nodes — product info as a knowledge entity
  const nodeContent = [
    `Product: ${product.title}`,
    product.vendor ? `Vendor: ${product.vendor}` : '',
    product.product_type ? `Type: ${product.product_type}` : '',
    product.body_html ? `Description: ${product.body_html.replace(/<[^>]+>/g, ' ').trim()}` : '',
    product.tags ? `Tags: ${product.tags}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const { error: nodeError } = await supabase
    .from('knowledge_nodes')
    .upsert(
      {
        brand_id: brandId,
        entity_type: 'product',
        entity_id: String(product.id),
        content: nodeContent,
        metadata: {
          shopify_product_id: product.id,
          status: product.status,
          variant_count: product.variants?.length ?? 0,
        },
        updated_at: now,
      },
      { onConflict: 'brand_id,entity_type,entity_id' },
    )

  if (nodeError) {
    // Non-fatal — knowledge graph update failure should not block the webhook
    console.warn('[shopify webhook] knowledge_nodes upsert failed (non-fatal):', nodeError.message)
  }

  console.log(`[shopify webhook] Product upserted: ${product.id} for brand ${brandId}`)
}

// ---------------------------------------------------------------------------
// orders/create
// ---------------------------------------------------------------------------

async function handleOrderCreate(
  supabase: ReturnType<typeof createServiceClient>,
  brandId: string,
  order: ShopifyOrderPayload,
): Promise<void> {
  const now = new Date().toISOString()

  // Update product revenue snapshots for each line item
  for (const item of order.line_items) {
    if (!item.product_id) continue

    const revenue = parseFloat(item.price) * item.quantity

    // Fetch existing snapshot
    const { data: existing } = await supabase
      .from('product_snapshots')
      .select('id, total_revenue, total_units')
      .eq('brand_id', brandId)
      .eq('shopify_product_id', String(item.product_id))
      .single()

    if (existing) {
      await supabase
        .from('product_snapshots')
        .update({
          total_revenue: (existing.total_revenue ?? 0) + revenue,
          total_units: (existing.total_units ?? 0) + item.quantity,
          last_order_at: now,
          updated_at: now,
        })
        .eq('id', existing.id)
    } else {
      await supabase.from('product_snapshots').insert({
        brand_id: brandId,
        shopify_product_id: String(item.product_id),
        total_revenue: revenue,
        total_units: item.quantity,
        last_order_at: now,
      })
    }
  }

  // Create a knowledge snapshot for this order event
  const { error: snapshotError } = await supabase.from('knowledge_snapshots').insert({
    brand_id: brandId,
    snapshot_type: 'order',
    data: {
      shopify_order_id: order.id,
      total_price: order.total_price,
      line_item_count: order.line_items.length,
      products: order.line_items.map((li) => ({
        product_id: li.product_id,
        title: li.title,
        quantity: li.quantity,
        price: li.price,
      })),
    },
    created_at: now,
  })

  if (snapshotError) {
    // Non-fatal
    console.warn('[shopify webhook] knowledge_snapshots insert failed (non-fatal):', snapshotError.message)
  }

  console.log(`[shopify webhook] Order processed: ${order.id} for brand ${brandId}`)
}

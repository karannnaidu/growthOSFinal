import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShopifyProduct {
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

interface ShopifyProductsResponse {
  products: ShopifyProduct[]
}

// ---------------------------------------------------------------------------
// Core API helper
// ---------------------------------------------------------------------------

export async function shopifyFetch(
  shop: string,
  accessToken: string,
  endpoint: string,
): Promise<unknown> {
  const response = await fetch(`https://${shop}/admin/api/2024-01/${endpoint}`, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(
      `Shopify API error: ${response.status} ${response.statusText} for ${endpoint}`,
    )
  }

  return response.json()
}

// ---------------------------------------------------------------------------
// HMAC verification
// ---------------------------------------------------------------------------

export function verifyShopifyHmac(
  query: Record<string, string>,
  secret: string,
): boolean {
  const { hmac, ...rest } = query

  if (!hmac) return false

  // Sort params alphabetically and build the message string
  const message = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key]}`)
    .join('&')

  const computed = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex')

  // Constant-time comparison to prevent timing attacks
  const hmacBuffer = Buffer.from(hmac, 'hex')
  const computedBuffer = Buffer.from(computed, 'hex')

  if (hmacBuffer.length !== computedBuffer.length) return false
  return crypto.timingSafeEqual(hmacBuffer, computedBuffer)
}

// ---------------------------------------------------------------------------
// Pull all products (paginated) and store in DB
// ---------------------------------------------------------------------------

export async function pullShopifyProducts(
  brandId: string,
  shop: string,
  accessToken: string,
): Promise<void> {
  const supabase = await createClient()

  // Fetch all products using pagination (limit=250 per page)
  let allProducts: ShopifyProduct[] = []
  let pageInfo: string | null = null
  let isFirstPage = true

  while (isFirstPage || pageInfo) {
    const endpoint = pageInfo
      ? `products.json?limit=250&page_info=${pageInfo}`
      : 'products.json?limit=250'

    const data = (await shopifyFetch(shop, accessToken, endpoint)) as ShopifyProductsResponse
    isFirstPage = false

    if (!data.products || data.products.length === 0) break

    allProducts = allProducts.concat(data.products)

    // Shopify cursor-based pagination: check Link header (not available via shopifyFetch)
    // For initial data pull, a single page of 250 products is sufficient.
    // TODO: Implement full cursor pagination using Link response headers when needed.
    break
  }

  if (allProducts.length === 0) return

  // Upsert products into DB
  const productRows = allProducts.map((p) => ({
    brand_id: brandId,
    shopify_id: String(p.id),
    title: p.title,
    description: p.body_html ?? null,
    price: p.variants[0]?.price ? parseFloat(p.variants[0].price) : null,
    compare_at_price: p.variants[0]?.compare_at_price
      ? parseFloat(p.variants[0].compare_at_price)
      : null,
    category: p.product_type || null,
    tags: p.tags ? p.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    images: p.images ?? [],
    variants: p.variants ?? [],
    status: p.status === 'active' ? 'active' : p.status,
  }))

  const { error: upsertError } = await supabase
    .from('products')
    .upsert(productRows, { onConflict: 'brand_id,shopify_id' })

  if (upsertError) {
    console.error('[Shopify] Failed to upsert products:', upsertError)
    throw new Error(`Failed to store products: ${upsertError.message}`)
  }

  // Fetch the stored product IDs so we can reference them in knowledge_nodes
  const { data: storedProducts, error: fetchError } = await supabase
    .from('products')
    .select('id, shopify_id, title, description, category, tags')
    .eq('brand_id', brandId)
    .in(
      'shopify_id',
      allProducts.map((p) => String(p.id)),
    )

  if (fetchError || !storedProducts) {
    console.error('[Shopify] Failed to fetch stored products for knowledge nodes:', fetchError)
    return
  }

  // Create knowledge_nodes for each product
  const knowledgeRows = storedProducts.map((product) => ({
    brand_id: brandId,
    node_type: 'product' as const,
    name: product.title,
    summary: product.description
      ? product.description.replace(/<[^>]*>/g, '').slice(0, 500)
      : null,
    properties: {
      product_id: product.id,
      shopify_id: product.shopify_id,
      category: product.category,
    },
    tags: product.tags ?? [],
    source_skill: 'shopify_connect',
    // TODO: Generate embedding using Gemini text-embedding-004 or compatible model
    // embedding: await generateEmbedding(`${product.title} ${product.description}`)
    is_active: true,
  }))

  const { error: knowledgeError } = await supabase
    .from('knowledge_nodes')
    .upsert(knowledgeRows, { onConflict: 'brand_id,name' })

  if (knowledgeError) {
    // Non-fatal: log but don't throw — products are already stored
    console.error('[Shopify] Failed to upsert knowledge nodes:', knowledgeError)
  }
}

// ---------------------------------------------------------------------------
// Pull 90-day orders summary and store as a knowledge node
// ---------------------------------------------------------------------------

export async function pullShopifyOrdersSummary(
  brandId: string,
  shop: string,
  accessToken: string,
): Promise<void> {
  const supabase = await createClient()

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  let orderCount = 0
  let totalRevenue = 0

  try {
    const data = (await shopifyFetch(
      shop,
      accessToken,
      `orders.json?status=any&created_at_min=${ninetyDaysAgo}&limit=250&fields=id,total_price`,
    )) as { orders: Array<{ id: number; total_price: string }> }

    if (data.orders) {
      orderCount = data.orders.length
      totalRevenue = data.orders.reduce(
        (sum, o) => sum + parseFloat(o.total_price ?? '0'),
        0,
      )
    }
  } catch (err) {
    console.error('[Shopify] Failed to fetch orders summary:', err)
    return
  }

  // Store summary as a knowledge node
  const { error } = await supabase.from('knowledge_nodes').upsert(
    [
      {
        brand_id: brandId,
        node_type: 'metric' as const,
        name: 'Shopify 90-Day Orders Summary',
        summary: `${orderCount} orders totalling $${totalRevenue.toFixed(2)} in the last 90 days`,
        properties: {
          order_count: orderCount,
          total_revenue: totalRevenue,
          period_days: 90,
          as_of: new Date().toISOString(),
          shop,
        },
        tags: ['shopify', 'orders', 'revenue'],
        source_skill: 'shopify_connect',
        is_active: true,
      },
    ],
    { onConflict: 'brand_id,name' },
  )

  if (error) {
    console.error('[Shopify] Failed to store orders knowledge node:', error)
  }
}

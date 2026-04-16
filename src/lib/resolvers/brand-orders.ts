// src/lib/resolvers/brand-orders.ts
//
// brand.orders.list — resolve order history from the best available source.
// Precedence:
//   1. Shopify orders (high confidence — live store data)
//   2. CSV upload (medium) — not implemented yet; returns null
//
// Note: Stripe is reserved for Growth OS billing, NOT brand customer payments.
// Do NOT add a Stripe fallback here.
//
// NOTE: TOOL_HANDLERS in `mcp-client.ts` is module-local (not exported),
// so we clone the shopify.orders.list call logic here rather than
// lazy-import it. Keeps the resolver self-contained and avoids a circular
// dep.

import { createServiceClient } from '@/lib/supabase/service';
import { shopifyFetch } from '@/lib/shopify';
import type { ResolverResult } from './brand-products';

export interface BrandOrder {
  id: string;
  created_at: string;
  total: number;
  currency: string;
  customer_id?: string;
  line_items?: Array<{ product_id?: string; sku?: string; quantity: number }>;
}

/**
 * Normalize a raw Shopify order into the shared BrandOrder shape.
 * Shopify returns total_price as a stringly-typed decimal.
 */
function normalizeShopifyOrder(raw: unknown): BrandOrder | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as {
    id?: number | string;
    created_at?: string;
    total_price?: string;
    currency?: string;
    customer?: { id?: number | string } | null;
    line_items?: Array<{
      product_id?: number | string | null;
      sku?: string | null;
      quantity?: number;
    }>;
  };
  if (o.id === undefined || !o.created_at) return null;
  const totalNum = o.total_price ? Number.parseFloat(o.total_price) : 0;
  const lineItems = Array.isArray(o.line_items)
    ? o.line_items.map((li) => ({
        product_id: li.product_id !== undefined && li.product_id !== null ? String(li.product_id) : undefined,
        sku: li.sku ?? undefined,
        quantity: typeof li.quantity === 'number' ? li.quantity : 0,
      }))
    : undefined;
  return {
    id: String(o.id),
    created_at: o.created_at,
    total: Number.isFinite(totalNum) ? totalNum : 0,
    currency: o.currency ?? 'USD',
    customer_id:
      o.customer && o.customer.id !== undefined && o.customer.id !== null
        ? String(o.customer.id)
        : undefined,
    line_items: lineItems,
  };
}

export async function resolveBrandOrders(
  brandId: string,
): Promise<ResolverResult<BrandOrder>> {
  const supabase = createServiceClient();

  // 1. Try Shopify — clone of shopify.orders.list handler.
  const { data: shopifyCred } = await supabase
    .from('credentials')
    .select('platform, access_token, metadata')
    .eq('brand_id', brandId)
    .eq('platform', 'shopify')
    .maybeSingle();

  if (shopifyCred?.access_token) {
    try {
      const metadata = (shopifyCred.metadata ?? {}) as Record<string, string | null | undefined>;
      const shop = metadata.shop ?? '';
      if (shop) {
        const res = (await shopifyFetch(
          shop,
          shopifyCred.access_token as string,
          'orders.json?limit=50&status=any',
        )) as { orders?: unknown[] };
        const rawOrders = Array.isArray(res?.orders) ? res.orders : [];
        if (rawOrders.length > 0) {
          const normalized = rawOrders
            .map(normalizeShopifyOrder)
            .filter((o): o is BrandOrder => o !== null);
          return {
            data: normalized,
            source: 'shopify',
            confidence: 'high',
            isComplete: true,
          };
        }
      }
    } catch (err) {
      console.warn('[resolveBrandOrders] shopify failed, falling through:', err);
    }
  }

  // 2. CSV upload — not implemented yet.
  return { data: null, source: null, confidence: 'low', isComplete: false };
}

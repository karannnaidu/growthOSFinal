// src/lib/resolvers/brand-products.ts
//
// brand.products.list — resolve a brand's product catalog from the best
// available source. Precedence:
//   1. Shopify (high confidence — live storefront data)
//   2. brands.product_context from onboarding extraction (medium)
//      (also falls back to brand_guidelines.products, which is what the
//      Settings page writes to — keeps parity until we unify storage)
//   3. CSV upload (medium)
//   4. Website scrape (low) — future
//
// Return shape is shared with brand-customers and brand-orders resolvers.
//
// NOTE: TOOL_HANDLERS in `mcp-client.ts` is module-local (not exported),
// so we clone the shopify.products.list call here rather than lazy-import it.
// This keeps the resolver self-contained and avoids a circular dep.

import { createServiceClient } from '@/lib/supabase/service';
import { shopifyFetch } from '@/lib/shopify';

export type ResolverSource =
  | 'shopify'
  | 'brand_data'
  | 'klaviyo'
  | 'csv'
  | 'scrape'
  | null;

export type ResolverConfidence = 'high' | 'medium' | 'low';

export interface ResolverResult<T> {
  data: T[] | null;
  source: ResolverSource;
  confidence: ResolverConfidence;
  isComplete: boolean;
}

export interface BrandProduct {
  id: string;
  title: string;
  price?: number;
  sku?: string;
  description?: string;
}

/**
 * Normalize a raw Shopify product into the shared BrandProduct shape.
 * Shopify prices are stringly-typed on variants; the first variant is used.
 */
function normalizeShopifyProduct(raw: unknown): BrandProduct | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as {
    id?: number | string;
    title?: string;
    body_html?: string | null;
    variants?: Array<{ price?: string; sku?: string | null }>;
  };
  if (p.id === undefined || !p.title) return null;
  const v = p.variants?.[0];
  const priceNum = v?.price ? Number.parseFloat(v.price) : undefined;
  return {
    id: String(p.id),
    title: p.title,
    price: Number.isFinite(priceNum as number) ? (priceNum as number) : undefined,
    sku: v?.sku ?? undefined,
    description: p.body_html ?? undefined,
  };
}

export async function resolveBrandProducts(
  brandId: string,
): Promise<ResolverResult<BrandProduct>> {
  const supabase = createServiceClient();

  // 1. Try Shopify — fetch the credential and call the storefront directly.
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
          'products.json?limit=50',
        )) as { products?: unknown[] };
        const rawProducts = Array.isArray(res?.products) ? res.products : [];
        if (rawProducts.length > 0) {
          const normalized = rawProducts
            .map(normalizeShopifyProduct)
            .filter((p): p is BrandProduct => p !== null);
          return {
            data: normalized,
            source: 'shopify',
            confidence: 'high',
            isComplete: true,
          };
        }
      }
    } catch (err) {
      console.warn('[resolveBrandProducts] shopify failed, falling through:', err);
    }
  }

  // 2. CSV upload — from brand_csv_products table.
  const { data: csvRows } = await supabase
    .from('brand_csv_products')
    .select('product_id, sku, title, price, inventory')
    .eq('brand_id', brandId)
    .limit(500);

  if (csvRows && csvRows.length > 0) {
    return {
      data: csvRows.map((r) => ({
        id: String(r.product_id ?? r.sku ?? r.title),
        title: r.title,
        price: r.price != null ? Number(r.price) : undefined,
        sku: r.sku ?? undefined,
      })),
      source: 'csv',
      confidence: 'medium',
      isComplete: true,
    };
  }

  // 3. product_context from onboarding extraction; fall back to
  //    brand_guidelines.products (what the Settings page writes to).
  const { data: brand } = await supabase
    .from('brands')
    .select('product_context, brand_guidelines')
    .eq('id', brandId)
    .single();

  const rawProducts = extractProducts(brand?.product_context)
    ?? extractProducts((brand?.brand_guidelines as { products?: unknown } | null)?.products);

  if (rawProducts && rawProducts.length > 0) {
    return {
      data: rawProducts.map(normalizeExtractedProduct),
      source: 'brand_data',
      confidence: 'medium',
      isComplete: false,
    };
  }

  // 4. scrape — not implemented yet.
  return { data: null, source: null, confidence: 'low', isComplete: false };
}

/**
 * Normalize a product from the onboarding extraction shape
 * ({ name, description, price, image_url, category }) into BrandProduct.
 * Price may be a string (e.g. "$29.99", "5100") or number.
 */
function normalizeExtractedProduct(raw: unknown): BrandProduct {
  const p = (raw ?? {}) as {
    id?: string | number;
    name?: string;
    title?: string;
    price?: string | number | null;
    sku?: string | null;
    description?: string | null;
  };
  const title = p.title ?? p.name ?? 'Untitled product';
  let price: number | undefined;
  if (typeof p.price === 'number' && Number.isFinite(p.price)) {
    price = p.price;
  } else if (typeof p.price === 'string') {
    const parsed = Number.parseFloat(p.price.replace(/[^0-9.\-]/g, ''));
    price = Number.isFinite(parsed) ? parsed : undefined;
  }
  return {
    id: p.id !== undefined ? String(p.id) : title,
    title,
    price,
    sku: p.sku ?? undefined,
    description: p.description ?? undefined,
  };
}

/** Returns the array if the value is a non-empty array, else null. */
function extractProducts(v: unknown): unknown[] | null {
  if (Array.isArray(v) && v.length > 0) return v;
  return null;
}

// src/lib/resolvers/brand-customers.ts
//
// brand.customers.list — resolve customer/profile data from the best
// available source. Precedence:
//   1. Shopify customers (high confidence — live store data)
//   2. Klaviyo profiles (medium — marketing list, may exclude non-opt-ins)
//   3. CSV upload (medium) — not implemented yet; returns null
//
// Return shape is shared with brand-products and brand-orders resolvers.
//
// NOTE: TOOL_HANDLERS in `mcp-client.ts` is module-local (not exported),
// so we clone the shopify.customers.list + klaviyo.lists.get call logic
// here rather than lazy-import them. Keeps the resolver self-contained
// and avoids a circular dep.

import { createServiceClient } from '@/lib/supabase/service';
import { shopifyFetch } from '@/lib/shopify';
import type { ResolverResult } from './brand-products';

export interface BrandCustomer {
  id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  total_spent?: number;
  orders_count?: number;
}

/**
 * Normalize a raw Shopify customer into the shared BrandCustomer shape.
 * Shopify returns total_spent as a stringly-typed decimal.
 */
function normalizeShopifyCustomer(raw: unknown): BrandCustomer | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as {
    id?: number | string;
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    total_spent?: string | null;
    orders_count?: number | null;
  };
  if (c.id === undefined) return null;
  const totalSpentNum = c.total_spent ? Number.parseFloat(c.total_spent) : undefined;
  return {
    id: String(c.id),
    email: c.email ?? undefined,
    first_name: c.first_name ?? undefined,
    last_name: c.last_name ?? undefined,
    total_spent: Number.isFinite(totalSpentNum as number) ? (totalSpentNum as number) : undefined,
    orders_count: typeof c.orders_count === 'number' ? c.orders_count : undefined,
  };
}

/**
 * Normalize a raw Klaviyo profile (JSON:API resource object) into the shared
 * BrandCustomer shape. Klaviyo profiles have the user-facing fields under
 * `.attributes` and don't expose per-customer order totals here.
 */
function normalizeKlaviyoProfile(raw: unknown): BrandCustomer | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as {
    id?: string;
    attributes?: {
      email?: string | null;
      first_name?: string | null;
      last_name?: string | null;
    };
  };
  if (!p.id) return null;
  const attrs = p.attributes ?? {};
  return {
    id: p.id,
    email: attrs.email ?? undefined,
    first_name: attrs.first_name ?? undefined,
    last_name: attrs.last_name ?? undefined,
  };
}

export async function resolveBrandCustomers(
  brandId: string,
): Promise<ResolverResult<BrandCustomer>> {
  const supabase = createServiceClient();

  // 1. Try Shopify — clone of shopify.customers.list handler.
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
          'customers.json?limit=50',
        )) as { customers?: unknown[] };
        const rawCustomers = Array.isArray(res?.customers) ? res.customers : [];
        if (rawCustomers.length > 0) {
          const normalized = rawCustomers
            .map(normalizeShopifyCustomer)
            .filter((c): c is BrandCustomer => c !== null);
          return {
            data: normalized,
            source: 'shopify',
            confidence: 'high',
            isComplete: true,
          };
        }
      }
    } catch (err) {
      console.warn('[resolveBrandCustomers] shopify failed, falling through:', err);
    }
  }

  // 2. CSV upload — richer fields than Klaviyo profiles, user-curated.
  const { data: csvRows } = await supabase
    .from('brand_csv_customers')
    .select('email, first_name, last_name, total_spent, orders_count')
    .eq('brand_id', brandId)
    .limit(500);

  if (csvRows && csvRows.length > 0) {
    return {
      data: csvRows.map((r, i) => ({
        id: r.email ?? `csv-${i}`,
        email: r.email ?? undefined,
        first_name: r.first_name ?? undefined,
        last_name: r.last_name ?? undefined,
        total_spent: r.total_spent != null ? Number(r.total_spent) : undefined,
        orders_count: r.orders_count ?? undefined,
      })),
      source: 'csv',
      confidence: 'medium',
      isComplete: true,
    };
  }

  // 3. Try Klaviyo — clone of klaviyo.lists.get pattern, but hit /profiles
  //    since we want individual customers rather than list metadata.
  const { data: klaviyoCred } = await supabase
    .from('credentials')
    .select('platform, access_token, metadata')
    .eq('brand_id', brandId)
    .eq('platform', 'klaviyo')
    .maybeSingle();

  if (klaviyoCred?.access_token) {
    try {
      const res = await fetch('https://a.klaviyo.com/api/profiles', {
        headers: {
          Authorization: `Klaviyo-API-Key ${klaviyoCred.access_token}`,
          revision: '2024-02-15',
          Accept: 'application/json',
        },
      });
      if (res.ok) {
        const json = (await res.json()) as { data?: unknown[] };
        const rawProfiles = Array.isArray(json?.data) ? json.data : [];
        if (rawProfiles.length > 0) {
          const normalized = rawProfiles
            .map(normalizeKlaviyoProfile)
            .filter((c): c is BrandCustomer => c !== null);
          return {
            data: normalized,
            source: 'klaviyo',
            confidence: 'medium',
            isComplete: false,
          };
        }
      } else {
        console.warn(
          '[resolveBrandCustomers] klaviyo profiles fetch failed:',
          res.status,
          res.statusText,
        );
      }
    } catch (err) {
      console.warn('[resolveBrandCustomers] klaviyo failed, falling through:', err);
    }
  }

  return { data: null, source: null, confidence: 'low', isComplete: false };
}

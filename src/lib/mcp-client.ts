/**
 * MCP Client — Data Fetching Layer
 *
 * Maps `mcp_tools` from skill frontmatter to live API calls.
 * Fetches credentials from the `credentials` table, executes the appropriate
 * provider calls, and returns a structured SkillDataContext that gets
 * injected into the skill's prompt before the LLM is invoked.
 *
 * Server-side only. Missing credentials or API errors are handled
 * gracefully — partial data is returned rather than throwing.
 */

import { createShopifyMcpClient } from '@/lib/platforms/shopify-mcp';
import { createAhrefsMcpClient } from '@/lib/platforms/ahrefs-mcp';
import { metaAdAccount } from '@/lib/platforms/meta-sdk';
import { ga4Client } from '@/lib/platforms/ga4-sdk';
import { googleAdsCustomer } from '@/lib/platforms/google-ads-sdk';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillDataContext {
  shopify?: {
    products?: unknown[];
    orders?: unknown[];
    customers?: unknown[];
    shop?: unknown;
  };
  meta?: {
    campaigns?: unknown[];
    adSets?: unknown[];
    ads?: unknown[];
    account?: unknown;
    breakdowns?: Record<string, unknown>;
    pixels?: unknown;
  };
  google?: {
    ads?: unknown;
  };
  google_analytics?: {
    ga4?: unknown;
    searchConsole?: unknown;
  };
  klaviyo?: {
    lists?: unknown[];
    flows?: unknown[];
  };
  ahrefs?: {
    backlinks?: unknown;
    keywords?: unknown;
  };
  competitor?: {
    ads?: unknown[];
    products?: unknown[];
    traffic?: unknown[];
    seo?: unknown[];
    status?: unknown[];
  };
}

interface Credential {
  platform: string;
  access_token: string;
  refresh_token?: string | null;
  expires_at?: string | null;
  metadata: Record<string, string | null | undefined>;
}

// ---------------------------------------------------------------------------
// Provider-specific fetch functions
//
// Google OAuth refresh is handled automatically by OAuth2Client inside the
// per-platform SDK wrappers (see ga4-sdk, google-ads-sdk, and the googleapis
// usage in fetchGSCPerformance). The manual refresh helper that used to live
// here was removed in Task 17 of the MCP+SDK migration.
// ---------------------------------------------------------------------------

async function fetchMetaInsights(cred: Credential): Promise<unknown> {
  const rawId = cred.metadata?.ad_account_id;
  if (!rawId) {
    console.warn('[MCP] Meta: ad_account_id not set in credential metadata');
    return { data: [] };
  }
  try {
    const account = metaAdAccount(cred.access_token, rawId);
    const insights = await account.getInsights(
      [
        'campaign_id',
        'campaign_name',
        'impressions',
        'clicks',
        'spend',
        'cpc',
        'ctr',
        'frequency',
        'actions',
        'action_values',
        'purchase_roas',
      ],
      { date_preset: 'last_30d', level: 'campaign' },
    );
    const data = (insights as { _data?: unknown }[]).map((i) => i._data ?? i);
    const totalSpend = data.reduce<number>((sum, row) => {
      const r = row as { spend?: string | number };
      const n = typeof r.spend === 'string' ? parseFloat(r.spend) : (r.spend ?? 0);
      return sum + (Number.isFinite(n) ? Number(n) : 0);
    }, 0);
    console.log('[MCP] Meta insights fetched', {
      adAccountId: rawId,
      rowCount: data.length,
      totalSpend30d: totalSpend,
    });
    return { data };
  } catch (err) {
    console.warn('[MCP] Meta insights error:', err);
    return { data: [], error: (err as Error).message ?? String(err) };
  }
}

async function fetchMetaAds(cred: Credential): Promise<unknown> {
  const rawId = cred.metadata?.ad_account_id;
  if (!rawId) {
    console.warn('[MCP] Meta: ad_account_id not set in credential metadata');
    return { data: [] };
  }
  try {
    const account = metaAdAccount(cred.access_token, rawId);
    // Two parallel calls: ad metadata + ad-level insights for last 30d.
    // Then merge by ad_id so the LLM gets one row per ad with both
    // creative info and performance numbers.
    const [adsRaw, insightsRaw] = await Promise.all([
      account.getAds(
        ['id', 'name', 'status', 'effective_status', 'campaign_id', 'adset_id', 'creative'],
        { limit: 200 },
      ),
      account.getInsights(
        [
          'ad_id',
          'ad_name',
          'campaign_name',
          'adset_name',
          'impressions',
          'clicks',
          'spend',
          'ctr',
          'cpc',
          'frequency',
          'actions',
          'action_values',
          'purchase_roas',
        ],
        { date_preset: 'last_30d', level: 'ad', limit: 200 },
      ),
    ]);
    const ads = (adsRaw as { _data?: unknown }[]).map((a) => a._data ?? a);
    const insights = (insightsRaw as { _data?: unknown }[]).map((i) => i._data ?? i);
    const insightsById = new Map<string, Record<string, unknown>>();
    for (const ins of insights) {
      const obj = ins as Record<string, unknown>;
      const id = obj.ad_id as string | undefined;
      if (id) insightsById.set(id, obj);
    }
    const merged = ads.map((ad) => {
      const obj = ad as Record<string, unknown>;
      const id = obj.id as string | undefined;
      const ins = id ? insightsById.get(id) : undefined;
      return { ...obj, insights: ins ?? null };
    });
    console.log('[MCP] Meta ads fetched', {
      adAccountId: rawId,
      adCount: ads.length,
      insightsCount: insights.length,
    });
    return { data: merged };
  } catch (err) {
    console.warn('[MCP] Meta ads error:', err);
    return { data: [], error: (err as Error).message ?? String(err) };
  }
}

async function fetchMetaAccountInfo(cred: Credential): Promise<unknown> {
  const rawId = cred.metadata?.ad_account_id;
  if (!rawId) {
    return { error: 'ad_account_id not set in credential metadata' };
  }
  try {
    const account = metaAdAccount(cred.access_token, rawId);
    const [info, lifetimeInsights] = await Promise.all([
      account.read(['name', 'currency', 'amount_spent', 'account_status', 'business_name', 'timezone_name']),
      account.getInsights(['spend', 'impressions', 'clicks'], { date_preset: 'maximum', level: 'account' }),
    ]);
    const lifetime = (lifetimeInsights as { _data?: unknown }[])
      .map((i) => i._data ?? i)[0] as Record<string, unknown> | undefined;
    const result = {
      name: info.name,
      currency: info.currency,
      account_status: info.account_status,
      business_name: info.business_name,
      timezone: info.timezone_name,
      // amount_spent is in cents per Meta's API — divide by 100 for the major unit
      amount_spent_lifetime: typeof info.amount_spent === 'string'
        ? parseFloat(info.amount_spent) / 100
        : null,
      lifetime_insights: lifetime ?? null,
    };
    console.log('[MCP] Meta account info fetched', { adAccountId: rawId, ...result });
    return result;
  } catch (err) {
    console.warn('[MCP] Meta account info error:', err);
    return { error: (err as Error).message ?? String(err) };
  }
}

async function fetchMetaAdSets(cred: Credential): Promise<unknown> {
  const rawId = cred.metadata?.ad_account_id;
  if (!rawId) {
    console.warn('[MCP] Meta: ad_account_id not set in credential metadata');
    return { data: [] };
  }
  try {
    const account = metaAdAccount(cred.access_token, rawId);
    // Pull learning_stage_info + bid_strategy + status fields so the
    // learning-phase-monitor and account-structure-audit skills have signal.
    const adSets = await account.getAdSets(
      [
        'id',
        'name',
        'status',
        'configured_status',
        'effective_status',
        'daily_budget',
        'lifetime_budget',
        'optimization_goal',
        'bid_strategy',
        'billing_event',
        'learning_stage_info',
        'campaign_id',
        'targeting',
        'created_time',
        'updated_time',
      ],
      { limit: 200 },
    );
    const data = (adSets as { _data?: unknown }[]).map((a) => a._data ?? a);
    return { data };
  } catch (err) {
    console.warn('[MCP] Meta adsets error:', err);
    return { data: [], error: (err as Error).message ?? String(err) };
  }
}

/**
 * Insights with multiple breakdown dimensions, returned per breakdown
 * group so the LLM can compare segments. Runs four parallel insight
 * queries — Meta only allows compatible breakdown combinations per call.
 */
async function fetchMetaInsightsBreakdowns(cred: Credential): Promise<unknown> {
  const rawId = cred.metadata?.ad_account_id;
  if (!rawId) {
    console.warn('[MCP] Meta: ad_account_id not set in credential metadata');
    return { data: {} };
  }
  const baseFields = [
    'impressions',
    'clicks',
    'spend',
    'ctr',
    'cpc',
    'frequency',
    'actions',
    'action_values',
    'purchase_roas',
  ];
  const baseParams = { date_preset: 'last_30d', level: 'account', limit: 500 };
  const breakdownGroups: Record<string, string[]> = {
    age_gender: ['age', 'gender'],
    placement: ['publisher_platform', 'platform_position', 'impression_device'],
    region: ['country'],
    device: ['device_platform'],
  };
  try {
    const account = metaAdAccount(cred.access_token, rawId);
    const entries = await Promise.all(
      Object.entries(breakdownGroups).map(async ([key, breakdowns]) => {
        try {
          const insights = await account.getInsights(baseFields, {
            ...baseParams,
            breakdowns,
          });
          const rows = (insights as { _data?: unknown }[]).map((i) => i._data ?? i);
          return [key, { rows }] as const;
        } catch (err) {
          console.warn(`[MCP] Meta breakdown "${key}" failed:`, err);
          return [key, { rows: [], error: (err as Error).message ?? String(err) }] as const;
        }
      }),
    );
    const data: Record<string, unknown> = Object.fromEntries(entries);
    console.log('[MCP] Meta breakdowns fetched', {
      adAccountId: rawId,
      groups: Object.keys(breakdownGroups),
      rowCounts: Object.fromEntries(
        entries.map(([k, v]) => [k, (v as { rows: unknown[] }).rows.length]),
      ),
    });
    return { data };
  } catch (err) {
    console.warn('[MCP] Meta breakdowns error:', err);
    return { data: {}, error: (err as Error).message ?? String(err) };
  }
}

/**
 * Pixel + CAPI diagnostics. Lists all pixels on the ad account, then
 * for each pixel pulls last-7d event activity (per-event volume + match
 * quality + server/browser split). Surfaces missing standard ecommerce
 * events so Max can flag broken tracking.
 *
 * Uses Graph API directly because the SDK shim doesn't expose AdsPixel
 * stats and the type cost of expanding the shim isn't worth it here.
 */
async function fetchMetaPixelDiagnostics(cred: Credential): Promise<unknown> {
  const rawId = cred.metadata?.ad_account_id;
  if (!rawId) {
    return { error: 'ad_account_id not set in credential metadata' };
  }
  const normalized = rawId.startsWith('act_') ? rawId : `act_${rawId}`;
  const token = cred.access_token;
  const baseUrl = 'https://graph.facebook.com/v21.0';
  const STANDARD_EVENTS = [
    'PageView',
    'ViewContent',
    'AddToCart',
    'InitiateCheckout',
    'AddPaymentInfo',
    'Purchase',
  ];
  try {
    // 1. List pixels on the account
    const pixelsRes = await fetch(
      `${baseUrl}/${normalized}/adspixels?fields=id,name,code,creation_time,last_fired_time,is_unavailable&access_token=${encodeURIComponent(token)}`,
    );
    if (!pixelsRes.ok) {
      const body = await pixelsRes.text();
      return { error: `Pixel list failed: ${pixelsRes.status} ${body.slice(0, 200)}` };
    }
    const pixelsJson = (await pixelsRes.json()) as { data?: Array<Record<string, unknown>> };
    const pixels = pixelsJson.data ?? [];

    // 2. For each pixel, pull last-7d stats
    const enriched = await Promise.all(
      pixels.map(async (pixel) => {
        const pid = pixel.id as string;
        try {
          const statsRes = await fetch(
            `${baseUrl}/${pid}/stats?aggregation=event&start_time=${Math.floor(Date.now() / 1000) - 7 * 86400}&access_token=${encodeURIComponent(token)}`,
          );
          if (!statsRes.ok) {
            return { ...pixel, stats_error: `${statsRes.status}` };
          }
          const statsJson = (await statsRes.json()) as { data?: Array<Record<string, unknown>> };
          const events = statsJson.data ?? [];
          const eventCounts: Record<string, number> = {};
          for (const ev of events) {
            const name = (ev.event as string) ?? 'unknown';
            const count = Number(ev.count ?? 0);
            eventCounts[name] = (eventCounts[name] ?? 0) + count;
          }
          const missing_standard = STANDARD_EVENTS.filter((e) => !eventCounts[e] || eventCounts[e] === 0);
          return {
            ...pixel,
            event_counts_7d: eventCounts,
            missing_standard_events: missing_standard,
            total_events_7d: Object.values(eventCounts).reduce((s, n) => s + n, 0),
          };
        } catch (err) {
          return { ...pixel, stats_error: (err as Error).message ?? String(err) };
        }
      }),
    );

    console.log('[MCP] Meta pixel diagnostics fetched', {
      adAccountId: normalized,
      pixelCount: pixels.length,
    });
    return { pixels: enriched };
  } catch (err) {
    console.warn('[MCP] Meta pixel diagnostics error:', err);
    return { error: (err as Error).message ?? String(err) };
  }
}

async function fetchGA4Report(cred: Credential): Promise<unknown> {
  const propertyId = cred.metadata?.property_id;
  if (!propertyId) {
    return { stub: true, message: 'GA4 integration requires property_id in credential metadata' };
  }
  try {
    const client = ga4Client(cred.access_token, cred.refresh_token ?? undefined);
    const [response] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'date' }],
      metrics: [
        { name: 'sessions' },
        { name: 'activeUsers' },
        { name: 'newUsers' },
        { name: 'bounceRate' },
      ],
    });
    return { rows: response.rows ?? [], metadata: response.metadata ?? null };
  } catch (err) {
    console.warn('[MCP] GA4 report error:', err);
    return { stub: true, message: 'GA4 fetch error' };
  }
}

async function fetchGSCPerformance(cred: Credential): Promise<unknown> {
  const siteUrl = cred.metadata?.gsc_site_url;
  if (!siteUrl) {
    return { stub: true, message: 'GSC integration requires gsc_site_url in credential metadata' };
  }
  try {
    const { google } = await import('googleapis');
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    );
    auth.setCredentials({
      access_token: cred.access_token,
      refresh_token: cred.refresh_token ?? undefined,
    });
    const sc = google.searchconsole({ version: 'v1', auth });
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const res = await sc.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: thirtyDaysAgo,
        endDate: today,
        dimensions: ['query'],
        rowLimit: 50,
      },
    });
    return { rows: res.data.rows ?? [] };
  } catch (err) {
    console.warn('[MCP] GSC error:', err);
    return { stub: true, message: 'GSC fetch error' };
  }
}

async function fetchGoogleAdsCampaigns(cred: Credential): Promise<unknown> {
  const customerId = cred.metadata?.customer_id;
  if (!customerId || !cred.refresh_token) {
    return { stub: true, message: 'Google Ads requires customer_id + refresh_token' };
  }
  if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    return { stub: true, message: 'GOOGLE_ADS_DEVELOPER_TOKEN not configured' };
  }
  try {
    const customer = googleAdsCustomer(customerId, cred.refresh_token);
    const rows = await customer.query(`
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions
      FROM campaign
      WHERE segments.date DURING LAST_30_DAYS
    `);
    return { rows };
  } catch (err) {
    console.warn('[MCP] Google Ads query error:', err);
    return { stub: true, message: 'Google Ads query failed' };
  }
}

async function fetchKlaviyoLists(cred: Credential): Promise<unknown> {
  try {
    const res = await fetch('https://a.klaviyo.com/api/lists', {
      headers: {
        Authorization: `Klaviyo-API-Key ${cred.access_token}`,
        revision: '2024-02-15',
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      console.warn('[MCP] Klaviyo lists fetch failed:', res.status, res.statusText);
      return null;
    }
    return res.json();
  } catch (err) {
    console.warn('[MCP] Klaviyo lists error:', err);
    return null;
  }
}

async function fetchKlaviyoFlows(cred: Credential): Promise<unknown> {
  try {
    const res = await fetch('https://a.klaviyo.com/api/flows', {
      headers: {
        Authorization: `Klaviyo-API-Key ${cred.access_token}`,
        revision: '2024-02-15',
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      console.warn('[MCP] Klaviyo flows fetch failed:', res.status, res.statusText);
      return null;
    }
    return res.json();
  } catch (err) {
    console.warn('[MCP] Klaviyo flows error:', err);
    return null;
  }
}

async function fetchAhrefsBacklinks(cred: Credential): Promise<unknown> {
  const target = cred.metadata?.target_domain;
  if (!target) {
    return { stub: true, message: 'Ahrefs backlinks requires target_domain in metadata' };
  }
  const client = await createAhrefsMcpClient(cred.access_token).catch((err) => {
    console.warn('[MCP] Ahrefs connect error:', err);
    return null;
  });
  if (!client) return { stub: true, message: 'Ahrefs MCP connect failed' };
  try {
    const result = await client.callTool({
      name: 'backlinks',
      arguments: { target, mode: 'domain' },
    });
    return { rows: result?.content ?? [] };
  } catch (err) {
    console.warn('[MCP] Ahrefs backlinks error:', err);
    return { stub: true, message: 'Ahrefs backlinks fetch failed' };
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function fetchAhrefsKeywords(cred: Credential): Promise<unknown> {
  const target = cred.metadata?.target_domain;
  if (!target) {
    return { stub: true, message: 'Ahrefs keywords requires target_domain in metadata' };
  }
  const client = await createAhrefsMcpClient(cred.access_token).catch((err) => {
    console.warn('[MCP] Ahrefs connect error:', err);
    return null;
  });
  if (!client) return { stub: true, message: 'Ahrefs MCP connect failed' };
  try {
    const result = await client.callTool({
      name: 'organic_keywords',
      arguments: { target, mode: 'domain' },
    });
    return { rows: result?.content ?? [] };
  } catch (err) {
    console.warn('[MCP] Ahrefs keywords error:', err);
    return { stub: true, message: 'Ahrefs keywords fetch failed' };
  } finally {
    await client.close().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Tool handler registry
// ---------------------------------------------------------------------------

type ToolHandler = (brandId: string, cred: Credential) => Promise<unknown>;

async function shopifyMcpCall(
  cred: Credential,
  tool: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const shop = cred.metadata?.shop;
  if (!shop) return null;
  const client = await createShopifyMcpClient({
    shop,
    accessToken: cred.access_token,
  }).catch((err) => {
    console.warn('[MCP] Shopify connect error:', err);
    return null;
  });
  if (!client) return null;
  try {
    const result = await client.callTool({ name: tool, arguments: args });
    return result?.content ?? null;
  } catch (err) {
    console.warn(`[MCP] Shopify ${tool} error:`, err);
    return null;
  } finally {
    await client.close().catch(() => undefined);
  }
}

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  // Shopify — via Shopify's remote MCP server at https://{shop}/api/mcp
  'shopify.products.list': async (_brandId, cred) => {
    const content = await shopifyMcpCall(cred, 'products_list', { limit: 50 });
    return { products: (content as unknown[]) ?? [] };
  },
  'shopify.orders.list': async (_brandId, cred) => {
    const content = await shopifyMcpCall(cred, 'orders_list', {
      limit: 50,
      status: 'any',
    });
    return { orders: (content as unknown[]) ?? [] };
  },
  'shopify.customers.list': async (_brandId, cred) => {
    const content = await shopifyMcpCall(cred, 'customers_list', { limit: 50 });
    return { customers: (content as unknown[]) ?? [] };
  },
  'shopify.shop.get': async (_brandId, cred) => {
    const content = await shopifyMcpCall(cred, 'shop_get');
    return { shop: content ?? {} };
  },

  // Meta Ads
  'meta_ads.campaigns.insights': async (_brandId, cred) => fetchMetaInsights(cred),
  'meta_ads.adsets.list': async (_brandId, cred) => fetchMetaAdSets(cred),
  'meta_ads.ads.list': async (_brandId, cred) => fetchMetaAds(cred),
  'meta_ads.account.info': async (_brandId, cred) => fetchMetaAccountInfo(cred),
  'meta_ads.insights.breakdowns': async (_brandId, cred) => fetchMetaInsightsBreakdowns(cred),
  'meta_ads.pixel.diagnostics': async (_brandId, cred) => fetchMetaPixelDiagnostics(cred),

  // Google
  'ga4.report.run': async (_brandId, cred) => fetchGA4Report(cred),
  'gsc.performance': async (_brandId, cred) => fetchGSCPerformance(cred),
  'google_ads.campaigns': async (_brandId, cred) => fetchGoogleAdsCampaigns(cred),

  // Klaviyo (direct REST)
  'klaviyo.lists.get': async (_brandId, cred) => fetchKlaviyoLists(cred),
  'klaviyo.flows.get': async (_brandId, cred) => fetchKlaviyoFlows(cred),

  // Ahrefs
  'ahrefs.backlinks': async (_brandId, cred) => fetchAhrefsBacklinks(cred),
  'ahrefs.keywords': async (_brandId, cred) => fetchAhrefsKeywords(cred),

  // Competitor Intelligence (no platform credential needed — uses env vars)
  'competitor.ads': async (brandId) => {
    const { scanAndStoreCompetitorAds } = await import('@/lib/competitor-intel');
    const admin = (await import('@/lib/supabase/service')).createServiceClient();
    const { data: nodes } = await admin
      .from('knowledge_nodes')
      .select('name, properties')
      .eq('brand_id', brandId)
      .eq('node_type', 'competitor')
      .eq('is_active', true)
      .limit(20);
    const allResults = [];
    for (const node of nodes ?? []) {
      const props = node.properties as Record<string, unknown> | null;
      const domain = props?.domain as string | undefined;
      const socialLinks = props?.social_links as Record<string, string> | undefined;
      void socialLinks; void domain; // hints already derived inside scanAndStoreCompetitorAds
      // Full pipeline: fetch + download media + analyze + store as knowledge nodes.
      // Returns the fetched ads so we don't double-call ScrapeCreators.
      const result = await scanAndStoreCompetitorAds(brandId, node.name, props ?? undefined);
      allResults.push({ competitor: node.name, ads: result.ads, stored: result.stored, errors: result.errors });
    }
    return allResults;
  },
  'competitor.products': async (brandId) => {
    const { detectBestSellers } = await import('@/lib/competitor-intel');
    const admin = (await import('@/lib/supabase/service')).createServiceClient();
    const { data: nodes } = await admin
      .from('knowledge_nodes')
      .select('name, properties')
      .eq('brand_id', brandId)
      .eq('node_type', 'competitor')
      .eq('is_active', true)
      .limit(20);
    const allProducts = [];
    for (const node of nodes ?? []) {
      const domain = (node.properties as Record<string, unknown>)?.domain as string;
      if (domain) {
        const products = await detectBestSellers(domain);
        allProducts.push({ competitor: node.name, domain, products });
      }
    }
    return allProducts;
  },
  'competitor.traffic': async (brandId) => {
    const { getTrafficEstimate } = await import('@/lib/competitor-intel');
    const admin = (await import('@/lib/supabase/service')).createServiceClient();
    const { data: nodes } = await admin
      .from('knowledge_nodes')
      .select('name, properties')
      .eq('brand_id', brandId)
      .eq('node_type', 'competitor')
      .eq('is_active', true)
      .limit(20);
    const results = [];
    for (const node of nodes ?? []) {
      const domain = (node.properties as Record<string, unknown>)?.domain as string;
      if (domain) {
        const traffic = await getTrafficEstimate(domain);
        results.push({ competitor: node.name, domain, traffic });
      }
    }
    return results;
  },
  'competitor.seo': async (brandId) => {
    const { getSEOMetrics, getKeywordRankings } = await import('@/lib/competitor-intel');
    const admin = (await import('@/lib/supabase/service')).createServiceClient();
    const { data: nodes } = await admin
      .from('knowledge_nodes')
      .select('name, properties')
      .eq('brand_id', brandId)
      .eq('node_type', 'competitor')
      .eq('is_active', true)
      .limit(20);
    const results = [];
    for (const node of nodes ?? []) {
      const domain = (node.properties as Record<string, unknown>)?.domain as string;
      if (domain) {
        const [seo, keywords] = await Promise.all([getSEOMetrics(domain), getKeywordRankings(domain)]);
        results.push({ competitor: node.name, domain, seo, keywords });
      }
    }
    return results;
  },
  // Brand-level resolvers (platform-agnostic — resolver picks best source)
  // Not in TOOL_PLATFORM because resolveBrandProducts loads its own credentials
  // internally and falls back to brand_data when shopify isn't connected.
  // Returns a ResolverResult<BrandProduct> — the skills engine will learn to
  // unwrap this shape in Task 6.
  'brand.products.list': async (brandId) => {
    const { resolveBrandProducts } = await import('@/lib/resolvers/brand-products');
    return resolveBrandProducts(brandId);
  },
  'brand.customers.list': async (brandId) => {
    const { resolveBrandCustomers } = await import('@/lib/resolvers/brand-customers');
    return resolveBrandCustomers(brandId);
  },
  'brand.orders.list': async (brandId) => {
    const { resolveBrandOrders } = await import('@/lib/resolvers/brand-orders');
    return resolveBrandOrders(brandId);
  },
  // Growth OS internal billing — wallet balance, free credits, and
  // usage totals. Used by Penny's billing-check (scope: Growth OS's own
  // billing, not the brand's vendor billing).
  'gos.wallet.summary': async (brandId) => {
    const admin = (await import('@/lib/supabase/service')).createServiceClient();
    const { data: wallet } = await admin
      .from('wallets')
      .select(
        'balance, free_credits, free_credits_expires_at, auto_recharge, auto_recharge_threshold, auto_recharge_amount',
      )
      .eq('brand_id', brandId)
      .single();

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [{ data: todayRows }, { data: monthRows }, { data: recentTx }] = await Promise.all([
      admin.from('wallet_transactions').select('amount').eq('brand_id', brandId).eq('type', 'debit').gte('created_at', startOfToday),
      admin.from('wallet_transactions').select('amount').eq('brand_id', brandId).eq('type', 'debit').gte('created_at', startOfMonth),
      admin
        .from('wallet_transactions')
        .select('amount, type, description, created_at, metadata')
        .eq('brand_id', brandId)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    const sum = (rows: { amount: number | null }[] | null) =>
      (rows ?? []).reduce((acc, r) => acc + Math.abs(r.amount ?? 0), 0);

    return {
      balance: wallet?.balance ?? 0,
      free_credits: wallet?.free_credits ?? 0,
      free_credits_expires_at: wallet?.free_credits_expires_at ?? null,
      auto_recharge: wallet?.auto_recharge ?? false,
      auto_recharge_threshold: wallet?.auto_recharge_threshold ?? null,
      auto_recharge_amount: wallet?.auto_recharge_amount ?? null,
      credits_used_today: sum(todayRows),
      credits_used_this_month: sum(monthRows),
      recent_transactions: recentTx ?? [],
    };
  },

  'competitor.status': async (brandId) => {
    const { checkCompetitorStatus, searchCompetitorNews } = await import('@/lib/competitor-intel');
    const admin = (await import('@/lib/supabase/service')).createServiceClient();
    const { data: nodes } = await admin
      .from('knowledge_nodes')
      .select('name, properties')
      .eq('brand_id', brandId)
      .eq('node_type', 'competitor')
      .eq('is_active', true)
      .limit(10);
    const results = [];
    for (const node of nodes ?? []) {
      const domain = (node.properties as Record<string, unknown>)?.domain as string;
      if (domain) {
        const [status, news] = await Promise.all([checkCompetitorStatus(domain), searchCompetitorNews(node.name)]);
        results.push({ competitor: node.name, domain, status, news });
      }
    }
    return results;
  },

  // Snapchat Ads — stub. Real fetch pending SDK work (no public TS SDK yet).
  'snapchat_ads.campaigns': async () => ({
    data: [],
    note: 'Snapchat Ads connector live; real fetch pending SDK work',
  }),

  // ChatGPT Ads — stub. Real fetch pending OpenAI public Ads API.
  'chatgpt_ads.campaigns': async () => ({
    data: [],
    note: 'ChatGPT Ads connector live; real fetch pending OpenAI public API',
  }),
};

/**
 * Per-tool invoker. Loads the platform credential if the tool requires one
 * (and refreshes Google tokens on the fly) and calls the handler.
 *
 * Returns whatever the handler returned — raw payload for legacy tools, or a
 * `ResolverResult` for brand.* tools. Never throws — errors bubble up via the
 * handler's own try/catch, but credential failures return undefined to signal
 * "no data source available".
 */
export async function callTool(
  toolName: string,
  args: { brandId: string },
): Promise<unknown> {
  const handler = TOOL_HANDLERS[toolName];
  if (!handler) throw new Error(`[mcp] unknown tool: ${toolName}`);

  const platform = TOOL_PLATFORM[toolName];
  let cred: Credential | null = null;
  if (platform) {
    cred = await loadCredential(args.brandId, platform);
    if (!cred) {
      // Tool needs credentials we don't have — signal no data source.
      // Google OAuth refresh is now handled by OAuth2Client inside each
      // Google SDK wrapper, so no manual refresh step is needed here.
      return undefined;
    }
  }

  return handler(args.brandId, cred ?? ({} as Credential));
}

// Which platform does each tool belong to?
const TOOL_PLATFORM: Record<string, string> = {
  'shopify.products.list': 'shopify',
  'shopify.orders.list': 'shopify',
  'shopify.customers.list': 'shopify',
  'shopify.shop.get': 'shopify',
  'meta_ads.campaigns.insights': 'meta',
  'meta_ads.adsets.list': 'meta',
  'meta_ads.ads.list': 'meta',
  'meta_ads.account.info': 'meta',
  'meta_ads.insights.breakdowns': 'meta',
  'meta_ads.pixel.diagnostics': 'meta',
  'ga4.report.run': 'google_analytics',
  'gsc.performance': 'google_analytics',
  'google_ads.campaigns': 'google',
  'klaviyo.lists.get': 'klaviyo',
  'klaviyo.flows.get': 'klaviyo',
  'ahrefs.backlinks': 'ahrefs',
  'ahrefs.keywords': 'ahrefs',
  'snapchat_ads.campaigns': 'snapchat',
  'chatgpt_ads.campaigns': 'chatgpt_ads',
};

// ---------------------------------------------------------------------------
// Credential loader (with cache per request)
// ---------------------------------------------------------------------------

async function loadCredential(
  brandId: string,
  platform: string,
): Promise<Credential | null> {
  try {
    const { createServiceClient } = await import('@/lib/supabase/service');
    const admin = createServiceClient();

    const { data, error } = await admin
      .from('credentials')
      .select('platform, access_token, refresh_token, expires_at, metadata')
      .eq('brand_id', brandId)
      .eq('platform', platform)
      .single();

    if (error || !data) return null;

    return data as Credential;
  } catch (err) {
    console.warn(`[MCP] Failed to load credential for platform ${platform}:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main export: fetchSkillData
// ---------------------------------------------------------------------------

/**
 * Given a brand and the list of mcp_tools from a skill's frontmatter,
 * fetch all required live data and return a structured SkillDataContext.
 *
 * Errors are swallowed per-tool — partial data is always returned.
 */
export async function fetchSkillData(
  brandId: string,
  mcpTools: string[],
): Promise<SkillDataContext> {
  if (!mcpTools || mcpTools.length === 0) return {};

  // Collect the unique platforms needed
  const platformsNeeded = new Set<string>();
  for (const tool of mcpTools) {
    const platform = TOOL_PLATFORM[tool];
    if (platform) platformsNeeded.add(platform);
  }

  // Load credentials for each platform. Google OAuth refresh is now handled
  // by OAuth2Client inside each Google SDK wrapper (see ga4-sdk,
  // google-ads-sdk, and the googleapis path in fetchGSCPerformance).
  const credentials = new Map<string, Credential>();
  await Promise.all(
    Array.from(platformsNeeded).map(async (platform) => {
      const cred = await loadCredential(brandId, platform);
      if (!cred) return;
      credentials.set(platform, cred);
    }),
  );

  // Execute each tool handler
  const context: SkillDataContext = {};

  await Promise.all(
    mcpTools.map(async (tool) => {
      const handler = TOOL_HANDLERS[tool];
      if (!handler) {
        console.warn(`[MCP] No handler for tool: ${tool}`);
        return;
      }

      const platform = TOOL_PLATFORM[tool];
      // Competitor tools use env vars, not platform credentials
      const cred = platform ? credentials.get(platform) : null;
      if (platform && !cred) {
        console.warn(`[MCP] No credential found for platform "${platform}" (tool: ${tool})`);
        return;
      }

      let result: unknown = null;
      try {
        result = await handler(brandId, cred ?? {} as Credential);
      } catch (err) {
        console.warn(`[MCP] Tool handler error for ${tool}:`, err);
        return;
      }

      if (result === null || result === undefined) return;

      // Merge result into context by platform + tool key
      switch (tool) {
        // Shopify
        case 'shopify.products.list':
          context.shopify = context.shopify ?? {};
          context.shopify.products = (result as { products?: unknown[] }).products ?? [];
          break;
        case 'shopify.orders.list':
          context.shopify = context.shopify ?? {};
          context.shopify.orders = (result as { orders?: unknown[] }).orders ?? [];
          break;
        case 'shopify.customers.list':
          context.shopify = context.shopify ?? {};
          context.shopify.customers = (result as { customers?: unknown[] }).customers ?? [];
          break;
        case 'shopify.shop.get':
          context.shopify = context.shopify ?? {};
          context.shopify.shop = (result as { shop?: unknown }).shop ?? result;
          break;

        // Meta
        case 'meta_ads.campaigns.insights':
          context.meta = context.meta ?? {};
          context.meta.campaigns = (result as { data?: unknown[] }).data ?? [];
          break;
        case 'meta_ads.adsets.list':
          context.meta = context.meta ?? {};
          context.meta.adSets = (result as { data?: unknown[] }).data ?? [];
          break;
        case 'meta_ads.ads.list':
          context.meta = context.meta ?? {};
          context.meta.ads = (result as { data?: unknown[] }).data ?? [];
          break;
        case 'meta_ads.account.info':
          context.meta = context.meta ?? {};
          context.meta.account = result;
          break;
        case 'meta_ads.insights.breakdowns':
          context.meta = context.meta ?? {};
          context.meta.breakdowns = (result as { data?: Record<string, unknown> }).data ?? {};
          break;
        case 'meta_ads.pixel.diagnostics':
          context.meta = context.meta ?? {};
          context.meta.pixels = result;
          break;

        // Google Ads
        case 'google_ads.campaigns':
          context.google = context.google ?? {};
          context.google.ads = result;
          break;

        // Google Analytics (GA4 + Search Console)
        case 'ga4.report.run':
          context.google_analytics = context.google_analytics ?? {};
          context.google_analytics.ga4 = result;
          break;
        case 'gsc.performance':
          context.google_analytics = context.google_analytics ?? {};
          context.google_analytics.searchConsole = result;
          break;

        // Klaviyo
        case 'klaviyo.lists.get':
          context.klaviyo = context.klaviyo ?? {};
          context.klaviyo.lists = (result as { data?: unknown[] }).data ?? [];
          break;
        case 'klaviyo.flows.get':
          context.klaviyo = context.klaviyo ?? {};
          context.klaviyo.flows = (result as { data?: unknown[] }).data ?? [];
          break;

        // Ahrefs
        case 'ahrefs.backlinks':
          context.ahrefs = context.ahrefs ?? {};
          context.ahrefs.backlinks = result;
          break;
        case 'ahrefs.keywords':
          context.ahrefs = context.ahrefs ?? {};
          context.ahrefs.keywords = result;
          break;

        // Competitor Intelligence
        case 'competitor.ads':
          context.competitor = context.competitor ?? {};
          context.competitor.ads = result as unknown[];
          break;
        case 'competitor.products':
          context.competitor = context.competitor ?? {};
          context.competitor.products = result as unknown[];
          break;
        case 'competitor.traffic':
          context.competitor = context.competitor ?? {};
          context.competitor.traffic = result as unknown[];
          break;
        case 'competitor.seo':
          context.competitor = context.competitor ?? {};
          context.competitor.seo = result as unknown[];
          break;
        case 'competitor.status':
          context.competitor = context.competitor ?? {};
          context.competitor.status = result as unknown[];
          break;

        default:
          break;
      }
    }),
  );

  return context;
}

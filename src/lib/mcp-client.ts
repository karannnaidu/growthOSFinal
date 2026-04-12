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

import { shopifyFetch } from '@/lib/shopify';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillDataContext {
  shopify?: {
    products?: unknown[];
    orders?: unknown[];
    shop?: unknown;
  };
  meta?: {
    campaigns?: unknown[];
    adSets?: unknown[];
  };
  google?: {
    analytics?: unknown;
    searchConsole?: unknown;
    ads?: unknown;
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
// Google token refresh
// ---------------------------------------------------------------------------

/**
 * If the credential has an expires_at in the past (or within 60 s), attempt
 * to refresh using the refresh_token and persist the new access_token.
 * Returns an updated credential object (or the original if refresh is not
 * needed / not possible).
 */
async function maybeRefreshGoogleToken(
  cred: Credential,
  brandId: string,
): Promise<Credential> {
  if (!cred.refresh_token) return cred;
  if (!cred.expires_at) return cred;

  const expiresAt = new Date(cred.expires_at).getTime();
  const nowPlus60 = Date.now() + 60_000;

  if (expiresAt > nowPlus60) {
    // Token still valid
    return cred;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID ?? '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? '';

  if (!clientId || !clientSecret) {
    console.warn('[MCP] Google token expired but GOOGLE_CLIENT_ID/SECRET not set — skipping refresh');
    return cred;
  }

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: cred.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) {
      console.warn('[MCP] Google token refresh failed:', res.status, res.statusText);
      return cred;
    }

    const json = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };

    if (!json.access_token) return cred;

    const newExpiresAt = new Date(
      Date.now() + (json.expires_in ?? 3600) * 1000,
    ).toISOString();

    // Persist refreshed token to the database
    try {
      const { createServiceClient } = await import('@/lib/supabase/service');
      const admin = createServiceClient();
      await admin
        .from('credentials')
        .update({ access_token: json.access_token, expires_at: newExpiresAt })
        .eq('brand_id', brandId)
        .eq('platform', 'google');
    } catch (dbErr) {
      console.warn('[MCP] Failed to persist refreshed Google token:', dbErr);
    }

    return { ...cred, access_token: json.access_token, expires_at: newExpiresAt };
  } catch (err) {
    console.warn('[MCP] Google token refresh error:', err);
    return cred;
  }
}

// ---------------------------------------------------------------------------
// Provider-specific fetch functions
// ---------------------------------------------------------------------------

async function fetchMetaInsights(cred: Credential): Promise<unknown> {
  const adAccountId = cred.metadata?.ad_account_id;
  if (!adAccountId) {
    console.warn('[MCP] Meta: ad_account_id not set in credential metadata');
    return null;
  }
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${adAccountId}/insights` +
        `?date_preset=last_30d` +
        `&fields=impressions,clicks,spend,cpc,ctr,actions` +
        `&access_token=${cred.access_token}`,
    );
    if (!res.ok) {
      console.warn('[MCP] Meta insights fetch failed:', res.status, res.statusText);
      return null;
    }
    return res.json();
  } catch (err) {
    console.warn('[MCP] Meta insights error:', err);
    return null;
  }
}

async function fetchMetaAdSets(cred: Credential): Promise<unknown> {
  const adAccountId = cred.metadata?.ad_account_id;
  if (!adAccountId) {
    console.warn('[MCP] Meta: ad_account_id not set in credential metadata');
    return null;
  }
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${adAccountId}/adsets` +
        `?fields=id,name,status,daily_budget,lifetime_budget,optimization_goal` +
        `&access_token=${cred.access_token}`,
    );
    if (!res.ok) {
      console.warn('[MCP] Meta adsets fetch failed:', res.status, res.statusText);
      return null;
    }
    return res.json();
  } catch (err) {
    console.warn('[MCP] Meta adsets error:', err);
    return null;
  }
}

async function fetchGA4Report(cred: Credential): Promise<unknown> {
  // TODO: GA4 requires a propertyId stored in cred.metadata.ga4_property_id
  // POST https://analyticsdata.googleapis.com/v1beta/properties/{propertyId}:runReport
  const propertyId = cred.metadata?.ga4_property_id;
  if (!propertyId) {
    return { stub: true, message: 'GA4 integration requires ga4_property_id in credential metadata' };
  }
  try {
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cred.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'date' }],
          metrics: [
            { name: 'sessions' },
            { name: 'activeUsers' },
            { name: 'newUsers' },
            { name: 'bounceRate' },
          ],
        }),
      },
    );
    if (!res.ok) {
      console.warn('[MCP] GA4 report fetch failed:', res.status, res.statusText);
      return { stub: true, message: `GA4 API error: ${res.status}` };
    }
    return res.json();
  } catch (err) {
    console.warn('[MCP] GA4 report error:', err);
    return { stub: true, message: 'GA4 fetch error' };
  }
}

async function fetchGSCPerformance(cred: Credential): Promise<unknown> {
  // TODO: GSC requires a siteUrl stored in cred.metadata.gsc_site_url
  // POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query
  const siteUrl = cred.metadata?.gsc_site_url;
  if (!siteUrl) {
    return { stub: true, message: 'GSC integration requires gsc_site_url in credential metadata' };
  }
  try {
    const encodedSite = encodeURIComponent(siteUrl);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);

    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cred.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: thirtyDaysAgo,
          endDate: today,
          dimensions: ['query'],
          rowLimit: 50,
        }),
      },
    );
    if (!res.ok) {
      console.warn('[MCP] GSC fetch failed:', res.status, res.statusText);
      return { stub: true, message: `GSC API error: ${res.status}` };
    }
    return res.json();
  } catch (err) {
    console.warn('[MCP] GSC error:', err);
    return { stub: true, message: 'GSC fetch error' };
  }
}

async function fetchGoogleAdsCampaigns(cred: Credential): Promise<unknown> {
  // TODO: Google Ads API requires developer token and customer ID
  // For now return a stub — proper implementation needs google-ads-api library
  return { stub: true, message: 'Google Ads integration requires developer token setup' };
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
  // TODO: Ahrefs API v3 — requires target domain from metadata
  // GET https://api.ahrefs.com/v3/site-explorer/backlinks
  return { stub: true, message: 'Ahrefs backlinks integration pending API key and target setup' };
}

async function fetchAhrefsKeywords(cred: Credential): Promise<unknown> {
  // TODO: Ahrefs API v3 — requires target domain from metadata
  // GET https://api.ahrefs.com/v3/keywords-explorer/overview
  return { stub: true, message: 'Ahrefs keywords integration pending API key and target setup' };
}

// ---------------------------------------------------------------------------
// Tool handler registry
// ---------------------------------------------------------------------------

type ToolHandler = (brandId: string, cred: Credential) => Promise<unknown>;

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  // Shopify
  'shopify.products.list': async (_brandId, cred) =>
    shopifyFetch(
      cred.metadata.shop ?? '',
      cred.access_token,
      'products.json?limit=50',
    ),
  'shopify.orders.list': async (_brandId, cred) =>
    shopifyFetch(
      cred.metadata.shop ?? '',
      cred.access_token,
      'orders.json?limit=50&status=any',
    ),
  'shopify.shop.get': async (_brandId, cred) =>
    shopifyFetch(cred.metadata.shop ?? '', cred.access_token, 'shop.json'),

  // Meta Ads
  'meta_ads.campaigns.insights': async (_brandId, cred) => fetchMetaInsights(cred),
  'meta_ads.adsets.list': async (_brandId, cred) => fetchMetaAdSets(cred),

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
    const { fetchCompetitorAds } = await import('@/lib/competitor-intel');
    const admin = (await import('@/lib/supabase/service')).createServiceClient();
    const { data: nodes } = await admin
      .from('knowledge_nodes')
      .select('name, properties')
      .eq('brand_id', brandId)
      .eq('node_type', 'competitor')
      .eq('is_active', true)
      .limit(5);
    const allAds = [];
    for (const node of nodes ?? []) {
      const ads = await fetchCompetitorAds(node.name);
      allAds.push({ competitor: node.name, ads });
    }
    return allAds;
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
      .limit(5);
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
      .limit(5);
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
      .limit(5);
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
};

// Which platform does each tool belong to?
const TOOL_PLATFORM: Record<string, string> = {
  'shopify.products.list': 'shopify',
  'shopify.orders.list': 'shopify',
  'shopify.shop.get': 'shopify',
  'meta_ads.campaigns.insights': 'meta',
  'meta_ads.adsets.list': 'meta',
  'ga4.report.run': 'google',
  'gsc.performance': 'google',
  'google_ads.campaigns': 'google',
  'klaviyo.lists.get': 'klaviyo',
  'klaviyo.flows.get': 'klaviyo',
  'ahrefs.backlinks': 'ahrefs',
  'ahrefs.keywords': 'ahrefs',
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

  // Load credentials for each platform (with Google token refresh)
  const credentials = new Map<string, Credential>();
  await Promise.all(
    Array.from(platformsNeeded).map(async (platform) => {
      let cred = await loadCredential(brandId, platform);
      if (!cred) return;

      // Refresh Google access token if expired
      if (platform === 'google') {
        cred = await maybeRefreshGoogleToken(cred, brandId);
      }

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

        // Google
        case 'ga4.report.run':
          context.google = context.google ?? {};
          context.google.analytics = result;
          break;
        case 'gsc.performance':
          context.google = context.google ?? {};
          context.google.searchConsole = result;
          break;
        case 'google_ads.campaigns':
          context.google = context.google ?? {};
          context.google.ads = result;
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

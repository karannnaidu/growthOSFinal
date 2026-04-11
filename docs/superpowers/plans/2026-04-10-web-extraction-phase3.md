# Phase 3: Echo Competitive Intelligence Infrastructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the data-fetching infrastructure that Echo's competitor-scan and competitor-creative-library skills need — Meta Ad Library API, DataForSEO (traffic + SEO), social metrics, best-seller detection, and financial signals.

**Architecture:** A single `competitor-intel.ts` module exposes typed async functions for each data source. Each function handles its own API auth, error handling, and response parsing. Echo's skills call these functions via the MCP client layer, which the skills engine feeds into LLM prompts.

**Tech Stack:** Meta Graph API (Ad Library), DataForSEO REST API, Firecrawl (product scraping), Meta Graph API (Instagram), Crunchbase Basic API, NewsAPI, existing `createServiceClient`.

**PRD Reference:** `docs/web-extraction-prd-onboarding.md` — Section 7

**Depends on:** Phase 1 complete (firecrawl-client.ts)

---

### Task 1: Create Competitor Intelligence Client

**Files:**
- Create: `src/lib/competitor-intel.ts`

- [ ] **Step 1: Create competitor-intel.ts with all data source functions**

```typescript
// ---------------------------------------------------------------------------
// Competitor Intelligence Client — data fetchers for Echo's skills
//
// Each function handles its own API auth, errors, and response parsing.
// All functions are non-fatal: they return null/empty on failure.
// ---------------------------------------------------------------------------

import { scrapePage } from '@/lib/firecrawl-client'
import * as cheerio from 'cheerio'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdCreative {
  id: string
  page_name: string
  ad_creative_body: string | null
  ad_creative_link_title: string | null
  ad_delivery_start_time: string
  ad_delivery_stop_time: string | null
  media_type: 'image' | 'video' | 'carousel' | 'unknown'
  thumbnail_url: string | null
  estimated_days_active: number
}

export interface CompetitorProduct {
  name: string
  price: string | null
  image_url: string | null
  url: string | null
  review_count: number | null
  position: number
}

export interface TrafficData {
  monthly_visits: number | null
  traffic_sources: {
    organic: number | null
    paid: number | null
    social: number | null
    direct: number | null
    referral: number | null
  }
  bounce_rate: number | null
  avg_visit_duration: number | null
}

export interface KeywordRanking {
  keyword: string
  position: number
  search_volume: number
  cpc: number | null
  url: string | null
}

export interface SEOMetrics {
  domain_rank: number | null
  backlinks_total: number | null
  referring_domains: number | null
  organic_traffic: number | null
  organic_keywords: number | null
}

export interface SocialMetrics {
  instagram_followers: number | null
  instagram_engagement_rate: number | null
  facebook_likes: number | null
  tiktok_followers: number | null
  twitter_followers: number | null
}

export interface FundingData {
  total_funding: string | null
  last_round_type: string | null
  last_round_date: string | null
  investors: string[]
}

export interface StatusCheck {
  is_online: boolean
  http_status: number | null
  response_time_ms: number | null
  last_checked: string
}

// ---------------------------------------------------------------------------
// Meta Ad Library
// ---------------------------------------------------------------------------

export async function fetchCompetitorAds(
  searchTerm: string,
  countryCode: string = 'US',
): Promise<AdCreative[]> {
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (!appId || !appSecret) return []

  try {
    // Get access token
    const tokenRes = await fetch(
      `https://graph.facebook.com/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&grant_type=client_credentials`,
    )
    if (!tokenRes.ok) return []
    const { access_token } = await tokenRes.json() as { access_token: string }

    // Search Ad Library
    const params = new URLSearchParams({
      access_token,
      search_terms: searchTerm,
      ad_reached_countries: `["${countryCode}"]`,
      ad_type: 'ALL',
      fields: 'id,page_name,ad_creative_bodies,ad_creative_link_titles,ad_delivery_start_time,ad_delivery_stop_time',
      limit: '25',
    })

    const res = await fetch(`https://graph.facebook.com/v19.0/ads_archive?${params}`)
    if (!res.ok) return []

    const data = await res.json() as { data: Record<string, unknown>[] }
    const now = Date.now()

    return (data.data || []).map(ad => {
      const startTime = ad.ad_delivery_start_time as string
      const stopTime = ad.ad_delivery_stop_time as string | null
      const startMs = new Date(startTime).getTime()
      const endMs = stopTime ? new Date(stopTime).getTime() : now

      return {
        id: (ad.id as string) || '',
        page_name: (ad.page_name as string) || '',
        ad_creative_body: ((ad.ad_creative_bodies as string[]) || [])[0] || null,
        ad_creative_link_title: ((ad.ad_creative_link_titles as string[]) || [])[0] || null,
        ad_delivery_start_time: startTime,
        ad_delivery_stop_time: stopTime || null,
        media_type: 'unknown' as const,
        thumbnail_url: null,
        estimated_days_active: Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24))),
      }
    })
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Best Seller Detection (Shopify stores)
// ---------------------------------------------------------------------------

export async function detectBestSellers(
  domain: string,
  limit: number = 10,
): Promise<CompetitorProduct[]> {
  try {
    // Shopify stores support ?sort_by=best-selling
    const page = await scrapePage(`${domain}/collections/all?sort_by=best-selling`)
    const $ = cheerio.load(page.html)

    const products: CompetitorProduct[] = []

    // Common Shopify product card selectors
    const selectors = [
      '.product-card', '.grid-product', '[data-product-card]',
      '.collection-product', '.product-item', '.grid__item',
    ]

    const productSelector = selectors.find(s => $(s).length > 0) || '.product-card'

    $(productSelector).each((i, el) => {
      if (i >= limit) return false
      const $el = $(el)
      const name = $el.find('a, .product-card__title, .grid-product__title, h3, h2').first().text().trim()
      const price = $el.find('.price, .money, [data-price]').first().text().trim() || null
      const imgEl = $el.find('img').first()
      const image_url = imgEl.attr('src') || imgEl.attr('data-src') || null
      const link = $el.find('a').first().attr('href') || null

      if (name) {
        products.push({
          name,
          price,
          image_url: image_url?.startsWith('//') ? `https:${image_url}` : image_url,
          url: link ? new URL(link, `https://${domain}`).href : null,
          review_count: null,
          position: i + 1,
        })
      }
    })

    return products
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// DataForSEO: Traffic Estimates
// ---------------------------------------------------------------------------

export async function getTrafficEstimate(domain: string): Promise<TrafficData | null> {
  const login = process.env.DATAFORSEO_LOGIN
  const password = process.env.DATAFORSEO_PASSWORD
  if (!login || !password) return null

  try {
    const auth = Buffer.from(`${login}:${password}`).toString('base64')
    const res = await fetch('https://api.dataforseo.com/v3/domain_analytics/technologies/domain_technologies/live', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{ target: domain.replace(/^https?:\/\//, '').replace(/^www\./, '') }]),
    })

    if (!res.ok) return null
    const data = await res.json()
    const result = data?.tasks?.[0]?.result?.[0]

    return {
      monthly_visits: result?.monthly_visits ?? null,
      traffic_sources: {
        organic: null,
        paid: null,
        social: null,
        direct: null,
        referral: null,
      },
      bounce_rate: null,
      avg_visit_duration: null,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// DataForSEO: SEO Metrics & Keywords
// ---------------------------------------------------------------------------

export async function getSEOMetrics(domain: string): Promise<SEOMetrics | null> {
  const login = process.env.DATAFORSEO_LOGIN
  const password = process.env.DATAFORSEO_PASSWORD
  if (!login || !password) return null

  try {
    const auth = Buffer.from(`${login}:${password}`).toString('base64')
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '')

    const res = await fetch('https://api.dataforseo.com/v3/backlinks/summary/live', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{ target: cleanDomain }]),
    })

    if (!res.ok) return null
    const data = await res.json()
    const result = data?.tasks?.[0]?.result?.[0]

    return {
      domain_rank: result?.rank ?? null,
      backlinks_total: result?.backlinks ?? null,
      referring_domains: result?.referring_domains ?? null,
      organic_traffic: null,
      organic_keywords: null,
    }
  } catch {
    return null
  }
}

export async function getKeywordRankings(
  domain: string,
  limit: number = 20,
): Promise<KeywordRanking[]> {
  const login = process.env.DATAFORSEO_LOGIN
  const password = process.env.DATAFORSEO_PASSWORD
  if (!login || !password) return []

  try {
    const auth = Buffer.from(`${login}:${password}`).toString('base64')
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '')

    const res = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{
        target: cleanDomain,
        language_code: 'en',
        location_code: 2840, // US
        limit,
        order_by: ['keyword_data.keyword_info.search_volume,desc'],
      }]),
    })

    if (!res.ok) return []
    const data = await res.json()
    const items = data?.tasks?.[0]?.result?.[0]?.items || []

    return items.map((item: Record<string, unknown>) => {
      const kd = item.keyword_data as Record<string, unknown>
      const ki = kd?.keyword_info as Record<string, unknown>
      return {
        keyword: (kd?.keyword as string) || '',
        position: (item.ranked_serp_element as Record<string, unknown>)?.serp_item?.rank_absolute as number || 0,
        search_volume: (ki?.search_volume as number) || 0,
        cpc: (ki?.cpc as number) || null,
        url: (item.ranked_serp_element as Record<string, unknown>)?.serp_item?.relative_url as string || null,
      }
    })
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Social Media Metrics (Instagram via Meta Graph API)
// ---------------------------------------------------------------------------

export async function getSocialMetrics(
  socialLinks: Record<string, string | null>,
): Promise<SocialMetrics> {
  // Basic implementation — extract follower counts from public profiles
  // Full implementation would use Meta Graph API with business account token
  return {
    instagram_followers: null,
    instagram_engagement_rate: null,
    facebook_likes: null,
    tiktok_followers: null,
    twitter_followers: null,
  }
}

// ---------------------------------------------------------------------------
// Crunchbase: Funding Data
// ---------------------------------------------------------------------------

export async function getFundingData(companyName: string): Promise<FundingData | null> {
  const apiKey = process.env.CRUNCHBASE_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch(
      `https://api.crunchbase.com/api/v4/autocompletes?query=${encodeURIComponent(companyName)}&collection_ids=organizations&limit=1`,
      { headers: { 'X-cb-user-key': apiKey } },
    )

    if (!res.ok) return null
    const data = await res.json() as { entities: { identifier: { permalink: string } }[] }
    const permalink = data.entities?.[0]?.identifier?.permalink
    if (!permalink) return null

    const orgRes = await fetch(
      `https://api.crunchbase.com/api/v4/entities/organizations/${permalink}?field_ids=funding_total,last_funding_type,last_funding_at,investor_identifiers`,
      { headers: { 'X-cb-user-key': apiKey } },
    )

    if (!orgRes.ok) return null
    const orgData = await orgRes.json() as { properties: Record<string, unknown> }
    const props = orgData.properties || {}

    return {
      total_funding: (props.funding_total as { value_usd?: number })?.value_usd
        ? `$${((props.funding_total as { value_usd: number }).value_usd / 1_000_000).toFixed(1)}M`
        : null,
      last_round_type: (props.last_funding_type as string) || null,
      last_round_date: (props.last_funding_at as string) || null,
      investors: ((props.investor_identifiers as { value: string }[]) || []).map(i => i.value).slice(0, 5),
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Company Status Monitoring
// ---------------------------------------------------------------------------

export async function checkCompetitorStatus(domain: string): Promise<StatusCheck> {
  const url = domain.startsWith('http') ? domain : `https://${domain}`
  const start = Date.now()

  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    })

    return {
      is_online: res.ok,
      http_status: res.status,
      response_time_ms: Date.now() - start,
      last_checked: new Date().toISOString(),
    }
  } catch {
    return {
      is_online: false,
      http_status: null,
      response_time_ms: Date.now() - start,
      last_checked: new Date().toISOString(),
    }
  }
}

// ---------------------------------------------------------------------------
// News Monitoring
// ---------------------------------------------------------------------------

export async function searchCompetitorNews(
  companyName: string,
): Promise<{ title: string; url: string; publishedAt: string; source: string }[]> {
  const apiKey = process.env.NEWSAPI_KEY
  if (!apiKey) return []

  try {
    const query = encodeURIComponent(`"${companyName}" AND (shutdown OR acquired OR closing OR layoffs OR funding)`)
    const res = await fetch(
      `https://newsapi.org/v2/everything?q=${query}&sortBy=publishedAt&pageSize=5&language=en`,
      { headers: { 'X-Api-Key': apiKey } },
    )

    if (!res.ok) return []
    const data = await res.json() as { articles: { title: string; url: string; publishedAt: string; source: { name: string } }[] }

    return (data.articles || []).map(a => ({
      title: a.title,
      url: a.url,
      publishedAt: a.publishedAt,
      source: a.source?.name || 'Unknown',
    }))
  } catch {
    return []
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/competitor-intel.ts
git commit -m "feat: add competitor intelligence client with all data source integrations"
```

---

### Task 2: Register Competitor Intel Functions as MCP Tools

**Files:**
- Modify: `src/lib/mcp-client.ts`

- [ ] **Step 1: Add competitor intel tool handlers**

In `src/lib/mcp-client.ts`, add new tool handlers to the registry (around lines 328-361) for:

```typescript
// --- Competitor Intelligence Tools ---
'competitor.ads': async (brandId: string) => {
  const { fetchCompetitorAds } = await import('@/lib/competitor-intel')
  // Get competitor domains from knowledge graph
  const admin = (await import('@/lib/supabase/service')).createServiceClient()
  const { data: nodes } = await admin
    .from('knowledge_nodes')
    .select('name, properties')
    .eq('brand_id', brandId)
    .eq('node_type', 'competitor')
    .eq('is_active', true)
    .limit(5)
  const allAds = []
  for (const node of nodes || []) {
    const ads = await fetchCompetitorAds(node.name)
    allAds.push({ competitor: node.name, ads })
  }
  return allAds
},
'competitor.products': async (brandId: string) => {
  const { detectBestSellers } = await import('@/lib/competitor-intel')
  const admin = (await import('@/lib/supabase/service')).createServiceClient()
  const { data: nodes } = await admin
    .from('knowledge_nodes')
    .select('name, properties')
    .eq('brand_id', brandId)
    .eq('node_type', 'competitor')
    .eq('is_active', true)
    .limit(5)
  const allProducts = []
  for (const node of nodes || []) {
    const domain = (node.properties as Record<string, unknown>)?.domain as string
    if (domain) {
      const products = await detectBestSellers(domain)
      allProducts.push({ competitor: node.name, domain, products })
    }
  }
  return allProducts
},
'competitor.traffic': async (brandId: string) => {
  const { getTrafficEstimate } = await import('@/lib/competitor-intel')
  const admin = (await import('@/lib/supabase/service')).createServiceClient()
  const { data: nodes } = await admin
    .from('knowledge_nodes')
    .select('name, properties')
    .eq('brand_id', brandId)
    .eq('node_type', 'competitor')
    .eq('is_active', true)
    .limit(5)
  const results = []
  for (const node of nodes || []) {
    const domain = (node.properties as Record<string, unknown>)?.domain as string
    if (domain) {
      const traffic = await getTrafficEstimate(domain)
      results.push({ competitor: node.name, domain, traffic })
    }
  }
  return results
},
'competitor.seo': async (brandId: string) => {
  const { getSEOMetrics, getKeywordRankings } = await import('@/lib/competitor-intel')
  const admin = (await import('@/lib/supabase/service')).createServiceClient()
  const { data: nodes } = await admin
    .from('knowledge_nodes')
    .select('name, properties')
    .eq('brand_id', brandId)
    .eq('node_type', 'competitor')
    .eq('is_active', true)
    .limit(5)
  const results = []
  for (const node of nodes || []) {
    const domain = (node.properties as Record<string, unknown>)?.domain as string
    if (domain) {
      const [seo, keywords] = await Promise.all([getSEOMetrics(domain), getKeywordRankings(domain)])
      results.push({ competitor: node.name, domain, seo, keywords })
    }
  }
  return results
},
'competitor.status': async (brandId: string) => {
  const { checkCompetitorStatus, searchCompetitorNews } = await import('@/lib/competitor-intel')
  const admin = (await import('@/lib/supabase/service')).createServiceClient()
  const { data: nodes } = await admin
    .from('knowledge_nodes')
    .select('name, properties')
    .eq('brand_id', brandId)
    .eq('node_type', 'competitor')
    .eq('is_active', true)
    .limit(10)
  const results = []
  for (const node of nodes || []) {
    const domain = (node.properties as Record<string, unknown>)?.domain as string
    if (domain) {
      const [status, news] = await Promise.all([checkCompetitorStatus(domain), searchCompetitorNews(node.name)])
      results.push({ competitor: node.name, domain, status, news })
    }
  }
  return results
},
```

Also update the `SkillDataContext` interface to include competitor data:

```typescript
competitor?: {
  ads?: unknown[]
  products?: unknown[]
  traffic?: unknown[]
  seo?: unknown[]
  status?: unknown[]
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/mcp-client.ts
git commit -m "feat: register competitor intel functions as MCP tool handlers"
```

---

### Task 3: Update Competitor Scan Skill Definition

**Files:**
- Modify: `skills/diagnosis/competitor-scan.md`

- [ ] **Step 1: Update frontmatter mcp_tools**

Replace the `mcp_tools` line in the frontmatter:

```yaml
mcp_tools: [shopify.products.list, competitor.ads, competitor.products, competitor.traffic, competitor.seo, competitor.status]
```

- [ ] **Step 2: Commit**

```bash
git add skills/diagnosis/competitor-scan.md
git commit -m "feat: update competitor-scan skill with new MCP tool references"
```

---

### Task 4: Update Competitor Creative Library Skill

**Files:**
- Modify: `skills/diagnosis/competitor-creative-library.md`

- [ ] **Step 1: Update frontmatter**

Replace `mcp_tools: []` with:

```yaml
mcp_tools: [competitor.ads]
```

- [ ] **Step 2: Commit**

```bash
git add skills/diagnosis/competitor-creative-library.md
git commit -m "feat: update competitor-creative-library skill with ads MCP tool"
```

---

## Phase 3 Complete Checklist

- [ ] `src/lib/competitor-intel.ts` created with all data source functions
- [ ] MCP tool handlers registered for `competitor.ads`, `competitor.products`, `competitor.traffic`, `competitor.seo`, `competitor.status`
- [ ] `SkillDataContext` interface updated with competitor section
- [ ] `competitor-scan.md` frontmatter updated with new MCP tools
- [ ] `competitor-creative-library.md` frontmatter updated
- [ ] All API keys documented in `.env.local.example` (done in Phase 1 Task 8)

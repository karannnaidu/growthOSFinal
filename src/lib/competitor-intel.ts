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
  ad_snapshot_url: string | null
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
// Ad Library — ScrapeCreators (primary) + Meta API (fallback)
// ---------------------------------------------------------------------------

/**
 * Fetch competitor ads using ScrapeCreators API (scrapes Meta Ad Library).
 * Falls back to Meta's official API if ScrapeCreators key is not set.
 *
 * @param searchTerm - Company name to search for
 * @param countryCode - Country code for Meta API fallback
 * @param hints - Optional domain/Facebook page URL to improve matching
 */
export async function fetchCompetitorAds(
  searchTerm: string,
  countryCode: string = 'US',
  hints?: { domain?: string; facebookUrl?: string },
): Promise<AdCreative[]> {
  // Try ScrapeCreators first (works for all commercial ads)
  const scrapeKey = process.env.SCRAPECREATORS_API_KEY
  if (scrapeKey) {
    try {
      const result = await fetchViaScrapCreators(searchTerm, scrapeKey, hints)
      if (result.length > 0) return result
    } catch (err) {
      console.warn('[competitor-intel] ScrapeCreators failed, trying Meta API:', err)
    }
  }

  // Fallback: Meta official API (only works for political/EU ads)
  return fetchViaMetaApi(searchTerm, countryCode)
}

async function fetchViaScrapCreators(
  searchTerm: string,
  apiKey: string,
  hints?: { domain?: string; facebookUrl?: string },
): Promise<AdCreative[]> {
  // If we have a Facebook page URL, try to extract the page name for a more targeted search
  let effectiveSearch = searchTerm
  if (hints?.facebookUrl) {
    const fbMatch = hints.facebookUrl.match(/facebook\.com\/([^/?]+)/)
    if (fbMatch?.[1]) effectiveSearch = fbMatch[1].replace(/[.-]/g, ' ')
  }

  // Step 1: Search for the company to get pageId
  const searchRes = await fetch(
    `https://api.scrapecreators.com/v1/facebook/adLibrary/search/companies?query=${encodeURIComponent(effectiveSearch)}`,
    { headers: { 'x-api-key': apiKey } },
  )
  if (!searchRes.ok) {
    console.warn('[competitor-intel] ScrapeCreators company search failed:', searchRes.status)
    return []
  }

  const searchData = await searchRes.json() as { searchResults?: Array<{ page_id?: string; name?: string; url?: string }> }
  const results = searchData.searchResults ?? []

  // Pick the best matching company — validate against domain/FB URL to avoid false matches
  let bestMatch = results[0]
  if (results.length > 1 && hints?.domain) {
    const domainLower = hints.domain.replace(/^www\./, '').toLowerCase()
    const domainMatch = results.find(r => {
      const name = (r.name ?? '').toLowerCase()
      const url = (r.url ?? '').toLowerCase()
      const domainBase = domainLower.split('.')[0] ?? domainLower
      return url.includes(domainLower) || name.includes(domainBase)
    })
    if (domainMatch) bestMatch = domainMatch
  }

  const pageId = bestMatch?.page_id
  if (!pageId) {
    console.warn('[competitor-intel] No pageId found for:', effectiveSearch)
    return []
  }
  console.info(`[competitor-intel] Matched "${searchTerm}" → "${bestMatch?.name}" (pageId: ${pageId})`)

  // Step 2: Fetch ads for this company
  const adsRes = await fetch(
    `https://api.scrapecreators.com/v1/facebook/adLibrary/company/ads?pageId=${pageId}`,
    { headers: { 'x-api-key': apiKey } },
  )
  if (!adsRes.ok) {
    console.warn('[competitor-intel] ScrapeCreators ads fetch failed:', adsRes.status)
    return []
  }

  const adsData = await adsRes.json() as { results?: Array<Record<string, unknown>> }
  const now = Date.now()

  return (adsData.results || []).slice(0, 25).map(ad => {
    const snapshot = (ad.snapshot || {}) as Record<string, unknown>
    const body = snapshot.body as { text?: string } | string | null
    const bodyText = typeof body === 'string' ? body : body?.text || null

    // Timestamps are Unix seconds
    const startSec = ad.start_date as number
    const endSec = ad.end_date as number | null
    const startTime = startSec ? new Date(startSec * 1000).toISOString() : new Date().toISOString()
    const stopTime = endSec ? new Date(endSec * 1000).toISOString() : null
    const startMs = startSec ? startSec * 1000 : Date.now()
    const endMs = endSec ? endSec * 1000 : now

    const images = (snapshot.images as Array<{ original_image_url?: string }>) || []
    const videos = (snapshot.videos as Array<{ video_preview_image_url?: string }>) || []
    const thumbnail = images[0]?.original_image_url || videos[0]?.video_preview_image_url || null

    // Build snapshot URL for viewing the full ad on Meta Ad Library
    const archiveId = (ad.ad_archive_id as string) || (ad.ad_id as string) || ''
    const snapshotUrl = archiveId
      ? `https://www.facebook.com/ads/library/?id=${archiveId}`
      : null

    return {
      id: archiveId || String(Date.now()),
      page_name: (ad.page_name as string) || (snapshot.page_name as string) || searchTerm,
      ad_creative_body: bodyText,
      ad_creative_link_title: (snapshot.title as string) || null,
      ad_delivery_start_time: startTime,
      ad_delivery_stop_time: stopTime,
      media_type: videos.length > 0 ? 'video' as const : images.length > 0 ? 'image' as const : 'unknown' as const,
      thumbnail_url: thumbnail,
      ad_snapshot_url: snapshotUrl,
      estimated_days_active: Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24))),
    }
  })
}

async function fetchViaMetaApi(searchTerm: string, countryCode: string): Promise<AdCreative[]> {
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (!appId || !appSecret) return []

  try {
    const tokenRes = await fetch(
      `https://graph.facebook.com/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&grant_type=client_credentials`,
    )
    if (!tokenRes.ok) return []
    const { access_token } = await tokenRes.json() as { access_token: string }

    const params = new URLSearchParams({
      access_token,
      search_terms: searchTerm,
      ad_reached_countries: `["${countryCode}"]`,
      ad_type: 'ALL',
      fields: 'id,page_name,ad_creative_bodies,ad_creative_link_titles,ad_delivery_start_time,ad_delivery_stop_time,ad_snapshot_url',
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

      const adId = (ad.id as string) || ''
      return {
        id: adId,
        page_name: (ad.page_name as string) || '',
        ad_creative_body: ((ad.ad_creative_bodies as string[]) || [])[0] || null,
        ad_creative_link_title: ((ad.ad_creative_link_titles as string[]) || [])[0] || null,
        ad_delivery_start_time: startTime,
        ad_delivery_stop_time: stopTime || null,
        media_type: 'unknown' as const,
        thumbnail_url: null,
        ad_snapshot_url: (ad.ad_snapshot_url as string) || (adId ? `https://www.facebook.com/ads/library/?id=${adId}` : null),
        estimated_days_active: Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24))),
      }
    })
  } catch (err) {
    console.warn('[competitor-intel] Meta API fallback failed:', err)
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
  } catch (err) {
    console.warn('[competitor-intel] detectBestSellers failed:', err)
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
  } catch (err) {
    console.warn('[competitor-intel] getTrafficEstimate failed:', err)
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
  } catch (err) {
    console.warn('[competitor-intel] getSEOMetrics failed:', err)
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
        position: ((item.ranked_serp_element as Record<string, unknown>)?.serp_item as Record<string, unknown>)?.rank_absolute as number || 0,
        search_volume: (ki?.search_volume as number) || 0,
        cpc: (ki?.cpc as number) || null,
        url: ((item.ranked_serp_element as Record<string, unknown>)?.serp_item as Record<string, unknown>)?.relative_url as string || null,
      }
    })
  } catch (err) {
    console.warn('[competitor-intel] getKeywordRankings failed:', err)
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
  } catch (err) {
    console.warn('[competitor-intel] getFundingData failed:', err)
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
  } catch (err) {
    console.warn('[competitor-intel] checkCompetitorStatus failed:', err)
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
  } catch (err) {
    console.warn('[competitor-intel] searchCompetitorNews failed:', err)
    return []
  }
}

// ---------------------------------------------------------------------------
// Competitor Creative Analysis (Gemini Vision)
// ---------------------------------------------------------------------------

export interface CreativeAnalysis {
  format: 'static_image' | 'video' | 'carousel' | 'ugc' | 'graphic_design'
  messaging_approach: 'benefit_led' | 'social_proof' | 'urgency_fomo' | 'educational' | 'lifestyle'
  visual_style: 'studio' | 'lifestyle' | 'ugc' | 'product_hero' | 'graphic'
  visual_description: string
  estimated_performance: 'high' | 'medium' | 'low'
  key_elements: string[]
}

export async function analyzeCompetitorCreative(
  imageUrl: string,
  daysActive: number,
): Promise<CreativeAnalysis | null> {
  const apiKey = process.env.GOOGLE_AI_KEY
  if (!apiKey) return null

  try {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(10000) })
    if (!imgRes.ok) return null
    const buffer = Buffer.from(await imgRes.arrayBuffer())
    const base64 = buffer.toString('base64')
    const mimeType = imgRes.headers.get('content-type') || 'image/png'

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: `Analyze this ad creative. Respond with JSON only:\n{\n  "format": "static_image" | "video" | "carousel" | "ugc" | "graphic_design",\n  "messaging_approach": "benefit_led" | "social_proof" | "urgency_fomo" | "educational" | "lifestyle",\n  "visual_style": "studio" | "lifestyle" | "ugc" | "product_hero" | "graphic",\n  "visual_description": "one paragraph describing what the ad shows",\n  "key_elements": ["list", "of", "notable", "design", "elements"]\n}` },
            { inlineData: { mimeType, data: base64 } },
          ]}],
          generationConfig: { maxOutputTokens: 512, temperature: 0.2 },
        }),
      },
    )

    if (!res.ok) return null
    const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    const fenceMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/)
    if (fenceMatch) text = fenceMatch[1]!.trim()

    const parsed = JSON.parse(text) as Omit<CreativeAnalysis, 'estimated_performance'>
    return {
      ...parsed,
      estimated_performance: daysActive >= 14 ? 'high' : daysActive >= 7 ? 'medium' : 'low',
    }
  } catch (err) {
    console.warn('[competitor-intel] analyzeCompetitorCreative failed:', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Full Scan: Fetch + Download Media + Store as Knowledge Nodes
// ---------------------------------------------------------------------------

/**
 * Complete competitor ad scan pipeline:
 * 1. Fetch ads via ScrapeCreators
 * 2. Download images/videos to Supabase Storage (permanent)
 * 3. Optionally analyze with Gemini Vision
 * 4. Create/update competitor_creative knowledge nodes
 *
 * Called by Echo's competitor-scan and competitor-creative-library skills.
 */
export async function scanAndStoreCompetitorAds(
  brandId: string,
  competitorName: string,
  competitorProps?: Record<string, unknown>,
): Promise<{ stored: number; errors: number }> {
  const { createServiceClient } = await import('@/lib/supabase/service')
  const admin = createServiceClient()

  // Build search hints from competitor properties
  const domain = competitorProps?.domain as string | undefined
  const socialLinks = competitorProps?.social_links as Record<string, string> | undefined
  const facebookUrl = socialLinks?.facebook ?? socialLinks?.meta ?? undefined
  const hints = (domain || facebookUrl) ? { domain, facebookUrl } : undefined

  // 1. Fetch ads (with domain/FB hints for accurate matching)
  const ads = await fetchCompetitorAds(competitorName, 'US', hints)
  if (ads.length === 0) return { stored: 0, errors: 0 }

  const competitorSlug = competitorName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  let stored = 0
  let errors = 0

  for (const ad of ads.slice(0, 15)) {
    // Skip ads without any thumbnail — they show blank in Creative Studio
    if (!ad.thumbnail_url) continue

    try {
      const adId = ad.id || `ad-${Date.now()}`

      // 2. Download thumbnail to permanent storage
      let storedThumbUrl: string | null = null
      if (ad.thumbnail_url) {
        try {
          const imgRes = await fetch(ad.thumbnail_url, { signal: AbortSignal.timeout(15000) })
          if (imgRes.ok) {
            const buffer = Buffer.from(await imgRes.arrayBuffer())
            const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
            const ext = contentType.includes('png') ? 'png' : 'jpg'
            const path = `${brandId}/competitors/${competitorSlug}/${adId}-thumb.${ext}`
            const { error: uploadErr } = await admin.storage
              .from('competitor-assets')
              .upload(path, buffer, { contentType, upsert: true })
            if (!uploadErr) {
              const { data: urlData } = admin.storage.from('competitor-assets').getPublicUrl(path)
              storedThumbUrl = urlData?.publicUrl ?? null
            }
          }
        } catch { /* non-fatal */ }
      }

      // 3. Analyze with Gemini Vision (if thumbnail available)
      let analysis: CreativeAnalysis | null = null
      const imageToAnalyze = storedThumbUrl || ad.thumbnail_url
      if (imageToAnalyze) {
        analysis = await analyzeCompetitorCreative(imageToAnalyze, ad.estimated_days_active)
      }

      // 4. Create competitor_creative knowledge node
      const { error: insertErr } = await admin.from('knowledge_nodes').insert({
        brand_id: brandId,
        node_type: 'competitor_creative',
        name: `${competitorName} — ${(ad.ad_creative_body || adId).slice(0, 40)}`,
        summary: (ad.ad_creative_body || '').slice(0, 300),
        properties: {
          competitor_name: competitorName,
          ad_id: adId,
          page_name: ad.page_name,
          ad_creative_body: ad.ad_creative_body,
          thumbnail_url: ad.thumbnail_url,
          stored_thumbnail_url: storedThumbUrl,
          cta_text: ad.ad_creative_link_title,
          estimated_days_active: ad.estimated_days_active,
          is_active: !ad.ad_delivery_stop_time,
          format: analysis?.format || ad.media_type || 'unknown',
          messaging_approach: analysis?.messaging_approach || 'benefit_led',
          visual_style: analysis?.visual_style || 'unknown',
          visual_description: analysis?.visual_description || null,
          key_elements: analysis?.key_elements || [],
          estimated_performance: ad.estimated_days_active >= 14 ? 'high' : ad.estimated_days_active >= 7 ? 'medium' : 'low',
        },
        is_active: true,
        confidence: 0.7,
      })

      if (!insertErr) stored++
      else errors++
    } catch (err) {
      console.warn(`[competitor-intel] scanAndStore failed for ad:`, err)
      errors++
    }
  }

  return { stored, errors }
}

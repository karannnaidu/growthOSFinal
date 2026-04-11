# PRD: Web Extraction & Brand Intelligence — Onboarding

**Version**: 1.0
**Date**: 2026-04-10
**Status**: Draft
**Owner**: Growth OS Platform Team

---

## 1. Problem Statement

When a user enters their brand name and website URL during onboarding, Growth OS currently stores the domain string and does **nothing with it**. No content is fetched, no brand voice is extracted, no products are catalogued, no competitors are identified. The diagnosis step shows fake hardcoded results.

Competitors like Holo.ai extract full brand intelligence from just a URL in ~2-3 minutes: voice, colors, fonts, products, audience, positioning, and competitor landscape. Growth OS needs parity.

---

## 2. Goals

1. **Extract full Brand DNA from a single URL** — voice, visual identity, products, audience, positioning
2. **Discover and snapshot competitors** — nearest competitors + market cohort leaders, with live data
3. **Show extraction live** — real progress, real logs, user reviews results before proceeding
4. **Quality gate** — AI self-evaluates extraction; re-crawls if data is insufficient
5. **Seed Echo's competitor monitoring** — competitors discovered here become Echo's ongoing watchlist
6. **Universal** — works for any ecommerce site (Shopify, WooCommerce, custom, etc.)

---

## 3. Scope

### In Scope (This PRD)

| Component | Description |
|-----------|-------------|
| **Brand Extraction Pipeline** | Crawl website, extract brand DNA via AI |
| **Competitor Discovery** | Find nearest + market cohort competitors during extraction |
| **Onboarding UI Rewrite** | Connect-store page shows live extraction + review step |
| **Echo Skill Upgrades** | Full competitive intelligence infrastructure for ongoing monitoring |
| **Data Storage** | Populate brands, brand_guidelines, knowledge_nodes, products |

### Out of Scope

- Shopify OAuth product import (exists, separate flow)
- Social media account connection
- Email platform integration (Klaviyo etc.)

---

## 4. Architecture Overview

```
User enters URL
       |
       v
+-------------------+
| 1. CRAWL PHASE    |  Firecrawl crawls homepage + discovered pages (max 5)
| (Firecrawl API)   |  Fallback: Jina Reader per page + cheerio
+-------------------+
       |
       v
+-------------------+
| 2. EXTRACT PHASE  |  Claude analyzes all scraped content
| (Claude Sonnet)   |  Returns structured Brand DNA JSON
+-------------------+
       |
       v
+-------------------+
| 3. QUALITY GATE   |  AI scores each extracted field (0-100)
| (self-evaluation) |  If any field < 60: identify gaps, targeted re-crawl
+-------------------+
       |
       v
+-------------------+
| 4. COMPETITOR      |  Claude identifies competitors from brand context
|    DISCOVERY       |  Firecrawl snapshots top 3-5 competitor sites
+-------------------+
       |
       v
+-------------------+
| 5. REVIEW UI       |  User sees Brand DNA + competitors
|                    |  Can edit/correct before proceeding
+-------------------+
       |
       v
+-------------------+
| 6. STORAGE         |  brands, brand_guidelines, knowledge_nodes, products
+-------------------+
```

---

## 5. Part 1 — Brand Extraction Pipeline

### 5.1 Crawl Phase

**Primary: Firecrawl** (`@mendable/firecrawl-js`)

- Input: `https://{domain}`
- Crawl mode: `crawl` endpoint with `limit: 5`
- Pages to discover: homepage, about/about-us, collections/products/shop, one product detail page
- Returns per page:
  - Clean markdown (body text)
  - Raw HTML
  - Metadata (title, description, OG tags, Twitter cards)
  - JSON-LD structured data
  - Links discovered

**Fallback: Jina Reader + Cheerio**

If Firecrawl is unavailable or credits exhausted:
1. Fetch `https://r.jina.ai/{url}` — returns LLM-ready markdown
2. Fetch raw HTML with `fetch()` + parse with `cheerio` for:
   - `<link>` tags (fonts, stylesheets)
   - CSS custom properties (colors)
   - `<script type="application/ld+json">` (JSON-LD)
   - `<meta>` tags (OG, description, keywords)
   - Image URLs from `<img>` and OG tags
3. Discover nav links, fetch up to 4 additional pages

**CSS/Visual Extraction** (cheerio on raw HTML):
- Font families from `<link href="fonts.googleapis.com/...">` and CSS `font-family` declarations
- Color values from CSS variables (`--color-*`, `--brand-*`), inline styles, and meta `theme-color`
- Logo URL from JSON-LD Organization, OG image, or `<img>` with "logo" in src/alt/class

### 5.2 Extract Phase

**Model**: Claude Sonnet (via `callModel` with provider `anthropic`)
**Temperature**: 0.2 (deterministic extraction)
**Max tokens**: 4096

**System Prompt**:
```
You are a brand intelligence analyst. Extract comprehensive brand DNA from 
scraped website content. Return valid JSON only. Be thorough — extract 
everything observable. If a field cannot be determined, set it to null 
with a brief reason.
```

**User Prompt** includes:
- Structured data (JSON-LD, OG tags, meta tags)
- Clean page content (markdown, max ~8000 tokens across all pages)
- CSS-extracted visual data (fonts, colors)
- Image URLs found

**Output Schema** (Brand DNA):

```json
{
  "brand_voice": {
    "formality": "casual|conversational|professional|formal",
    "warmth": "cold|neutral|warm|intimate",
    "humor": "none|subtle|moderate|playful",
    "confidence": "humble|balanced|confident|bold",
    "style_notes": "string — specific voice observations",
    "sample_phrases": ["string — characteristic phrases found on site"]
  },
  "tone_adjectives": ["calm", "clinical", "empathetic"],
  "target_audience": {
    "age_range": "25-45",
    "gender_skew": "female-leaning|male-leaning|neutral",
    "interests": ["wellness", "self-care"],
    "pain_points": ["stress", "poor sleep"],
    "income_bracket": "mid|mid-high|high|luxury",
    "psychographic": "string — lifestyle/values description"
  },
  "positioning": {
    "statement": "string — one-sentence positioning",
    "category": "string — e.g. wellness supplements",
    "differentiator": "string — what makes them unique",
    "price_positioning": "budget|value|mid|premium|luxury"
  },
  "products": [
    {
      "name": "string",
      "description": "string",
      "price": "string or null",
      "currency": "USD",
      "image_url": "string or null",
      "category": "string",
      "is_bestseller": false
    }
  ],
  "visual_identity": {
    "primary_colors": ["#hex1", "#hex2"],
    "secondary_colors": ["#hex3"],
    "font_families": ["Inter", "Playfair Display"],
    "font_style": "modern-sans|classic-serif|mixed|custom",
    "logo_url": "string or null",
    "aesthetic": "string — e.g. minimalist, clinical, bohemian"
  },
  "brand_story": "string or null — mission/origin if found",
  "key_themes": ["ingredient transparency", "science-backed"],
  "trust_signals": ["dermatologist tested", "10k+ reviews"],
  "social_links": {
    "instagram": "url or null",
    "tiktok": "url or null",
    "facebook": "url or null",
    "twitter": "url or null",
    "youtube": "url or null"
  },
  "technology_signals": {
    "platform": "shopify|woocommerce|custom|squarespace|other",
    "detected_tools": ["klaviyo", "yotpo", "google-analytics"]
  },
  "extraction_confidence": {
    "overall": 85,
    "brand_voice": 90,
    "products": 70,
    "visual_identity": 95,
    "target_audience": 75,
    "positioning": 80
  }
}
```

### 5.3 Quality Gate

After extraction, the AI self-evaluates via `extraction_confidence` scores.

**Re-extraction triggers** (any field scoring < 60):

| Low-confidence field | Re-crawl action |
|---------------------|-----------------|
| `products` < 60 | Crawl `/collections/all`, `/products`, or first collection link |
| `brand_voice` < 60 | Crawl `/about`, `/about-us`, `/our-story` |
| `target_audience` < 60 | Crawl `/about` + analyze product descriptions more deeply |
| `visual_identity` < 60 | Fetch and parse main CSS stylesheet |
| `positioning` < 60 | Re-analyze with focus on hero sections and taglines |

**Max re-extraction attempts**: 1 (to avoid infinite loops)
**Total budget**: Max 2 Firecrawl crawls + 2 LLM calls per brand extraction

### 5.4 API Route

**`POST /api/onboarding/extract-brand`**

Request:
```json
{
  "brandId": "uuid",
  "domain": "www.calmosis.com"
}
```

Response (streamed via Server-Sent Events for live progress):
```
event: progress
data: {"step": "crawling", "message": "Fetching homepage...", "progress": 10}

event: progress
data: {"step": "crawling", "message": "Found 4 pages. Crawling /about...", "progress": 25}

event: progress
data: {"step": "extracting", "message": "Analyzing brand voice and visual identity...", "progress": 50}

event: progress
data: {"step": "quality_check", "message": "Verifying extraction quality...", "progress": 75}

event: progress
data: {"step": "competitors", "message": "Discovering competitors...", "progress": 85}

event: complete
data: {"brandDna": {...}, "competitors": [...]}
```

### 5.5 Storage

After extraction, write to:

| Table | Fields Updated |
|-------|---------------|
| `brands` | `product_context` (products array), `brand_guidelines` (full Brand DNA object) |
| `brand_guidelines` | `voice_tone`, `target_audience`, `positioning`, `do_say`, `dont_say`, `colors`, `typography`, `brand_story` |
| `knowledge_nodes` | One node per product (type: `product`), one for brand_guidelines (type: `brand_guidelines`) |
| `knowledge_edges` | Product → brand, brand_guidelines → brand |

---

## 6. Part 2 — Competitor Discovery & Snapshot

### 6.1 Discovery (During Onboarding)

After Brand DNA extraction, Claude receives the brand context and identifies competitors.

**LLM Prompt**:
```
Given this brand's positioning, products, and category, identify:
1. 3-5 nearest direct competitors (same niche, similar size/stage)
2. 2-3 larger market cohort leaders (aspirational/established players in the space)

For each, provide: name, domain URL, why they're a competitor, estimated relative size.
Return JSON only.
```

**For each discovered competitor**:
1. Firecrawl fetches their homepage (single page, not full crawl)
2. Extract: tagline, product categories, price positioning, visual style, social links
3. Store as `competitor` knowledge node with snapshot

### 6.2 Competitor Snapshot Schema

```json
{
  "competitors": [
    {
      "name": "CompetitorX",
      "domain": "competitorx.com",
      "type": "direct|market_cohort",
      "tagline": "string",
      "positioning": "string",
      "product_categories": ["category1", "category2"],
      "price_positioning": "budget|value|mid|premium|luxury",
      "estimated_size": "smaller|similar|larger|much_larger",
      "why_competitor": "string — reasoning",
      "social_links": {},
      "platform": "shopify|woocommerce|custom"
    }
  ]
}
```

### 6.3 Review UI

After extraction + competitor discovery, the user sees:

**Brand DNA Review Screen** (new step between connect-store and focus):
- Brand voice summary (editable)
- Color palette swatches (editable)
- Font preview
- Product grid (thumbnails + names)
- Target audience card
- Positioning statement (editable)
- **Competitor cards**: name, tagline, "why they're your competitor", link
- "Looks good" button to proceed
- "Re-scan" button to re-run extraction

---

## 7. Part 3 — Echo's Competitive Intelligence System

Echo's `competitor-scan` and `competitor-creative-library` skills exist but lack the infrastructure to execute. This section defines what Echo needs.

### 7.1 Echo's Data Sources

| Data Point | Source | Cost | Frequency |
|-----------|--------|------|-----------|
| **Active ads & creatives** | Meta Ad Library API (official, free) | Free | Weekly |
| **Best selling products** | Firecrawl: `{domain}/collections/all?sort_by=best-selling` | ~$0.01/page | Weekly |
| **Web traffic estimates** | DataForSEO Traffic Analytics API | ~$0.01/query | Monthly |
| **SEO rankings** | DataForSEO SERP API | ~$0.005/keyword | Monthly |
| **Keyword rankings** | DataForSEO Ranked Keywords API | ~$0.005/domain | Monthly |
| **Social media metrics** | Meta Graph API (Instagram) + public profiles | Free | Weekly |
| **Funding/financial signals** | Crunchbase Basic API (free tier) | Free | Monthly |
| **Company status** | HTTP health check + NewsAPI | Free | Daily |
| **Product/pricing changes** | Firecrawl product page scraping | ~$0.01/page | Weekly |
| **Landing page changes** | Firecrawl homepage screenshot + diff | ~$0.01/page | Weekly |

**Estimated monthly cost per competitor**: ~$2-5/month
**For 5 competitors**: ~$10-25/month

### 7.2 New Infrastructure Required

#### `src/lib/competitor-intel.ts` — Competitor Intelligence Client

```typescript
// Core functions Echo's skills will call:

// Meta Ad Library
fetchCompetitorAds(pageId: string): Promise<AdCreative[]>

// Product scraping via Firecrawl
scrapeCompetitorProducts(domain: string): Promise<Product[]>
detectBestSellers(domain: string): Promise<Product[]>

// Traffic & SEO via DataForSEO
getTrafficEstimate(domain: string): Promise<TrafficData>
getKeywordRankings(domain: string): Promise<KeywordRanking[]>
getSEOMetrics(domain: string): Promise<SEOMetrics>

// Social metrics
getSocialMetrics(socialLinks: SocialLinks): Promise<SocialMetrics>

// Financial signals
getFundingData(companyName: string): Promise<FundingData | null>

// Health monitoring
checkCompetitorStatus(domain: string): Promise<StatusCheck>
```

#### `src/lib/firecrawl-client.ts` — Firecrawl Wrapper

```typescript
// Shared by both onboarding extraction and Echo's ongoing scraping

crawlSite(url: string, options: CrawlOptions): Promise<CrawlResult>
scrapePage(url: string): Promise<PageResult>
extractStructured(url: string, schema: object): Promise<object>
```

#### Environment Variables (New)

```env
# Firecrawl — web crawling
FIRECRAWL_API_KEY=

# DataForSEO — traffic & SEO intelligence
DATAFORSEO_LOGIN=
DATAFORSEO_PASSWORD=

# Meta Ad Library (uses existing META_APP_ID + META_APP_SECRET)

# Crunchbase (optional)
CRUNCHBASE_API_KEY=

# NewsAPI — shutdown/news monitoring
NEWSAPI_KEY=
```

### 7.3 Updated Echo Skill Definitions

#### `competitor-scan` — Enhanced

Current: Uses only `shopify.products.list` MCP tool, relies on knowledge graph context.

**Enhanced with**:
- `firecrawl.scrape` — scrape competitor product pages + homepage
- `meta_ads.library` — pull active ads from Meta Ad Library
- `dataforseo.traffic` — traffic estimates
- `dataforseo.seo` — domain authority, backlinks, keyword rankings
- `social.metrics` — follower counts, engagement rates
- `crunchbase.org` — funding rounds, revenue estimates
- `newsapi.search` — recent news/shutdown signals

**New output fields**:
```json
{
  "competitors": [
    {
      "...existing fields...",
      "traffic": {
        "monthly_visits": 150000,
        "traffic_sources": {"organic": 45, "paid": 30, "social": 15, "direct": 10},
        "trend": "growing|stable|declining"
      },
      "seo": {
        "domain_authority": 42,
        "backlinks": 12500,
        "top_keywords": [
          {"keyword": "calming supplements", "position": 3, "volume": 8100}
        ],
        "organic_traffic_share": 45
      },
      "social": {
        "instagram_followers": 45000,
        "instagram_engagement_rate": 2.3,
        "tiktok_followers": 12000,
        "facebook_likes": 8500
      },
      "financials": {
        "total_funding": "$2.5M",
        "last_round": "Seed — Jan 2026",
        "estimated_revenue": "unknown|$1-5M|$5-10M|$10M+",
        "shopify_plan": "basic|shopify|advanced|plus"
      },
      "best_sellers": [
        {"name": "Sleep Gummies", "price": "$29.99", "review_count": 1240}
      ],
      "status": "active|inactive|shutdown",
      "last_social_post": "2026-04-08"
    }
  ]
}
```

#### `competitor-creative-library` — Enhanced

Add Meta Ad Library API integration:
- Pull all active ads for each competitor's Facebook page
- Capture ad creative URL, copy text, CTA, format, start date
- Calculate ad longevity (days running = performance proxy)
- Store screenshots in Supabase Storage: `competitor-assets/{brand_id}/{competitor_id}/ads/`
- Create `competitor_creative` knowledge nodes with embeddings

### 7.4 New Echo Skill: `competitor-traffic-report`

```yaml
id: competitor-traffic-report
name: Competitor Traffic & SEO Report
agent: echo
category: diagnosis
complexity: mid
credits: 2
schedule: "0 8 1 * *"  # Monthly, 1st of month
```

**What it does**:
- Pull traffic estimates for all tracked competitors via DataForSEO
- Pull keyword rankings and SEO metrics
- Compare month-over-month trends
- Identify keywords where competitors rank but the brand doesn't
- Identify traffic source shifts (competitor pivoting from paid to organic?)
- Feed keyword gaps to Hugo's `keyword-strategy` skill

### 7.5 New Echo Skill: `competitor-status-monitor`

```yaml
id: competitor-status-monitor
name: Competitor Status Monitor
agent: echo
category: diagnosis
complexity: cheap
credits: 0.5
schedule: "0 7 * * *"  # Daily 7am
```

**What it does**:
- HTTP health check on all competitor domains
- NewsAPI search for "[competitor name] shutdown|acquired|closing|layoffs"
- Check last social media post date (>30 days = inactive signal)
- If shutdown detected: alert Mia, flag opportunity in next weekly report

---

## 8. Onboarding Flow (Updated)

### Current Flow
```
Connect Store → Focus → Platforms → Diagnosis (fake) → Dashboard
```

### New Flow
```
Connect Store → Brand Extraction (live) → Review Brand DNA → Focus → Platforms → Dashboard
```

**Changes**:
1. **Connect Store** page unchanged (name + URL input)
2. **NEW: Brand Extraction** — live crawl + AI analysis + competitor discovery (~30-60 sec)
3. **NEW: Review Brand DNA** — user sees extracted data + competitors, can edit
4. **Focus** page unchanged
5. **Platforms** page unchanged
6. **Diagnosis removed** from onboarding — Scout runs health-check as first dashboard skill instead (needs platform data which isn't available during onboarding anyway)

### Step-by-step UX

**Step 2a — Extraction (automatic after connect-store)**:
- Full-screen with Mia avatar
- "Mia is learning about your brand..."
- Real-time log terminal showing: "Crawling homepage...", "Found /about page...", "Extracting brand voice...", "Discovering competitors..."
- Progress bar tied to real SSE events
- ~30-60 seconds

**Step 2b — Review Brand DNA**:
- Left column: Brand DNA card
  - Voice summary (editable text)
  - Color swatches (visual)
  - Font names
  - Positioning statement (editable)
  - Target audience summary
- Right column: Products found
  - Grid of product cards (image + name + price)
  - "We found X products" header
- Bottom section: Competitors
  - Card per competitor: name, domain, type badge (Direct/Market Leader), tagline, "why"
  - "These competitors will be monitored by Echo weekly"
- Actions:
  - "Looks good, continue" → proceed to Focus
  - "Re-scan" → re-run extraction
  - Individual field edit (inline)

---

## 9. Technical Implementation Notes

### 9.1 New Files

| File | Purpose |
|------|---------|
| `src/lib/firecrawl-client.ts` | Firecrawl API wrapper (crawl, scrape, extract) |
| `src/lib/brand-extractor.ts` | Brand DNA extraction pipeline (crawl → extract → quality gate → store) |
| `src/lib/competitor-intel.ts` | Competitor intelligence data fetchers (Meta Ads, DataForSEO, social, etc.) |
| `src/app/api/onboarding/extract-brand/route.ts` | SSE endpoint for live extraction |
| `src/app/onboarding/extraction/page.tsx` | Live extraction progress UI |
| `src/app/onboarding/review/page.tsx` | Brand DNA + competitor review UI |
| `skills/diagnosis/competitor-traffic-report.md` | New Echo skill definition |
| `skills/diagnosis/competitor-status-monitor.md` | New Echo skill definition |

### 9.2 New Dependencies

```json
{
  "@mendable/firecrawl-js": "latest",
  "cheerio": "^1.2.0"
}
```

### 9.3 New Environment Variables

```env
FIRECRAWL_API_KEY=
DATAFORSEO_LOGIN=
DATAFORSEO_PASSWORD=
NEWSAPI_KEY=
```

### 9.4 Credit Costs

| Action | Credits |
|--------|---------|
| Onboarding brand extraction | 0 (free, part of onboarding) |
| Competitor scan (Echo, weekly) | 1 credit |
| Competitor creative library (Echo, weekly) | 2 credits |
| Competitor traffic report (Echo, monthly) | 2 credits |
| Competitor status monitor (Echo, daily) | 0.5 credits |
| **Monthly total for Echo** (5 competitors) | ~26 credits/month |

---

## 10. Success Metrics

| Metric | Target |
|--------|--------|
| Extraction completion rate | > 90% of URLs successfully extracted |
| Average extraction time | < 60 seconds |
| Brand voice confidence score | > 70 average |
| Products detected (for stores with products) | > 80% of actual catalog |
| Competitors discovered | 3-5 per brand |
| User edit rate on review screen | < 30% (lower = better extraction quality) |
| Onboarding completion rate improvement | +20% vs current (users stop dropping at diagnosis) |

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Firecrawl rate limit / downtime | Jina Reader + cheerio fallback path |
| Bot protection blocks crawling | Firecrawl handles most anti-bot; degrade gracefully with partial data |
| Poor extraction for thin sites | Quality gate triggers re-crawl; worst case shows partial data + "we couldn't detect X" |
| Competitor discovery hallucination | Cross-reference with web search; flag low-confidence competitors |
| DataForSEO cost overrun | Budget cap per brand per month; cache aggressively |
| Meta Ad Library API restrictions | Rate limit: 200 calls/hr; queue requests; cache results for 24hr |

---

## 12. Implementation Priority

| Phase | What | Timeline |
|-------|------|----------|
| **Phase 1** | Brand extraction pipeline + onboarding UI (Firecrawl + Claude + review screen) | First |
| **Phase 2** | Competitor discovery during onboarding + competitor nodes | Second |
| **Phase 3** | Echo infrastructure (competitor-intel.ts, DataForSEO, Meta Ad Library) | Third |
| **Phase 4** | New Echo skills (traffic report, status monitor) | Fourth |

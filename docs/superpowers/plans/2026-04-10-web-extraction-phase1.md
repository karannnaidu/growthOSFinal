# Phase 1: Brand Extraction Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Given a website URL, crawl the site, extract structured Brand DNA (voice, colors, fonts, products, audience, positioning) via AI, and store results — with a live-progress onboarding UI.

**Architecture:** Firecrawl crawls up to 5 pages → cheerio extracts CSS/visual data from raw HTML → Claude Sonnet analyzes all content and returns structured Brand DNA JSON → quality gate re-crawls if any field scores < 60 → results stored in brands/brand_guidelines/knowledge_nodes tables. SSE stream delivers real-time progress to the onboarding UI.

**Tech Stack:** Firecrawl (`@mendable/firecrawl-js`), cheerio, Claude Sonnet (via existing `callModel`), Supabase (via existing service client), Next.js SSE route, React client components.

**PRD Reference:** `docs/web-extraction-prd-onboarding.md` — Sections 5.1–5.5, 8

**Execution Progress:**
- [x] Task 1: Install Firecrawl SDK & env vars — DONE
- [x] Task 2: Create Firecrawl client wrapper — DONE
- [x] Task 3: Create brand extractor pipeline — DONE
- [x] Task 4: Create SSE API route — DONE
- [x] Task 5: Create extraction progress page — DONE
- [x] Task 6: Create Brand DNA review page — DONE
- [x] Task 7: Rewire onboarding flow — DONE
- [x] Task 8: Update .env.local.example — DONE
- [x] Task 9: Remove proxy debug logging — DONE

**Last executed:** 2026-04-11 — All 9 tasks complete. Phase 1 done.

---

### Task 1: Install Firecrawl SDK & Add Environment Variable

**Files:**
- Modify: `growth-os/package.json`
- Modify: `growth-os/.env.local`
- Modify: `growth-os/.env.local.example`

- [ ] **Step 1: Install Firecrawl**

```bash
cd growth-os && npm install @mendable/firecrawl-js
```

- [ ] **Step 2: Add env var to .env.local**

Add to `.env.local`:
```
# Firecrawl — AI web crawling for brand extraction
FIRECRAWL_API_KEY=
```

- [ ] **Step 3: Add env var to .env.local.example**

Add to `.env.local.example` after the `FAL_AI_KEY` block:
```
# Firecrawl — AI web crawling for brand extraction
# Get your key from https://firecrawl.dev
FIRECRAWL_API_KEY=
```

- [ ] **Step 4: Add to Vercel**

```bash
vercel env add FIRECRAWL_API_KEY production
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.local.example
git commit -m "chore: add firecrawl SDK and env var"
```

---

### Task 2: Create Firecrawl Client Wrapper

**Files:**
- Create: `src/lib/firecrawl-client.ts`

This wrapper is shared by onboarding extraction (Phase 1) and Echo's competitor scraping (Phase 3).

- [ ] **Step 1: Create firecrawl-client.ts**

```typescript
// ---------------------------------------------------------------------------
// Firecrawl Client — shared by brand extraction and competitor intelligence
//
// Primary: Firecrawl API (handles JS rendering, anti-bot, returns markdown)
// Fallback: Jina Reader (free, returns markdown) + cheerio (HTML parsing)
// ---------------------------------------------------------------------------

import * as cheerio from 'cheerio'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CrawlOptions {
  /** Max pages to crawl. Default 5. */
  limit?: number
  /** Only crawl pages matching these path patterns. */
  includePaths?: string[]
  /** Exclude pages matching these patterns. */
  excludePaths?: string[]
}

export interface PageResult {
  url: string
  markdown: string
  html: string
  metadata: {
    title?: string
    description?: string
    ogTitle?: string
    ogDescription?: string
    ogImage?: string
    ogSiteName?: string
  }
  jsonLd: Record<string, unknown>[]
  links: string[]
}

export interface CrawlResult {
  pages: PageResult[]
  totalCrawled: number
}

export interface VisualData {
  fontFamilies: string[]
  colors: string[]
  logoUrl: string | null
  themeColor: string | null
}

// ---------------------------------------------------------------------------
// Firecrawl API Key
// ---------------------------------------------------------------------------

function getFirecrawlKey(): string | null {
  return process.env.FIRECRAWL_API_KEY || null
}

// ---------------------------------------------------------------------------
// Primary: Firecrawl crawl
// ---------------------------------------------------------------------------

export async function crawlSite(
  url: string,
  options: CrawlOptions = {},
): Promise<CrawlResult> {
  const apiKey = getFirecrawlKey()

  if (apiKey) {
    try {
      return await firecrawlCrawl(url, apiKey, options)
    } catch (err) {
      console.warn('[firecrawl-client] Firecrawl failed, falling back to Jina:', err)
    }
  }

  return jinaFallbackCrawl(url, options)
}

// ---------------------------------------------------------------------------
// Primary: Firecrawl single-page scrape
// ---------------------------------------------------------------------------

export async function scrapePage(url: string): Promise<PageResult> {
  const apiKey = getFirecrawlKey()

  if (apiKey) {
    try {
      return await firecrawlScrape(url, apiKey)
    } catch (err) {
      console.warn('[firecrawl-client] Firecrawl scrape failed, falling back to Jina:', err)
    }
  }

  return jinaFallbackScrape(url)
}

// ---------------------------------------------------------------------------
// Visual extraction from raw HTML (cheerio)
// ---------------------------------------------------------------------------

export function extractVisualData(html: string): VisualData {
  const $ = cheerio.load(html)
  const fontFamilies = new Set<string>()
  const colors = new Set<string>()

  // Fonts from Google Fonts links
  $('link[href*="fonts.googleapis.com"]').each((_, el) => {
    const href = $(el).attr('href') || ''
    const familyMatch = href.match(/family=([^&:]+)/)
    if (familyMatch) {
      familyMatch[1].split('|').forEach(f =>
        fontFamilies.add(decodeURIComponent(f.replace(/\+/g, ' ')))
      )
    }
  })

  // Fonts from <style> and style attributes
  const allStyles = $('style').text() + ' ' + $('[style]').map((_, el) => $(el).attr('style')).get().join(' ')
  const fontMatches = allStyles.match(/font-family\s*:\s*([^;}"]+)/gi) || []
  for (const match of fontMatches) {
    const value = match.replace(/font-family\s*:\s*/i, '').trim()
    const firstFont = value.split(',')[0].replace(/['"]/g, '').trim()
    if (firstFont && !['inherit', 'initial', 'unset', 'sans-serif', 'serif', 'monospace', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace'].includes(firstFont.toLowerCase())) {
      fontFamilies.add(firstFont)
    }
  }

  // Colors from CSS variables and theme-color
  const colorVarMatches = allStyles.match(/--[a-z-]*color[a-z-]*\s*:\s*([^;}"]+)/gi) || []
  for (const match of colorVarMatches) {
    const value = match.split(':').slice(1).join(':').trim()
    if (value.startsWith('#') && value.length <= 9) colors.add(value)
  }

  // theme-color meta tag
  const themeColor = $('meta[name="theme-color"]').attr('content') || null
  if (themeColor) colors.add(themeColor)

  // Hex colors from inline styles (common in ecommerce)
  const hexMatches = allStyles.match(/#[0-9a-fA-F]{3,8}\b/g) || []
  for (const hex of hexMatches.slice(0, 20)) {
    colors.add(hex.toLowerCase())
  }

  // Logo detection
  let logoUrl: string | null = null

  // 1. JSON-LD Organization logo
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || '{}')
      if (data['@type'] === 'Organization' && data.logo) {
        logoUrl = typeof data.logo === 'string' ? data.logo : data.logo.url || null
      }
    } catch { /* skip */ }
  })

  // 2. OG image
  if (!logoUrl) {
    logoUrl = $('meta[property="og:image"]').attr('content') || null
  }

  // 3. <img> with "logo" in src, alt, or class
  if (!logoUrl) {
    const logoImg = $('img').filter((_, el) => {
      const src = $(el).attr('src') || ''
      const alt = $(el).attr('alt') || ''
      const cls = $(el).attr('class') || ''
      return /logo/i.test(src + alt + cls)
    }).first()
    logoUrl = logoImg.attr('src') || null
  }

  return {
    fontFamilies: [...fontFamilies].slice(0, 10),
    colors: [...colors].slice(0, 20),
    logoUrl,
    themeColor,
  }
}

// ---------------------------------------------------------------------------
// JSON-LD extraction from HTML
// ---------------------------------------------------------------------------

export function extractJsonLd(html: string): Record<string, unknown>[] {
  const $ = cheerio.load(html)
  const results: Record<string, unknown>[] = []

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || '{}')
      if (Array.isArray(data)) {
        results.push(...data)
      } else {
        results.push(data)
      }
    } catch { /* skip malformed */ }
  })

  return results
}

// ---------------------------------------------------------------------------
// Metadata extraction from HTML
// ---------------------------------------------------------------------------

export function extractMetadata(html: string): PageResult['metadata'] {
  const $ = cheerio.load(html)
  return {
    title: $('title').text().trim() || undefined,
    description: $('meta[name="description"]').attr('content') || undefined,
    ogTitle: $('meta[property="og:title"]').attr('content') || undefined,
    ogDescription: $('meta[property="og:description"]').attr('content') || undefined,
    ogImage: $('meta[property="og:image"]').attr('content') || undefined,
    ogSiteName: $('meta[property="og:site_name"]').attr('content') || undefined,
  }
}

// ---------------------------------------------------------------------------
// Internal: Firecrawl implementations
// ---------------------------------------------------------------------------

async function firecrawlCrawl(
  url: string,
  apiKey: string,
  options: CrawlOptions,
): Promise<CrawlResult> {
  const FirecrawlApp = (await import('@mendable/firecrawl-js')).default
  const app = new FirecrawlApp({ apiKey })

  const normalizedUrl = url.startsWith('http') ? url : `https://${url}`

  const response = await app.crawlUrl(normalizedUrl, {
    limit: options.limit ?? 5,
    scrapeOptions: {
      formats: ['markdown', 'html'],
    },
    ...(options.includePaths ? { includePaths: options.includePaths } : {}),
    ...(options.excludePaths ? { excludePaths: options.excludePaths } : {}),
  })

  if (!response.success) {
    throw new Error(`Firecrawl crawl failed: ${response.error || 'unknown error'}`)
  }

  const pages: PageResult[] = (response.data || []).map((page: Record<string, unknown>) => {
    const html = (page.html as string) || ''
    return {
      url: (page.url as string) || normalizedUrl,
      markdown: (page.markdown as string) || '',
      html,
      metadata: extractMetadata(html),
      jsonLd: extractJsonLd(html),
      links: extractLinksFromHtml(html, normalizedUrl),
    }
  })

  return { pages, totalCrawled: pages.length }
}

async function firecrawlScrape(url: string, apiKey: string): Promise<PageResult> {
  const FirecrawlApp = (await import('@mendable/firecrawl-js')).default
  const app = new FirecrawlApp({ apiKey })

  const normalizedUrl = url.startsWith('http') ? url : `https://${url}`

  const response = await app.scrapeUrl(normalizedUrl, {
    formats: ['markdown', 'html'],
  })

  if (!response.success) {
    throw new Error(`Firecrawl scrape failed: ${response.error || 'unknown error'}`)
  }

  const html = (response.html as string) || ''

  return {
    url: normalizedUrl,
    markdown: (response.markdown as string) || '',
    html,
    metadata: extractMetadata(html),
    jsonLd: extractJsonLd(html),
    links: extractLinksFromHtml(html, normalizedUrl),
  }
}

// ---------------------------------------------------------------------------
// Internal: Jina Reader fallback
// ---------------------------------------------------------------------------

async function jinaFallbackCrawl(
  url: string,
  options: CrawlOptions,
): Promise<CrawlResult> {
  const normalizedUrl = url.startsWith('http') ? url : `https://${url}`
  const pages: PageResult[] = []

  // Fetch homepage
  const homepage = await jinaFallbackScrape(normalizedUrl)
  pages.push(homepage)

  // Discover additional pages from nav links
  const additionalPaths = ['/about', '/about-us', '/collections', '/products', '/shop']
  const baseUrl = new URL(normalizedUrl)
  const limit = (options.limit ?? 5) - 1

  let crawled = 0
  for (const path of additionalPaths) {
    if (crawled >= limit) break
    const pageUrl = `${baseUrl.origin}${path}`
    try {
      const page = await jinaFallbackScrape(pageUrl)
      if (page.markdown.length > 100) {
        pages.push(page)
        crawled++
      }
    } catch { /* skip 404s */ }
  }

  return { pages, totalCrawled: pages.length }
}

async function jinaFallbackScrape(url: string): Promise<PageResult> {
  const normalizedUrl = url.startsWith('http') ? url : `https://${url}`

  // Fetch markdown via Jina Reader
  let markdown = ''
  try {
    const jinaRes = await fetch(`https://r.jina.ai/${normalizedUrl}`, {
      headers: { Accept: 'text/plain' },
      signal: AbortSignal.timeout(15000),
    })
    if (jinaRes.ok) {
      markdown = await jinaRes.text()
    }
  } catch { /* Jina unavailable */ }

  // Fetch raw HTML for visual extraction
  let html = ''
  try {
    const htmlRes = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GrowthOS/1.0; +https://growthosapp.com)',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (htmlRes.ok) {
      html = await htmlRes.text()
    }
  } catch { /* fetch failed */ }

  // If no Jina markdown, extract text from HTML
  if (!markdown && html) {
    const $ = cheerio.load(html)
    $('script, style, nav, footer, header, noscript').remove()
    markdown = $('main, article, [role="main"]').text().trim()
    if (!markdown) markdown = $('body').text().trim()
    // Collapse whitespace
    markdown = markdown.replace(/\s+/g, ' ').slice(0, 15000)
  }

  return {
    url: normalizedUrl,
    markdown,
    html,
    metadata: html ? extractMetadata(html) : {},
    jsonLd: html ? extractJsonLd(html) : [],
    links: html ? extractLinksFromHtml(html, normalizedUrl) : [],
  }
}

// ---------------------------------------------------------------------------
// Internal: Link extraction
// ---------------------------------------------------------------------------

function extractLinksFromHtml(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html)
  const links = new Set<string>()
  const base = new URL(baseUrl)

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return
    try {
      const resolved = new URL(href, base.origin)
      if (resolved.hostname === base.hostname) {
        links.add(resolved.href)
      }
    } catch { /* skip invalid */ }
  })

  return [...links].slice(0, 50)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/firecrawl-client.ts
git commit -m "feat: add firecrawl client wrapper with Jina fallback"
```

---

### Task 3: Create Brand Extractor Pipeline

**Files:**
- Create: `src/lib/brand-extractor.ts`

This is the core pipeline: crawl → extract via LLM → quality gate → optional re-crawl → store.

- [ ] **Step 1: Create brand-extractor.ts**

```typescript
// ---------------------------------------------------------------------------
// Brand Extractor — crawl website, extract Brand DNA via AI
//
// Pipeline: crawl → visual extraction → LLM analysis → quality gate →
//           optional re-crawl → store to Supabase
// ---------------------------------------------------------------------------

import { crawlSite, scrapePage, extractVisualData, type CrawlResult, type PageResult } from '@/lib/firecrawl-client'
import { callModel } from '@/lib/model-client'
import { createServiceClient } from '@/lib/supabase/service'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BrandDna {
  brand_voice: {
    formality: string
    warmth: string
    humor: string
    confidence: string
    style_notes: string
    sample_phrases: string[]
  }
  tone_adjectives: string[]
  target_audience: {
    age_range: string
    gender_skew: string
    interests: string[]
    pain_points: string[]
    income_bracket: string
    psychographic: string
  }
  positioning: {
    statement: string
    category: string
    differentiator: string
    price_positioning: string
  }
  products: {
    name: string
    description: string
    price: string | null
    currency: string
    image_url: string | null
    category: string
    is_bestseller: boolean
  }[]
  visual_identity: {
    primary_colors: string[]
    secondary_colors: string[]
    font_families: string[]
    font_style: string
    logo_url: string | null
    aesthetic: string
  }
  brand_story: string | null
  key_themes: string[]
  trust_signals: string[]
  social_links: Record<string, string | null>
  technology_signals: {
    platform: string
    detected_tools: string[]
  }
  extraction_confidence: Record<string, number>
}

export interface ExtractionProgress {
  step: 'crawling' | 'extracting' | 'quality_check' | 'storing'
  message: string
  progress: number
}

export type ProgressCallback = (progress: ExtractionProgress) => void

export interface ExtractionResult {
  brandDna: BrandDna
  pagesScraped: number
  reExtracted: boolean
}

// ---------------------------------------------------------------------------
// System prompt for brand extraction
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a brand intelligence analyst. Extract comprehensive brand DNA from scraped website content. Return valid JSON only matching the exact schema provided.

Be thorough — extract everything observable from the content. Analyze writing style, word choice, sentence structure to determine voice. Look at product names, descriptions, pricing to understand positioning. Identify colors, fonts, and visual patterns.

If a field cannot be determined from the available content, set it to null with the extraction_confidence for that field set below 50.

CRITICAL: Return ONLY valid JSON. No markdown, no explanation, no code fences.`

// ---------------------------------------------------------------------------
// Build user prompt from crawled data
// ---------------------------------------------------------------------------

function buildExtractionPrompt(
  crawlResult: CrawlResult,
  visualData: ReturnType<typeof extractVisualData>,
  brandName: string,
): string {
  const parts: string[] = []

  parts.push(`# Brand: ${brandName}\n`)

  // Structured data from all pages
  const allJsonLd = crawlResult.pages.flatMap(p => p.jsonLd)
  if (allJsonLd.length > 0) {
    parts.push(`## Structured Data (JSON-LD)\n${JSON.stringify(allJsonLd, null, 2).slice(0, 3000)}\n`)
  }

  // Metadata from all pages
  const metaParts: string[] = []
  for (const page of crawlResult.pages) {
    const m = page.metadata
    if (m.title || m.description || m.ogTitle) {
      metaParts.push(`### ${page.url}\nTitle: ${m.title || 'N/A'}\nDescription: ${m.description || 'N/A'}\nOG Title: ${m.ogTitle || 'N/A'}\nOG Description: ${m.ogDescription || 'N/A'}`)
    }
  }
  if (metaParts.length > 0) {
    parts.push(`## Page Metadata\n${metaParts.join('\n\n')}`)
  }

  // Visual data
  parts.push(`## Visual Data Extracted from CSS/HTML\nFonts found: ${visualData.fontFamilies.join(', ') || 'none detected'}\nColors found: ${visualData.colors.join(', ') || 'none detected'}\nLogo URL: ${visualData.logoUrl || 'not detected'}\nTheme color: ${visualData.themeColor || 'not detected'}`)

  // Page content (truncated to fit context)
  let totalTokensBudget = 8000
  for (const page of crawlResult.pages) {
    if (totalTokensBudget <= 0) break
    const content = page.markdown.slice(0, totalTokensBudget)
    parts.push(`## Page Content: ${page.url}\n${content}`)
    totalTokensBudget -= content.length
  }

  parts.push(`## Required Output Schema

Return a JSON object with these exact keys:
{
  "brand_voice": { "formality": "casual|conversational|professional|formal", "warmth": "cold|neutral|warm|intimate", "humor": "none|subtle|moderate|playful", "confidence": "humble|balanced|confident|bold", "style_notes": "string", "sample_phrases": ["string"] },
  "tone_adjectives": ["string"],
  "target_audience": { "age_range": "string", "gender_skew": "female-leaning|male-leaning|neutral", "interests": ["string"], "pain_points": ["string"], "income_bracket": "mid|mid-high|high|luxury", "psychographic": "string" },
  "positioning": { "statement": "string", "category": "string", "differentiator": "string", "price_positioning": "budget|value|mid|premium|luxury" },
  "products": [{ "name": "string", "description": "string", "price": "string or null", "currency": "string", "image_url": "string or null", "category": "string", "is_bestseller": false }],
  "visual_identity": { "primary_colors": ["#hex"], "secondary_colors": ["#hex"], "font_families": ["string"], "font_style": "modern-sans|classic-serif|mixed|custom", "logo_url": "string or null", "aesthetic": "string" },
  "brand_story": "string or null",
  "key_themes": ["string"],
  "trust_signals": ["string"],
  "social_links": { "instagram": "url or null", "tiktok": "url or null", "facebook": "url or null", "twitter": "url or null", "youtube": "url or null" },
  "technology_signals": { "platform": "shopify|woocommerce|custom|squarespace|other", "detected_tools": ["string"] },
  "extraction_confidence": { "overall": 0-100, "brand_voice": 0-100, "products": 0-100, "visual_identity": 0-100, "target_audience": 0-100, "positioning": 0-100 }
}`)

  return parts.join('\n\n')
}

// ---------------------------------------------------------------------------
// Quality gate: check confidence scores, decide re-crawl paths
// ---------------------------------------------------------------------------

interface ReExtractAction {
  field: string
  paths: string[]
}

function qualityGate(dna: BrandDna): ReExtractAction[] {
  const actions: ReExtractAction[] = []
  const confidence = dna.extraction_confidence

  if ((confidence.products ?? 0) < 60) {
    actions.push({ field: 'products', paths: ['/collections/all', '/products', '/shop', '/collections'] })
  }
  if ((confidence.brand_voice ?? 0) < 60) {
    actions.push({ field: 'brand_voice', paths: ['/about', '/about-us', '/our-story', '/pages/about'] })
  }
  if ((confidence.target_audience ?? 0) < 60) {
    actions.push({ field: 'target_audience', paths: ['/about', '/about-us'] })
  }
  if ((confidence.positioning ?? 0) < 60) {
    actions.push({ field: 'positioning', paths: ['/about', '/about-us'] })
  }

  return actions
}

// ---------------------------------------------------------------------------
// Store extraction results to Supabase
// ---------------------------------------------------------------------------

async function storeExtractionResults(
  brandId: string,
  dna: BrandDna,
): Promise<void> {
  const admin = createServiceClient()

  // 1. Update brands table
  await admin.from('brands').update({
    product_context: { products: dna.products, technology: dna.technology_signals },
    brand_guidelines: dna,
    updated_at: new Date().toISOString(),
  }).eq('id', brandId)

  // 2. Upsert brand_guidelines table
  await admin.from('brand_guidelines').upsert({
    brand_id: brandId,
    voice_tone: dna.brand_voice,
    target_audience: dna.target_audience,
    positioning: dna.positioning.statement,
    do_say: dna.tone_adjectives,
    dont_say: [],
    colors: {
      primary: dna.visual_identity.primary_colors,
      secondary: dna.visual_identity.secondary_colors,
    },
    typography: {
      families: dna.visual_identity.font_families,
      style: dna.visual_identity.font_style,
    },
    brand_story: dna.brand_story,
  }, { onConflict: 'brand_id' })

  // 3. Create knowledge nodes for products
  for (const product of dna.products.slice(0, 30)) {
    await admin.from('knowledge_nodes').insert({
      brand_id: brandId,
      node_type: 'product',
      name: product.name.slice(0, 255),
      summary: product.description?.slice(0, 500) || product.name,
      properties: {
        price: product.price,
        currency: product.currency,
        image_url: product.image_url,
        category: product.category,
        is_bestseller: product.is_bestseller,
      },
      confidence: (dna.extraction_confidence.products ?? 50) / 100,
      source_skill: 'brand-extraction',
      source_run_id: null,
      is_active: true,
    })
  }

  // 4. Create knowledge node for brand guidelines
  await admin.from('knowledge_nodes').insert({
    brand_id: brandId,
    node_type: 'brand_guidelines',
    name: 'Brand DNA — Web Extraction',
    summary: `Brand voice: ${dna.brand_voice.formality}, ${dna.brand_voice.warmth}. Positioning: ${dna.positioning.statement?.slice(0, 200)}`,
    properties: {
      voice: dna.brand_voice,
      visual: dna.visual_identity,
      audience: dna.target_audience,
      themes: dna.key_themes,
    },
    confidence: (dna.extraction_confidence.overall ?? 50) / 100,
    source_skill: 'brand-extraction',
    source_run_id: null,
    is_active: true,
  })
}

// ---------------------------------------------------------------------------
// Main extraction pipeline
// ---------------------------------------------------------------------------

export async function extractBrandDna(
  brandId: string,
  domain: string,
  brandName: string,
  onProgress?: ProgressCallback,
): Promise<ExtractionResult> {
  const emit = onProgress ?? (() => {})

  // --- Phase 1: Crawl ---
  emit({ step: 'crawling', message: 'Crawling website...', progress: 5 })

  const crawlResult = await crawlSite(domain, { limit: 5 })

  emit({
    step: 'crawling',
    message: `Crawled ${crawlResult.totalCrawled} pages.`,
    progress: 25,
  })

  // Extract visual data from all HTML
  const allHtml = crawlResult.pages.map(p => p.html).join('\n')
  const visualData = extractVisualData(allHtml)

  // --- Phase 2: LLM Extraction ---
  emit({ step: 'extracting', message: 'Analyzing brand voice, products, and visual identity...', progress: 35 })

  const userPrompt = buildExtractionPrompt(crawlResult, visualData, brandName)

  const llmResult = await callModel({
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 4096,
    temperature: 0.2,
  })

  let dna: BrandDna
  try {
    // Strip markdown code fences if present
    const cleaned = llmResult.content.replace(/^```json?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim()
    dna = JSON.parse(cleaned) as BrandDna
  } catch {
    throw new Error('Failed to parse Brand DNA from AI response')
  }

  // Merge CSS-extracted visual data (AI may miss some)
  if (visualData.logoUrl && !dna.visual_identity.logo_url) {
    dna.visual_identity.logo_url = visualData.logoUrl
  }
  if (visualData.fontFamilies.length > 0 && dna.visual_identity.font_families.length === 0) {
    dna.visual_identity.font_families = visualData.fontFamilies
  }
  if (visualData.colors.length > 0 && dna.visual_identity.primary_colors.length === 0) {
    dna.visual_identity.primary_colors = visualData.colors.slice(0, 3)
    dna.visual_identity.secondary_colors = visualData.colors.slice(3, 6)
  }

  emit({ step: 'extracting', message: 'Brand DNA extracted.', progress: 60 })

  // --- Phase 3: Quality Gate ---
  emit({ step: 'quality_check', message: 'Verifying extraction quality...', progress: 65 })

  const reExtractActions = qualityGate(dna)
  let reExtracted = false

  if (reExtractActions.length > 0) {
    emit({
      step: 'quality_check',
      message: `Low confidence on: ${reExtractActions.map(a => a.field).join(', ')}. Re-crawling...`,
      progress: 70,
    })

    // Gather unique paths to re-crawl
    const pathsToTry = [...new Set(reExtractActions.flatMap(a => a.paths))]
    const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`
    const base = new URL(baseUrl)

    const additionalPages: PageResult[] = []
    for (const path of pathsToTry.slice(0, 4)) {
      try {
        const page = await scrapePage(`${base.origin}${path}`)
        if (page.markdown.length > 100) additionalPages.push(page)
      } catch { /* skip 404s */ }
    }

    if (additionalPages.length > 0) {
      // Re-run extraction with additional content
      const combinedCrawl: CrawlResult = {
        pages: [...crawlResult.pages, ...additionalPages],
        totalCrawled: crawlResult.totalCrawled + additionalPages.length,
      }

      const rePrompt = buildExtractionPrompt(combinedCrawl, visualData, brandName)
      const reLlm = await callModel({
        model: 'claude-sonnet-4-20250514',
        provider: 'anthropic',
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: rePrompt,
        maxTokens: 4096,
        temperature: 0.2,
      })

      try {
        const cleaned = reLlm.content.replace(/^```json?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim()
        dna = JSON.parse(cleaned) as BrandDna
        reExtracted = true
      } catch { /* keep original extraction */ }
    }
  }

  emit({ step: 'quality_check', message: 'Quality check complete.', progress: 80 })

  // --- Phase 4: Store ---
  emit({ step: 'storing', message: 'Saving brand intelligence...', progress: 85 })

  await storeExtractionResults(brandId, dna)

  emit({ step: 'storing', message: 'Brand DNA saved.', progress: 100 })

  return {
    brandDna: dna,
    pagesScraped: crawlResult.totalCrawled,
    reExtracted,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/brand-extractor.ts
git commit -m "feat: add brand DNA extraction pipeline with quality gate"
```

---

### Task 4: Create SSE API Route for Live Extraction

**Files:**
- Create: `src/app/api/onboarding/extract-brand/route.ts`

- [ ] **Step 1: Create the SSE route**

```typescript
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { extractBrandDna, type ExtractionProgress } from '@/lib/brand-extractor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // 1. Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 2. Parse body
  let body: { brandId: string; domain: string }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { brandId, domain } = body
  if (!brandId || !domain) {
    return new Response(JSON.stringify({ error: 'brandId and domain are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 3. Verify brand access
  const admin = createServiceClient()
  const { data: brand } = await admin
    .from('brands')
    .select('id, name, owner_id')
    .eq('id', brandId)
    .single()

  if (!brand || brand.owner_id !== user.id) {
    return new Response(JSON.stringify({ error: 'Brand not found or access denied' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 4. Create SSE stream
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      const onProgress = (progress: ExtractionProgress) => {
        send('progress', progress)
      }

      try {
        const result = await extractBrandDna(brandId, domain, brand.name, onProgress)
        send('complete', {
          brandDna: result.brandDna,
          pagesScraped: result.pagesScraped,
          reExtracted: result.reExtracted,
        })
      } catch (err) {
        send('error', {
          message: err instanceof Error ? err.message : 'Extraction failed',
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/onboarding/extract-brand/route.ts
git commit -m "feat: add SSE endpoint for live brand extraction"
```

---

### Task 5: Create Extraction Progress Page (Onboarding Step 2a)

**Files:**
- Create: `src/app/onboarding/extraction/page.tsx`

- [ ] **Step 1: Create the extraction progress page**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface LogLine {
  ts: string
  msg: string
  level: 'info' | 'ok' | 'error'
}

function ts() {
  return new Date().toLocaleTimeString('en-US', { hour12: false })
}

export default function ExtractionPage() {
  const router = useRouter()
  const [logs, setLogs] = useState<LogLine[]>([])
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<'running' | 'done' | 'error'>('running')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const hasStarted = useRef(false)

  const addLog = (msg: string, level: LogLine['level'] = 'info') => {
    setLogs(prev => [...prev, { ts: ts(), msg, level }])
  }

  useEffect(() => {
    if (hasStarted.current) return
    hasStarted.current = true

    const brandId = sessionStorage.getItem('onboarding_brand_id')
    const domain = sessionStorage.getItem('onboarding_domain')

    if (!brandId || !domain) {
      setErrorMsg('Missing brand data. Please go back and enter your website URL.')
      setStatus('error')
      return
    }

    addLog('Starting brand extraction...')

    fetch('/api/onboarding/extract-brand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId, domain }),
    }).then(async (res) => {
      if (!res.ok || !res.body) {
        const err = await res.text()
        addLog(`Error: ${err}`, 'error')
        setErrorMsg(err)
        setStatus('error')
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let currentEvent = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7)
          } else if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6))

            if (currentEvent === 'progress') {
              setProgress(data.progress)
              addLog(data.message, 'info')
            } else if (currentEvent === 'complete') {
              setProgress(100)
              addLog('Brand DNA extraction complete!', 'ok')
              sessionStorage.setItem('onboarding_brand_dna', JSON.stringify(data.brandDna))
              setStatus('done')
              // Auto-navigate to review after short delay
              setTimeout(() => router.push('/onboarding/review'), 1000)
            } else if (currentEvent === 'error') {
              addLog(`Error: ${data.message}`, 'error')
              setErrorMsg(data.message)
              setStatus('error')
            }
          }
        }
      }
    }).catch(err => {
      addLog(`Network error: ${err.message}`, 'error')
      setErrorMsg('Failed to connect to extraction service.')
      setStatus('error')
    })
  }, [router])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div className="w-full max-w-2xl animate-slide-up">
      {/* Step badge */}
      <div className="flex justify-center mb-6">
        <span
          className="text-xs font-metric font-medium tracking-widest uppercase px-3 py-1 rounded-full border"
          style={{ borderColor: 'oklch(1 0 0 / 15%)', color: 'oklch(0.65 0.02 243)', background: 'oklch(1 0 0 / 4%)' }}
        >
          Step 2 of 5
        </span>
      </div>

      {/* Heading */}
      <div className="text-center mb-10">
        <div className="flex justify-center mb-4">
          <div style={{ filter: 'drop-shadow(0 0 15px rgba(99,102,241,0.3))' }}>
            <AgentAvatar agentId="mia" size="lg" state={status === 'running' ? 'working' : 'default'} />
          </div>
        </div>
        <h1 className="font-heading font-bold text-3xl sm:text-4xl text-foreground mb-4 tracking-tight">
          {status === 'error' ? 'Extraction Failed' : 'Learning Your Brand'}
        </h1>
        <p className="text-muted-foreground text-base max-w-md mx-auto leading-relaxed">
          {status === 'running'
            ? 'Mia is crawling your website and extracting your brand DNA...'
            : status === 'done'
              ? 'Brand DNA extracted! Redirecting to review...'
              : errorMsg}
        </p>
      </div>

      {/* Progress + Terminal */}
      <div className="glass-panel rounded-2xl p-6 space-y-4 mb-8">
        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>Extraction progress</span>
            <span className="font-metric">{progress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                background: status === 'error'
                  ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                  : 'linear-gradient(90deg, #6366f1, #0d9488)',
              }}
            />
          </div>
        </div>

        {/* Terminal */}
        <div
          className="rounded-xl p-4 font-mono text-xs space-y-1.5 max-h-48 overflow-y-auto"
          style={{ background: 'oklch(0.12 0.03 243)', color: '#94a3b8' }}
        >
          {logs.map((line, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-[#475569] flex-shrink-0">{line.ts}</span>
              <span className={line.level === 'ok' ? 'text-[#10b981]' : line.level === 'error' ? 'text-red-400' : 'text-[#94a3b8]'}>
                {line.msg}
              </span>
            </div>
          ))}
          {status === 'running' && (
            <div className="flex gap-2">
              <span className="text-[#475569]">{ts()}</span>
              <span className="text-[#6366f1] animate-pulse">█</span>
            </div>
          )}
          <div ref={logsEndRef} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-center gap-4">
        {status === 'running' && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            This usually takes 30-60 seconds...
          </div>
        )}
        {status === 'error' && (
          <>
            <Button variant="outline" onClick={() => router.push('/onboarding/connect-store')} className="gap-2 border-border/50">
              Go Back
            </Button>
            <Button onClick={() => window.location.reload()} className="gap-2 bg-[#6366f1] hover:bg-[#5254cc] text-white font-semibold">
              Retry
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/onboarding/extraction/page.tsx
git commit -m "feat: add live extraction progress page for onboarding"
```

---

### Task 6: Create Brand DNA Review Page (Onboarding Step 2b)

**Files:**
- Create: `src/app/onboarding/review/page.tsx`

- [ ] **Step 1: Create the review page**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Palette, Type, Users, Target, Package, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AgentAvatar } from '@/components/agents/agent-avatar'

interface BrandDna {
  brand_voice: { formality: string; warmth: string; humor: string; confidence: string; style_notes: string; sample_phrases: string[] }
  tone_adjectives: string[]
  target_audience: { age_range: string; gender_skew: string; interests: string[]; pain_points: string[]; income_bracket: string; psychographic: string }
  positioning: { statement: string; category: string; differentiator: string; price_positioning: string }
  products: { name: string; description: string; price: string | null; image_url: string | null; category: string }[]
  visual_identity: { primary_colors: string[]; secondary_colors: string[]; font_families: string[]; logo_url: string | null; aesthetic: string }
  brand_story: string | null
  key_themes: string[]
  trust_signals: string[]
  extraction_confidence: Record<string, number>
}

export default function ReviewPage() {
  const router = useRouter()
  const [dna, setDna] = useState<BrandDna | null>(null)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  useEffect(() => {
    const raw = sessionStorage.getItem('onboarding_brand_dna')
    if (!raw) {
      router.push('/onboarding/connect-store')
      return
    }
    try {
      setDna(JSON.parse(raw))
    } catch {
      router.push('/onboarding/connect-store')
    }
  }, [router])

  if (!dna) return null

  const startEdit = (field: string, value: string) => {
    setEditingField(field)
    setEditValue(value)
  }

  const saveEdit = () => {
    if (!editingField || !dna) return
    const updated = { ...dna }
    if (editingField === 'positioning') updated.positioning.statement = editValue
    else if (editingField === 'brand_story') updated.brand_story = editValue
    else if (editingField === 'style_notes') updated.brand_voice.style_notes = editValue
    setDna(updated)
    sessionStorage.setItem('onboarding_brand_dna', JSON.stringify(updated))
    setEditingField(null)
  }

  const overallConf = dna.extraction_confidence?.overall ?? 0

  return (
    <div className="w-full max-w-5xl animate-slide-up">
      {/* Step badge */}
      <div className="flex justify-center mb-6">
        <span className="text-xs font-metric font-medium tracking-widest uppercase px-3 py-1 rounded-full border" style={{ borderColor: 'oklch(1 0 0 / 15%)', color: 'oklch(0.65 0.02 243)', background: 'oklch(1 0 0 / 4%)' }}>
          Step 2 of 5 — Review
        </span>
      </div>

      {/* Heading */}
      <div className="text-center mb-8">
        <div className="flex justify-center mb-3">
          <AgentAvatar agentId="mia" size="md" />
        </div>
        <h1 className="font-heading font-bold text-2xl sm:text-3xl text-foreground mb-2 tracking-tight">
          Your Brand DNA
        </h1>
        <p className="text-muted-foreground text-sm max-w-lg mx-auto">
          Mia extracted this from your website. Review and edit anything that doesn&apos;t look right.
          <span className="font-metric ml-2 text-xs" style={{ color: overallConf > 70 ? '#10b981' : '#f97316' }}>
            {overallConf}% confidence
          </span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Brand Voice */}
        <div className="glass-panel rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-heading font-semibold text-foreground">
            <Type className="w-4 h-4 text-[#6366f1]" />
            Brand Voice
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white/5 rounded-lg px-3 py-2"><span className="text-muted-foreground">Formality:</span> <span className="text-foreground capitalize">{dna.brand_voice.formality}</span></div>
            <div className="bg-white/5 rounded-lg px-3 py-2"><span className="text-muted-foreground">Warmth:</span> <span className="text-foreground capitalize">{dna.brand_voice.warmth}</span></div>
            <div className="bg-white/5 rounded-lg px-3 py-2"><span className="text-muted-foreground">Humor:</span> <span className="text-foreground capitalize">{dna.brand_voice.humor}</span></div>
            <div className="bg-white/5 rounded-lg px-3 py-2"><span className="text-muted-foreground">Confidence:</span> <span className="text-foreground capitalize">{dna.brand_voice.confidence}</span></div>
          </div>
          {editingField === 'style_notes' ? (
            <div className="space-y-2">
              <textarea value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full bg-white/5 border border-border/50 rounded-lg px-3 py-2 text-xs text-foreground resize-none" rows={3} />
              <div className="flex gap-2">
                <button onClick={saveEdit} className="text-xs text-[#10b981] hover:underline">Save</button>
                <button onClick={() => setEditingField(null)} className="text-xs text-muted-foreground hover:underline">Cancel</button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground leading-relaxed cursor-pointer hover:text-foreground transition-colors" onClick={() => startEdit('style_notes', dna.brand_voice.style_notes)}>
              {dna.brand_voice.style_notes} <span className="text-[#6366f1] text-[10px]">edit</span>
            </p>
          )}
          {dna.tone_adjectives.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {dna.tone_adjectives.map((adj, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-[#6366f1]/10 text-[#6366f1]">{adj}</span>
              ))}
            </div>
          )}
        </div>

        {/* Visual Identity */}
        <div className="glass-panel rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-heading font-semibold text-foreground">
            <Palette className="w-4 h-4 text-[#f97316]" />
            Visual Identity
          </div>
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Colors</div>
            <div className="flex gap-2 flex-wrap">
              {[...dna.visual_identity.primary_colors, ...dna.visual_identity.secondary_colors].map((color, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-md border border-white/10" style={{ background: color }} />
                  <span className="text-[10px] font-metric text-muted-foreground">{color}</span>
                </div>
              ))}
              {dna.visual_identity.primary_colors.length === 0 && <span className="text-xs text-muted-foreground">No colors detected</span>}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Fonts</div>
            <div className="flex flex-wrap gap-1.5">
              {dna.visual_identity.font_families.map((font, i) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-foreground">{font}</span>
              ))}
              {dna.visual_identity.font_families.length === 0 && <span className="text-xs text-muted-foreground">No fonts detected</span>}
            </div>
          </div>
          <div className="text-xs"><span className="text-muted-foreground">Aesthetic:</span> <span className="text-foreground">{dna.visual_identity.aesthetic}</span></div>
        </div>

        {/* Positioning */}
        <div className="glass-panel rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-heading font-semibold text-foreground">
            <Target className="w-4 h-4 text-[#10b981]" />
            Positioning
          </div>
          {editingField === 'positioning' ? (
            <div className="space-y-2">
              <textarea value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full bg-white/5 border border-border/50 rounded-lg px-3 py-2 text-xs text-foreground resize-none" rows={2} />
              <div className="flex gap-2">
                <button onClick={saveEdit} className="text-xs text-[#10b981] hover:underline">Save</button>
                <button onClick={() => setEditingField(null)} className="text-xs text-muted-foreground hover:underline">Cancel</button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-foreground cursor-pointer hover:text-[#6366f1] transition-colors" onClick={() => startEdit('positioning', dna.positioning.statement)}>
              &ldquo;{dna.positioning.statement}&rdquo; <span className="text-[#6366f1] text-[10px]">edit</span>
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white/5 rounded-lg px-3 py-2"><span className="text-muted-foreground">Category:</span> <span className="text-foreground">{dna.positioning.category}</span></div>
            <div className="bg-white/5 rounded-lg px-3 py-2"><span className="text-muted-foreground">Price:</span> <span className="text-foreground capitalize">{dna.positioning.price_positioning}</span></div>
          </div>
          <p className="text-xs text-muted-foreground">{dna.positioning.differentiator}</p>
        </div>

        {/* Target Audience */}
        <div className="glass-panel rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-heading font-semibold text-foreground">
            <Users className="w-4 h-4 text-[#8b5cf6]" />
            Target Audience
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white/5 rounded-lg px-3 py-2"><span className="text-muted-foreground">Age:</span> <span className="text-foreground">{dna.target_audience.age_range}</span></div>
            <div className="bg-white/5 rounded-lg px-3 py-2"><span className="text-muted-foreground">Skew:</span> <span className="text-foreground capitalize">{dna.target_audience.gender_skew}</span></div>
            <div className="bg-white/5 rounded-lg px-3 py-2"><span className="text-muted-foreground">Income:</span> <span className="text-foreground capitalize">{dna.target_audience.income_bracket}</span></div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{dna.target_audience.psychographic}</p>
          <div className="flex flex-wrap gap-1.5">
            {dna.target_audience.interests.map((int, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-[#8b5cf6]/10 text-[#8b5cf6]">{int}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Products */}
      {dna.products.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm font-heading font-semibold text-foreground mb-3">
            <Package className="w-4 h-4 text-[#0d9488]" />
            Products Found ({dna.products.length})
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {dna.products.slice(0, 12).map((p, i) => (
              <div key={i} className="glass-panel rounded-xl p-3 space-y-2">
                {p.image_url && (
                  <div className="aspect-square rounded-lg bg-white/5 overflow-hidden">
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                  </div>
                )}
                <p className="text-xs font-medium text-foreground line-clamp-2">{p.name}</p>
                {p.price && <p className="text-[10px] font-metric text-muted-foreground">{p.price}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key Themes & Trust Signals */}
      {(dna.key_themes.length > 0 || dna.trust_signals.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {dna.key_themes.length > 0 && (
            <div className="glass-panel rounded-xl p-4">
              <p className="text-xs font-semibold text-foreground mb-2">Key Themes</p>
              <div className="flex flex-wrap gap-1.5">
                {dna.key_themes.map((t, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-[#0d9488]/10 text-[#0d9488]">{t}</span>
                ))}
              </div>
            </div>
          )}
          {dna.trust_signals.length > 0 && (
            <div className="glass-panel rounded-xl p-4">
              <p className="text-xs font-semibold text-foreground mb-2">Trust Signals</p>
              <div className="flex flex-wrap gap-1.5">
                {dna.trust_signals.map((t, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-[#10b981]/10 text-[#10b981]">{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between gap-4">
        <Button variant="outline" onClick={() => router.push('/onboarding/connect-store')} className="gap-2 border-border/50 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => { sessionStorage.removeItem('onboarding_brand_dna'); router.push('/onboarding/extraction') }} className="gap-2 border-border/50 text-muted-foreground hover:text-foreground">
            <RefreshCw className="w-4 h-4" />
            Re-scan
          </Button>
          <Button onClick={() => router.push('/onboarding/focus')} className="gap-2 bg-[#6366f1] hover:bg-[#5254cc] text-white font-semibold px-8">
            Looks Good
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/onboarding/review/page.tsx
git commit -m "feat: add Brand DNA review page for onboarding"
```

---

### Task 7: Update Onboarding Flow — Layout, Connect-Store Redirect, Step Counts

**Files:**
- Modify: `src/app/onboarding/layout.tsx`
- Modify: `src/app/onboarding/connect-store/page.tsx`
- Modify: `src/app/onboarding/focus/page.tsx` (step badge only)
- Modify: `src/app/onboarding/platforms/page.tsx` (step badge only)
- Delete diagnosis step reference (keep page for now but remove from STEPS)

- [ ] **Step 1: Update layout.tsx STEPS array**

In `src/app/onboarding/layout.tsx`, replace the STEPS array (lines 8-13):

```typescript
const STEPS = [
  { path: 'connect-store', label: 'Connect Store' },
  { path: 'extraction', label: 'Brand DNA' },
  { path: 'review', label: 'Review' },
  { path: 'focus', label: 'Pick Focus' },
  { path: 'platforms', label: 'Ad Platforms' },
]
```

- [ ] **Step 2: Update connect-store page to redirect to extraction**

In `src/app/onboarding/connect-store/page.tsx`, in the `handleManualSubmit` function, after `sessionStorage.setItem('onboarding_brand_id', brandId)` (approximately line 77), add:

```typescript
sessionStorage.setItem('onboarding_domain', domain)
router.push('/onboarding/extraction')
```

Replace the existing `router.push('/onboarding/focus')` with the above.

Also in `handleShopifyConnect`, after `sessionStorage.setItem('onboarding_brand_id', brandId)` (approximately line 42), add:

```typescript
sessionStorage.setItem('onboarding_domain', domain || shopifyDomain)
```

- [ ] **Step 3: Update step badge numbers**

In `src/app/onboarding/focus/page.tsx`, find the step badge text and change from "Step 2 of 4" to "Step 4 of 5".

In `src/app/onboarding/platforms/page.tsx`, find the step badge text and change from "Step 3 of 4" to "Step 5 of 5".

- [ ] **Step 4: Commit**

```bash
git add src/app/onboarding/layout.tsx src/app/onboarding/connect-store/page.tsx src/app/onboarding/focus/page.tsx src/app/onboarding/platforms/page.tsx
git commit -m "feat: rewire onboarding flow — extraction + review after connect-store"
```

---

### Task 8: Update .env.local.example with All New Variables

**Files:**
- Modify: `growth-os/.env.local.example`

- [ ] **Step 1: Add Firecrawl section to .env.local.example**

Add after the `FAL_AI_KEY` section:

```
# Firecrawl — AI web crawling for brand extraction (Phase 1)
# Get your key from https://firecrawl.dev — 500 free credits/month
FIRECRAWL_API_KEY=

# DataForSEO — traffic & SEO intelligence (Phase 3: Echo)
# Sign up at https://dataforseo.com — pay-as-you-go pricing
DATAFORSEO_LOGIN=
DATAFORSEO_PASSWORD=

# NewsAPI — competitor shutdown/news monitoring (Phase 4: Echo)
# Get your key from https://newsapi.org — 100 free requests/day
NEWSAPI_KEY=
```

- [ ] **Step 2: Commit**

```bash
git add .env.local.example
git commit -m "docs: add Phase 1-4 env vars to .env.local.example"
```

---

### Task 9: Remove Debug Logging from Proxy

**Files:**
- Modify: `src/proxy.ts`

- [ ] **Step 1: Remove the debug console.log added earlier**

In `src/proxy.ts`, remove the debug block that starts with `// Debug auth — remove once login is working`.

- [ ] **Step 2: Commit**

```bash
git add src/proxy.ts
git commit -m "chore: remove auth debug logging from proxy"
```

---

## Phase 1 Complete Checklist

After all 9 tasks:

- [ ] `@mendable/firecrawl-js` installed
- [ ] `FIRECRAWL_API_KEY` env var set locally and on Vercel
- [ ] `src/lib/firecrawl-client.ts` — crawl/scrape with Jina fallback
- [ ] `src/lib/brand-extractor.ts` — full pipeline: crawl → extract → quality gate → store
- [ ] `src/app/api/onboarding/extract-brand/route.ts` — SSE endpoint
- [ ] `src/app/onboarding/extraction/page.tsx` — live progress UI
- [ ] `src/app/onboarding/review/page.tsx` — Brand DNA review with inline editing
- [ ] Onboarding flow rewired: connect-store → extraction → review → focus → platforms
- [ ] Step badges updated to "Step N of 5"
- [ ] Proxy debug logging removed

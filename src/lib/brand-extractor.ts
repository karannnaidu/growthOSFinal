import 'server-only'

import { crawlSite, scrapePage, extractVisualData } from '@/lib/firecrawl-client'
import type { CrawlResult, PageResult, VisualData } from '@/lib/firecrawl-client'
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
  technology_signals: { platform: string; detected_tools: string[] }
  extraction_confidence: Record<string, number>
}

export interface CompetitorSnapshot {
  name: string
  domain: string
  type: 'direct' | 'market_cohort'
  tagline: string
  positioning: string
  product_categories: string[]
  price_positioning: string
  estimated_size: string
  why_competitor: string
  social_links: Record<string, string | null>
  platform: string
}

export interface ExtractionProgress {
  step: 'crawling' | 'extracting' | 'quality_check' | 'competitors' | 'storing'
  message: string
  progress: number
}

export type ProgressCallback = (progress: ExtractionProgress) => void

export interface ExtractionResult {
  brandDna: BrandDna
  pagesScraped: number
  reExtracted: boolean
  competitors: CompetitorSnapshot[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BRAND_DNA_SCHEMA = `{
  "brand_voice": {
    "formality": "string (casual/neutral/formal)",
    "warmth": "string (cold/neutral/warm)",
    "humor": "string (none/subtle/playful/bold)",
    "confidence": "string (humble/balanced/bold/authoritative)",
    "style_notes": "string",
    "sample_phrases": ["string"]
  },
  "tone_adjectives": ["string"],
  "target_audience": {
    "age_range": "string (e.g. 25-40)",
    "gender_skew": "string (male/female/neutral)",
    "interests": ["string"],
    "pain_points": ["string"],
    "income_bracket": "string",
    "psychographic": "string"
  },
  "positioning": {
    "statement": "string",
    "category": "string",
    "differentiator": "string",
    "price_positioning": "string (budget/mid-range/premium/luxury)"
  },
  "products": [
    {
      "name": "string",
      "description": "string",
      "price": "string|null",
      "currency": "string (e.g. USD, INR)",
      "image_url": "string|null",
      "category": "string",
      "is_bestseller": "boolean"
    }
  ],
  "visual_identity": {
    "primary_colors": ["hex string"],
    "secondary_colors": ["hex string"],
    "font_families": ["string"],
    "font_style": "string",
    "logo_url": "string|null",
    "aesthetic": "string"
  },
  "brand_story": "string|null",
  "key_themes": ["string"],
  "trust_signals": ["string"],
  "social_links": { "instagram": "url|null", "facebook": "url|null", "twitter": "url|null", "linkedin": "url|null", "youtube": "url|null", "tiktok": "url|null" },
  "technology_signals": { "platform": "string (shopify/woocommerce/custom/etc)", "detected_tools": ["string"] },
  "extraction_confidence": { "brand_voice": 0-100, "target_audience": 0-100, "positioning": 0-100, "products": 0-100, "visual_identity": 0-100 }
}`

const SYSTEM_PROMPT =
  'You are a brand intelligence analyst. Extract comprehensive brand DNA from scraped website content. Return valid JSON only matching the exact schema provided.'

const CONTENT_BUDGET = 8000

const QUALITY_THRESHOLD = 60

const RECRAWL_PATHS = [
  '/collections/all',
  '/collections',
  '/products',
  '/shop',
  '/about',
  '/about-us',
  '/pages/about',
  '/pages/about-us',
  '/pages/our-story',
]

const WEAK_FIELD_PATH_MAP: Record<string, string[]> = {
  products: ['/collections/all', '/collections', '/products', '/shop'],
  brand_voice: ['/about', '/about-us', '/pages/about', '/pages/our-story'],
  target_audience: ['/about', '/about-us', '/pages/about'],
  positioning: ['/about', '/about-us', '/pages/about', '/pages/our-story'],
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildExtractionPrompt(
  pages: PageResult[],
  visualData: VisualData[],
  brandName: string,
): string {
  const sections: string[] = []

  // JSON-LD data
  const allJsonLd = pages.flatMap((p) => p.jsonLd)
  if (allJsonLd.length > 0) {
    sections.push(`## JSON-LD Structured Data\n${JSON.stringify(allJsonLd, null, 1).slice(0, 2000)}`)
  }

  // Page metadata
  const metaLines = pages
    .map((p) => `- ${p.metadata.title ?? p.url}: ${p.metadata.description ?? '(no description)'}`)
    .join('\n')
  sections.push(`## Page Metadata\n${metaLines}`)

  // Visual data (merged from all pages)
  const mergedFonts = [...new Set(visualData.flatMap((v) => v.fontFamilies))]
  const mergedColors = [...new Set(visualData.flatMap((v) => v.colors))]
  const logos = visualData.map((v) => v.logoUrl).filter(Boolean)
  sections.push(
    `## Visual Data (CSS/HTML extraction)\nFonts: ${mergedFonts.join(', ') || 'none detected'}\nColors: ${mergedColors.join(', ') || 'none detected'}\nLogo URLs: ${logos.join(', ') || 'none detected'}`,
  )

  // Page content (truncated to budget)
  let charBudget = CONTENT_BUDGET
  const contentLines: string[] = []
  for (const page of pages) {
    if (charBudget <= 0) break
    const content = page.markdown || ''
    const truncated = content.slice(0, charBudget)
    contentLines.push(`### ${page.url}\n${truncated}`)
    charBudget -= truncated.length
  }
  sections.push(`## Page Content\n${contentLines.join('\n\n')}`)

  return `Extract the complete Brand DNA for "${brandName}" from the following scraped website data.\n\nReturn a single JSON object matching this exact schema:\n${BRAND_DNA_SCHEMA}\n\n${sections.join('\n\n')}`
}

// ---------------------------------------------------------------------------
// Visual data merging
// ---------------------------------------------------------------------------

function mergeVisualData(dna: BrandDna, visualData: VisualData[]): void {
  const mergedFonts = [...new Set(visualData.flatMap((v) => v.fontFamilies))]
  const mergedColors = [...new Set(visualData.flatMap((v) => v.colors))]
  const logo = visualData.find((v) => v.logoUrl)?.logoUrl ?? null

  if (dna.visual_identity.font_families.length === 0 && mergedFonts.length > 0) {
    dna.visual_identity.font_families = mergedFonts
  }

  if (dna.visual_identity.primary_colors.length === 0 && mergedColors.length > 0) {
    dna.visual_identity.primary_colors = mergedColors.slice(0, 3)
    dna.visual_identity.secondary_colors = mergedColors.slice(3, 6)
  }

  if (!dna.visual_identity.logo_url && logo) {
    dna.visual_identity.logo_url = logo
  }
}

// ---------------------------------------------------------------------------
// JSON parsing
// ---------------------------------------------------------------------------

function parseJsonResponse(content: string): BrandDna {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1]!.trim() : content.trim()
  return JSON.parse(raw) as BrandDna
}

// ---------------------------------------------------------------------------
// Quality gate
// ---------------------------------------------------------------------------

interface QualityCheckResult {
  passed: boolean
  weakFields: string[]
}

function checkQuality(dna: BrandDna): QualityCheckResult {
  const weakFields: string[] = []
  const fieldsToCheck = ['products', 'brand_voice', 'target_audience', 'positioning'] as const

  for (const field of fieldsToCheck) {
    const confidence = dna.extraction_confidence?.[field] ?? 0
    if (confidence < QUALITY_THRESHOLD) {
      weakFields.push(field)
    }
  }

  return { passed: weakFields.length === 0, weakFields }
}

function getRecrawlPaths(weakFields: string[]): string[] {
  const paths = new Set<string>()
  for (const field of weakFields) {
    const fieldPaths = WEAK_FIELD_PATH_MAP[field] ?? RECRAWL_PATHS
    for (const p of fieldPaths) paths.add(p)
  }
  return Array.from(paths)
}

// ---------------------------------------------------------------------------
// Competitor Discovery
// ---------------------------------------------------------------------------

const COMPETITOR_SYSTEM_PROMPT = `You are a market intelligence analyst. Given a brand's positioning, products, and category, identify their competitors. Return valid JSON only matching the exact schema. Be specific — use real company names and real domains you are confident exist. Do not invent companies.`

async function discoverCompetitors(
  dna: BrandDna,
  brandName: string,
  onProgress?: ProgressCallback,
): Promise<CompetitorSnapshot[]> {
  const emit = onProgress ?? (() => {})
  emit({ step: 'competitors', message: 'Identifying competitors...', progress: 82 })

  const userPrompt = `Brand: ${brandName}
Category: ${dna.positioning.category}
Positioning: ${dna.positioning.statement}
Price: ${dna.positioning.price_positioning}
Products: ${dna.products.slice(0, 5).map(p => p.name).join(', ')}
Key Themes: ${dna.key_themes.join(', ')}

Identify:
1. 3-5 nearest DIRECT competitors (same niche, similar size/stage)
2. 2-3 larger MARKET COHORT leaders (established players in this space)

Return JSON array:
[{
  "name": "string",
  "domain": "example.com",
  "type": "direct|market_cohort",
  "why_competitor": "string — one sentence",
  "estimated_size": "smaller|similar|larger|much_larger",
  "product_categories": ["string"]
}]

CRITICAL: Only include companies you are confident actually exist with real domains. Return ONLY valid JSON array.`

  const result = await callModel({
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    systemPrompt: COMPETITOR_SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 2048,
    temperature: 0.3,
  })

  let rawCompetitors: { name: string; domain: string; type: string; why_competitor: string; estimated_size: string; product_categories: string[] }[]
  try {
    const cleaned = result.content.replace(/^```json?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim()
    rawCompetitors = JSON.parse(cleaned)
    if (!Array.isArray(rawCompetitors)) rawCompetitors = []
  } catch {
    return []
  }

  const competitors: CompetitorSnapshot[] = []

  for (const raw of rawCompetitors.slice(0, 7)) {
    emit({ step: 'competitors', message: `Scanning ${raw.name}...`, progress: 85 })

    let tagline = ''
    let positioning = ''
    let socialLinks: Record<string, string | null> = {}
    let platform = 'unknown'

    try {
      const page = await scrapePage(raw.domain)
      tagline = page.metadata.description ?? page.metadata.ogDescription ?? ''
      positioning = page.metadata.ogTitle ?? page.metadata.title ?? ''

      const html = page.html.toLowerCase()
      if (html.includes('shopify') || html.includes('cdn.shopify.com')) platform = 'shopify'
      else if (html.includes('woocommerce') || html.includes('wp-content')) platform = 'woocommerce'
      else if (html.includes('squarespace')) platform = 'squarespace'
      else if (html.includes('bigcommerce')) platform = 'bigcommerce'
      else platform = 'custom'

      const $ = (await import('cheerio')).load(page.html)
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') ?? ''
        if (href.includes('instagram.com/')) socialLinks.instagram = href
        if (href.includes('tiktok.com/')) socialLinks.tiktok = href
        if (href.includes('facebook.com/')) socialLinks.facebook = href
        if (href.includes('twitter.com/') || href.includes('x.com/')) socialLinks.twitter = href
        if (href.includes('youtube.com/')) socialLinks.youtube = href
      })
    } catch {
      // Competitor site unreachable — still include with basic info
    }

    competitors.push({
      name: raw.name,
      domain: raw.domain,
      type: raw.type === 'market_cohort' ? 'market_cohort' : 'direct',
      tagline: tagline.slice(0, 300),
      positioning: positioning.slice(0, 200),
      product_categories: raw.product_categories ?? [],
      price_positioning: 'unknown',
      estimated_size: raw.estimated_size ?? 'unknown',
      why_competitor: raw.why_competitor ?? '',
      social_links: socialLinks,
      platform,
    })
  }

  return competitors
}

async function storeCompetitors(brandId: string, competitors: CompetitorSnapshot[]): Promise<void> {
  const admin = createServiceClient()

  for (const comp of competitors) {
    await admin.from('knowledge_nodes').insert({
      brand_id: brandId,
      node_type: 'competitor',
      name: comp.name.slice(0, 255),
      summary: `${comp.type === 'market_cohort' ? 'Market leader' : 'Direct competitor'}: ${comp.why_competitor}`,
      properties: {
        domain: comp.domain,
        type: comp.type,
        tagline: comp.tagline,
        positioning: comp.positioning,
        product_categories: comp.product_categories,
        price_positioning: comp.price_positioning,
        estimated_size: comp.estimated_size,
        social_links: comp.social_links,
        platform: comp.platform,
        discovered_at: new Date().toISOString(),
      },
      confidence: 0.7,
      source_skill: 'brand-extraction',
      source_run_id: null,
      is_active: true,
    })
  }
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

export async function extractBrandDna(
  brandId: string,
  domain: string,
  brandName: string,
  onProgress?: ProgressCallback,
): Promise<ExtractionResult> {
  const notify = onProgress ?? (() => {})

  // ---- Step 1: Crawl ----
  notify({ step: 'crawling', message: 'Starting site crawl...', progress: 5 })

  const siteUrl = domain.startsWith('http') ? domain : `https://${domain}`
  const crawlResult: CrawlResult = await crawlSite(siteUrl, { limit: 5 })

  notify({ step: 'crawling', message: `Crawled ${crawlResult.totalCrawled} pages`, progress: 15 })

  const visualDataList: VisualData[] = crawlResult.pages
    .filter((p) => p.html)
    .map((p) => extractVisualData(p.html))

  notify({ step: 'crawling', message: 'Visual data extracted', progress: 25 })

  // ---- Step 2: LLM Extraction ----
  notify({ step: 'extracting', message: 'Analyzing brand with AI...', progress: 35 })

  const userPrompt = buildExtractionPrompt(crawlResult.pages, visualDataList, brandName)

  const llmResult = await callModel({
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 4096,
    temperature: 0.2,
  })

  notify({ step: 'extracting', message: 'Parsing AI response...', progress: 55 })

  let brandDna: BrandDna = parseJsonResponse(llmResult.content)

  mergeVisualData(brandDna, visualDataList)

  notify({ step: 'extracting', message: 'Brand DNA extracted', progress: 60 })

  // ---- Step 3: Quality Gate ----
  notify({ step: 'quality_check', message: 'Running quality checks...', progress: 65 })

  const quality = checkQuality(brandDna)
  let reExtracted = false

  if (!quality.passed) {
    notify({
      step: 'quality_check',
      message: `Low confidence in: ${quality.weakFields.join(', ')}. Re-crawling...`,
      progress: 70,
    })

    const pathsToRecrawl = getRecrawlPaths(quality.weakFields)

    const additionalPages: PageResult[] = []
    for (const path of pathsToRecrawl) {
      try {
        const page = await scrapePage(`${siteUrl}${path}`)
        if (page.markdown || page.html) {
          additionalPages.push(page)
        }
      } catch {
        // Skip unreachable paths
      }
    }

    if (additionalPages.length > 0) {
      notify({
        step: 'quality_check',
        message: `Re-scraped ${additionalPages.length} pages. Re-extracting...`,
        progress: 75,
      })

      const allPages = [...crawlResult.pages, ...additionalPages]
      const allVisual = [
        ...visualDataList,
        ...additionalPages.filter((p) => p.html).map((p) => extractVisualData(p.html)),
      ]

      const rePrompt = buildExtractionPrompt(allPages, allVisual, brandName)

      const reLlmResult = await callModel({
        model: 'claude-sonnet-4-20250514',
        provider: 'anthropic',
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: rePrompt,
        maxTokens: 4096,
        temperature: 0.2,
      })

      brandDna = parseJsonResponse(reLlmResult.content)
      mergeVisualData(brandDna, allVisual)
      reExtracted = true
    }
  }

  notify({ step: 'quality_check', message: 'Quality gate passed', progress: 80 })

  // ---- Step 3.5: Competitor Discovery ----
  let competitors: CompetitorSnapshot[] = []
  try {
    competitors = await discoverCompetitors(brandDna, brandName, onProgress)
    notify({ step: 'competitors', message: `Found ${competitors.length} competitors`, progress: 88 })
  } catch (err) {
    console.warn('[brand-extractor] Competitor discovery failed (non-fatal):', err)
  }

  // ---- Step 4: Store to Supabase ----
  notify({ step: 'storing', message: 'Saving brand data...', progress: 90 })

  const supabase = createServiceClient()

  await supabase
    .from('brands')
    .update({
      product_context: brandDna.products,
      brand_guidelines: brandDna,
    })
    .eq('id', brandId)

  notify({ step: 'storing', message: 'Updating brand guidelines...', progress: 90 })

  await supabase.from('brand_guidelines').upsert(
    {
      brand_id: brandId,
      voice_tone: brandDna.brand_voice,
      target_audience: brandDna.target_audience,
      positioning: brandDna.positioning.statement,
      colors: {
        primary: brandDna.visual_identity.primary_colors,
        secondary: brandDna.visual_identity.secondary_colors,
      },
      typography: {
        font_families: brandDna.visual_identity.font_families,
        font_style: brandDna.visual_identity.font_style,
      },
      brand_story: brandDna.brand_story,
    },
    { onConflict: 'brand_id' },
  )

  notify({ step: 'storing', message: 'Creating knowledge nodes...', progress: 95 })

  // Product knowledge nodes (up to 30)
  const productNodes = brandDna.products.slice(0, 30).map((product) => ({
    brand_id: brandId,
    node_type: 'product' as const,
    name: product.name,
    summary: product.description?.slice(0, 500) ?? null,
    properties: {
      price: product.price,
      currency: product.currency,
      image_url: product.image_url,
      category: product.category,
      is_bestseller: product.is_bestseller,
    },
    source_skill: 'brand-extractor',
    is_active: true,
  }))

  if (productNodes.length > 0) {
    await supabase
      .from('knowledge_nodes')
      .upsert(productNodes, { onConflict: 'brand_id,name' })
  }

  // Brand guidelines knowledge node
  await supabase.from('knowledge_nodes').upsert(
    {
      brand_id: brandId,
      node_type: 'brand_guidelines',
      name: `${brandName} Brand Guidelines`,
      summary: brandDna.positioning.statement,
      properties: {
        tone_adjectives: brandDna.tone_adjectives,
        key_themes: brandDna.key_themes,
        trust_signals: brandDna.trust_signals,
        social_links: brandDna.social_links,
        technology_signals: brandDna.technology_signals,
        visual_identity: brandDna.visual_identity,
        extraction_confidence: brandDna.extraction_confidence,
      },
      source_skill: 'brand-extractor',
      is_active: true,
    },
    { onConflict: 'brand_id,name' },
  )

  if (competitors.length > 0) {
    notify({ step: 'storing', message: `Saving ${competitors.length} competitors...`, progress: 98 })
    await storeCompetitors(brandId, competitors)
  }

  notify({ step: 'storing', message: 'Brand extraction complete', progress: 100 })

  return {
    brandDna,
    pagesScraped: crawlResult.totalCrawled,
    reExtracted,
    competitors,
  }
}

# Phase 2: Competitor Discovery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** During onboarding brand extraction, discover 3-5 direct competitors and 2-3 market leaders, snapshot their homepages, and store as knowledge nodes that seed Echo's ongoing monitoring.

**Architecture:** After Brand DNA extraction completes, Claude identifies competitors from brand context → Firecrawl scrapes each competitor's homepage → results stored as `competitor` knowledge nodes → review page shows competitor cards alongside Brand DNA.

**Tech Stack:** Existing `firecrawl-client.ts` (Phase 1), existing `callModel` (Claude), existing `createServiceClient` (Supabase), React client components.

**PRD Reference:** `docs/web-extraction-prd-onboarding.md` — Section 6

**Depends on:** Phase 1 complete

**Execution Progress:**
- [x] Task 1: Add competitor discovery to brand-extractor.ts — DONE
- [x] Task 2: Add competitor cards to review page — DONE

**Last executed:** 2026-04-11 — Phase 2 complete.

---

### Task 1: Add Competitor Discovery to Brand Extractor

**Files:**
- Modify: `src/lib/brand-extractor.ts`

- [ ] **Step 1: Add competitor types and discovery function**

Add after the existing `ExtractionResult` interface in `src/lib/brand-extractor.ts`:

```typescript
// ---------------------------------------------------------------------------
// Competitor Discovery Types
// ---------------------------------------------------------------------------

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

export interface ExtractionResultWithCompetitors extends ExtractionResult {
  competitors: CompetitorSnapshot[]
}
```

- [ ] **Step 2: Add competitor discovery function**

Add to `src/lib/brand-extractor.ts`:

```typescript
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
  emit({ step: 'competitors' as any, message: 'Identifying competitors...', progress: 82 })

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

  // Scrape each competitor's homepage for enrichment
  const competitors: CompetitorSnapshot[] = []

  for (const raw of rawCompetitors.slice(0, 7)) {
    emit({ step: 'competitors' as any, message: `Scanning ${raw.name}...`, progress: 85 })

    let tagline = ''
    let positioning = ''
    let socialLinks: Record<string, string | null> = {}
    let platform = 'unknown'

    try {
      const page = await scrapePage(raw.domain)
      tagline = page.metadata.ogDescription || page.metadata.description || ''
      positioning = page.metadata.ogTitle || page.metadata.title || ''

      // Detect platform from HTML
      const html = page.html.toLowerCase()
      if (html.includes('shopify') || html.includes('cdn.shopify.com')) platform = 'shopify'
      else if (html.includes('woocommerce') || html.includes('wp-content')) platform = 'woocommerce'
      else if (html.includes('squarespace')) platform = 'squarespace'
      else if (html.includes('bigcommerce')) platform = 'bigcommerce'
      else platform = 'custom'

      // Extract social links from HTML
      const $ = (await import('cheerio')).load(page.html)
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || ''
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
      product_categories: raw.product_categories || [],
      price_positioning: 'unknown',
      estimated_size: raw.estimated_size || 'unknown',
      why_competitor: raw.why_competitor || '',
      social_links: socialLinks,
      platform,
    })
  }

  return competitors
}
```

- [ ] **Step 3: Add competitor storage function**

Add to `src/lib/brand-extractor.ts`:

```typescript
async function storeCompetitors(
  brandId: string,
  competitors: CompetitorSnapshot[],
): Promise<void> {
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
```

- [ ] **Step 4: Update extractBrandDna to include competitors**

Modify the `extractBrandDna` function signature and add competitor discovery after the quality gate, before storage:

Change return type from `ExtractionResult` to `ExtractionResultWithCompetitors`.

After the quality check section (after `emit({ step: 'quality_check', ...`), add:

```typescript
  // --- Phase 3.5: Competitor Discovery ---
  emit({ step: 'storing', message: 'Discovering competitors...', progress: 82 })
  let competitors: CompetitorSnapshot[] = []
  try {
    competitors = await discoverCompetitors(dna, brandName, onProgress)
  } catch (err) {
    console.warn('[brand-extractor] Competitor discovery failed (non-fatal):', err)
  }
```

In the storage phase, after `await storeExtractionResults(brandId, dna)`, add:

```typescript
  if (competitors.length > 0) {
    await storeCompetitors(brandId, competitors)
    emit({ step: 'storing', message: `Found ${competitors.length} competitors.`, progress: 95 })
  }
```

Update the return to:

```typescript
  return {
    brandDna: dna,
    pagesScraped: crawlResult.totalCrawled,
    reExtracted,
    competitors,
  }
```

- [ ] **Step 5: Update SSE route to include competitors in complete event**

In `src/app/api/onboarding/extract-brand/route.ts`, the `send('complete', ...)` call already passes the full result object, which now includes `competitors`. No code change needed — just verify.

- [ ] **Step 6: Commit**

```bash
git add src/lib/brand-extractor.ts
git commit -m "feat: add competitor discovery and snapshot during brand extraction"
```

---

### Task 2: Add Competitors to Extraction Page & Review Page

**Files:**
- Modify: `src/app/onboarding/extraction/page.tsx`
- Modify: `src/app/onboarding/review/page.tsx`

- [ ] **Step 1: Update extraction page to store competitors in sessionStorage**

In `src/app/onboarding/extraction/page.tsx`, in the `currentEvent === 'complete'` handler, after `sessionStorage.setItem('onboarding_brand_dna', ...)`, add:

```typescript
if (data.competitors) {
  sessionStorage.setItem('onboarding_competitors', JSON.stringify(data.competitors))
}
```

- [ ] **Step 2: Add competitor section to review page**

In `src/app/onboarding/review/page.tsx`, add competitor state and load from sessionStorage:

After the `dna` state declaration, add:

```typescript
const [competitors, setCompetitors] = useState<CompetitorSnapshot[]>([])
```

Add the `CompetitorSnapshot` interface at the top (same as in brand-extractor.ts):

```typescript
interface CompetitorSnapshot {
  name: string
  domain: string
  type: 'direct' | 'market_cohort'
  tagline: string
  positioning: string
  product_categories: string[]
  estimated_size: string
  why_competitor: string
  platform: string
}
```

In the `useEffect`, after `setDna(JSON.parse(raw))`, add:

```typescript
const compRaw = sessionStorage.getItem('onboarding_competitors')
if (compRaw) {
  try { setCompetitors(JSON.parse(compRaw)) } catch { /* skip */ }
}
```

Add competitor cards section before the navigation buttons:

```tsx
{/* Competitors */}
{competitors.length > 0 && (
  <div className="mb-8">
    <div className="flex items-center gap-2 text-sm font-heading font-semibold text-foreground mb-1">
      <span className="text-[#64748b]">🔍</span>
      Competitors Discovered ({competitors.length})
    </div>
    <p className="text-xs text-muted-foreground mb-3">
      These competitors will be monitored weekly by Echo.
    </p>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {competitors.map((comp, i) => (
        <div key={i} className="glass-panel rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">{comp.name}</p>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${comp.type === 'market_cohort' ? 'bg-[#7c3aed]/10 text-[#7c3aed]' : 'bg-[#0d9488]/10 text-[#0d9488]'}`}>
              {comp.type === 'market_cohort' ? 'Market Leader' : 'Direct'}
            </span>
          </div>
          <p className="text-[10px] font-metric text-muted-foreground">{comp.domain}</p>
          <p className="text-xs text-muted-foreground line-clamp-2">{comp.why_competitor}</p>
          {comp.product_categories.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {comp.product_categories.slice(0, 3).map((cat, j) => (
                <span key={j} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">{cat}</span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="capitalize">{comp.platform}</span>
            <span>•</span>
            <span className="capitalize">{comp.estimated_size}</span>
          </div>
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/extraction/page.tsx src/app/onboarding/review/page.tsx
git commit -m "feat: show competitor cards on Brand DNA review page"
```

---

## Phase 2 Complete Checklist

- [ ] `discoverCompetitors()` function in brand-extractor.ts
- [ ] `storeCompetitors()` stores competitor knowledge nodes
- [ ] Extraction pipeline includes competitor discovery after quality gate
- [ ] SSE stream sends competitors in complete event
- [ ] Extraction page stores competitors in sessionStorage
- [ ] Review page shows competitor cards with type badges
- [ ] Competitors stored as `competitor` knowledge nodes (seeds Echo)

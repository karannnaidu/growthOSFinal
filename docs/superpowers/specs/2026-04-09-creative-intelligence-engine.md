# Creative Intelligence Engine — Data-Driven Creative Generation

> **Purpose:** Build the core differentiator of Growth OS — an AI creative generation system that uses the knowledge graph (performance data, cohort analysis, brand guidelines, competitor intel) to produce images and videos informed by what actually works for the brand. Not generic AI creative, but intelligence-backed creative grounded in real data.
> **Created:** 2026-04-09
> **Depends on:** Creative Pipeline Foundation (Plan 1 must be complete — RAG wired, embeddings working, fal.ai client built)
> **Scope:** Backend engine + API routes + Creative Studio UI page

---

## The Core Insight

Every other AI creative tool generates content from a generic prompt. Growth OS generates content from **your brand's knowledge graph** — a growing body of evidence about what works:

- Which ad creatives had 4x+ ROAS (from `ad_creative` knowledge nodes with performance snapshots)
- Which personas respond to which styles (from `reviewed_by` edges between creatives and personas)
- Your exact brand voice, colors, and positioning (from `brand_guidelines` table)
- What competitors are running (from `competitor_creative` nodes)
- Your actual product photos and descriptions (from `product_image` and `product` nodes)

The result: **every creative gets smarter than the last**, because performance data feeds back into the knowledge graph.

---

## The Creative Intelligence Loop

```
┌─────────────────────────────────────────────────────────┐
│                   THE INTELLIGENCE LOOP                  │
│                                                         │
│  1. DATA IN                                             │
│     Products, customers, competitors, past ads          │
│     → Knowledge Graph (nodes + embeddings)              │
│                                                         │
│  2. CONTEXT ASSEMBLY                                    │
│     gatherCreativeContext() queries:                     │
│     - Top-performing creatives (by CTR/ROAS)            │
│     - Persona profiles (from real customer data)        │
│     - Brand guidelines (voice, colors, do/don't)        │
│     - Competitor creatives (what they're running)        │
│     - Product images (real product photos)              │
│                                                         │
│  3. INTELLIGENT GENERATION                              │
│     Aria + Claude generate copy INFORMED by context     │
│     fal.ai generates images using brand aesthetic       │
│     fal.ai generates video using winning styles         │
│                                                         │
│  4. PERSONA VALIDATION                                  │
│     Atlas's personas score each variant                 │
│     Scores based on REAL customer data, not templates   │
│                                                         │
│  5. PERFORMANCE FEEDBACK                                │
│     Ads run → Meta/Google report real metrics            │
│     Metrics flow back into knowledge graph              │
│     → Loop restarts with richer data                    │
└─────────────────────────────────────────────────────────┘
```

---

## System Architecture

### `src/lib/creative-intelligence.ts` — Core Engine

The brain of the creative generation system. Three main functions:

#### `gatherCreativeContext(brandId: string): Promise<CreativeContext>`

Assembles all relevant knowledge for creative generation:

```typescript
interface CreativeContext {
  // Top-performing creatives from knowledge graph, sorted by performance
  topCreatives: Array<{
    name: string
    nodeType: string          // 'ad_creative' | 'content' | 'top_content'
    style: string             // extracted from properties
    metrics: {
      ctr?: number
      roas?: number
      impressions?: number
      conversions?: number
    }
    prompt?: string           // original fal.ai prompt if available
  }>

  // Persona profiles built from real Shopify customer data
  personas: Array<{
    name: string              // "Yoga Mom Sarah", "Budget-Conscious Mike"
    demographics: Record<string, any>
    psychographics: Record<string, any>
    shoppingBehavior: Record<string, any>
    preferredCreativeStyles: string[]  // derived from past reviewed_by edges
    avgPurchaseIntent: number          // from past persona reviews
  }>

  // Brand guidelines from dedicated table
  brandGuidelines: {
    voiceTone: { formality: number; humor: number; confidence: number; warmth: number; style: string }
    colors: { primary: string; secondary: string; accent: string; palette: string[] }
    doSay: string[]
    dontSay: string[]
    positioning: string
    brandStory: string
  }

  // Competitor creatives from knowledge graph
  competitorCreatives: Array<{
    competitorName: string
    style: string
    platform: string
    estimatedPerformance: string  // "high" | "medium" | "low"
  }>

  // Product images available for reference
  productImages: Array<{
    productTitle: string
    imageUrl: string
    category: string
  }>

  // Agency patterns (if applicable)
  agencyPatterns: Array<{
    patternType: string
    name: string
    data: Record<string, any>
    confidence: number
  }>
}
```

**Data sources:**
- `knowledge_nodes` WHERE `node_type IN ('ad_creative', 'top_content')` + JOIN `knowledge_snapshots` for performance data → `topCreatives`
- `knowledge_nodes` WHERE `node_type = 'persona'` + JOIN `knowledge_edges` WHERE `edge_type = 'reviewed_by'` for style preferences → `personas`
- `brand_guidelines` table → `brandGuidelines`
- `knowledge_nodes` WHERE `node_type = 'competitor_creative'` → `competitorCreatives`
- `knowledge_nodes` WHERE `node_type = 'product_image'` → `productImages`
- `agency_patterns` table (if brand has `agency_parent_id`) → `agencyPatterns`

#### `generateIntelligentBrief(brandId, campaignGoal, targetAudience, context): Promise<CreativeBrief>`

Calls Claude Sonnet with full creative context to generate fal.ai-ready prompts:

```typescript
interface CreativeBrief {
  // 4 image prompts informed by brand aesthetic and top-performing styles
  imagePrompts: Array<{
    prompt: string            // fal.ai-ready prompt
    negativePrompt: string
    style: string             // e.g., "lifestyle-product", "ugc-testimonial"
    rationale: string         // why this style was chosen based on data
    targetPersona: string     // which persona this variant targets
    dimensions: { width: number; height: number }
  }>

  // 2 video prompts informed by winning video patterns
  videoPrompts: Array<{
    prompt: string
    duration: number          // seconds
    style: string
    rationale: string
    targetPersona: string
  }>

  // Copy variants (from ad-copy skill, informed by brand voice)
  copyVariants: Array<{
    headline: string
    body: string
    cta: string
    targetPersona: string
    voiceToneMatch: number    // 0-100 match to brand guidelines
  }>

  // Reasoning trace — why these choices were made
  reasoning: string
}
```

**The Claude prompt includes:**
- "Your top-performing ad style is 'lifestyle-product' with 4.2x ROAS"
- "Persona 'Yoga Mom Sarah' responds best to warm, aspirational imagery"
- "Brand colors: primary #6366F1, avoid using red (competitor's color)"
- "Competitor X is running UGC-style testimonials — consider differentiation"
- "Product images available: [descriptions]"

This is NOT generic "write me an ad." It's deeply personalized to the brand's specific data.

#### `scoreCreative(brandId, creative, context): Promise<CreativeScore>`

Scores a generated creative against personas and brand guidelines:

```typescript
interface CreativeScore {
  overallScore: number        // 0-100
  brandGuidelineMatch: number // 0-100 — does it follow voice/colors?
  personaScores: Array<{
    personaName: string
    attention: number         // 1-10
    relevance: number         // 1-10
    purchaseIntent: number    // 1-10
    feedback: string          // specific, data-backed feedback
  }>
  strengths: string[]
  improvements: string[]
  predictedPerformance: {
    estimatedCtr: string      // "above average" | "average" | "below average"
    confidence: number        // based on how much performance data exists
    reasoning: string
  }
}
```

Scoring is done by calling Claude with the creative + all persona profiles + brand guidelines. The more data in the knowledge graph, the more accurate the predictions.

---

## Image Generation Strategy

### Style Informed by Data

When generating images, the system doesn't just use the text prompt. It enriches the prompt with:

1. **Brand color palette** — injected as color directives in the fal.ai prompt
2. **Winning visual style** — if "lifestyle-product" outperforms "flat-lay" by 2x, bias toward lifestyle
3. **Product context** — reference real product descriptions and categories
4. **Persona preference** — each variant targets a different persona's aesthetic preference

### Variety with Purpose

Each generation produces **4 image variants**, each targeting a different persona or style:
- Variant A: targets primary persona, winning style
- Variant B: targets secondary persona, winning style
- Variant C: targets primary persona, alternative style (for A/B testing)
- Variant D: competitor-differentiated style

### Models

| Use Case | fal.ai Model | Dimensions |
|----------|-------------|------------|
| Feed ads (1:1) | `fal-ai/flux/schnell` | 1024x1024 |
| Story ads (9:16) | `fal-ai/flux/schnell` | 768x1344 |
| Carousel cards | `fal-ai/flux/schnell` | 1024x1024 |
| High-quality hero | `fal-ai/flux/dev` | 1024x1024 |

---

## Video Generation Strategy

### When to Generate Video

Video generation is triggered when:
- Campaign goal is "awareness" (video outperforms static for awareness)
- Brand has existing video content that performed well (from `knowledge_snapshots`)
- User explicitly requests video variants

### Video Types

| Type | Duration | Model | Use Case |
|------|----------|-------|----------|
| Product showcase | 5s | `fal-ai/minimax-video/video-01-live` | Feed ads |
| Testimonial style | 10s | `fal-ai/minimax-video/video-01-live` | Story ads |
| Brand story | 15s | `fal-ai/minimax-video/video-01-live` | Awareness |

### Prompts Informed by Data

Video prompts include:
- Product description and key selling points
- Brand color palette and visual style
- Winning video patterns from past performance data
- Persona-specific emotional hooks

---

## Performance Feedback Loop

### Data Flow

1. **Creative generated** → stored in `knowledge_nodes` (type `ad_creative` or `video_asset`) with `properties.prompt`, `properties.style`, `properties.target_persona`
2. **Ad published to platform** → user exports creative to Meta/Google (or manual upload)
3. **Daily cron runs** → `updateCreativePerformance()` fetches metrics from Meta/Google APIs via MCP client
4. **Metrics stored** → `knowledge_snapshots` created for each creative node with real CTR, ROAS, impressions, conversions
5. **Next generation** → `gatherCreativeContext()` now sees which styles/personas/prompts actually performed → informs next brief

### Performance Matching

To link a generated creative back to its ad platform performance:
- Store `meta_ad_id` or `google_ad_id` in the knowledge node's `properties` when the user exports to a platform
- During daily cron, fetch performance by ad ID
- Match back to the knowledge node and create snapshot

If no platform ID is available (user manually uploaded), performance data won't be auto-linked. User can manually input results via the Creative Studio UI.

### Cold Start

For new brands with no performance data:
- Use `agency_patterns` if brand has an agency parent (cross-brand learnings)
- Use `benchmarks` table for industry averages
- Use brand guidelines + persona profiles as primary signals
- After 2-3 ad cycles, real performance data kicks in and the loop becomes data-driven

---

## Creative Studio UI (`/dashboard/creative`)

### Gallery Tab (Default)

Grid view of all generated creatives:
- **Card layout:** thumbnail (lazy-loaded), campaign badge, persona score bar, performance metrics (if available)
- **Filters:** Campaign name, date range, node type (image/video), performance bracket (top/mid/low)
- **Sort:** by date, by persona score, by performance (CTR/ROAS)
- **Actions per card:** Download, Export to Platform, Re-generate Similar, View Details
- **Detail modal:** full-size preview, all metadata (prompt, style, personas, scores), performance timeline chart, "Generate More Like This" button

### Generate Tab

Step-by-step generation flow:

**Step 1: Campaign Setup**
- Campaign name (text input)
- Goal: Awareness / Conversion / Retention (radio cards with icons)
- Target personas: multi-select from Atlas's personas (show persona cards with names + key traits)
- Platform: Meta / Google / Both (determines aspect ratios)

**Step 2: Intelligence Preview**
- Before generating, show what the system knows:
  - "Your top-performing style: lifestyle-product (4.2x ROAS)"
  - "Best-responding persona: Yoga Mom Sarah (8.2/10 purchase intent)"
  - "Brand colors: #6366F1, #F97316, #10B981"
  - "Competitor gap: they're heavy on UGC, you should try editorial"
- User can adjust: override style preference, add custom prompt text, exclude certain patterns
- "Generate Creatives" CTA button

**Step 3: Results**
- 4 image variants displayed as cards, each with:
  - Full image preview
  - Target persona badge
  - Style label
  - Persona score (from automatic scoring)
  - "Why this variant" rationale text
- 2 video variants (if applicable):
  - Video player (auto-play on hover, muted)
  - Same metadata as images
- **Actions:** approve/reject each variant, regenerate specific variant, export all approved

**Step 4: Export**
- Selected creatives are saved to `generated-assets` storage
- Option to "Export to Meta Ads Manager" or "Export to Google Ads" (creates the ad in draft mode via API — future enhancement, for now just download)
- Knowledge nodes created for all approved creatives

### Performance Tab

Dashboard showing creative intelligence metrics:
- **Creative generation trend:** chart showing # of creatives generated per week
- **Performance comparison:** generated creatives vs. manually created (if data available)
- **Top styles:** which creative styles perform best for this brand
- **Persona accuracy:** how well persona scores predicted actual performance (correlation)
- **Knowledge graph health:** node count by type, embedding coverage, snapshot freshness

---

## API Routes

### `POST /api/creative/generate`

```typescript
// Request
{
  brandId: string
  campaignName: string
  campaignGoal: 'awareness' | 'conversion' | 'retention'
  targetPersonas?: string[]   // persona node IDs; if empty, use all
  platform: 'meta' | 'google' | 'both'
  customPrompt?: string       // user's additional direction
  includeVideo: boolean       // default true for awareness, false otherwise
}

// Response (streamed via SSE for progress)
// Event: 'context' — creative context assembled
// Event: 'brief' — intelligent brief generated
// Event: 'image' — each image variant as it's generated
// Event: 'video' — each video variant
// Event: 'scores' — persona scores for all variants
// Event: 'done' — final response with all data
```

### `GET /api/creative/gallery`

```typescript
// Query params
?brandId=xxx&page=1&limit=20&type=all|image|video&sort=date|score|performance

// Response
{
  creatives: Array<{
    id: string
    nodeType: 'ad_creative' | 'video_asset'
    name: string
    mediaUrl: string
    thumbnailUrl: string
    properties: { prompt, style, targetPersona, dimensions }
    scores: { overall, personaScores }
    performance: { ctr, roas, impressions } | null
    createdAt: string
  }>
  total: number
  page: number
  limit: number
}
```

### `POST /api/creative/score`

```typescript
// Score a specific creative (on-demand)
// Request: { brandId, creativeNodeId }
// Response: { score: CreativeScore }
```

### `POST /api/creative/feedback`

```typescript
// Manual performance feedback (when auto-linking isn't available)
// Request: { brandId, creativeNodeId, metrics: { ctr, roas, impressions, conversions } }
// Creates a knowledge_snapshot for the creative node
```

---

## Success Criteria

1. **Context assembly works:** `gatherCreativeContext()` returns real data from the knowledge graph (top creatives, personas, brand guidelines, competitor intel, product images)
2. **Generation is data-informed:** the fal.ai prompts reference specific brand data (colors, winning styles, persona preferences), not generic descriptions
3. **4 image + 2 video variants** generated per campaign, each targeting different personas/styles
4. **Persona scoring works:** Atlas personas score each variant with specific, data-backed feedback
5. **Performance feedback loop:** after ads run, real CTR/ROAS data flows back into knowledge graph and improves next generation
6. **Creative Studio UI:** users can browse gallery, generate new creatives, see performance data — all connected to real backend
7. **Cold start handled:** new brands get reasonable creatives using brand guidelines + industry benchmarks, improving as data accumulates
8. **Video generation works:** fal.ai video models produce real .mp4 files, stored in Supabase Storage, playable in the UI

---

## What This Is NOT

- **Not a generic AI image generator** — every prompt is informed by brand-specific data
- **Not a standalone tool** — deeply integrated with the knowledge graph, skills engine, and persona system
- **Not a replacement for creative teams** — it's an intelligence layer that makes creative decisions data-backed
- **Not dependent on large ad spend** — works with brand guidelines + personas even before any ads run, gets smarter as performance data accumulates

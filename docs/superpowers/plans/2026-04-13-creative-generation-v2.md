# Competitor-Informed Creative Generation v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current creative generation pipeline with a competitor-informed, product-faithful system using Nano Banana 2 / Imagen 4.0, with campaign type variants (Urgency/Offer/Retargeting/Awareness) and user-editable copy.

**Architecture:** Echo analyzes competitor ads via Gemini Vision and stores categorized creatives in the knowledge graph. Aria generates briefs informed by competitor winners. User edits copy. Nano Banana 2 generates product-faithful ad images with text overlays in one call. New Competitor Insights tab in Creative Studio shows competitor intelligence.

**Tech Stack:** Gemini API (Nano Banana 2 for image gen, Gemini Vision for competitor analysis, Gemini Flash for briefs), Imagen 4.0 as fallback, existing Meta Ad Library API, existing knowledge graph.

---

### Task 1: Create Imagen/Nano Banana Client

**Files:**
- Create: `src/lib/imagen-client.ts`

- [ ] **Step 1: Create the image generation client**

```typescript
// src/lib/imagen-client.ts
//
// Google AI image generation — Nano Banana 2 (primary) + Imagen 4.0 (fallback).
// Replaces fal.ai for creative generation. fal.ai kept for bg removal only.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImageGenOptions {
  prompt: string
  referenceImageUrl?: string   // Product image for Nano Banana 2 (multimodal)
  width?: number               // default 1024
  height?: number              // default 1024
  numberOfImages?: number      // default 1
}

export interface GeneratedImage {
  base64: string
  mimeType: string
  width: number
  height: number
}

// ---------------------------------------------------------------------------
// Nano Banana 2 — multimodal image generation (primary)
// Accepts a reference product image + text prompt → generates faithful product ad
// ---------------------------------------------------------------------------

export async function generateWithNanoBanana(
  options: ImageGenOptions,
): Promise<GeneratedImage[]> {
  const apiKey = process.env.GOOGLE_AI_KEY
  if (!apiKey) throw new Error('GOOGLE_AI_KEY is not set')

  const parts: Array<Record<string, unknown>> = []

  // If reference image provided, include it as input
  if (options.referenceImageUrl) {
    try {
      const imgRes = await fetch(options.referenceImageUrl, { signal: AbortSignal.timeout(10000) })
      if (imgRes.ok) {
        const buffer = Buffer.from(await imgRes.arrayBuffer())
        const mimeType = imgRes.headers.get('content-type') || 'image/png'
        parts.push({ inlineData: { mimeType, data: buffer.toString('base64') } })
      }
    } catch (err) {
      console.warn('[imagen-client] Failed to fetch reference image, proceeding without:', err)
    }
  }

  parts.push({ text: options.prompt })

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    },
  )

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Nano Banana 2 error ${res.status}: ${errText.slice(0, 200)}`)
  }

  const data = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType: string; data: string } }> } }>
  }

  const images: GeneratedImage[] = []
  for (const candidate of data.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData?.data) {
        images.push({
          base64: part.inlineData.data,
          mimeType: part.inlineData.mimeType || 'image/jpeg',
          width: options.width ?? 1024,
          height: options.height ?? 1024,
        })
      }
    }
  }

  return images
}

// ---------------------------------------------------------------------------
// Imagen 4.0 — text-to-image fallback (no reference image support)
// ---------------------------------------------------------------------------

export async function generateWithImagen(
  options: ImageGenOptions,
  model: 'imagen-4.0-fast-generate-001' | 'imagen-4.0-generate-001' | 'imagen-4.0-ultra-generate-001' = 'imagen-4.0-fast-generate-001',
): Promise<GeneratedImage[]> {
  const apiKey = process.env.GOOGLE_AI_KEY
  if (!apiKey) throw new Error('GOOGLE_AI_KEY is not set')

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt: options.prompt }],
        parameters: { sampleCount: options.numberOfImages ?? 1 },
      }),
    },
  )

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Imagen 4.0 error ${res.status}: ${errText.slice(0, 200)}`)
  }

  const data = await res.json() as {
    predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>
  }

  return (data.predictions ?? [])
    .filter(p => p.bytesBase64Encoded)
    .map(p => ({
      base64: p.bytesBase64Encoded!,
      mimeType: p.mimeType ?? 'image/png',
      width: options.width ?? 1024,
      height: options.height ?? 1024,
    }))
}

// ---------------------------------------------------------------------------
// Unified generate — tries Nano Banana first, falls back to Imagen
// ---------------------------------------------------------------------------

export async function generateAdImage(options: ImageGenOptions): Promise<GeneratedImage | null> {
  // Try Nano Banana 2 first (supports reference images)
  try {
    const results = await generateWithNanoBanana(options)
    if (results.length > 0) return results[0]!
  } catch (err) {
    console.warn('[imagen-client] Nano Banana 2 failed, trying Imagen 4.0:', err)
  }

  // Fallback to Imagen 4.0 Fast (text-only, no reference)
  try {
    const results = await generateWithImagen({
      ...options,
      prompt: options.prompt + ' Professional product photography, premium quality.',
    })
    if (results.length > 0) return results[0]!
  } catch (err) {
    console.warn('[imagen-client] Imagen 4.0 also failed:', err)
  }

  return null
}
```

- [ ] **Step 2: Verify types**

```bash
npx tsc --noEmit --pretty false 2>&1 | head -5
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/imagen-client.ts
git commit -m "feat: Nano Banana 2 + Imagen 4.0 client for product-faithful ad generation"
```

---

### Task 2: Competitor Creative Analysis with Gemini Vision

**Files:**
- Modify: `src/lib/competitor-intel.ts`

- [ ] **Step 1: Add analyzeCompetitorCreative function**

Add this function at the end of `src/lib/competitor-intel.ts`:

```typescript
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
            { text: `Analyze this ad creative. Respond with JSON only:
{
  "format": "static_image" | "video" | "carousel" | "ugc" | "graphic_design",
  "messaging_approach": "benefit_led" | "social_proof" | "urgency_fomo" | "educational" | "lifestyle",
  "visual_style": "studio" | "lifestyle" | "ugc" | "product_hero" | "graphic",
  "visual_description": "one paragraph describing what the ad shows",
  "key_elements": ["list", "of", "notable", "design", "elements"]
}` },
            { inlineData: { mimeType, data: base64 } },
          ]}],
          generationConfig: { maxOutputTokens: 512, temperature: 0.2 },
        }),
      },
    )

    if (!res.ok) return null
    const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    // Strip markdown fences
    const fenceMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/)
    if (fenceMatch) text = fenceMatch[1]!.trim()

    const parsed = JSON.parse(text) as Omit<CreativeAnalysis, 'estimated_performance'>
    return {
      ...parsed,
      estimated_performance: daysActive >= 14 ? 'high' : daysActive >= 7 ? 'medium' : 'low',
    }
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/competitor-intel.ts
git commit -m "feat: Gemini Vision analysis for competitor ad creatives"
```

---

### Task 3: Competitor Insights API Endpoint

**Files:**
- Create: `src/app/api/creative/competitor-insights/route.ts`

- [ ] **Step 1: Create the endpoint**

```bash
mkdir -p src/app/api/creative/competitor-insights
```

```typescript
// src/app/api/creative/competitor-insights/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const brandId = request.nextUrl.searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  const admin = createServiceClient()

  // Fetch competitor_creative nodes
  const { data: creatives } = await admin
    .from('knowledge_nodes')
    .select('id, name, summary, properties, confidence, created_at')
    .eq('brand_id', brandId)
    .eq('node_type', 'competitor_creative')
    .eq('is_active', true)
    .order('confidence', { ascending: false }) // inspiration-marked first (0.95)
    .order('created_at', { ascending: false })
    .limit(50)

  // Build trend analysis
  const items = (creatives ?? []).map(c => {
    const props = c.properties as Record<string, unknown>
    return {
      id: c.id,
      name: c.name,
      competitorName: props.competitor_name as string ?? c.name,
      thumbnailUrl: props.thumbnail_url as string ?? null,
      visualDescription: props.visual_description as string ?? c.summary,
      format: props.format as string ?? 'unknown',
      messagingApproach: props.messaging_approach as string ?? 'unknown',
      visualStyle: props.visual_style as string ?? 'unknown',
      estimatedPerformance: props.estimated_performance as string ?? 'unknown',
      daysActive: props.estimated_days_active as number ?? 0,
      keyElements: props.key_elements as string[] ?? [],
      adBody: props.ad_creative_body as string ?? null,
      isInspiration: c.confidence >= 0.95,
      createdAt: c.created_at,
    }
  })

  // Compute trends
  const formatCounts: Record<string, number> = {}
  const messagingCounts: Record<string, number> = {}
  for (const item of items) {
    formatCounts[item.format] = (formatCounts[item.format] ?? 0) + 1
    messagingCounts[item.messagingApproach] = (messagingCounts[item.messagingApproach] ?? 0) + 1
  }
  const topPerformers = items.filter(i => i.estimatedPerformance === 'high').slice(0, 10)
  const newExperiments = items.filter(i => i.daysActive < 7).slice(0, 5)

  return NextResponse.json({
    items,
    topPerformers,
    newExperiments,
    trends: { formatCounts, messagingCounts },
    total: items.length,
  })
}

// POST — mark a creative as inspiration
export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { brandId: string; creativeId: string; inspire: boolean }
  try { body = await request.json() as typeof body } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { brandId, creativeId, inspire } = body
  if (!brandId || !creativeId) return NextResponse.json({ error: 'brandId and creativeId required' }, { status: 400 })

  const admin = createServiceClient()

  // Set confidence to 0.95 (inspiration) or back to default (0.7)
  await admin.from('knowledge_nodes')
    .update({
      confidence: inspire ? 0.95 : 0.7,
      updated_at: new Date().toISOString(),
    })
    .eq('id', creativeId)
    .eq('brand_id', brandId)

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/creative/competitor-insights/
git commit -m "feat: competitor insights API — browse competitor creatives, mark as inspiration"
```

---

### Task 4: Update Creative Brief for Campaign Types + Editable Copy

**Files:**
- Modify: `src/lib/creative-intelligence.ts`

- [ ] **Step 1: Update BRIEF_SYSTEM_PROMPT and brief generation**

In `src/lib/creative-intelligence.ts`, update the `BRIEF_SYSTEM_PROMPT` to include campaign type patterns. Find the existing prompt (starts around line 214) and replace the entire prompt + the `generateIntelligentBrief` function.

The key changes:
1. Campaign types defined with headline patterns, CTA, and visual approach
2. Competitor inspiration creatives explicitly referenced in prompt
3. Brief output includes editable fields (headline, body, cta, offerText, sceneDescription)
4. Video prompts set to 0

Update the `CreativeBrief` interface to add `offerText` and `sceneDescription` to copy variants:

Find where `CreativeBrief` is defined and ensure `copyVariants` has:
```typescript
copyVariants: Array<{
  headline: string
  body: string
  cta: string
  offerText?: string
  sceneDescription: string
  targetPersona?: string
  reasoning?: string
}>
```

Update the `BRIEF_SYSTEM_PROMPT` to include campaign type instructions (the existing prompt already has scene-based image prompts guidance — add the campaign type table and competitor inspiration context).

After the existing guidelines, add:

```
Campaign Types and Creative Patterns:
- URGENCY/FOMO: Headlines like "Only X left", "Ends tonight". CTA: "Shop Now". Visual: bold contrast, warm/red accents.
- OFFER: Headlines like "X% off", "Buy 1 Get 1". CTA: "Claim Offer". Visual: price slash, bright accents.
- RETARGETING: Headlines like "Still thinking?", "Come back". CTA: "Complete Purchase". Visual: warm, product-centered.
- AWARENESS: Headlines like "Discover", "Meet your new...". CTA: "Learn More". Visual: lifestyle, aspirational.

Match the campaign type from the user's goal. Each copyVariant MUST include a "sceneDescription" field describing the lifestyle setting for the product image.

If competitor creatives marked as inspiration are provided, reference their format and style in your image prompts and copy approach.
```

In `generateIntelligentBrief`, update the user prompt to include competitor inspiration creatives:

```typescript
// After building slimCompetitors, add:
const inspirationCreatives = context.competitorCreatives
  .filter(c => (c as Record<string, unknown>).isInspiration)
  .slice(0, 3)
  .map(c => ({ name: c.name, style: c.style, description: (c as Record<string, unknown>).visual_description }))

// Add to userPrompt:
if (inspirationCreatives.length > 0) {
  userPrompt += `\n\n## Inspiration Creatives (match their style)\n${JSON.stringify(inspirationCreatives)}`
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/creative-intelligence.ts
git commit -m "feat: creative brief with campaign types, editable copy, competitor inspiration"
```

---

### Task 5: Replace fal.ai with Imagen/Nano Banana in Generate Pipeline

**Files:**
- Modify: `src/app/api/creative/generate/route.ts`

- [ ] **Step 1: Replace image generation with Nano Banana 2**

Replace the fal.ai `generateImage` calls with the new `generateAdImage` from `imagen-client.ts`. The key changes:

1. Import `generateAdImage` from `@/lib/imagen-client` instead of `generateImage` from `@/lib/fal-client`
2. For each image prompt, build a Nano Banana prompt that includes:
   - The scene description from the brief
   - Text overlay instructions (headline, CTA, offer)
   - Brand colors
   - Campaign type visual direction
3. Save the base64 result to Supabase Storage (Nano Banana returns base64, not URLs)
4. Remove video generation entirely (already disabled)

Replace the Step 4 image generation block:

```typescript
    // 4. Generate 4 ad images via Nano Banana 2 (or Imagen 4.0 fallback)
    const { generateAdImage } = await import('@/lib/imagen-client')
    const imagePrompts = brief.imagePrompts.slice(0, 4)
    console.log(`[creative/generate] Step 4: generating ${imagePrompts.length} images via Nano Banana 2`)

    const rawImages: Array<{ base64: string; mimeType: string; width: number; height: number }> = []

    for (let idx = 0; idx < imagePrompts.length; idx++) {
      const p = imagePrompts[idx]!
      const copyVariant = brief.copyVariants[idx] ?? brief.copyVariants[0]
      const productImageUrl = productImages.length > 0 ? productImages[idx % productImages.length] : undefined

      // Build Nano Banana prompt with product ref + text overlay instructions
      const adPrompt = [
        `Create a professional D2C social media ad.`,
        `Scene: ${copyVariant?.sceneDescription || p.prompt}`,
        productImageUrl ? `Keep the product EXACTLY as shown in the reference image. Do not modify labels or branding.` : `Show a premium wellness product in the scene.`,
        `Text overlay on the image:`,
        copyVariant?.headline ? `- Headline (prominent, top): "${copyVariant.headline}"` : '',
        copyVariant?.cta ? `- CTA button (bottom): "${copyVariant.cta}"` : '',
        copyVariant?.offerText ? `- Offer badge (corner): "${copyVariant.offerText}"` : '',
        `Brand colors: ${((brandData?.brand_guidelines as Record<string, unknown>)?.visual_identity as Record<string, unknown>)?.primary_colors || '#6366f1'}`,
        `Style: Professional product photography, clean layout, social media ad format.`,
      ].filter(Boolean).join('\n')

      try {
        const result = await generateAdImage({
          prompt: adPrompt,
          referenceImageUrl: productImageUrl,
          width: 1024,
          height: 1024,
        })
        if (result) rawImages.push(result)
      } catch (err) {
        console.warn(`[creative/generate] Image ${idx} failed:`, err)
      }
    }

    console.log(`[creative/generate] Step 4 done. Generated ${rawImages.length} images`)
```

Replace the storage persistence block to handle base64 instead of URLs:

```typescript
    // 6. Persist to Supabase Storage + create knowledge nodes
    const persistedImages: PersistedMedia[] = []

    const imageStorageResults = await Promise.allSettled(
      rawImages.map(async (img, idx) => {
        const ext = img.mimeType.includes('png') ? 'png' : 'jpg'
        const subPath = `creatives/${runId}/image-${idx}.${ext}`
        const storagePath = `${brandId}/${subPath}`

        const buffer = Buffer.from(img.base64, 'base64')
        const { error: uploadErr } = await admin.storage
          .from('generated-assets')
          .upload(storagePath, buffer, { contentType: img.mimeType, upsert: true })

        if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`)

        const { data: urlData } = admin.storage.from('generated-assets').getPublicUrl(storagePath)
        const publicUrl = urlData?.publicUrl ?? ''

        const copyVariant = brief.copyVariants[idx] ?? brief.copyVariants[0]
        const nodeId = await createMediaNode(
          brandId,
          'ad_creative',
          `Creative ${idx + 1} — ${campaignGoal.slice(0, 80)}`,
          storagePath,
          'generated-assets',
          img.mimeType,
          'creative-generate',
          runId,
          {
            campaign_goal: campaignGoal,
            prompt: imagePrompts[idx]?.prompt,
            copy_headline: copyVariant?.headline,
            copy_body: copyVariant?.body,
            copy_cta: copyVariant?.cta,
            offer_text: copyVariant?.offerText,
            media_url: publicUrl,
          },
        )

        return { url: publicUrl, width: img.width, height: img.height, content_type: img.mimeType, storagePath, publicUrl, nodeId } as PersistedMedia
      }),
    )

    for (const result of imageStorageResults) {
      if (result.status === 'fulfilled') {
        persistedImages.push(result.value)
      }
    }
```

Remove the video generation block entirely (or keep the disabled version).

- [ ] **Step 2: Commit**

```bash
git add src/app/api/creative/generate/route.ts
git commit -m "feat: replace fal.ai with Nano Banana 2/Imagen 4.0 for ad generation"
```

---

### Task 6: Creative Studio UI — Competitor Insights Tab + Two-Step Generate

**Files:**
- Modify: `src/app/dashboard/creative/page.tsx`

- [ ] **Step 1: Add Competitor Insights tab**

Add `'insights'` to the tab options. Add the tab button after 'generate':

```typescript
const TABS = [
  { key: 'gallery', label: 'Gallery', icon: <ImageIcon className="h-4 w-4" /> },
  { key: 'generate', label: 'Generate', icon: <Sparkles className="h-4 w-4" /> },
  { key: 'insights', label: 'Competitor Insights', icon: <Eye className="h-4 w-4" /> },
  { key: 'performance', label: 'Performance', icon: <BarChart3 className="h-4 w-4" /> },
]
```

Import `Eye` from lucide-react.

- [ ] **Step 2: Add campaign type options for new types**

Update `CAMPAIGN_GOALS`:

```typescript
const CAMPAIGN_GOALS = [
  { value: 'awareness', label: 'Awareness', desc: 'Maximize reach and brand recognition' },
  { value: 'urgency', label: 'Urgency / FOMO', desc: 'Create scarcity and urgency to buy now' },
  { value: 'offer', label: 'Offer / Discount', desc: 'Promote deals, bundles, and discounts' },
  { value: 'retargeting', label: 'Retargeting', desc: 'Re-engage visitors who didn\'t purchase' },
]
```

- [ ] **Step 3: Add two-step generate flow with copy editing**

Add state for the two-step flow:

```typescript
const [genStep, setGenStep] = useState<'select' | 'edit' | 'generating' | 'results'>('select')
const [editableBrief, setEditableBrief] = useState<CreativeBrief | null>(null)
```

Step 1 (select campaign type) → calls a new "generate brief only" mode.
Step 2 (edit copy) → shows editable form fields for each copy variant.
On "Generate Images" → sends the edited brief to the generate endpoint.

For the brief-only step, add `briefOnly: true` to the request body. The generate endpoint returns just the brief without generating images.

For the edit step, render editable fields:

```tsx
{genStep === 'edit' && editableBrief && (
  <div className="space-y-4">
    <h3 className="font-heading font-bold text-foreground">Edit Your Ad Copy</h3>
    <p className="text-xs text-muted-foreground">Review and edit before generation. Each variant creates one ad image.</p>
    {editableBrief.copyVariants.map((variant, idx) => (
      <div key={idx} className="glass-panel rounded-xl p-4 space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Variant {idx + 1}</p>
        <input value={variant.headline} onChange={(e) => { /* update editableBrief */ }}
          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-foreground" placeholder="Headline" />
        <textarea value={variant.body} onChange={(e) => { /* update editableBrief */ }}
          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-foreground" rows={2} placeholder="Body copy" />
        <input value={variant.cta} onChange={(e) => { /* update editableBrief */ }}
          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-foreground" placeholder="CTA text" />
        <input value={variant.offerText || ''} onChange={(e) => { /* update editableBrief */ }}
          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-foreground" placeholder="Offer text (optional, e.g. '20% off')" />
      </div>
    ))}
    <button onClick={handleGenerateWithBrief} className="bg-[#6366f1] text-white px-6 py-2.5 rounded-xl text-sm font-medium">
      Generate {editableBrief.copyVariants.length} Ad Images
    </button>
  </div>
)}
```

- [ ] **Step 4: Add Competitor Insights tab content**

```tsx
{activeTab === 'insights' && (
  <CompetitorInsightsTab brandId={brandId} />
)}
```

Create `CompetitorInsightsTab` as an inline component that:
1. Fetches from `/api/creative/competitor-insights?brandId=X`
2. Renders top performers with thumbnails, format tags, messaging tags, days active
3. Shows trend summary (format counts, messaging counts)
4. "Use as Inspiration" button calls POST to mark the creative

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/creative/page.tsx
git commit -m "feat: Creative Studio — competitor insights tab, two-step generate with copy editing"
```

---

### Task 7: Update Generate Endpoint for Two-Step Flow

**Files:**
- Modify: `src/app/api/creative/generate/route.ts`

- [ ] **Step 1: Add briefOnly mode**

At the top of the POST handler, check for `briefOnly` in the request body:

```typescript
  const { brandId, campaignGoal, targetPersonas, customPrompt, briefOnly, editedBrief } = body as {
    brandId?: string
    campaignGoal?: string
    targetPersonas?: string
    customPrompt?: string
    briefOnly?: boolean
    editedBrief?: CreativeBrief
  }
```

After generating the brief (step 3), if `briefOnly` is true, return immediately:

```typescript
    if (briefOnly) {
      return NextResponse.json({ brief, briefOnly: true })
    }
```

If `editedBrief` is provided, use it instead of generating a new brief:

```typescript
    const activeBrief = editedBrief ?? brief
```

Then use `activeBrief` for image generation instead of `brief`.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/creative/generate/route.ts
git commit -m "feat: two-step generate — briefOnly mode + editedBrief support"
```

---

## Summary

| Task | What | Files | Depends On |
|------|------|-------|-----------|
| 1 | Nano Banana 2 + Imagen 4.0 client | 1 new | — |
| 2 | Competitor creative analysis (Gemini Vision) | 1 modified | — |
| 3 | Competitor Insights API | 1 new | — |
| 4 | Brief update (campaign types + editable copy) | 1 modified | — |
| 5 | Replace fal.ai with Imagen in generate pipeline | 1 modified | Tasks 1, 4 |
| 6 | Creative Studio UI (insights tab + two-step flow) | 1 modified | Tasks 3, 5 |
| 7 | Two-step generate endpoint (briefOnly + editedBrief) | 1 modified | Task 4 |

**Recommended execution order:** Tasks 1-4 in parallel → Task 5 → Tasks 6-7 in parallel

**Total: ~650 lines across 7 files.**

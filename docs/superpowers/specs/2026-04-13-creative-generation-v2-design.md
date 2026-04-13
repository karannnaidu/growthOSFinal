# Competitor-Informed Creative Generation v2 — Design Spec

**Date:** 2026-04-13
**Status:** Approved

## Problem

Current creative generation produces generic AI art disconnected from the brand's actual products and market. No competitor intelligence informs creative decisions. Products get distorted by img2img. Text overlays are AI-generated (unreliable).

## Solution

Replace the current pipeline with a competitor-informed, product-faithful system:
1. Echo analyzes competitor ads from Meta Ad Library (format, style, messaging, performance)
2. Aria generates briefs informed by competitor winners + campaign type
3. User edits copy before generation
4. Nano Banana 2 / Imagen 4.0 generates product-faithful images
5. Text overlays applied programmatically (pixel-perfect)
6. Competitor Insights tab in Creative Studio shows what competitors are doing

---

## 1. Competitor Creative Intelligence (Echo)

### Data Source
Meta Ad Library API via existing `fetchCompetitorAds()` in `competitor-intel.ts`. Already returns: ad ID, page name, creative body, start/stop dates.

### Analysis Pipeline
For each competitor ad with a thumbnail/image:
1. **Gemini Vision** describes the visual: composition, colors, subjects, format
2. **Categorize** by:
   - **Format:** static image, video, carousel, UGC, graphic design
   - **Messaging:** benefit-led, social-proof, urgency/FOMO, educational, lifestyle
   - **Visual style:** studio, lifestyle, UGC, product-hero, graphic
3. **Performance proxy:** `estimated_days_active` from Ad Library dates. 14+ days = likely performing well.
4. **Store** as `competitor_creative` knowledge node with:
   - `visual_description` (from Gemini Vision)
   - `format`, `messaging_approach`, `visual_style` tags
   - `estimated_performance`: high (14+ days), medium (7-14), low (<7)
   - `thumbnail_url` or stored screenshot
   - Embedding includes visual description + tags for RAG

### Auto-Discovery
Echo's `competitor-creative-library` skill runs weekly (already scheduled). New competitor creatives get analyzed and stored automatically.

---

## 2. Creative Studio — Competitor Insights Tab

New tab in `/dashboard/creative` between Gallery and Performance.

### Layout
```
Competitor Insights
├── Trend Summary Card
│   "UGC format dominates (42% of competitor ads). Social proof 
│    messaging up 15%. Static image declining."
│
├── Top Performers (sorted by days active)
│   ┌──────────────────────────────────┐
│   │ [thumbnail] CompetitorX          │
│   │ Format: UGC  │  Message: Social  │
│   │ 34 days active  ★ High performer │
│   │ "I was so skeptical but..."      │
│   │ [Use as Inspiration]             │
│   └──────────────────────────────────┘
│
├── Format Breakdown (pie chart or pills)
│   Static: 35%  Video: 25%  UGC: 30%  Carousel: 10%
│
└── New Experiments (ads <7 days, new formats)
    "CompetitorY testing educational carousel — monitoring"
```

### "Use as Inspiration" Button
- Sets `inspiration_priority: true` on the competitor_creative knowledge node
- Boosts its confidence score to 0.95 (RAG pulls it first)
- When Aria generates next brief, this creative's style/format/messaging is referenced explicitly in the prompt
- Shows a toast: "Aria will use this style in your next generation"

### Data Source
Queries `competitor_creative` knowledge nodes via `/api/creative/competitor-insights?brandId=X`

---

## 3. Creative Generation Pipeline v2

### Campaign Types

| Type | Headline Pattern | CTA | Visual Approach |
|------|-----------------|-----|----------------|
| Urgency/FOMO | "Only X left", "Ends tonight", "Last chance" | "Shop Now" | Bold contrast, timer badge, red/orange accents |
| Offer | "X% off", "Buy 1 Get 1", "Free shipping" | "Claim Offer" | Price slash graphic, bright accents, offer badge |
| Retargeting | "Still thinking?", "Don't miss out", "Come back" | "Complete Purchase" | Warm, familiar, product hero centered |
| Awareness | "Discover", "Meet your new...", "Why thousands trust..." | "Learn More" | Lifestyle, aspirational, clean |

### Two-Step Flow

**Step 1: Brief Generation + User Edit**

User selects:
- Campaign type (Urgency/Offer/Retargeting/Awareness)
- Target product(s) from Brand DNA
- (Optional) custom instructions

Aria generates brief using:
- Competitor top performers from knowledge graph (inspiration-marked ones first)
- Campaign type patterns (headline style, CTA, visual approach)
- Brand DNA (voice, colors, audience, positioning)

Brief includes for each variant (4 variants):
- Headline (editable)
- Body copy (editable)
- CTA text (editable)
- Price/offer text (editable)
- Scene description (editable — describes the lifestyle setting)

User reviews and edits ALL fields before proceeding.

**Step 2: Image Generation + Text Overlay**

For each approved variant:
1. **Nano Banana 2** generates product image:
   - Input: product photo (transparent if available) + scene prompt
   - The model SEES the product and generates it faithfully in the described scene
   - Fallback: Imagen 4.0 Fast for text-to-image if Nano Banana fails
2. **Text overlays handled by Nano Banana 2** — included in the same generation prompt:
   - Headline text, CTA button text, price/offer badge, brand colors
   - All text is specified in the prompt, Nano Banana renders it on the image
   - No separate text overlay step or `sharp` dependency needed
3. Save the ad-ready image (product + scene + text in one generation)

### Image Generation Models

| Model | Use Case | Method | Cost |
|-------|----------|--------|------|
| Nano Banana 2 (`gemini-3.1-flash-image-preview`) | Primary: product + scene + text overlay, all in one | `generateContent` with image input + output | Free |
| Imagen 4.0 Fast (`imagen-4.0-fast-generate-001`) | Fallback: text-to-image if Nano Banana fails | `predict` | Free |
| Imagen 4.0 Ultra (`imagen-4.0-ultra-generate-001`) | Premium: highest quality fallback | `predict` | Free |

### Nano Banana 2 Prompt Structure

```
[Product image provided as input]

Create a professional D2C social media ad featuring this exact product.

Scene: {scene description from brief}
Brand colors: {primary_colors from Brand DNA}

Text overlay requirements:
- Headline (top): "{user-edited headline}"
- CTA button (bottom): "{user-edited CTA}"  
- Offer badge (corner): "{price/offer text}"

Style: {campaign type visual approach — bold/warm/clean/aspirational}
Keep the product label and branding EXACTLY as shown in the reference.
```

---

## 4. Auto-Generation from Competitor Winners

When Echo discovers a high-performing competitor ad (14+ days active, new format):
1. Echo stores it as `competitor_creative` node with `estimated_performance: 'high'`
2. Post-flight Mia decision: "New high-performing competitor creative detected"
3. Mia auto-dispatches Aria's creative generation:
   - Campaign type inferred from competitor's messaging approach
   - Style inspired by the competitor's format/visual
   - Uses the brand's own products
4. Generated creatives land in Gallery with tag "Auto-generated — inspired by [CompetitorX]"
5. User sees notification: "Aria created new creatives based on a competitor trend"
6. Creatives are NOT auto-published — user must approve

### Knowledge Graph Integration

- `competitor_creative` nodes with `inspiration_priority: true` get confidence 0.95
- RAG query in creative brief generation: sort by confidence DESC → inspiration-marked creatives come first
- Aria's brief prompt includes: "The following competitor creatives are marked as inspiration. Match their format and style."
- Generated `ad_creative` nodes link back to inspiration source: edge `inspired_by` → `competitor_creative`

---

## 5. Files to Create/Modify

### New Files

| File | Purpose | Est. Lines |
|------|---------|-----------|
| `src/lib/imagen-client.ts` | Imagen 4.0 + Nano Banana 2 API wrapper (replaces fal.ai for image gen) | 150 |
| `src/app/api/creative/competitor-insights/route.ts` | GET competitor creative data for the Insights tab | 80 |

### Modified Files

| File | Change | Est. Lines |
|------|--------|-----------|
| `src/app/api/creative/generate/route.ts` | Replace fal.ai with Imagen/NanoBanana, add two-step flow, add text overlay | 100 |
| `src/lib/creative-intelligence.ts` | Update brief prompt for campaign types, competitor inspiration, editable fields | 60 |
| `src/app/dashboard/creative/page.tsx` | Add Competitor Insights tab, two-step Generate flow with copy editing | 200 |
| `src/lib/competitor-intel.ts` | Add visual analysis to fetchCompetitorAds output | 40 |
| `skills/diagnosis/competitor-creative-library.md` | Update skill to use Gemini Vision for analysis | 20 |

**Total: ~650 lines new/changed across 7 files.**

---

## 6. Dependencies

- Google AI Key — already configured (Gemini, Imagen, Nano Banana all use same key)
- Meta Ad Library API — already configured (META_APP_ID/SECRET)
- fal.ai — kept for background removal (birefnet) only, no longer used for image generation
- No new npm packages needed

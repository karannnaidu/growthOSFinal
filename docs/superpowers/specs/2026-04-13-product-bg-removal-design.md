# Product Background Removal + Creative Generation — Design Spec

**Date:** 2026-04-13
**Status:** Approved

## Problem

Creative generation uses product images with busy backgrounds. fal.ai img2img distorts products or creates irrelevant mashups. D2C ads need the actual product to be recognizable — transparent background product images produce clean, professional ad creatives.

## Solution

Add "Remove Background" button to Brand DNA product cards. Users approve the result. Creative generation uses transparent versions when available, falls back to original with a warning.

## 1. Background Removal on Brand DNA Page

Each product card gets a "Remove Background" button:
1. Call `fal-ai/birefnet/v2` with product image URL
2. Show transparent result side-by-side with original
3. User clicks "Approve" or re-uploads their own transparent PNG
4. Stored in Supabase Storage: `{brandId}/products/{productName}-transparent.png`
5. Product knowledge node updated with `transparent_image_url` in properties

Product card states:
- No transparent image → "Remove Background" button
- Processing → spinner
- Pending approval → side-by-side preview with Approve/Reject
- Approved → green checkmark, transparent thumbnail

## 2. Creative Generation Pipeline

When generating creatives:
1. Check each product for `transparent_image_url`
2. If exists → use transparent version with fal.ai Flux dev img2img
3. If not → use original image + UI warning: "Better results with transparent backgrounds"
4. Prompt includes product placement, lifestyle context, brand colors
5. Strength 0.6 (keeps product recognizable)
6. Fallback: if Flux img2img fails, try Nano Banana 2

## 3. Data Model

No new tables. Product knowledge node `properties` adds:
- `transparent_image_url: string` — Supabase Storage public URL
- `bg_removed_at: string` — ISO timestamp
- `bg_approved: boolean`

## 4. Files to Change

| File | Change | Est. Lines |
|------|--------|-----------|
| `src/lib/fal-client.ts` | Add `removeBackground(imageUrl)` function | 30 |
| `src/app/api/products/remove-bg/route.ts` | New POST endpoint | 60 |
| `src/app/dashboard/settings/page.tsx` | "Remove Background" button + approval UI | 80 |
| `src/app/api/creative/generate/route.ts` | Use transparent_image_url when available | 10 |
| `src/app/api/settings/brand-dna/route.ts` | Include transparent URLs in response | 5 |

~200 lines total.

## 5. API

**POST /api/products/remove-bg**
```json
Request: { "brandId": "...", "productName": "Peace Mantra", "imageUrl": "https://..." }
Response: { "transparentUrl": "https://supabase.../transparent.png", "originalUrl": "https://..." }
```

**POST /api/products/approve-bg**
```json
Request: { "brandId": "...", "productName": "Peace Mantra", "approved": true }
Response: { "success": true }
```

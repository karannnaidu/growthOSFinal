# Aria — Re-Verification After Fix

**Date:** 2026-04-17 (re-verify)
**Prior grade:** PASS-W-NOTES (creative-path regression)
**New aggregate grade:** PASS-W-NOTES (regression RESOLVED; two smaller issues persist)

## Status of originally-flagged issues

| # | Issue | Status |
|---|-------|--------|
| 1 | `image-brief` post-hook used fal.ai flux/schnell instead of Nano Banana 2 / Imagen 4.0 | **RESOLVED** |
| 2 | `brand-voice-extractor` schema mismatch (`voice_personality` vs `voice_tone`, etc.) at skills-engine.ts ~630-641 | **NOT FIXED** — still present |
| 3 | `creative-fatigue-detector` — `fetchMetaInsights` does not request `frequency` | **NOT FIXED** — still present |
| 4 | `ugc-scout` has no creator-discovery MCP tool | **NOT FIXED** — still present (spec-scaffold acceptable) |
| 5 | Veo video not triggered from agent path | **NOT FIXED** — image path fixed; video still only via `/api/creative/generate` |
| 6 | Cosmetic Shopify prose in `ad-copy` / `image-brief` | Not verified this pass (cosmetic) |

## Creative-path regression — RESOLVED

Confirmed at `src/lib/skills-engine.ts:592-639`. The `image-brief` post-execution hook now:

- Dynamically imports `@/lib/imagen-client` and destructures `generateAdImage` (line 598, 601).
- Calls `generateAdImage({ prompt, referenceImageUrl, width, height })` (lines 609-614) — Nano Banana 2 primary with Imagen 4.0 fallback per `imagen-client.ts`.
- Uploads via base64 buffer: `Buffer.from(img.base64, 'base64')` with `contentType: img.mimeType` into `generated-assets` bucket (lines 617-622).
- Persists through `createMediaNode` with dimensions `${img.width}x${img.height}` (lines 627-633).
- Legacy `generateImage` / flux-schnell call is GONE. `fal-client` is still imported but only to destructure `createMediaNode` (line 601) — no image generation via fal.
- Header comment (lines 592-595) documents the April 2026 swap and alignment with `/api/creative/generate`.

Aria's agent-triggered image path now matches the Creative Studio pipeline.

## Residual notes

- Video generation still not wired into the skills-engine post-hook; Veo remains reachable only via `/api/creative/generate`.
- `brand-voice-extractor` persistence hook still reads legacy keys and will silently write empty values for the richer prompt output — latent data-loss bug.
- `creative-fatigue-detector` still missing `frequency` field in Meta insights query.

Aggregate: **PASS-W-NOTES** — primary regression cleared; remaining items are pre-existing latent bugs, not regressions.

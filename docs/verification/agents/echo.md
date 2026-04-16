# Echo — Phase 2 Re-Verification (Post-Fix)

**Date:** 2026-04-17
**Agent:** Echo (competitive intelligence)
**Skills re-checked:** 4 (`competitor-scan`, `competitor-creative-library`, `competitor-traffic-report`, `competitor-status-monitor`)
**Aggregate grade:** PASS-W-NOTES (unchanged severity; one blocker resolved, three documentation/spec issues remain)

## Status of originally-flagged issues

1. **Double ScrapeCreators fetch in `competitor.ads` handler — FIXED.**
   - `src/lib/competitor-intel.ts:655` — `scanAndStoreCompetitorAds` signature now returns `Promise<{ stored: number; errors: number; ads: AdCreative[] }>`. Early-return at line 667 and final return at line 766 both carry `ads`.
   - `src/lib/mcp-client.ts:380-402` — handler imports **only** `scanAndStoreCompetitorAds` (line 381). No `fetchCompetitorAds` import anywhere in this file (grep confirmed: 0 hits). Handler calls the scan once (line 398) and reads `result.ads` (line 399). The prior redundant `fetchCompetitorAds` call is gone. 2x ScrapeCreators spend per scan is eliminated.

2. **Dead Bucket-B caveat in `competitor-scan.md:27` — STILL PRESENT.**
   - Line 27 still reads: `Use `brand.products` as your product catalog. If `source !== 'shopify'`, caveat any quantitative claims…`. `mcp_tools` does not include `brand.products.list`. No code change here, as expected per the brief.

3. **Landing-page screenshot gap — STILL PRESENT.**
   - `competitor-scan.md` workflow step 1d (line ~60) still promises screenshotting the competitor homepage; no handler in `competitor-intel.ts` or `firecrawl-client.ts` captures landing pages, and no Playwright/Puppeteer dependency was added. Output schema field `landing_page.screenshot_url` remains unbacked.

4. **`competitor-traffic-report` schema-vs-impl drift — STILL PRESENT.**
   - `getTrafficEstimate` (`competitor-intel.ts:329-365`) still hits `domain_analytics/technologies/domain_technologies/live` (line 336) and hard-nulls `traffic_sources.{organic,paid,social,direct,referral}`, `bounce_rate`, `avg_visit_duration` (lines 351-359). `getSEOMetrics` also still hard-nulls `organic_traffic` and `organic_keywords` (lines 397-398). Skill schema continues to advertise the richer shape.

5. Doc drift on `competitor-creative-library` `storage_path` and `competitor-status-monitor` `last_social_post` reliance — unchanged (minor; not in fix scope).

## Double-call fix — confirmed eliminated

- Before: handler called `scanAndStoreCompetitorAds` (which internally calls `fetchCompetitorAds`) then called `fetchCompetitorAds` a second time to populate `ads`.
- After: `src/lib/mcp-client.ts:398-399` uses `result.ads` returned from the single scan call. `fetchCompetitorAds` is no longer imported by `mcp-client.ts`. Verified: each competitor node now triggers exactly one ScrapeCreators company-search + one ads-fetch round-trip per run.

## New aggregate grade

**PASS-W-NOTES** — one functional blocker (cost regression) resolved cleanly; three prompt/schema-vs-impl drift items remain as documented, all non-blocking for first shipping run but worth a follow-up cleanup pass.

# Nova — Re-Verification Report

**Date:** 2026-04-17 (post-fix)
**Agent:** Nova (GEO / AI search visibility)
**Skills:** 1
**Test mode:** Structural re-audit

## Summary

| Skill | Loads | Data resolves | Runs e2e | Output parseable | Output usable | UI renders | Grade |
|-------|-------|---------------|----------|------------------|---------------|------------|-------|
| geo-visibility | PASS | PASS | NEEDS_LIVE_RUN | PASS | NEEDS_LIVE_RUN | NEEDS_LIVE_RUN | PASS-W-NOTES |

## Status of originally-flagged issues

1. **`shopify.orders.list` → `brand.orders.list` migration** — **RESOLVED.** `skills/growth/geo-visibility.md:8` now declares `mcp_tools: [brand.orders.list, ga4.report.run]`. Body copy's brand-resolver intent (line 25: "Use `brand.products` as your product catalog…") is now consistent with the declared tool.

2. **Meta Ads / GSC data referenced in body but not declared in `mcp_tools`** — **UNCHANGED** (not in fix list, expected). `geo-visibility.md:8` still declares only `[brand.orders.list, ga4.report.run]`; the prompt body continues to request `ad_geo_efficiency.best_roas_markets` and organic search-demand signals with no backing tool.

3. **`brand.products.list` not declared despite body referencing `brand.products`** — **UNCHANGED** (not in fix list). Line 25 still references the catalog with no corresponding tool declaration.

4. **Stale example `analysis_date` (2026-04-08)** — **UNCHANGED** (cosmetic; not in fix list).

## Aggregate structural grade: PASS-W-NOTES

Blocking Bucket A migration issue is cleared; remaining notes are prompt/tool reconciliation items previously logged as "known issues for later."

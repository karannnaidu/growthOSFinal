# Max — Phase 2 Re-Verification (Post-Fix)

**Date:** 2026-04-17
**Aggregate grade:** PASS (upgraded from PASS-W-NOTES)

## Status of originally-flagged issues

| # | Issue | Status | Evidence |
|---|---|---|---|
| 1 | `channel-expansion-advisor.mcp_tools` missing `brand.products.list` | **RESOLVED** | `skills/optimization/channel-expansion-advisor.md:8` → `mcp_tools: [brand.orders.list, brand.products.list, ga4.report.run]`. Prompt body's `source !== 'shopify'` conditional (`line 24`) now has a real ResolverResult payload to inspect. |
| 2 | `arrayHasData` silent-pass on `{data: []}` Meta envelope | **RESOLVED** | See code citation below. Affects all 4 Max skills declaring `meta_ads.campaigns.insights`. |
| 3 | `fetchMetaInsights` missing `purchase_roas` / `action_values` | **UNCHANGED** | `src/lib/mcp-client.ts:159` field list still `impressions,clicks,spend,cpc,ctr,actions`. ROAS fabrication risk persists in budget-allocation, ad-scaling, campaign-optimizer. |
| 4 | `meta_ads.adsets.list` fetches no spend/insights | **UNCHANGED** | `src/lib/mcp-client.ts:182-184` still only fetches `id,name,status,daily_budget,lifetime_budget,optimization_goal`. `ad-performance-analyzer` per-adset claims remain data-free. |
| 5 | `channel-expansion-advisor` missing `requires:` field (cosmetic) | UNCHANGED | Still absent at `channel-expansion-advisor.md:1-22`. Non-blocking. |

## Silent-data bug — RESOLVED

`src/lib/skills-engine/preflight.ts:27-40` now unwraps envelope shapes before length-checking:

```ts
function arrayHasData(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  if (!v) return false;
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    for (const key of ['data', 'rows', 'campaigns', 'adsets', 'customers', 'orders', 'products']) {
      if (key in obj) return arrayHasData(obj[key]);
    }
    return Object.keys(obj).length > 0;
  }
  return !!v;
}
```

An empty Meta account returning `{data: []}` now recurses to `arrayHasData([]) → false`, flipping `hasData: false`, which causes `computeBlockage` (`preflight.ts:123`) to emit a proper block reason rather than silently passing an empty array to the LLM. Correct.

## New aggregate grade: PASS

Structural issues resolved. Remaining items (#3, #4) are API-surface data-gap concerns for live-run hardening, not Phase 2 structural blockers. channel-expansion-advisor grade raised C → A-.

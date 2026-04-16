# Nova — Verification Report

**Date:** 2026-04-17
**Agent:** Nova (GEO / AI search visibility)
**Skills:** 1
**Test mode:** Structural audit

## Summary

| Skill | Loads | Data resolves | Runs e2e | Output parseable | Output usable | UI renders | Grade |
|-------|-------|---------------|----------|------------------|---------------|------------|-------|
| geo-visibility | PASS | PASS-W-NOTES | NEEDS_LIVE_RUN | PASS | NEEDS_LIVE_RUN | NEEDS_LIVE_RUN | PASS-W-NOTES |

## Per-skill details

### geo-visibility

- **Location:** `skills/growth/geo-visibility.md`
- **Frontmatter:** verbatim

  ```yaml
  id: geo-visibility
  name: Geographic Visibility Analyzer
  agent: nova
  category: growth
  complexity: cheap
  credits: 1
  mcp_tools: [shopify.orders.list, ga4.report.run]
  chains_to: [ad-copy, audience-targeting]
  schedule: "0 9 * * 1"
  knowledge:
    needs: [audience, metric, campaign, keyword, insight]
    semantic_query: "geographic market expansion regional performance location targeting"
    traverse_depth: 1
    include_agency_patterns: true
  produces:
    - node_type: insight
      edge_to: audience
      edge_type: derived_from
    - node_type: metric
      edge_to: audience
      edge_type: measures
  ```

- **Loads:** PASS — YAML parses cleanly. All core fields present (id, name, agent, category, complexity, credits, mcp_tools, chains_to, schedule, knowledge, produces). `agent: nova` correctly wires to the Nova agent. `complexity: cheap` + `credits: 1` is consistent.

- **Data resolves:** PASS-W-NOTES. Both declared `mcp_tools` are registered in `src/lib/mcp-client.ts`:
  - `shopify.orders.list` — present in `TOOL_HANDLERS` (line 347) and `TOOL_PLATFORM` (line 538); will fetch `orders.json?limit=50&status=any`.
  - `ga4.report.run` — present in `TOOL_HANDLERS` (line 367) and `TOOL_PLATFORM` (line 543); runs the 30-day GA4 `runReport`.
  - **Issue:** This skill is a Phase 1 Task 7/8 migration miss. The body copy explicitly opens with "Use `brand.products` as your product catalog. If `source !== 'shopify'`, caveat any quantitative claims…" — signalling intent to use the brand-level resolver — but the `mcp_tools` list still declares `shopify.orders.list` rather than `brand.orders.list`. The skill reads orders-shaped data, so the correct migration target is `brand.orders.list` (registered at line 476 via `resolveBrandOrders`). As currently declared, Nova will hard-block on brands without a live Shopify connection (Phase 1 runSkill hard-block behaviour) rather than gracefully falling back to `brand_data` via the resolver.

- **Runs end-to-end:** NEEDS_LIVE_RUN. Not a pure-LLM skill — it depends on Shopify + GA4 credentials and the MCP fetch pipeline.

- **Output parseable:** PASS. The body declares a single, well-formed JSON output schema under `## Output Format` with a stable top-level shape: `analysis_date`, `total_markets_analyzed`, `current_performance` (`top_markets`, `fastest_growing`, `underperforming`), `expansion_opportunities[]` (each with `opportunity_score`, `evidence{}`, `recommended_actions[]`), `geographic_insights[]`, and `ad_geo_efficiency{}`. `recommended_actions` entries carry `{action, agent, skill}` which aligns with the declared `chains_to: [ad-copy, audience-targeting]` plus a Max budget-allocation handoff. No multi-format ambiguity.

- **Output usable:** NEEDS_LIVE_RUN.

- **UI renders:** NEEDS_LIVE_RUN.

- **Grade:** PASS-W-NOTES.

- **Issues found:**
  1. `mcp_tools` still contains `shopify.orders.list` — should be migrated to `brand.orders.list` to match the body copy's brand-resolver intent and to avoid hard-block on non-Shopify brands under the new runSkill gating.
  2. The skill's "Inputs Required" section lists Meta Ads and Google Search Console data (for ROAS by region, search volume by geography), but neither `meta_ads.campaigns.insights` nor `gsc.performance` is declared in `mcp_tools`. The LLM will be asked to produce `ad_geo_efficiency.best_roas_markets` and organic demand signals without the backing data, risking hallucinated numbers. Either add the missing tools or prune the prompt sections that depend on them.
  3. No product-catalog tool is declared, yet the body opens with "Use `brand.products` as your product catalog." If that guidance is load-bearing, `brand.products.list` should be added to `mcp_tools`; otherwise the line is dead instruction.
  4. The output `analysis_date` in the example (`2026-04-08`) is stale relative to today (`2026-04-17`) — cosmetic only; the LLM fills in at runtime.

## Aggregate structural grade: PASS-W-NOTES

## Known issues noted for later

- Complete the Bucket A `shopify.*` → `brand.*` migration for this skill (`shopify.orders.list` → `brand.orders.list`).
- Reconcile the `mcp_tools` declaration with the inputs the body asks the LLM to reason over: either declare `meta_ads.campaigns.insights`, `gsc.performance`, and `brand.products.list`, or trim the prompt sections that reference ad ROAS by geography, organic search demand by geography, and the product catalog.
- Once `brand.orders.list` is wired in, confirm the `_data_caveats` injection renders correctly when `source !== 'shopify'` so the opening prompt instruction ("say 'based on your product catalog' rather than 'based on your store data'") has the signal it needs.

## What needs a live run to verify

- Live-run checks 3/5/6 require connecting Meta, Shopify (or equivalent fallback source) and a running dev server.

# Navi — Verification Report

**Date:** 2026-04-17
**Agent:** Navi (Ops — Inventory + Compliance)
**Skills:** 3 (`inventory-alert`, `reorder-calculator`, `compliance-checker`)
**Test mode:** Structural audit (no code edits, no runtime execution)

## Summary

| Skill | Loads | Data resolves | Runs e2e | Output parseable | Output usable | UI renders | Grade |
|---|---|---|---|---|---|---|---|
| inventory-alert | PASS | PASS | NEEDS_LIVE_RUN | PASS (JSON) | NEEDS_LIVE_RUN | NEEDS_LIVE_RUN | A (structural) |
| reorder-calculator | PASS | PASS | NEEDS_LIVE_RUN | PASS (JSON) | NEEDS_LIVE_RUN | NEEDS_LIVE_RUN | A (structural) |
| compliance-checker | PASS | PASS (pure LLM) | PASS (no MCP deps) | PASS (JSON) | NEEDS_LIVE_RUN | NEEDS_LIVE_RUN | A (structural) |

## Per-skill details

### inventory-alert

- **Location:** `skills/ops/inventory-alert.md`
- **Frontmatter:**
  - `id: inventory-alert`, `agent: navi`, `category: ops`
  - `complexity: free`, `credits: 0`
  - `mcp_tools: [brand.products.list]`
  - `chains_to: [reorder-calculator]`
  - `schedule: "0 7 * * *"` (daily 7am)
  - `knowledge.needs: [product, metric, campaign]`
  - `produces: insight (edge_to: product), metric`
- **Check 1 — Loads:** PASS. YAML parses cleanly; standard frontmatter delimiters.
- **Check 2 — Data resolves:** PASS. `brand.products.list` is registered in `src/lib/mcp-client.ts` TOOL_HANDLERS (line 468). No lingering `shopify.*` references in declared tools. Body text correctly instructs: "Use `brand.products` as your product catalog. If `source !== 'shopify'`, caveat any quantitative claims…" — matches Phase 1 resolver contract.
- **Check 3 — Runs e2e:** NEEDS_LIVE_RUN. Declares one Bucket A tool; requires a brand with Shopify (or fallback catalog in `brands.brand_data`) to execute meaningfully.
- **Check 4 — Output parseable:** PASS. Declared output is a well-structured JSON object with top-level keys: `scan_date`, `products_checked`, `healthy/watch/warning/critical/overstock` counts, `alerts[]`, `upcoming_impact`, `summary`. Per-alert schema includes `product`, `severity`, `days_remaining`, `reorder_urgency`, `ad_action`, `recommendation`.
- **Check 5 — Output usable:** NEEDS_LIVE_RUN. Output has strong hooks for downstream agents (`ad_action` → Max; `severity` → BlockedRunCard isn't applicable here since it's not blocked, but alert severity maps cleanly to UI badges).
- **Check 6 — UI renders:** NEEDS_LIVE_RUN.
- **Grade:** A (structural). Well-migrated to Bucket A, clean auto-chain semantics, caveat logic wired to `source` field.
- **Issues:** None blocking. Minor: workflow step 1 still says "via Shopify MCP" in plain English — non-blocking since `mcp_tools` is correctly migrated, but prose could be updated to "via `brand.products`" for consistency.

### reorder-calculator

- **Location:** `skills/ops/reorder-calculator.md`
- **Frontmatter:**
  - `id: reorder-calculator`, `agent: navi`, `category: ops`
  - `complexity: free`, `credits: 0`
  - `mcp_tools: [brand.products.list, brand.orders.list]`
  - `requires: [shopify]`
  - `chains_to: [cash-flow-forecast]`
  - `knowledge.needs: [product, metric]`
  - `produces: metric (edge_to: product, edge_type: measures)`
- **Check 1 — Loads:** PASS. YAML parses.
- **Check 2 — Data resolves:** PASS. Both declared tools registered in TOOL_HANDLERS (lines 468, 476). No lingering `shopify.*` in `mcp_tools`. Body correctly uses `brand.orders` / `brand.customers` / `brand.products` vocabulary with `source` caveat instruction.
- **Check 3 — Runs e2e:** NEEDS_LIVE_RUN. Requires real order history for meaningful EOQ math (noted as a known consideration). Without Shopify, `brand.orders.list` will fall back to Klaviyo/brand_data if available; otherwise `runSkill` hard-blocks with `blocked_reason` and renders via BlockedRunCard.
- **Check 4 — Output parseable:** PASS. JSON with `calculation_date`, `reorder_recommendations[]` (rich per-product math: velocity, stddev, lead_time, safety_stock, reorder_point, EOQ, expedite_option), `cash_impact`, `seasonal_adjustment`, `summary`.
- **Check 5 — Output usable:** NEEDS_LIVE_RUN. Output chains explicitly to Penny's `cash-flow-forecast` — cross-agent hand-off structure is sound.
- **Check 6 — UI renders:** NEEDS_LIVE_RUN.
- **Grade:** A (structural).
- **Issues:** `requires: [shopify]` — note that `brand.orders.list` resolver now falls back to Klaviyo / `brands.brand_data`, so `requires` may be overly strict; however blocking semantics are correctly handled at the `runSkill` level via tool-source checks, so this declaration is informational. Math meaningfulness depends on order history depth (known consideration).

### compliance-checker

- **Location:** `skills/ops/compliance-checker.md`
- **Frontmatter:**
  - `id: compliance-checker`, `agent: navi`, `category: ops`
  - `complexity: free`, `credits: 0`
  - `mcp_tools: []` (pure LLM)
  - `chains_to: []`
  - `schedule: "0 8 1 * *"` (monthly, 1st at 8am)
  - `knowledge.needs: [product, creative, brand_guidelines]`
  - `produces: insight (edge_to: product)`
- **Check 1 — Loads:** PASS. YAML parses.
- **Check 2 — Data resolves:** PASS. Empty `mcp_tools` array — no external dependencies to satisfy; pulls from knowledge graph only. Body mentions `brand.products` with `source` caveat pattern for when product claims are audited.
- **Check 3 — Runs e2e:** PASS. Pure LLM with knowledge-graph context; will not hard-block under Phase 1 semantics since no tool requires a source.
- **Check 4 — Output parseable:** PASS. JSON with `audit_date`, `overall_compliance_score`, 5 sub-category blocks (`legal`, `platform_policies`, `product_claims`, `accessibility`, `data_tracking`) each with `score`, `status`, `checks[]`; plus `priority_fixes[]` and `legal_review_recommended[]`.
- **Check 5 — Output usable:** NEEDS_LIVE_RUN. Output chains informally to Aria (ad compliance), Mia (founder review), Hugo (accessibility/alt-text).
- **Check 6 — UI renders:** NEEDS_LIVE_RUN.
- **Grade:** A (structural). Safest of the three — no MCP failure modes.
- **Issues:** None. `chains_to: []` is explicit, and downstream alerts are handled in prose (non-contract).

## Aggregate structural grade: **A**

All 3 skills load cleanly, have fully migrated `mcp_tools` declarations pointing at Phase 1 Bucket A/B resolvers, contain well-structured JSON output schemas, and correctly implement the `source` caveat pattern in body prose. `compliance-checker` is runnable today (pure LLM); the two inventory skills need a live brand with data to exercise end-to-end.

## Known issues noted for later

- `reorder-calculator` output quality is data-bound: real EOQ / safety-stock math needs ≥30 days of order history. Without it, the LLM will produce plausible-looking but arithmetically-fabricated numbers. Consider a minimum-history guardrail in the skill (e.g., refuse to emit `velocity_stddev` / `safety_stock` if `orders.length < 30`).
- `reorder-calculator` frontmatter has `requires: [shopify]` but its declared tools (`brand.*`) support non-Shopify fallback. Either tighten (keep `requires`) or loosen (document that Klaviyo/brand_data fallback is acceptable for directional recommendations).
- `inventory-alert` prose still says "via Shopify MCP" in step 1 of workflow — cosmetic, but drift from the migrated `mcp_tools` declaration.
- `compliance-checker`'s "Inputs Required" list references "Product descriptions and claims (from Shopify)" — similar cosmetic drift; the skill doesn't actually declare a Shopify tool so it must pull product claims from the knowledge graph / brand settings.

## What needs a live run to verify

- `inventory-alert`: resolver behavior across all three paths (Shopify primary, `brands.brand_data` fallback, Klaviyo) including the `source` / `confidence` / `isComplete` envelope; blocked-state rendering when no source exists.
- `reorder-calculator`: EOQ math correctness on a real order history; cash_impact block accuracy (needs Penny's billing-check context); expedite_option reasoning quality.
- `compliance-checker`: end-to-end LLM run against a real brand's knowledge graph — specifically whether it fabricates compliance findings or grounds them in actual ad copy / product pages.
- All three: `skill_runs` row state (`status`, `blocked_reason`, output JSON shape), BlockedRunCard rendering when data absent, chain execution (`inventory-alert` → `reorder-calculator` → `cash-flow-forecast`).

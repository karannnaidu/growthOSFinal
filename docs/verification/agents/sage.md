# Sage — Verification Report

**Date:** 2026-04-17
**Agent:** Sage (CRO + Pricing)
**Skills:** 4
**Test mode:** Structural audit

## Summary

| Skill | Loads | Data resolves | Runs e2e | Output parseable | Output usable | UI renders | Grade |
|-------|-------|---------------|----------|------------------|---------------|------------|-------|
| page-cro | PASS | PASS-W-NOTES | NEEDS_LIVE_RUN | PASS | NEEDS_LIVE_RUN | NEEDS_LIVE_RUN | PASS-W-NOTES |
| signup-flow-cro | PASS | PASS | NEEDS_LIVE_RUN | PASS | NEEDS_LIVE_RUN | NEEDS_LIVE_RUN | PASS |
| ab-test-design | PASS | PASS-W-NOTES | NEEDS_LIVE_RUN | PASS | NEEDS_LIVE_RUN | NEEDS_LIVE_RUN | PASS-W-NOTES |
| pricing-optimizer | PASS | PASS-W-NOTES | NEEDS_LIVE_RUN | PASS | NEEDS_LIVE_RUN | NEEDS_LIVE_RUN | PASS-W-NOTES |

## Per-skill details

### page-cro

- **Location:** `skills/optimization/page-cro.md`
- **Frontmatter:** verbatim

  ```yaml
  id: page-cro
  name: Page CRO Analyzer
  agent: sage
  category: optimization
  complexity: mid
  credits: 2
  mcp_tools: [ga4.report.run]
  chains_to: [ab-test-design]
  knowledge:
    needs: [product, metric, persona, insight, competitor]
    semantic_query: "conversion rate optimization product page landing page UX friction"
    traverse_depth: 2
    include_agency_patterns: true
  produces:
    - node_type: insight
      edge_to: product
      edge_type: derived_from
    - node_type: recommendation
      edge_to: insight
      edge_type: based_on
  ```

- **Loads:** PASS — YAML parses cleanly. All core fields present. `agent: sage`, `complexity: mid`, `credits: 2` consistent. `chains_to: [ab-test-design]` points to a sibling Sage skill that exists in the same folder.

- **Data resolves:** PASS-W-NOTES. The one declared tool resolves:
  - `ga4.report.run` — registered in `TOOL_HANDLERS` (`src/lib/mcp-client.ts:367`) and `TOOL_PLATFORM` (line 543, platform `google_analytics`). Runs the 30-day GA4 `runReport`.
  - **Bucket B miss:** This is one of the two skills flagged in the brief as Bucket B (product catalog). The body opens with the canonical Phase 1 caveat *"Use `brand.products` as your product catalog. If `source !== 'shopify'`, caveat any quantitative claims…"* — signalling intent to use the brand-level resolver — but `mcp_tools` does NOT declare `brand.products.list`. Under the Phase 1 runSkill hard-block behaviour, the prompt will request product-catalog reasoning that has no declared data source, so the LLM will either hallucinate or fall back to knowledge-graph `product` nodes (which are present in `knowledge.needs`, so partial cover exists). To honor the body instruction, add `brand.products.list` to `mcp_tools` (it's registered in `TOOL_HANDLERS` at line 468 and is credential-safe — `resolveBrandProducts` falls back to `brand_data` when Shopify isn't connected).
  - The prompt also asks for "Product page URLs and content (from Shopify via MCP)" and funnel `add_to_cart`/`checkout`/`purchase` rates, which implicitly need `brand.orders.list` or `shopify.orders.list` for the conversion-funnel numbers in the example output — neither is declared.

- **Runs end-to-end:** NEEDS_LIVE_RUN. Not a pure-LLM skill — depends on GA4 credentials and (per the body) Shopify/brand-catalog data.

- **Output parseable:** PASS. A single, well-formed JSON schema under `## Output Format` with a stable top-level shape: `analysis_date`, `pages_analyzed`, `current_funnel{}`, `biggest_drop_off`, `page_audits[]` (with nested `issues[]` carrying `{issue, evidence, impact, fix, estimated_lift, effort}`), `quick_wins[]`, `estimated_revenue_impact{}`. No multi-format ambiguity.

- **Output usable:** NEEDS_LIVE_RUN.

- **UI renders:** NEEDS_LIVE_RUN.

- **Grade:** PASS-W-NOTES.

- **Issues found:**
  1. Bucket B migration incomplete: body references `brand.products` but `mcp_tools` omits `brand.products.list`.
  2. Funnel numbers in the output schema (`page_view_to_atc`, `atc_to_checkout`, `checkout_to_purchase`) have no declared orders-shaped data source; add `brand.orders.list` or prune the funnel section.
  3. Example output's `analysis_date` (`2026-04-08`) is stale relative to today — cosmetic.

### signup-flow-cro

- **Location:** `skills/optimization/signup-flow-cro.md`
- **Frontmatter:** verbatim

  ```yaml
  id: signup-flow-cro
  name: Signup & Checkout Flow CRO
  agent: sage
  category: optimization
  complexity: premium
  credits: 3
  mcp_tools: [shopify.orders.list, ga4.report.run]
  chains_to: [ab-test-design]
  knowledge:
    needs: [metric, persona, insight, experiment]
    semantic_query: "checkout flow signup conversion funnel friction cart abandonment"
    traverse_depth: 2
    include_agency_patterns: true
  produces:
    - node_type: insight
      edge_to: metric
      edge_type: derived_from
    - node_type: recommendation
      edge_to: insight
      edge_type: based_on
  ```

- **Loads:** PASS — YAML parses cleanly. `complexity: premium` + `credits: 3` is consistent. `knowledge.needs` correctly omits `product` (this skill reasons over the flow, not the catalog).

- **Data resolves:** PASS. Both declared tools registered:
  - `shopify.orders.list` — `TOOL_HANDLERS` line 347, `TOOL_PLATFORM` line 538 (platform `shopify`), fetches `orders.json?limit=50&status=any`.
  - `ga4.report.run` — as above.
  - **Bucket A note:** this skill declares the legacy `shopify.orders.list` rather than the brand-level `brand.orders.list`. Unlike `page-cro`, the body does NOT open with the `brand.products`/caveat language, so this is a defensible Bucket A design choice — the skill is explicitly Shopify-flow-focused (the example output hard-codes `"checkout_type": "shopify_standard"`). However, under the Phase 1 runSkill hard-block, brands without a Shopify connection will hard-block rather than fall back. If desired behaviour is graceful degradation (e.g. using knowledge-graph checkout/persona nodes when Shopify is absent), migrate to `brand.orders.list`.

- **Runs end-to-end:** NEEDS_LIVE_RUN. Not a pure-LLM skill — requires Shopify + GA4 credentials.

- **Output parseable:** PASS. Single JSON schema with stable shape: `analysis_date`, `checkout_type`, `total_steps`, `overall_checkout_completion`, `benchmark_completion`, `gap`, `estimated_monthly_revenue_lost`, `funnel[]` (each step has `visitors`, `drop_off_rate`, `issues[]` with `{issue, evidence, fix, impact, estimated_lift}`), `priority_fixes[]`, `projected_improvement{}`.

- **Output usable:** NEEDS_LIVE_RUN.

- **UI renders:** NEEDS_LIVE_RUN.

- **Grade:** PASS.

- **Issues found:**
  1. Intentional Bucket A scoping (Shopify-only) may be fine, but worth a conscious decision given the Phase 1 hard-block behaviour. If non-Shopify brands should run this, migrate to `brand.orders.list`.
  2. The body lists "Shopify checkout configuration: fields required, payment options, shipping options" as an input — there is no `shopify.checkout.config` tool registered, so the LLM will infer this from the scraped/declared shop metadata only.

### ab-test-design

- **Location:** `skills/optimization/ab-test-design.md`
- **Frontmatter:** verbatim

  ```yaml
  id: ab-test-design
  name: A/B Test Designer
  agent: sage
  category: optimization
  complexity: mid
  credits: 2
  mcp_tools: [ga4.report.run]
  chains_to: [persona-ab-predictor]
  knowledge:
    needs: [experiment, metric, insight, persona, creative]
    semantic_query: "AB test experiment design statistical significance sample size"
    traverse_depth: 1
    include_agency_patterns: true
  produces:
    - node_type: experiment
      edge_to: insight
      edge_type: tests
  ```

- **Loads:** PASS — YAML parses cleanly. `traverse_depth: 1` is the shallowest among Sage's skills, which suits a design-only skill that consumes a hypothesis rather than mining the graph. `produces` emits a single `experiment` node, matching the skill's purpose.

- **Data resolves:** PASS-W-NOTES.
  - `ga4.report.run` — registered (line 367 / 543). Provides baseline traffic volume used in the `statistical_plan.current_daily_traffic` field.
  - **Chain target risk:** `chains_to: [persona-ab-predictor]`. This skill is referenced by `page-cro` and `signup-flow-cro` as their auto-chain target, so the chain graph is Sage→Sage→`persona-ab-predictor`. `persona-ab-predictor` was not inspected as part of this audit; if it does not exist or is not registered, the chain will fail silently at runtime. Verify existence before relying on the auto-chain.
  - The prompt asks for "Historical test results (from experiment nodes)" — this is served by `knowledge.needs: [experiment, …]` rather than an MCP tool, which is correct.

- **Runs end-to-end:** NEEDS_LIVE_RUN. Requires GA4 for baseline traffic volume; otherwise statistical plan (sample size, duration) has no grounding.

- **Output parseable:** PASS. Single JSON schema with stable shape: `test_id`, `test_name`, `hypothesis{}`, `design{variants[], audience, traffic_split, pages[]}`, `metrics{primary{}, secondary[]}`, `statistical_plan{}`, `decision_framework{}`, `risks_and_mitigations[]`, `persona_predictions{}`. The nested shapes are consistent and machine-parseable.

- **Output usable:** NEEDS_LIVE_RUN.

- **UI renders:** NEEDS_LIVE_RUN.

- **Grade:** PASS-W-NOTES.

- **Issues found:**
  1. `chains_to: [persona-ab-predictor]` — verify the target skill exists and is registered. If it doesn't, the chain will no-op.
  2. The hypothesis is supposed to come from an upstream skill (per "When to Run"), but there is no typed input contract that enforces this; the skill will accept a user-typed prompt. Acceptable for Phase 1 but worth noting.

### pricing-optimizer

- **Location:** `skills/optimization/pricing-optimizer.md`
- **Frontmatter:** verbatim

  ```yaml
  id: pricing-optimizer
  name: Pricing Optimizer
  agent: sage
  category: optimization
  complexity: mid
  credits: 2
  mcp_tools: [shopify.orders.list]
  chains_to: [ab-test-design]
  knowledge:
    needs: [product, competitor, metric, persona, insight]
    semantic_query: "pricing strategy elasticity margin optimization bundle discount"
    traverse_depth: 2
    include_agency_patterns: true
  produces:
    - node_type: insight
      edge_to: product
      edge_type: derived_from
    - node_type: recommendation
      edge_to: product
      edge_type: optimizes
  ```

- **Loads:** PASS — YAML parses cleanly. `knowledge.needs` includes `product` and `competitor`, aligned with the body's "competitive positioning" and "product catalog with margins" inputs.

- **Data resolves:** PASS-W-NOTES.
  - `shopify.orders.list` — registered (line 347 / 538).
  - **Bucket B miss (same pattern as `page-cro`):** body opens with *"Use `brand.products` as your product catalog. If `source !== 'shopify'`, caveat any quantitative claims…"* but `mcp_tools` does NOT declare `brand.products.list`. The first "Inputs Required" line is "Product catalog with current prices, costs, and margins" — that is squarely `brand.products.list` territory (its `ResolverResult` carries price and metadata). Migrate to `mcp_tools: [brand.products.list, brand.orders.list]` (or keep `shopify.orders.list` if Shopify-specific order structure is load-bearing).
  - Using legacy `shopify.orders.list` means the skill will hard-block on non-Shopify brands despite the body's explicit "if `source !== 'shopify'`" graceful-degradation guidance — which is inconsistent.

- **Runs end-to-end:** NEEDS_LIVE_RUN. Requires Shopify orders + (ideally) brand-level product catalog.

- **Output parseable:** PASS. Single JSON schema with stable shape: `analysis_date`, `products_analyzed`, `overall_pricing_health`, `products[]` (each with `current_price`, `cogs`, `shipping_cost`, `current_margin`, `monthly_units`, `competitor_prices[]`, `competitive_position`, `pricing_signals{}`, `scenarios[]`, `recommendation{}`), `bundle_opportunities[]`, `discount_strategy{}`. Numerically dense and well-typed.

- **Output usable:** NEEDS_LIVE_RUN.

- **UI renders:** NEEDS_LIVE_RUN.

- **Grade:** PASS-W-NOTES.

- **Issues found:**
  1. Bucket B migration incomplete: `brand.products.list` should be declared to match the body's `brand.products` instruction and to enable the documented `source !== 'shopify'` caveat pathway.
  2. The schema asks for `cogs` and `shipping_cost` per product — neither is a field on `BrandProduct` from `resolveBrandProducts` (product margin data is usually not exposed via Shopify REST). The LLM will likely infer or omit. Consider either (a) documenting that these are user-provided / graph-stored, or (b) trimming the margin fields from the required output.
  3. The body mentions "Historical price changes and their impact (if available in knowledge graph)" — correctly served by `knowledge.needs: [insight, …]` with `traverse_depth: 2`. No change needed.
  4. Example output's `analysis_date` (`2026-04-08`) is stale — cosmetic.

## Aggregate structural grade: PASS-W-NOTES

Sage is close to green. All 4 skills load cleanly, all declared tools are registered in `mcp-client.ts`, and every output schema is a single well-formed JSON blob. The only structural concerns are two Bucket B migration misses (`page-cro`, `pricing-optimizer` — body references `brand.products` but frontmatter doesn't declare `brand.products.list`) and one Bucket A scoping decision (`signup-flow-cro` uses `shopify.orders.list` by design but should be consciously confirmed).

## Known issues noted for later

- **Bucket B migration completion:** Add `brand.products.list` to `page-cro` and `pricing-optimizer` `mcp_tools`. `resolveBrandProducts` already returns the `{ data, source, confidence, isComplete }` shape and falls back to `brand_data`, which is exactly what the body copy's `source !== 'shopify'` caveat language assumes.
- **Missing orders tool on `page-cro`:** The funnel section of the output asks for `page_view_to_atc`/`atc_to_checkout`/`checkout_to_purchase` — add `brand.orders.list` (or `shopify.orders.list` + `ga4.report.run` is probably sufficient) or prune that section of the output schema.
- **Bucket A decision on `signup-flow-cro`:** explicitly decide whether non-Shopify brands should be able to run this; migrate to `brand.orders.list` if yes.
- **Margin data gap in `pricing-optimizer`:** `cogs` and `shipping_cost` are not in the `BrandProduct` shape. Either add a knowledge-graph pathway or soften the output schema.
- **Chain dependency verification:** confirm `persona-ab-predictor` exists and is registered before relying on `ab-test-design`'s auto-chain.
- **Stale `analysis_date` in three example outputs** — cosmetic only; the LLM fills in at runtime.

## What needs a live run to verify

- Rubric checks 3 (Runs e2e), 5 (Output usable), 6 (UI renders) for all four skills. All require:
  - Live Shopify + GA4 credentials against a seeded brand, OR
  - A brand with `brand_data` fallback populated to exercise the `source !== 'shopify'` caveat path once Bucket B migration lands.
- Verification that `BlockedRunCard` renders correctly when a Sage skill hard-blocks (e.g. run `pricing-optimizer` on a brand with no Shopify — expect `blocked_reason: "Cannot run: no data source for shopify.orders.list. Connect shopify to unlock."`).
- End-to-end auto-chain smoke test: `page-cro` → `ab-test-design` → `persona-ab-predictor`.

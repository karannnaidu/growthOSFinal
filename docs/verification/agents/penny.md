# Penny — Verification Report

**Date:** 2026-04-17
**Agent:** Penny (Finance)
**Skills:** 3 (`billing-check`, `unit-economics`, `cash-flow-forecast`)
**Test mode:** Structural audit (no live run)

## Summary

| Skill | Loads | Data resolves | Runs e2e | Output parseable | Output usable | UI renders | Grade |
|-------|-------|---------------|----------|------------------|---------------|------------|-------|
| billing-check | PASS | FAIL | PASS | PASS | NEEDS_LIVE_RUN | NEEDS_LIVE_RUN | FAIL |
| unit-economics | PASS | PASS | NEEDS_LIVE_RUN | PASS | NEEDS_LIVE_RUN | NEEDS_LIVE_RUN | PASS |
| cash-flow-forecast | PASS | PASS-W-NOTES | NEEDS_LIVE_RUN | PASS | NEEDS_LIVE_RUN | NEEDS_LIVE_RUN | PASS-W-NOTES |

## Per-skill details

### billing-check

- **Location:** `skills/ops/billing-check.md` (filed under `ops/` directory, though `agent: penny` and the role wires it to Finance — cross-directory placement is intentional per current layout).
- **Frontmatter:** verbatim

  ```yaml
  id: billing-check
  name: Billing & Cost Monitor
  agent: penny
  category: ops
  complexity: free
  credits: 0
  mcp_tools: []
  chains_to: [unit-economics]
  schedule: "0 8 * * 1"
  knowledge:
    needs: [metric, campaign, channel]
    semantic_query: "billing costs subscription fees platform charges ad spend reconciliation"
    traverse_depth: 1
    include_agency_patterns: false
  produces:
    - node_type: metric
    - node_type: insight
      edge_to: metric
      edge_type: derived_from
  ```

- **Loads:** PASS — YAML parses. All required fields present. `agent: penny` correctly wires back to Finance via `skills/agents.json`. `complexity: free` with `credits: 0` is internally consistent.

- **Data resolves:** FAIL. `mcp_tools: []` is empty, so the `runSkill` hard-block (`skills-engine.ts:312 computeBlockage`) never triggers — but that is only because no tools are declared at all. The skill body explicitly lists data inputs the LLM is expected to reason over: *Shopify billing / app subscriptions / transaction fees*, *ad-platform actual charges (Meta / Google / TikTok)*, *tool subscriptions (Klaviyo etc.)*, *Growth OS credit usage*. None of those are represented by a registered MCP tool or brand-level resolver. Additionally, **scope is wrong per spec**: the prompt talks about the brand's Shopify plan + apps + ad spend (brand's own vendor billing), whereas the Phase 1 spec (line 224) scopes `billing-check` to Growth OS's own subscription/wallet (`wallets`, `wallet_transactions`, Task 2/3). Neither resolver exists: `src/lib/resolvers/` contains only `brand-products.ts`, `brand-orders.ts`, `brand-customers.ts`. There is no `wallet.*` or `billing.*` tool in `TOOL_HANDLERS` (see `src/lib/mcp-client.ts:339–501`). Per spec, we must NOT fix in this audit — just document. Current effect: the skill will run as a pure-LLM skill with zero data inputs and hallucinate numbers (e.g. the example output's `"total_weekly_costs": 1847`, the Bold Upsell line item, the Klaviyo tier limit).

- **Runs end-to-end:** PASS — formally "pure LLM" because `mcp_tools: []` means no MCP fetch step is attempted and no hard-block is possible. (This is the wrong reason to pass, but the structural rubric counts it as PASS.)

- **Output parseable:** PASS. One precise top-level JSON schema under `## Output Format` with stable keys: `period`, `total_weekly_costs`, `cost_breakdown{shopify_plan, shopify_transaction_fees, shopify_apps{total, apps[]}, ad_spend{meta, google}, growth_os{credits_used, ai_cost}}`, `waste_detected[]`, `cost_trends{}`, `alerts[]`, `savings_opportunities[]`, `total_potential_savings`. Per-item records carry discriminating fields (`flag: "waste"`, `severity`, `status`). No multi-format ambiguity. As a quant skill, schema precision is appropriate.

- **Output usable:** NEEDS_LIVE_RUN.

- **UI renders:** NEEDS_LIVE_RUN.

- **Grade:** FAIL — because the data-resolves check is the hard structural gate for a quant skill. The LLM is being asked to produce a precise 5-decimal cost reconciliation with no data plumbing behind it.

- **Issues found:**
  1. `mcp_tools: []` — no declared data source.
  2. Scope mismatch vs spec (line 224): prompt is written for the brand's vendor billing, but the spec scopes `billing-check` to Growth OS's own subscription (wallet + wallet_transactions).
  3. No `wallet.*` / `billing.*` / `growth_os.*` MCP tool exists in `TOOL_HANDLERS`. The Task 2/3 wallet model (`wallets.free_credits`, `wallets.balance`, `wallet_transactions.metadata.{from_free, from_balance}`) and the `/api/billing/balance` endpoint are not exposed to the skills engine as tools.
  4. `category: ops` vs directory `skills/ops/` is fine, but `agent: penny` and the chain target `unit-economics` (finance) argue the skill is conceptually Finance — if kept at brand-vendor-billing scope, relabel; if repointed to GOS billing per spec, also revisit.
  5. Example `period: "2026-04-01 to 2026-04-08"` is stale cosmetic data — LLM fills at runtime.

### unit-economics

- **Location:** `skills/finance/unit-economics.md`
- **Frontmatter:** verbatim

  ```yaml
  id: unit-economics
  name: Unit Economics Calculator
  agent: penny
  category: finance
  complexity: cheap
  credits: 1
  mcp_tools: [brand.orders.list, brand.products.list]
  chains_to: [cash-flow-forecast, pricing-optimizer]
  schedule: "0 8 * * 1"
  knowledge:
    needs: [product, metric, campaign, channel]
    semantic_query: "CAC LTV contribution margin unit economics cohort payback"
    traverse_depth: 2
    include_agency_patterns: true
  produces:
    - node_type: metric
      edge_to: product
      edge_type: measures
    - node_type: insight
      edge_to: metric
      edge_type: derived_from
  ```

- **Loads:** PASS — YAML clean, all fields present, `agent: penny` wires correctly, `complexity: cheap` + `credits: 1` consistent.

- **Data resolves:** PASS. **Task 8 migration is confirmed applied** — `mcp_tools` uses `brand.orders.list` and `brand.products.list`, not the legacy `shopify.*` names. Both are registered in `src/lib/mcp-client.ts`:
  - `brand.orders.list` — `TOOL_HANDLERS` line 476, delegates to `resolveBrandOrders` (`src/lib/resolvers/brand-orders.ts`). Returns a `ResolverResult<BrandOrder>` with `{ data, source, confidence, isComplete }`. Precedence: Shopify (high) → CSV upload (not yet implemented).
  - `brand.products.list` — `TOOL_HANDLERS` line 468, delegates to `resolveBrandProducts`.
  - Neither tool is listed in `TOOL_PLATFORM`, which is correct for brand-level resolvers (per the comment at `mcp-client.ts:463–467`, brand resolvers load their own credentials internally and fall back to `brand_data`).
  - The body's opening line ("If any has `source !== 'shopify'`, caveat quantitative claims") aligns with the `_data_caveats` injection path in `skills-engine.ts:402–410`.

- **Runs end-to-end:** NEEDS_LIVE_RUN. Depends on Shopify credentials or `brand_data` fallback + the MCP fetch pipeline.

- **Output parseable:** PASS. Single precise JSON schema. Stable top-level: `period`, `headline{}`, `by_product[]`, `by_channel[]`, `cohort_analysis{}`, `recommendations[]`. Quant fields (margins, ratios, payback) are typed numerically. `recommendations[]` entries carry `{action, priority, agent, skill}`, aligned to the declared `chains_to: [cash-flow-forecast, pricing-optimizer]` plus handoffs to `scout/returns-analyzer`, `luna/churn-prevention`, `max/budget-allocation`. No multi-format ambiguity; schema precision is appropriate for a quant skill.

- **Output usable:** NEEDS_LIVE_RUN.

- **UI renders:** NEEDS_LIVE_RUN.

- **Grade:** PASS.

- **Issues found:**
  1. Prompt lists "Ad spend by channel (Meta, Google, TikTok)" as an input, but `mcp_tools` does not declare `meta_ads.campaigns.insights` or `google_ads.campaigns`. The `by_channel[]` output (CAC, ROAS, new customers acquired per channel) will be computed without ad-side data unless the RAG layer supplies it. Either declare those tools or trim the prompt's per-channel ask.
  2. Prompt lists "Customer cohort data: new vs returning, repeat purchase rate by cohort" — requires customers-shaped data. `brand.customers.list` is available and wired in `TOOL_HANDLERS` (line 472) but is **not** declared in this skill's `mcp_tools`. Adding it would make the cohort analysis deterministic rather than inferred from orders alone.
  3. Body opening references `brand.customers` as a data source ("Use `brand.orders` / `brand.customers` / `brand.products`…") but only two of those three resolvers are declared. Dead instruction or missing tool.

### cash-flow-forecast

- **Location:** `skills/finance/cash-flow-forecast.md`
- **Frontmatter:** verbatim

  ```yaml
  id: cash-flow-forecast
  name: 90-Day Cash Flow Forecast
  agent: penny
  category: finance
  complexity: mid
  credits: 2
  mcp_tools: [brand.orders.list]
  chains_to: [budget-allocation]
  schedule: "0 8 * * 1"
  knowledge:
    needs: [metric, product, campaign, channel]
    semantic_query: "cash flow forecast revenue projection inventory ad spend runway"
    traverse_depth: 1
    include_agency_patterns: true
  produces:
    - node_type: metric
      edge_to: metric
      edge_type: derived_from
    - node_type: insight
  ```

- **Loads:** PASS — YAML clean. `complexity: mid` + `credits: 2` consistent. `agent: penny` wired.

- **Data resolves:** PASS-W-NOTES. **Task 8 migration is confirmed applied** — `mcp_tools` uses `brand.orders.list` (not `shopify.orders.list`). Registered in `TOOL_HANDLERS` (line 476). The opening body line "Use `brand.orders` / `brand.customers` / `brand.products` as your data sources…" is intent-consistent, but only one of the three resolvers is actually declared.

- **Runs end-to-end:** NEEDS_LIVE_RUN. Not pure-LLM — depends on `brand.orders.list` resolving.

- **Output parseable:** PASS. Well-formed JSON schema. Stable top-level: `forecast_date`, `current_cash_position`, `forecast_period`, `scenarios{conservative, expected, optimistic}` (each with `assumption`, `revenue_90d`, `total_costs_90d`, `ending_cash`, `lowest_cash_week{week, amount, reason?}`, `cash_crunch_risk`), `weekly_forecast_expected[]`, `cost_breakdown_monthly{fixed{}, variable_at_expected_revenue{}, total_monthly_costs}`, `upcoming_major_expenses[]`, `stress_test{}`, `recommendations[]`, `key_metrics{}`. Numeric fields are typed. Appropriate precision for a forecasting skill. No multi-format ambiguity.

- **Output usable:** NEEDS_LIVE_RUN.

- **UI renders:** NEEDS_LIVE_RUN.

- **Grade:** PASS-W-NOTES.

- **Issues found:**
  1. `mcp_tools` declares only `brand.orders.list`, but the prompt depends on:
     - "Current cash position (bank balance or revenue as proxy)" — no banking resolver exists; the LLM will infer cash position from order revenue alone. Should it hook into `/api/billing/balance` (Growth OS wallet) or a dedicated `brand.cash_position` resolver? Currently neither exists.
     - "Variable costs: COGS… shipping… payment processing" — requires product cost metadata. `brand.products.list` would supply COGS/margin fields; not declared.
     - "Upcoming known expenses: inventory reorders (from reorder-calculator), seasonal campaign budgets (from seasonal-planner)" — cross-skill handoff, served by RAG/knowledge graph traversal (`traverse_depth: 1`). That is probably fine at the structural level but untestable without a live run.
     - "Ad spend: current and planned" — not declared via `meta_ads.campaigns.insights` or similar.
  2. The example `weekly_forecast_expected` array has only 5 weeks shown (truncated), but `forecast_period` spans 90 days (~13 weeks). LLM will need to generate the remaining weeks — schema-wise no issue, just a completeness note for the live-run reviewer.
  3. `key_metrics.months_of_runway: 1.8` is derived from `monthly_burn_rate` and `current_monthly_revenue`, but both upstream inputs are inferred, not resolved — creates a compounding-uncertainty risk. Caveats rely on `_data_caveats` injection to show up in the prompt.

## Aggregate structural grade: FAIL

One of three skills (`billing-check`) fails the data-resolves gate, and it's a quant skill with a precise numeric output schema — the most dangerous combination (high-confidence-looking hallucinations). `unit-economics` and `cash-flow-forecast` are structurally sound and confirm Phase 1 Task 8 (`shopify.*` → `brand.*` migration) as applied for Penny's Bucket A skills.

## Known issues noted for later

- **`billing-check` scope clarity (per spec line 224)**: the skill is currently written for the brand's vendor billing (Shopify plan, app subscriptions, ad spend reconciliation), but the Phase 1 spec scopes it to Growth OS's own subscription/wallet. Decision needed: either (a) rewrite prompt + add a `gos.wallet.get` / `gos.transactions.list` MCP tool backed by the Task 2/3 wallet model, or (b) keep the brand-vendor-billing scope and add `shopify.shop.get` + ad-platform cost tools + a Klaviyo/tool-subscription reader. Not fixing in this audit.
- `billing-check` has `mcp_tools: []` — no data plumbing regardless of which scope is chosen. Any live run will produce hallucinated numerics with the current frontmatter.
- `unit-economics` and `cash-flow-forecast` both reference `brand.customers` in body copy but don't declare `brand.customers.list` in `mcp_tools`. Either declare or trim prompt references.
- `unit-economics` computes per-channel CAC/ROAS but doesn't declare ad-platform tools; all channel-level numbers will come from RAG-surfaced history or hallucination.
- `cash-flow-forecast` claims a current cash position but has no resolver for it; consider wiring `/api/billing/balance` as an MCP tool (`gos.wallet.get`) or introducing a brand-cash-position resolver.
- `category: ops` on `billing-check` is inconsistent with `agent: penny` (Finance) and the file location under `skills/ops/`; reconcile whichever way the scope decision lands.

## What needs a live run to verify

- Checks 3 (runs e2e), 5 (output usable), 6 (UI renders) for `unit-economics` and `cash-flow-forecast` — require a brand with either a live Shopify connection or populated `brand_data`, plus a running dev server and UI route.
- Confirm `_data_caveats` injection renders correctly when `brand.orders.list` resolves with `source !== 'shopify'` (e.g. from `brand_data` fallback) so Penny's "based on available data" hedging takes effect.
- Confirm `chains_to` resolution: `unit-economics` → `cash-flow-forecast` → `budget-allocation` (cross-agent into Max), plus `unit-economics` → `pricing-optimizer` (Sage). Requires the chain executor to be live.
- For `billing-check`, a live run is moot until the scope-and-tools decision is made.

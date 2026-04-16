# Luna — Verification Report

**Date:** 2026-04-17
**Agent:** Luna (Email/SMS + Retention)
**Skills:** 6
**Test mode:** Structural audit

## Summary

| Skill | Loads | Data resolves | Runs e2e | Output parseable | Output usable | UI renders | Grade |
|-------|-------|---------------|----------|------------------|---------------|------------|-------|
| email-copy | PASS | PASS-W-NOTES | NEEDS_LIVE_RUN | PASS | NEEDS_LIVE_RUN | NEEDS_LIVE_RUN | PASS-W-NOTES |
| email-flow-audit | PASS | PASS-W-NOTES | NEEDS_LIVE_RUN | PASS | NEEDS_LIVE_RUN | NEEDS_LIVE_RUN | PASS-W-NOTES |
| abandoned-cart-recovery | PASS | PASS-W-NOTES | NEEDS_LIVE_RUN | PASS | NEEDS_LIVE_RUN | NEEDS_LIVE_RUN | PASS-W-NOTES |
| churn-prevention | PASS | PASS-W-NOTES | NEEDS_LIVE_RUN | PASS | NEEDS_LIVE_RUN | NEEDS_LIVE_RUN | PASS-W-NOTES |
| review-collector | PASS | PASS-W-NOTES | NEEDS_LIVE_RUN | PASS | NEEDS_LIVE_RUN | NEEDS_LIVE_RUN | PASS-W-NOTES |
| loyalty-program-designer | PASS | PASS-W-NOTES | NEEDS_LIVE_RUN | PASS | NEEDS_LIVE_RUN | NEEDS_LIVE_RUN | PASS-W-NOTES |

## Per-skill details

### email-copy

- **Location:** `skills/creative/email-copy.md`
- **Frontmatter:** verbatim

  ```yaml
  id: email-copy
  name: Email Copy Generator
  agent: luna
  category: creative
  complexity: premium
  credits: 3
  mcp_tools: [shopify.products.list, shopify.orders.list]
  chains_to: [persona-creative-review]
  knowledge:
    needs: [email_flow, persona, product, brand_guidelines, top_content, insight]
    semantic_query: "email copy subject lines conversion open rates retention nurture"
    traverse_depth: 2
    include_agency_patterns: true
  produces:
    - node_type: email_content
      edge_to: email_flow
      edge_type: belongs_to
    - node_type: email_content
      edge_to: persona
      edge_type: targets
  ```

- **Loads:** PASS — YAML parses cleanly. All required fields present (id, name, agent, category, complexity, credits, mcp_tools, chains_to, knowledge, produces). `agent: luna` correctly wires. `complexity: premium` + `credits: 3` consistent. Note: `category: creative` rather than `retention` — this is the only Luna skill that lives under `skills/creative/` and is the one Bucket B (creative/copy-generation) skill in Luna's slate; intentional per the Bucket A/B split.

- **Data resolves:** PASS-W-NOTES. Both declared tools are registered in `src/lib/mcp-client.ts`:
  - `shopify.products.list` — present in `TOOL_HANDLERS` (line 341) and `TOOL_PLATFORM` (line 537).
  - `shopify.orders.list` — present in `TOOL_HANDLERS` (line 347) and `TOOL_PLATFORM` (line 538).
  - **Issue:** This is a copy-generation skill — per the Bucket A/B split it should be Bucket B (pure LLM, no hard-block). But declaring `shopify.*` tools puts it behind the Phase 1 `runSkill` hard-block gate: non-Shopify brands will be blocked by `computeBlockage` (preflight.ts line 115) with `"Cannot run: no data source for shopify.products.list, shopify.orders.list. Connect shopify to unlock."` Since the body copy's "Inputs Required" section asks for brand voice, personas, and product data (all of which can come from `brand_data`/knowledge graph), declaring `brand.products.list` + `brand.orders.list` would keep the graceful fallback open. Alternatively, if email copy truly doesn't need platform data (it uses `knowledge.needs` node-types to pull from the graph), the `mcp_tools` list could be emptied.

- **Runs end-to-end:** NEEDS_LIVE_RUN. Requires shopify credentials (or, post-migration, `brand_data` fallback) plus the MCP pipeline.

- **Output parseable:** PASS. Well-formed JSON schema under `## Output Format`: top-level `flow_type`, `total_emails`, `target_personas`, `emails[]` (each with `position`, `send_delay`, `job`, `subject_line{variant_a, variant_b}`, `preview_text`, `body{opening, middle, cta, closing}`, `personalization_tokens[]`, `html_structure{}`, `predicted_performance{}`), `flow_projected_recovery_rate`, `flow_projected_monthly_revenue`, `segmentation_notes`. Stable, no format ambiguity.

- **Output usable:** NEEDS_LIVE_RUN.

- **UI renders:** NEEDS_LIVE_RUN.

- **Grade:** PASS-W-NOTES.

- **Issues found:**
  1. Declares raw `shopify.*` tools rather than `brand.*`. For a copy-generation skill this is the wrong gate — should migrate to `brand.products.list` / `brand.orders.list` (or drop mcp_tools entirely if the graph plus persona/brand inputs are sufficient).
  2. `klaviyo.flows.get` is registered in mcp-client but not declared here. If the intent is to reuse prior-flow performance data in copy generation, declare it so the data actually reaches the prompt.

---

### email-flow-audit

- **Location:** `skills/retention/email-flow-audit.md`
- **Frontmatter:** verbatim

  ```yaml
  id: email-flow-audit
  name: Email Flow Audit
  agent: luna
  category: retention
  complexity: cheap
  credits: 1
  mcp_tools: [shopify.orders.list]
  chains_to: [email-copy, abandoned-cart-recovery]
  knowledge:
    needs: [email_flow, audience, metric, insight, persona]
    semantic_query: "email automation welcome series cart recovery open rate retention"
    traverse_depth: 1
    include_agency_patterns: true
  produces:
    - node_type: email_flow
    - node_type: insight
      edge_to: email_flow
      edge_type: derived_from
  ```

- **Loads:** PASS — YAML parses cleanly. `complexity: cheap` + `credits: 1` consistent. No `schedule` field despite body saying "Weekly Monday (scheduled)" — the agent-level `schedule: "0 8 * * 1"` on Luna in `skills/agents.json` covers this.

- **Data resolves:** PASS-W-NOTES. `shopify.orders.list` is registered (mcp-client line 347).
  - **Issue (Task 8 migration miss):** The context for this audit states Luna's retention skills were migrated to `brand.orders.list`/`brand.customers.list`; the file still declares raw `shopify.orders.list`. As declared, non-Shopify brands are hard-blocked by preflight's `computeBlockage` (preflight.ts lines 115–131). Target is `brand.orders.list` (registered line 476 via `resolveBrandOrders`) to pick up the resolver's `{ data, source, confidence, isComplete }` shape and fall through to `brand_data` when Shopify isn't connected.
  - **Issue:** Body copy says the primary data source is "Klaviyo flow data (via MCP if connected) OR Shopify email data (fallback)" — yet neither `klaviyo.flows.get` nor `klaviyo.lists.get` is declared in `mcp_tools`, even though both are registered in mcp-client (lines 372–373). The LLM is being asked to inventory welcome series, abandoned cart, post-purchase, win-back, browse abandonment, and VIP flows and score their performance (open rate, click rate, revenue per email) without any Klaviyo data reaching it. Output fields like `welcome_series.performance.open_rate` will be guessed.

- **Runs end-to-end:** NEEDS_LIVE_RUN. Not a pure-LLM skill — depends on at least one of Shopify/Klaviyo being connected and MCP pipeline.

- **Output parseable:** PASS. Well-formed JSON schema: `audit_date`, `flows_found`, `flows_missing`, `estimated_monthly_revenue_gap`, `flows{welcome_series, abandoned_cart, post_purchase, win_back, browse_abandonment, vip_loyalty}` each with a per-flow schema (status/performance/benchmark/diagnosis/recommendations/priority OR status/estimated_impact/evidence/priority), `top_3_actions[]` carrying `{action, impact, skill}`. `skill` values (`abandoned-cart-recovery`, `email-copy`, `review-collector`) align with `chains_to` plus the declared Auto-Chain section.

- **Output usable:** NEEDS_LIVE_RUN.

- **UI renders:** NEEDS_LIVE_RUN.

- **Grade:** PASS-W-NOTES.

- **Issues found:**
  1. Bucket A migration not applied — `shopify.orders.list` should be `brand.orders.list`.
  2. Klaviyo data not declared despite being the primary source per body copy. Declare `klaviyo.flows.get` (and optionally `klaviyo.lists.get`) or rewrite the body to acknowledge that "performance" numbers are estimates grounded in agency benchmarks rather than the brand's actual flow metrics.
  3. Example `audit_date` is `2026-04-08` — stale vs today (`2026-04-17`). Cosmetic only; filled at runtime.

---

### abandoned-cart-recovery

- **Location:** `skills/retention/abandoned-cart-recovery.md`
- **Frontmatter:** verbatim

  ```yaml
  id: abandoned-cart-recovery
  name: Abandoned Cart Recovery Strategy
  agent: luna
  category: retention
  complexity: cheap
  credits: 1
  mcp_tools: [shopify.orders.list]
  chains_to: [email-copy]
  knowledge:
    needs: [product, audience, metric, email_flow, persona, insight]
    semantic_query: "cart abandonment recovery email sequence timing objection handling"
    traverse_depth: 1
    include_agency_patterns: true
  produces:
    - node_type: email_flow
      edge_to: audience
      edge_type: sends_to
    - node_type: insight
      edge_to: metric
      edge_type: derived_from
  ```

- **Loads:** PASS — YAML parses cleanly. `complexity: cheap` + `credits: 1` consistent.

- **Data resolves:** PASS-W-NOTES. `shopify.orders.list` is registered.
  - **Issue (Task 8 migration miss):** Same as email-flow-audit — per context this should be `brand.orders.list`. Currently declared `shopify.orders.list`, so non-Shopify brands hard-block via preflight even though `resolveBrandOrders` with Klaviyo/brand_data fallback exists.

- **Runs end-to-end:** NEEDS_LIVE_RUN.

- **Output parseable:** PASS. Well-formed JSON: `analysis_date`, `abandonment_rate`, `monthly_abandoned_carts`, `monthly_abandoned_revenue`, `abandonment_stage_breakdown{}`, `top_abandoned_products[]`, `recovery_sequence{email_1, email_2, email_3}` each with `{delay, job, subject_variants[], content_strategy, personalization[], predicted_open_rate, predicted_recovery_rate}` plus email_3's `incentive_strategy{}`, `projected_impact{}`, `segmentation_recommendations[]`. Stable.

- **Output usable:** NEEDS_LIVE_RUN.

- **UI renders:** NEEDS_LIVE_RUN.

- **Grade:** PASS-W-NOTES.

- **Issues found:**
  1. Bucket A migration not applied — `shopify.orders.list` → `brand.orders.list`.
  2. The body explicitly requests "Abandonment stage data (where in checkout do they leave — cart page, info, payment)" to populate `abandonment_stage_breakdown`, but `shopify.orders.list` only returns placed orders, not abandoned-checkout stage telemetry. Shopify's `checkouts.json` endpoint is the actual source; it isn't declared or registered. Either declare a new tool or have the output honestly mark `abandonment_stage_breakdown` as "estimated from industry norms" when the data isn't present.
  3. Example `analysis_date` stale (`2026-04-08`).

---

### churn-prevention

- **Location:** `skills/retention/churn-prevention.md`
- **Frontmatter:** verbatim

  ```yaml
  id: churn-prevention
  name: Churn Prevention Strategy
  agent: luna
  category: retention
  complexity: mid
  credits: 2
  mcp_tools: [shopify.orders.list, shopify.customers.list]
  chains_to: [email-copy, loyalty-program-designer]
  knowledge:
    needs: [audience, metric, product, email_flow, review_theme, persona]
    semantic_query: "customer churn prevention win-back retention signals RFM"
    traverse_depth: 2
    include_agency_patterns: true
  produces:
    - node_type: insight
      edge_to: audience
      edge_type: derived_from
    - node_type: email_flow
      edge_to: audience
      edge_type: sends_to
  ```

- **Loads:** PASS — YAML parses cleanly. `complexity: mid` + `credits: 2` consistent.

- **Data resolves:** PASS-W-NOTES. Both tools registered:
  - `shopify.orders.list` — line 347.
  - `shopify.customers.list` — line 353.
  - **Issue (Task 8 migration miss):** Both should be migrated to `brand.orders.list` and `brand.customers.list` (registered lines 476 and 472). `resolveBrandCustomers` has a meaningful Klaviyo profiles fallback (brand-customers.ts line 121 onward), which is exactly the retention context where Klaviyo most often carries the customer list for brands that don't sell through Shopify. Leaving it as `shopify.customers.list` means the skill hard-blocks on non-Shopify brands even when Klaviyo has the audience data needed for RFM scoring.
  - **Issue:** Body copy asks for "Email engagement metrics: open rates and click trends per customer" to segment the "Lost" tier (`90+ days, no email engagement`), but no Klaviyo flow/campaign tool is declared — the LLM can only reason about RFM using order recency/frequency/monetary, not engagement.

- **Runs end-to-end:** NEEDS_LIVE_RUN.

- **Output parseable:** PASS. Well-formed JSON: `analysis_date`, `total_customers`, `churn_risk_summary{champions, loyal, at_risk, hibernating, lost}` each with `{count, pct, lifetime_value_avg, revenue_at_risk?}`, `churn_drivers[]` each with `{driver, affected_segment, evidence, intervention}`, `intervention_plans[]` each with `{segment, count, strategy, sequence[], projected_recovery, projected_revenue_recovered}`, `total_projected_recovery{}`, `automation_triggers[]`. Stable.

- **Output usable:** NEEDS_LIVE_RUN.

- **UI renders:** NEEDS_LIVE_RUN.

- **Grade:** PASS-W-NOTES.

- **Issues found:**
  1. Bucket A migration not applied — `shopify.orders.list, shopify.customers.list` → `brand.orders.list, brand.customers.list`. `resolveBrandCustomers` Klaviyo fallback is the strongest argument for migrating this skill in particular.
  2. Email engagement metrics (central to the `at_risk` → `lost` classification) aren't sourced; declare `klaviyo.flows.get` or acknowledge in the prompt that engagement is inferred.
  3. Example `analysis_date` stale.

---

### review-collector

- **Location:** `skills/retention/review-collector.md`
- **Frontmatter:** verbatim

  ```yaml
  id: review-collector
  name: Review Collection Optimizer
  agent: luna
  category: retention
  complexity: free
  credits: 0
  mcp_tools: [shopify.orders.list, shopify.products.list]
  chains_to: [email-copy]
  schedule: "0 9 * * 1"
  knowledge:
    needs: [product, review_theme, metric, persona]
    semantic_query: "review collection post-purchase timing product reviews social proof"
    traverse_depth: 1
    include_agency_patterns: true
  produces:
    - node_type: insight
      edge_to: product
      edge_type: derived_from
    - node_type: metric
  ```

- **Loads:** PASS — YAML parses cleanly. `complexity: free` + `credits: 0` consistent. Unique among Luna skills in carrying its own `schedule: "0 9 * * 1"` in addition to the agent's Monday schedule; not a conflict, just slightly out-of-band vs agent cron.

- **Data resolves:** PASS-W-NOTES. Both tools registered:
  - `shopify.orders.list` — line 347.
  - `shopify.products.list` — line 341.
  - **Issue (Task 8 migration miss):** Should be `brand.orders.list, brand.products.list`. Especially relevant here since the body says the main input is "which customers haven't been asked for reviews yet" (orders + customers join) and "Product catalog with delivery times and typical usage period" (products).

- **Runs end-to-end:** NEEDS_LIVE_RUN.

- **Output parseable:** PASS. Well-formed JSON: `analysis_date`, `review_health{}`, `product_gaps[]` each with `{product, orders_90d, current_reviews, competitor_avg_reviews, gap, priority, optimal_ask_timing}`, `review_sequence{email_1, email_2}` each with `{timing, subject_variants[], approach, predicted_response_rate}`, `incentive_economics{}`, `review_themes{positive[], negative[], language_for_ads[]}`, `projected_improvement{}`. Stable.

- **Output usable:** NEEDS_LIVE_RUN.

- **UI renders:** NEEDS_LIVE_RUN.

- **Grade:** PASS-W-NOTES.

- **Issues found:**
  1. Bucket A migration not applied — `shopify.orders.list, shopify.products.list` → `brand.orders.list, brand.products.list`.
  2. `review_themes` and `current_reviews` / `competitor_avg_reviews` depend on a review platform (Judge.me, Yotpo, Loox) — no such tool is declared or registered. The LLM will synthesize theme counts and per-product review numbers from knowledge-graph `review_theme` nodes if present, but `product_gaps[].current_reviews` values will effectively be hallucinated when the graph is sparse. Consider either declaring a reviews tool or weakening the output schema so those fields are explicitly marked as "from knowledge graph" vs "from live source."
  3. Example `analysis_date` stale.

---

### loyalty-program-designer

- **Location:** `skills/retention/loyalty-program-designer.md`
- **Frontmatter:** verbatim

  ```yaml
  id: loyalty-program-designer
  name: Loyalty Program Designer
  agent: luna
  category: retention
  complexity: mid
  credits: 2
  mcp_tools: [shopify.orders.list, shopify.customers.list]
  chains_to: [email-copy]
  knowledge:
    needs: [product, audience, metric, competitor, persona]
    semantic_query: "loyalty program points referral subscription VIP retention"
    traverse_depth: 2
    include_agency_patterns: true
  produces:
    - node_type: insight
      edge_to: audience
      edge_type: derived_from
    - node_type: recommendation
  ```

- **Loads:** PASS — YAML parses cleanly. `complexity: mid` + `credits: 2` consistent.

- **Data resolves:** PASS-W-NOTES. Both tools registered:
  - `shopify.orders.list` — line 347.
  - `shopify.customers.list` — line 353.
  - **Issue (Task 8 migration miss):** Should be `brand.orders.list, brand.customers.list`. Same reasoning as churn-prevention.

- **Runs end-to-end:** NEEDS_LIVE_RUN.

- **Output parseable:** PASS. Well-formed JSON: `analysis_date`, `retention_baseline{}`, `recommended_program{type, name_suggestion, reasoning}`, `program_design{points{}, referral{}, vip_tiers[]}`, `economics{}`, `launch_plan{phase_1, phase_2, phase_3, communication{}}`, `tools_recommended[]`. Stable, covers a lot of surface area but consistent.

- **Output usable:** NEEDS_LIVE_RUN.

- **UI renders:** NEEDS_LIVE_RUN.

- **Grade:** PASS-W-NOTES.

- **Issues found:**
  1. Bucket A migration not applied — same pattern as churn-prevention.
  2. Body copy asks for "Competitor loyalty programs (from competitor-scan)" and "Discount dependency data (from pricing-optimizer)" — both are upstream skills Luna can't call directly; they must come via the knowledge graph. This is fine as long as Mia chains them correctly; flagged as an integration-level risk rather than a frontmatter bug.
  3. Example `analysis_date` stale.

## Aggregate structural grade: PASS-W-NOTES

All six skills parse cleanly and have their declared tools registered in `mcp-client.ts`. Every output block is valid JSON with a stable top-level schema. No Grade-blocking issues at the structural level.

The single systemic problem is that **none of Luna's skills have actually had the Bucket A `shopify.*` → `brand.*` migration applied** despite the task context asserting they had. The `brand.orders.list` / `brand.customers.list` / `brand.products.list` resolvers are implemented and registered, the Klaviyo fallback inside `resolveBrandCustomers` is live, and the `runSkill` preflight hard-block will fire on any non-Shopify brand for every one of Luna's skills as currently declared. This will be the most immediately user-visible breakage when Luna runs against a brand that only has Klaviyo (a very common Luna-shaped brand profile).

## Known issues noted for later

- Bucket A migration (Task 8) must actually be applied to all five retention skills: `email-flow-audit`, `abandoned-cart-recovery`, `churn-prevention`, `review-collector`, `loyalty-program-designer` — swap every `shopify.orders.list` / `shopify.customers.list` / `shopify.products.list` in `mcp_tools` for the corresponding `brand.*` tool.
- Decide where `email-copy` belongs. If it truly needs no platform data (it pulls brand voice, personas, products from knowledge graph), drop `mcp_tools` entirely and treat it as Bucket B pure-LLM. If it does need product/order context, migrate to `brand.*`.
- Klaviyo tools (`klaviyo.flows.get`, `klaviyo.lists.get`) are registered but undeclared across Luna's slate. At minimum `email-flow-audit` and `churn-prevention` should declare `klaviyo.flows.get` — they claim to reason over flow performance and customer email engagement respectively, and without the tool declared that data never reaches the prompt.
- `abandoned-cart-recovery` references checkout-stage breakdown that Shopify's orders endpoint can't deliver. Either add a `checkouts` tool or soften the output schema's `abandonment_stage_breakdown` to benchmark-derived.
- `review-collector` has no review-platform tool (Judge.me/Yotpo/Loox). `product_gaps[].current_reviews` and `review_themes.*.frequency` will be invented unless the knowledge graph already has `review_theme` nodes populated.
- Stale `analysis_date` / `audit_date` examples (`2026-04-08`) in five of six skills — cosmetic; LLM overwrites at runtime.

## What needs a live run to verify

- **Runs e2e (check 3):** Requires at least one of Shopify or Klaviyo connected for a test brand, plus a dev server. For the retention five skills this is the chief thing to confirm — specifically, whether after the Bucket A migration a Klaviyo-only brand can actually get past the preflight gate for `churn-prevention` (the strongest test, since `resolveBrandCustomers` Klaviyo fallback is the load-bearing path).
- **Output usable (check 5):** Are `chains_to` handoffs actually firing — e.g. does `email-flow-audit.top_3_actions[].skill` correctly trigger `abandoned-cart-recovery` / `email-copy` / `review-collector` when clicked, and does the downstream skill receive the intended brief?
- **UI renders (check 6):** Confirm each skill's output renders in the agent run detail view — the deep object nesting in `loyalty-program-designer.program_design` and the mixed `flows.{flow_name}` schema in `email-flow-audit` (different keys per flow status) are the most likely places the renderer trips. Also confirm `_data_caveats` injection renders when the resolver returns `source !== 'shopify'` (will be important once the Bucket A migration lands — the caveats are the whole point of the resolver shape).

# Max — Phase 2 Structural Audit

**Date:** 2026-04-17
**Aggregate grade:** PASS-W-NOTES

Scope: 6 skills across `skills/acquisition/` and `skills/optimization/`.

| Skill | File | Frontmatter | Registry | Bucket B | Prompt/Tool | Output | Grade |
|---|---|---|---|---|---|---|---|
| budget-allocation | `skills/optimization/budget-allocation.md` | PASS | PASS | PASS | PASS | PASS | A |
| ad-scaling | `skills/optimization/ad-scaling.md` | PASS | PASS | PASS-W-NOTES | PASS-W-NOTES | PASS | A- |
| channel-expansion-advisor | `skills/optimization/channel-expansion-advisor.md` | PASS | PASS | **FAIL** | **FAIL** | PASS | C |
| ad-performance-analyzer | `skills/optimization/ad-performance-analyzer.md` | PASS | PASS | PASS | PASS | PASS | A |
| campaign-optimizer | `skills/optimization/campaign-optimizer.md` | PASS | PASS | PASS | PASS | PASS | A |
| campaign-launcher | `skills/acquisition/campaign-launcher.md` | PASS | PASS (empty array) | PASS | PASS | PASS | A |

## Per-skill findings

### budget-allocation

- **Location:** `growth-os/skills/optimization/budget-allocation.md:1`
- **Frontmatter:** PASS. YAML parses. `mcp_tools: [meta_ads.campaigns.insights, ga4.report.run]`. `requires: [meta]`. Has `schedule`, `chains_to: [ad-scaling]`, `knowledge` block, `produces` edges.
- **Tool-registry alignment:** PASS. Both tools registered in `src/lib/mcp-client.ts`:
  - `meta_ads.campaigns.insights` → TOOL_HANDLERS:363, TOOL_PLATFORM:541 (`meta`)
  - `ga4.report.run` → TOOL_HANDLERS:367, TOOL_PLATFORM:543 (`google_analytics`)
- **Bucket B migration:** PASS. Prompt body never references brand/product/order data outside the Meta/GA4 channel metrics. "Total monthly budget (from brand settings)" is a runtime brand-settings lookup, not an MCP brand resolver.
- **Prompt/tool consistency:** PASS. "Pull current performance data from all ad platforms via MCP" maps to the two declared tools. "Google Ads: campaign-level spend..." is conditionally called out ("via MCP if connected") — but Google Ads is not declared in `mcp_tools`. Acceptable: prose says "if connected" and the preflight would block if a declared-but-missing tool were added. Output schema handles this gracefully (google_shopping/google_search are just named keys in the response — the LLM will synthesize from knowledge-graph snapshots if Google Ads is absent).
- **Output schema:** PASS. Single JSON block under `## Output Format`. All fields (current_allocation, recommendation, projected_impact, alerts, competitor_context) are computable from Meta insights + GA4 + knowledge graph.
- **Issues:** None material.

### ad-scaling

- **Location:** `growth-os/skills/optimization/ad-scaling.md:1`
- **Frontmatter:** PASS. `mcp_tools: [meta_ads.campaigns.insights, ga4.report.run]`, `requires: [meta]`, `chains_to: [budget-allocation, creative-fatigue-detector]`, `complexity: premium`, `credits: 3`. Produces insight and recommendation edges.
- **Tool-registry alignment:** PASS (same two tools as budget-allocation — both registered).
- **Bucket B migration:** PASS-W-NOTES. Prompt body lists "Brand's margin data and profitability threshold" and "Cash position (from Penny)" as inputs — these are cross-agent/brand-settings injections, not MCP tool fetches, so no `brand.*` declaration is needed. Acceptable.
- **Prompt/tool consistency:** PASS-W-NOTES. Body references "Cash position (from Penny)" and "Competitor spend changes (from Echo — are competitors scaling)" — neither is fetched by a declared tool, but both come through knowledge-graph RAG (the `knowledge.needs` array includes `campaign, metric, channel, audience, creative, insight`, which is adequate) or chained-agent context. Prose is honest ("from Penny" etc. → not claimed as live Meta data).
- **Output schema:** PASS. Single JSON block. Fields scale_recommendations / hold_campaigns / cut_campaigns / total_projected_monthly_impact are all computable from Meta insights per-campaign metrics + knowledge-graph history.
- **Issues:** None blocking. `readiness_checks.cash_available` is LLM-synthesized from prose, not a hard gate — note for live-run review.

### channel-expansion-advisor

- **Location:** `growth-os/skills/optimization/channel-expansion-advisor.md:1`
- **Frontmatter:** PASS. `mcp_tools: [shopify.orders.list, ga4.report.run]`. **No `requires:` field** (most other Max skills declare `requires: [meta]`). This is arguably a frontmatter inconsistency but not a hard failure — the engine uses `mcp_tools`, not `requires`, for gating.
- **Tool-registry alignment:** PASS. Both tools exist:
  - `shopify.orders.list` → TOOL_HANDLERS:347, TOOL_PLATFORM:538 (`shopify`)
  - `ga4.report.run` → TOOL_HANDLERS:367, TOOL_PLATFORM:543 (`google_analytics`)
- **Bucket B migration:** **FAIL.** The body opens with:
  > "Use `brand.products` as your product catalog. If `source !== 'shopify'`, caveat any quantitative claims..."
  and under Inputs Required lists "Product catalog with margins and fulfillment requirements."
  Yet `mcp_tools` does not include `brand.products.list`. The resolver-based product catalog is never fetched. The LLM will receive Shopify orders (useful) and GA4 (useful) but no `brand.products` payload, despite the prompt explicitly telling the model to cite a `source` field that does not exist in the context.
- **Prompt/tool consistency:** **FAIL.** Same issue — prose asks the LLM to check `source !== 'shopify'` on a payload the engine never delivers. The LLM will either hallucinate the source field or output uncaveated product recommendations.
- **Output schema:** PASS. Single JSON block. Fields are computable when the brand-products resolver is added.
- **Issues:**
  1. Bucket B migration incomplete — needs `brand.products.list` added to `mcp_tools`.
  2. Body references `source !== 'shopify'` conditional on data the engine does not fetch.
  3. Missing `requires:` field (minor consistency issue).

### ad-performance-analyzer

- **Location:** `growth-os/skills/optimization/ad-performance-analyzer.md:1`
- **Frontmatter:** PASS. `mcp_tools: [meta_ads.campaigns.insights, meta_ads.adsets.list]`, `requires: [meta]`, `schedule: "0 9 * * *"`, `complexity: cheap`, `credits: 1`.
- **Tool-registry alignment:** PASS. Both tools registered (`meta_ads.adsets.list` → TOOL_HANDLERS:364, TOOL_PLATFORM:542).
- **Bucket B migration:** PASS. Prompt does not reference brand/product/order resolvers.
- **Prompt/tool consistency:** PASS. Prose (campaign / ad-set / ad level data + baseline + benchmarks) matches the two declared tools plus runtime-injected baseline/benchmark context.
- **Output schema:** PASS. Single JSON block with explicit "Respond ONLY with valid JSON (no markdown fences)" instruction. All fields (phase, account_maturity, account_currency, baseline_comparison, monthly_comparison, gos_vs_external, campaigns[], top_ads, worst_ads, recommendations, benchmark_narrative) are computable from Meta insights + ad-sets + additionalContext baseline/benchmark.
- **Issues:** None.

### campaign-optimizer

- **Location:** `growth-os/skills/optimization/campaign-optimizer.md:1`
- **Frontmatter:** PASS. `mcp_tools: [meta_ads.campaigns.insights]`, `requires: [meta]`, `schedule: "0 6 */2 * *"`, `chains_to: [ad-copy, image-brief, creative-fatigue-detector]`.
- **Tool-registry alignment:** PASS. Tool registered.
- **Bucket B migration:** PASS. No brand-data references.
- **Prompt/tool consistency:** PASS. "Fetch per-ad-set and per-ad performance breakdowns from Meta" — note this is prose-only; the declared tool (`meta_ads.campaigns.insights`) returns top-level campaign insights, NOT per-ad-set/per-ad breakdowns. The body also says "Execute budget changes and ad pauses via Meta API" — which is not represented by the declared tool. This is write-side behavior that the skills engine's post-execution hook (not this skill's tool set) would handle if implemented. No Meta write-path is currently wired for `campaign-optimizer` in the engine (`src/lib/skills-engine.ts:700` only handles `campaign-launcher`). **This is a gap but not a structural failure for Phase 2** — the LLM can still produce the JSON; the write-side is a live-run concern.
- **Output schema:** PASS. Single JSON block (campaigns_analyzed, actions_taken[], insights[], recommendations[]). All fields computable.
- **Issues:**
  1. Prose says "Execute budget changes and ad pauses via Meta API" but no engine hook exists for that — defer to live-run / implementation backlog.
  2. Prose references per-ad-set + per-ad breakdowns that aren't in the declared tool's payload. Consider adding `meta_ads.adsets.list` + a per-ad tool, or narrow the prompt scope.

### campaign-launcher

- **Location:** `growth-os/skills/acquisition/campaign-launcher.md:1`
- **Frontmatter:** PASS. `mcp_tools: []` (empty by design), `requires: [meta]`, `complexity: free`, `credits: 0`, `chains_to: [campaign-optimizer]`.
- **Tool-registry alignment:** PASS. Empty array — nothing to align. The Meta launch is done post-execution by `src/lib/skills-engine.ts:700+` which imports `createMetaCampaign / createMetaAdSet / createMetaAd` from `@/lib/meta-ads` directly, keyed on `skill.id === 'campaign-launcher'`.
- **Bucket B migration:** PASS. No brand.* references in prompt.
- **Prompt/tool consistency:** PASS. Body is explicit: "This is a pure execution skill — no creative decisions needed. Take the structured input..." — inputs are expected from additionalContext, not MCP.
- **Output schema:** PASS. Single JSON block with Meta IDs (campaign, ad sets, ads), learning_ends_at, summary.
- **Issues:** None material. The engine does wire the post-execution launch, so end-to-end does work — but requires live Meta credential to verify.

## fetchMetaInsights silent-null check

**Finding: PARTIAL BUG CONFIRMED.**

Reference code path:

- `src/lib/mcp-client.ts:148-171` — `fetchMetaInsights()` returns `null` when:
  - `cred.metadata.ad_account_id` is missing (line 150-153, warns to console)
  - Meta API responds non-2xx (line 162-165, warns to console)
  - Fetch throws (line 167-170, warns to console)
- `src/lib/mcp-client.ts:363` — handler wired: `'meta_ads.campaigns.insights': async (_brandId, cred) => fetchMetaInsights(cred)`.
- `src/lib/skills-engine/preflight.ts:57-69` — `resolveDeclaredTools` treats `res === null || res === undefined` as `confidence: 'low', hasData: false`. Combined with `computeBlockage` (lines 115-131), this correctly **blocks** the skill with `"Cannot run: no data source for meta_ads.campaigns.insights. Connect meta to unlock."`

So the `null` return from API error or missing `ad_account_id` is **NOT silently passed to the LLM** — the skill blocks. Good.

**However, there is a genuine silent-data bug:** when Meta's API returns HTTP 200 with an empty `{data: []}` envelope (e.g., an ad account that has no campaigns, is paused, or has a date-range with no activity), the flow is:

1. `fetchMetaInsights` (mcp-client.ts:166) returns `{data: []}` — a non-null object.
2. `preflight.ts:83-94` — `arrayHasData({data: []})` returns `true` because the object has 1 key. Tool resolves with `confidence: 'high', isComplete: true, hasData: true`.
3. `computeBlockage` sees `hasData: true` → no block.
4. `fetchSkillData` (mcp-client.ts:669-672) unwraps: `context.meta.campaigns = (result as { data?: unknown[] }).data ?? [] → []`.
5. LLM receives `"meta": { "campaigns": [] }` with no caveat.

This affects all four Max skills that declare `meta_ads.campaigns.insights` (budget-allocation, ad-scaling, ad-performance-analyzer, campaign-optimizer). The LLM will synthesize analysis on an empty array without a data-gap warning.

**Secondary concern:** `_data_caveats` injection (skills-engine.ts:402-410) is only populated when resolutions have `confidence !== 'high'`. Because the empty-envelope path yields `confidence: 'high'`, no caveat is surfaced.

**Remediation (out-of-scope for audit):** `preflight.ts:arrayHasData` should special-case the Meta envelope shape — treat `{data: []}` as `hasData: false`. Alternatively, `fetchMetaInsights` should return `null` when `json.data?.length === 0`. Third option: add a downgrade to `confidence: 'medium'` when legacy tools return an empty envelope.

## Cross-cutting issues

1. **Meta empty-envelope silent-pass** (see above) — affects 4 of 6 Max skills.
2. **channel-expansion-advisor references `brand.products` without declaring the tool** — body opens with `source !== 'shopify'` conditional on a payload the engine does not fetch.
3. **campaign-optimizer prose overreaches its tool set** — claims per-ad-set/per-ad breakdowns and Meta write operations that the declared tool `meta_ads.campaigns.insights` + the current engine hooks don't deliver.
4. **Minor: `channel-expansion-advisor` missing `requires:` field** — inconsistent with peer Max skills, cosmetic.
5. **Production caveat (informational):** `fetchMetaInsights` uses `date_preset=last_30d` and fields `impressions,clicks,spend,cpc,ctr,actions`. It does NOT fetch `purchase_roas` or `action_values`. Several Max prompts assume ROAS is available — the LLM will have to compute it from `actions` + `action_values`, which aren't in the field list. This is a **real data gap** (not just a silent null) that will cause ROAS fabrication. See `src/lib/mcp-client.ts:159`.
6. **Production caveat (informational):** `meta_ads.adsets.list` (only used by `ad-performance-analyzer`) fetches `id,name,status,daily_budget,lifetime_budget,optimization_goal` — no spend/insights. The skill body expects per-ad-set performance which requires calling `/insights` on each ad set separately. See `src/lib/mcp-client.ts:182`.

## Live-run items deferred

- [ ] Verify LLM behavior when `context.meta.campaigns` is `[]` with a real Meta credential pointing to an empty test ad account — does any Max skill fabricate ROAS?
- [ ] End-to-end run of `campaign-launcher` against a sandbox Meta account; verify `createMetaCampaign/AdSet/Ad` chain in `src/lib/skills-engine.ts:700+` produces valid IDs and the `learning_ends_at` is ≥3 days out.
- [ ] Run `ad-performance-analyzer` and confirm the output includes real `gos_vs_external` segmentation (requires `source` field to be set on campaigns in the test account).
- [ ] Run `campaign-optimizer` and verify whether any Meta write-path is triggered; currently the engine post-execution only wires `campaign-launcher`.
- [ ] Add `brand.products.list` to `channel-expansion-advisor.mcp_tools` and re-run; verify the `source !== 'shopify'` conditional in the prompt actually fires with a ResolverResult payload.
- [ ] Confirm that `purchase_roas` / `action_values` additions to `fetchMetaInsights` unblock real ROAS computation for budget-allocation / ad-scaling / campaign-optimizer.
- [ ] UI — BlockedRunCard rendering for Max skills when Meta is disconnected (generic component; untested for Max specifically).

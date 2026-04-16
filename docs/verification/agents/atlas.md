# Atlas — Phase 2 Structural Audit

**Date:** 2026-04-17
**Aggregate grade:** PASS-W-NOTES

## Executive Summary

All 8 Atlas skills parse cleanly and declare coherent, if sparse, tool sets. Bucket B migration is **partially complete**: the persona-intel skills correctly use `brand.customers.list` / `brand.orders.list`, but both `acquisition/` skills that read commerce data (`audience-targeting`, `retargeting-strategy`) still declare `shopify.*` tools — this is the single most material issue. All declared tools resolve in `TOOL_HANDLERS`, and the `brand.*` tools are correctly absent from `TOOL_PLATFORM` (their resolvers load credentials internally, as documented at `mcp-client.ts:463-479`). `persona-feedback-video` is confirmed pure LLM — no video-generation tool wiring is declared or required by the prompt. Prompt prose across several skills references derived fields (LTV deciles, UTM attribution, website visitor windows) that are not obtainable from the declared tools — these are live-run items, not structural failures.

## Per-skill findings

### audience-targeting
- **Frontmatter** (`skills/acquisition/audience-targeting.md:1-22`): PASS. YAML parses, `mcp_tools` is a clean array of 3 tools, `chains_to` sane.
- **Tool-registry alignment**: PASS. `shopify.customers.list` (`mcp-client.ts:353`, `:539`), `shopify.orders.list` (`:347`, `:538`), `meta_ads.campaigns.insights` (`:363`, `:541`) all present in both `TOOL_HANDLERS` and `TOOL_PLATFORM`.
- **Bucket B migration**: **FAIL.** Still declares raw `shopify.customers.list` and `shopify.orders.list` (line 8) instead of the Bucket B `brand.customers.list` / `brand.orders.list`. The skill body (line 24) even tells the model to "use `brand.products` as your product catalog" with a `source !== 'shopify'` caveat — so the prose expects Bucket B but the tools don't deliver it.
- **Prompt/tool consistency**: WEAK. Prompt (lines 72-74) asks for "seed source: top 10% customers by LTV" — the declared `shopify.customers.list?limit=50` returns max 50 customer records with no LTV field; top-10%-by-LTV is not computable from this payload. Website visitor / cart-abandoner / email-subscriber audiences (lines 140-178 of the example output) have no corresponding tool (no GA4, no Klaviyo, no pixel feed declared).
- **Output schema**: PASS. Single JSON block, well-structured (tiers -> audiences -> targeting).
- **Issues**: Needs Bucket B migration; tools under-cover the prose (LTV decile, pixel/GA4 visitor data, email subscriber feed).

### retargeting-strategy
- **Frontmatter** (`skills/acquisition/retargeting-strategy.md:1-22`): PASS.
- **Tool-registry alignment**: PASS. All three tools (`meta_ads.campaigns.insights`, `ga4.report.run`, `shopify.orders.list`) present at `mcp-client.ts:363/541`, `:367/543`, `:347/538`.
- **Bucket B migration**: **FAIL.** Declares `shopify.orders.list` (line 8) — should be `brand.orders.list`. Body prose (line 24) again gestures at Bucket B (`brand.products`, source caveat) but tool list is not migrated.
- **Prompt/tool consistency**: WEAK. Skill needs "page views, time on site, products viewed, cart actions" (line 44). `ga4.report.run` returns only aggregate session/user counts with `date` as dimension (see `fetchGA4Report` at `mcp-client.ts:197-232`), not per-product-page / cart-abandon events. Intent-based segmentation described in workflow (lines 53-58) is not supported by declared tools.
- **Output schema**: PASS. Single JSON block.
- **Issues**: Bucket B not migrated; GA4 report is too shallow for the page-level intent segmentation the prompt asks for.

### influencer-finder
- **Frontmatter** (`skills/acquisition/influencer-finder.md:1-20`): PASS. `mcp_tools: []` intentionally empty (pure LLM/graph skill).
- **Tool-registry alignment**: N/A (no tools declared).
- **Bucket B migration**: N/A.
- **Prompt/tool consistency**: PASS. Prompt explicitly asks user to provide "Brand identity, values, target personas, budget, platform priorities, competitor partnerships" as inputs (lines 40-46) — no data source needed. Candidates section (line 89+) produces synthesized candidate profiles from LLM knowledge, which matches an empty-tool design.
- **Output schema**: PASS.
- **Issues**: None. Caveat: the skill generates influencer handles (e.g., "@gracefulskin") from LLM training — this is acknowledged design but will produce fabricated handles at runtime. Live-run concern, not structural.

### influencer-tracker
- **Frontmatter** (`skills/acquisition/influencer-tracker.md:1-23`): PASS. One tool (`shopify.orders.list`).
- **Tool-registry alignment**: PASS. `mcp-client.ts:347`, `:538`.
- **Bucket B migration**: **FAIL.** Should declare `brand.orders.list`. Body prose at line 25 references `brand.products` / source caveat, so migration intent is evident but tool list is stale.
- **Prompt/tool consistency**: WEAK. Prompt needs "UTM links, promo codes, affiliate dashboard metrics, content performance, views/likes/comments, brand sentiment" (lines 46-49). `shopify.orders.list?limit=50` returns only the 50 most recent orders — no UTM attribution, no promo-code breakdown, no influencer-level dimension. Direct attribution workflow (lines 53-58) cannot be computed from the declared tool.
- **Output schema**: PASS.
- **Issues**: Bucket B migration needed; tool coverage is fundamentally insufficient for the prompt (a real influencer tracker needs attribution tables and social platform APIs — neither declared nor in registry).

### persona-builder
- **Frontmatter** (`skills/customer-intel/persona-builder.md:1-22`): PASS. Correctly declares `mcp_tools: [brand.customers.list, brand.orders.list]` — Bucket B native.
- **Tool-registry alignment**: PASS. `brand.customers.list` at `mcp-client.ts:472`, `brand.orders.list` at `:476`. Both correctly **absent** from `TOOL_PLATFORM` (the resolvers load credentials internally, per the comment at `:463-467`).
- **Bucket B migration**: **PASS** — correctly migrated.
- **Prompt/tool consistency**: MOSTLY PASS. Workflow step 1 (lines 51-58) asks for cohort LTV, frequency distribution, category preferences, geography, time-of-purchase, return patterns. The resolvers return `BrandCustomer` / `BrandOrder` arrays — whether they include all these derived fields depends on resolver implementations (not audited here; flagged as live-run item). Body still calls out Shopify by name at line 32 ("If the Shopify data shows 60%…") — this reads as pre-Bucket-B prose even though tool list is migrated. Minor inconsistency.
- **Output schema**: PASS. Complex nested persona schema is sane (demographics / psychographics / shopping_behavior / media_consumption / brand_relationship + confidence + weight).
- **Issues**: Prose mentions "Shopify data" (line 32) and "shopify_orders" in the example `data_sources` (line 113) while tool list is Bucket-B — cosmetic inconsistency. Live question: do `BrandCustomer`/`BrandOrder` include enough fields (LTV, return rate, AOV) to build the cohort analysis?

### persona-creative-review
- **Frontmatter** (`skills/customer-intel/persona-creative-review.md:1-19`): PASS. `mcp_tools: []` — pure LLM over knowledge graph.
- **Tool-registry alignment**: N/A.
- **Bucket B migration**: N/A.
- **Prompt/tool consistency**: PASS. Inputs (lines 42-46) are all knowledge-graph resident (persona nodes, creative variants from prior skill output) — no fresh data fetch needed. Design is internally consistent.
- **Output schema**: PASS. Nested `reviews[].persona_scores[]` + `ranking` + `cross_persona_insights`.
- **Issues**: None structural.

### persona-ab-predictor
- **Frontmatter** (`skills/customer-intel/persona-ab-predictor.md:1-22`): PASS. `mcp_tools: []`.
- **Tool-registry alignment**: N/A.
- **Bucket B migration**: N/A.
- **Prompt/tool consistency**: PASS. Operates over persona + experiment + top_content nodes from graph (line 40-45). No external fetch needed.
- **Output schema**: PASS.
- **Issues**: None structural.

### persona-feedback-video
- **Frontmatter** (`skills/customer-intel/persona-feedback-video.md:1-22`): PASS. `mcp_tools: []`.
- **Tool-registry alignment**: N/A.
- **Bucket B migration**: N/A.
- **Prompt/tool consistency**: PASS.
- **Output schema**: PASS.
- **Special flag (video generation)**: **CONFIRMED PURE LLM.** Despite the name, this skill does **not** produce a rendered video. The output is a structured JSON "walkthrough script" (lines 65-129) — narrative persona journeys with `moment`/`sees`/`thinks`/`feels`/`does` per step. No Nano Banana / Imagen / Veo or any media-generation tool is declared or implied by the prompt. The naming is misleading but structurally correct for an LLM-only skill.
- **Issues**: Name vs. artifact mismatch is a UX concern (users may expect an actual video); not a structural bug. No wiring needed.

## Cross-cutting issues

1. **Bucket B migration incomplete for acquisition/**: 3 of 4 acquisition skills (`audience-targeting`, `retargeting-strategy`, `influencer-tracker`) still declare `shopify.*` tools directly. Their prose already anticipates Bucket B (using `brand.products`, source caveats), so the fix is a pure frontmatter swap: `shopify.customers.list` -> `brand.customers.list`, `shopify.orders.list` -> `brand.orders.list`. This is consistent with the migration already done in `persona-builder`.

2. **Stale "Shopify" references in persona-builder prose**: `persona-builder.md:32` and `:113` still say "Shopify data" / `"shopify_orders"` even though the tool list is Bucket B. Cosmetic but misleading to the LLM at runtime — it may output `shopify_orders` as a data source when the actual source could be `brand_data` fallback.

3. **Tool coverage gaps in acquisition/ skills**: `audience-targeting`, `retargeting-strategy`, and `influencer-tracker` prompts ask for signals the declared tools cannot provide:
   - Customer LTV deciles (need full customers, not limit=50).
   - Per-page / per-product visitor intent (GA4 tool runs only a session-level report with date dimension — see `fetchGA4Report` at `mcp-client.ts:197-232`).
   - UTM / promo-code / affiliate attribution (no attribution tool in registry).
   - Cart-abandoner / email-subscriber audiences (no pixel or Klaviyo tools declared).
   These are not fixable by frontmatter alone — they imply either new MCP tools or prompt pruning.

4. **`meta_ads.campaigns.insights` is read-side only**: Atlas's prompts (e.g., retargeting frequency caps, cross-channel coordination) imply write operations against Meta — no such tools exist in the registry. Expected for a strategy-authoring agent but worth noting.

5. **Pure-LLM skill density**: 5 of 8 Atlas skills (`influencer-finder`, `persona-creative-review`, `persona-ab-predictor`, `persona-feedback-video`) have `mcp_tools: []`. This is by design — they consume knowledge-graph nodes produced by other skills. Verifying graph population is a live-run concern.

## Live-run items deferred

- Confirm `brand.customers.list` resolver returns enough fields (LTV, AOV, return rate, order count, geography) to support `persona-builder`'s cohort analysis. The resolver is at `@/lib/resolvers/brand-customers` (referenced `mcp-client.ts:473`); schema not audited.
- Confirm `brand.orders.list` resolver returns timing patterns, product categories, and return flags.
- Verify knowledge-graph actually contains active `persona` nodes when `persona-creative-review` / `persona-ab-predictor` / `persona-feedback-video` run — these skills have no fallback and will produce empty output if the graph is unseeded.
- Verify `ga4.report.run` output shape when plumbed into `retargeting-strategy` — sessions/users by date is unlikely to support the intent-segmented retargeting audiences the prompt describes.
- Influencer-finder generates handles from LLM knowledge; at runtime, verify whether the engine augments with a live directory lookup or accepts fabricated handles as strategic suggestions.
- `persona-feedback-video` takes a `url` as input — confirm whether the engine supplements the LLM with a fetched copy of the page, or whether the LLM is evaluating solely from the URL string.

---

**Report path:** `C:/Users/naidu/Downloads/GROWTH-OS/growth-os/docs/verification/agents/atlas.md`
**Aggregate grade:** PASS-W-NOTES

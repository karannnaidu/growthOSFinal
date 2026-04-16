# Scout — Phase 2 Structural Audit

**Date:** 2026-04-17
**Aggregate grade:** PASS-W-NOTES

Scope: `health-check`, `anomaly-detection`, `customer-signal-analyzer`, `returns-analyzer`.

Note on locations: Scout owns 4 skills but only 2 live under `skills/diagnosis/`. `customer-signal-analyzer` and `returns-analyzer` live under `skills/customer-intel/` (confirmed by `skills/agents.json:21` assigning all four to Scout). The audit instructions pointed at `skills/diagnosis/<skill-id>.md` but the category field in each file is authoritative and correct.

---

## Per-skill findings

### health-check
File: `growth-os/skills/diagnosis/health-check.md`

- **Frontmatter:** PASS. YAML parses cleanly. `mcp_tools: [brand.products.list, brand.orders.list, meta_ads.campaigns.insights, ga4.report.run]` is a valid array (`health-check.md:8`). No `requires:` field (acceptable — this is a free/always-eligible skill). `chains_to`, `produces`, `knowledge` blocks well-formed.
- **Tool-registry alignment:** PASS. All 4 tools present in `TOOL_HANDLERS` (`mcp-client.ts:363, 367, 468, 476`). `meta_ads.campaigns.insights` and `ga4.report.run` also in `TOOL_PLATFORM` (`mcp-client.ts:541, 543`). `brand.*` tools intentionally omitted from `TOOL_PLATFORM` (documented at `mcp-client.ts:463-467`) because the resolver loads credentials internally — this is by design for Bucket B/A fallback.
- **Bucket B migration:** PASS. Frontmatter uses `brand.products.list` + `brand.orders.list` (not `shopify.*`). Body prose at `health-check.md:23` includes the required caveat line: "Use `brand.orders` / `brand.customers` / `brand.products` as your data sources. If any has `source !== 'shopify'`, caveat quantitative claims…". Matches spec guidance at `2026-04-17-production-readiness-design.md:157,162`.
- **Prompt/tool consistency:** PASS-W-NOTES. Prompt asks the LLM to score categories including `email` (`health-check.md:73`) and `seo` (`74`), which the prose correctly gates ("only with Klaviyo data", etc.). Klaviyo and Ahrefs/GSC tools are not declared — but the prompt does not *require* them; it self-gates with "only with X data" language. The `inventory` category in the output schema (`health-check.md:93`) can be computed from `brand.products.list` (stock levels from Shopify products when source=shopify).
- **Output schema:** PASS. Single JSON block, all fields (overall_score, categories, critical_findings, positive_signals, data_gaps) computable from declared inputs plus graph context. `data_gaps` array is specifically the right mechanism for un-declared sources.
- **Issues:** None blocking. Minor: no `requires:` block, but that is consistent with this skill being the default daily diagnostic that should always run even in low-data mode (explicitly by design — `health-check.md:31-36`).

### anomaly-detection
File: `growth-os/skills/diagnosis/anomaly-detection.md`

- **Frontmatter:** PASS. YAML parses. `mcp_tools: [brand.orders.list, meta_ads.campaigns.insights, ga4.report.run]` clean array (`anomaly-detection.md:8`). `schedule: "*/30 * * * *"` (every 30 min) noted — see cross-cutting issues re Scout cron dedupe.
- **Tool-registry alignment:** PASS. All 3 tools in `TOOL_HANDLERS`. Meta + GA4 in `TOOL_PLATFORM`.
- **Bucket B migration:** PASS. Uses `brand.orders.list` not `shopify.orders.list`. Caveat prose present at `anomaly-detection.md:25`.
- **Prompt/tool consistency:** PASS-W-NOTES. Prompt asks for "cart creation rate, checkout completion" (`anomaly-detection.md:44`), and the example output has a `checkout_completion_rate` anomaly (`:82`). Shopify `orders.json` alone does not expose cart-creation telemetry — that lives in Shopify analytics/checkout events, which the current `resolveBrandOrders` resolver does not pull. Baseline comparison (`:53-55`) depends on knowledge-graph metric nodes that live outside MCP — acceptable but unverifiable at structural level. `bounce_rate`, `traffic by source` are covered by `ga4.report.run`. Minor gap only — anomaly-detection will structurally work for order volume / revenue / GA4 / Meta anomalies; the checkout-funnel examples may degrade to data-gap output.
- **Output schema:** PASS. Well-formed single JSON block. `system_health.data_freshness` and `baseline_quality` fields are LLM-reported, not tool-computed — acceptable.
- **Issues:**
  - Checkout-funnel metrics (cart creation, checkout_completion_rate) not backed by any declared tool. Either prune those examples from the prompt or add a `shopify.checkouts.list` (or similar analytics) tool later.
  - Scout-specific cron dedupe is explicitly called out as an open issue in the spec (`2026-04-17-production-readiness-design.md:34, 120-122`). Every-30-min cadence without per-run idempotency is flagged there.

### customer-signal-analyzer
File: `growth-os/skills/customer-intel/customer-signal-analyzer.md`

- **Frontmatter:** PASS. YAML parses. `mcp_tools: [brand.orders.list, brand.customers.list]` clean (`customer-signal-analyzer.md:8`).
- **Tool-registry alignment:** PASS. Both resolvers registered in `TOOL_HANDLERS` (`mcp-client.ts:472-479`). Correctly absent from `TOOL_PLATFORM`.
- **Bucket B migration:** PASS. Already on `brand.*` tools. Caveat line present at `:25`. Matches Bucket A classification in the spec (`2026-04-17-production-readiness-design.md:155`).
- **Prompt/tool consistency:** NEEDS-ATTENTION. Prompt declares additional inputs the `mcp_tools` list does not fetch:
  - "Review data: sentiment trends, common themes, star rating distribution" (`:45`) — no review tool declared.
  - "GA4: returning vs new visitor ratio, pages per session, time on site" (`:46`) — `ga4.report.run` NOT in `mcp_tools`.
  - Output schema includes a `review_sentiment_shift` object (`:119-123`) that cannot be computed from orders+customers alone.
  - The RFM segmentation and churn/upsell signals *are* computable from `brand.orders.list` + `brand.customers.list`, so the core flow works.
- **Output schema:** PASS-W-NOTES. Well-formed, but `review_sentiment_shift` has no upstream tool. LLM will either fabricate or omit — without knowledge-graph review_theme nodes (they are declared in `knowledge.needs`), it will be fabricated.
- **Issues:**
  - Either add `ga4.report.run` + a review source, or remove those input declarations and the `review_sentiment_shift` output block, or gate them the way `health-check` gates email/SEO.

### returns-analyzer
File: `growth-os/skills/customer-intel/returns-analyzer.md`

- **Frontmatter:** PASS. YAML parses. `mcp_tools: [brand.orders.list, brand.products.list]` clean (`returns-analyzer.md:8`).
- **Tool-registry alignment:** PASS. Both in `TOOL_HANDLERS`.
- **Bucket B migration:** PASS. On `brand.*` tools; caveat line at `:23`. Spec classifies this in Bucket A (`2026-04-17-production-readiness-design.md:155`).
- **Prompt/tool consistency:** PASS-W-NOTES.
  - Return/refund/exchange breakdown (`:42`) is derivable from Shopify `orders.json` with `status=any` (refunds are embedded). `resolveBrandOrders` fetches `limit=50 status=any` — 90-day coverage and full refund detail depend on pagination which is not currently widened. Structural audit can't verify volume.
  - "Customer reviews: negative reviews correlated with returns" (`:44`) — no review tool declared.
  - "Support ticket themes (if accessible)" (`:46`) — explicitly conditional, acceptable.
  - Output block `return_reasons` requires a reason taxonomy which Shopify's refund object does include (`note`, `reason`), so feasible.
- **Output schema:** PASS. Single JSON block, well-formed.
- **Issues:**
  - Review-correlation claim in prompt has no backing tool — will silently fall back to graph `review_theme` nodes (declared in `knowledge.needs`) if present, else fabricated.
  - Only 50-order Shopify page limit in `resolveBrandOrders` may starve the "last 30–90 days" window for higher-volume brands. Not Scout-specific but relevant for both Scout skills that depend on orders history.

---

## Cross-cutting issues

1. **Scout cron dedupe** is an explicit known issue (`2026-04-17-production-readiness-design.md:34, 120-122`). `anomaly-detection` at every-30-min and `health-check` at daily 6am both share the same daily cron path — without per-day idempotency, duplicate runs are possible. Tracked in Phase 0.6 of the production-readiness plan.
2. **Review data is referenced by three of four Scout skills** (`health-check` only indirectly; `customer-signal-analyzer` and `returns-analyzer` explicitly) without any declared tool. The architecture currently assumes `review_theme` knowledge-graph nodes exist (they're in `knowledge.needs` for both skills), but there is no MCP tool / resolver that populates them. This is a systemic gap, not a Scout-only one.
3. **GA4 access inconsistency.** `health-check` and `anomaly-detection` declare `ga4.report.run`; `customer-signal-analyzer` references GA4 metrics in prose but does not declare the tool. Either add it or drop the prose.
4. **Bucket B migration is structurally clean across all 4 Scout skills.** The caveat sentence is present and identical in all 4 files — good prompt-hygiene consistency.
5. **Resolver-result shape.** Tool handlers `brand.*` return `ResolverResult<T>` (noted at `mcp-client.ts:466`), but `fetchSkillData` does NOT special-case them in its switch (`mcp-client.ts:649-738`) — so `brand.*` results currently fall into the `default: break;` branch and are dropped from `SkillDataContext`. Injection of `brand.*` data appears to happen instead via `skills-engine.ts:306-327` (`toolResolutions` / `data_source_summary`). Confirmed present there, but worth a live-run verification that the LLM actually sees the resolved products/orders/customers payload — not just the `_data_source_summary` metadata.

---

## Live-run items deferred (cannot verify without credentials + dev server)

- End-to-end call of `brand.orders.list` / `brand.customers.list` / `brand.products.list` resolvers against a real brand with Shopify connected — confirm full rows land in the LLM prompt (not just `data_source_summary`).
- Confirm fallback path: create a brand with no Shopify credential, confirm `brand.orders.list` returns a non-throwing `null`-source result and the engine injects `_data_caveats` (`skills-engine.ts:402-404`).
- Meta Ads `ad_account_id` metadata resolution — `fetchMetaInsights` at `mcp-client.ts:148-171` requires `cred.metadata.ad_account_id`; verify a connected brand has it set.
- GA4 `property_id` metadata — same check at `mcp-client.ts:197-232`.
- Google token refresh — `maybeRefreshGoogleToken` at `mcp-client.ts:72-142` writes back to DB; verify `GOOGLE_CLIENT_ID/SECRET` env is set.
- Anomaly-detection rolling-baseline logic — verify knowledge-graph metric nodes with 14-day history actually exist (or the skill gracefully reports "baseline_quality: insufficient").
- Cron dedupe — pending Phase 0.6 fix; until then, running `anomaly-detection` twice in a 30-min window will double-credit / double-produce.
- Output-schema adherence — confirm the LLM produces single-format JSON on a live run (no chat preamble) since runSkill parses strictly.

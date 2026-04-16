# Echo — Phase 2 Structural Audit

**Date:** 2026-04-17
**Agent:** Echo (competitive intelligence)
**Skills audited:** 4 (`competitor-scan`, `competitor-creative-library`, `competitor-traffic-report`, `competitor-status-monitor`)
**Aggregate grade:** PASS-W-NOTES

All 4 skills are located under `skills/diagnosis/` (not `skills/customer-intel/` as the audit brief suggested — noted for cross-check). YAML frontmatter parses cleanly on every skill, every declared `mcp_tools` entry is registered in `TOOL_HANDLERS` in `src/lib/mcp-client.ts`, and the competitor-assets storage pipeline is genuinely wired end-to-end (ScrapeCreators → download → Supabase Storage → competitor_creative nodes). The core blockers are prompt/tool drift (a body caveat in `competitor-scan` referencing `brand.products` that isn't in its `mcp_tools`) and a capability gap (landing-page screenshots promised in prose, not implemented in code).

## Per-skill findings

### competitor-scan
- **Location:** `C:/Users/naidu/Downloads/GROWTH-OS/growth-os/skills/diagnosis/competitor-scan.md`
- **Frontmatter:** PASS. YAML parses; `mcp_tools: [competitor.ads, competitor.products, competitor.traffic, competitor.seo, competitor.status]` is a clean array; no `requires:` field (not required by schema — sibling agents don't use it either). `schedule: "0 8 * * 4"`, `visual_capture: true`, `knowledge.needs/semantic_query/traverse_depth`, `produces[]` all well-formed.
- **Tool-registry alignment:** PASS. All 5 tools are registered in `TOOL_HANDLERS` (`src/lib/mcp-client.ts:380, 403, 423, 443, 481`). None require a platform credential (none appear in `TOOL_PLATFORM`), matching the comment at `mcp-client.ts:379` — "Competitor Intelligence (no platform credential needed — uses env vars)". Handlers load competitor nodes directly from `knowledge_nodes` (`brand_id, node_type='competitor', is_active=true`) and call the relevant `competitor-intel` function per node.
- **Bucket B migration:** NEEDS-ATTENTION. Line 27 of the skill body reads: `Use brand.products as your product catalog. If source !== 'shopify', caveat any quantitative claims…` — this Bucket-B prose was clearly ported from the diagnosis template (`anomaly-detection.md:25`, `health-check.md:23`) but there's no matching `brand.products.list` tool in `mcp_tools`. The skill analyzes *competitors*, not the brand's own catalog, so the correct fix is to delete line 27 rather than add `brand.products.list`. As shipped, the prompt will receive no `brand.products` context under that key and the LLM may hallucinate or waste tokens looking for it.
- **Prompt/tool consistency:** MIXED. Workflow step 1c/1d instruct the skill to "Screenshot top 3-5 ads" and "Screenshot competitor homepage (above-fold)". Step 1c is supported — `competitor.ads` → `scanAndStoreCompetitorAds` downloads ad thumbnails + videos to `competitor-assets/{brandId}/competitors/{slug}/` (`competitor-intel.ts:683-699`, `701-720`) and Gemini-vision-analyzes them (`competitor-intel.ts:591-636`). Step 1d is NOT supported — no handler captures landing-page screenshots. `firecrawl-client.ts` has no screenshot method (only HTML scraping for best-sellers at `competitor-intel.ts:277-323`), and there is no puppeteer/playwright dependency in `src/lib/`. The `landing_page.screenshot_url` field in the output schema (line 101) cannot be produced.
- **Output schema:** PASS. Single JSON block, stable top-level shape (`scan_date`, `competitors[]`, `competitive_position`, `recommended_actions[]`). `recommended_actions` entries carry `{action, agent, skill}` which aligns with `chains_to` + cross-agent handoffs (Aria, Sage, Max).
- **Media pipeline:** PASS for ads. The `competitor-assets` Supabase bucket is declared public in `supabase/storage.sql:18`, ScrapeCreators → download → upload → `getPublicUrl` is wired (`competitor-intel.ts:651-767`), and `competitor_creative` knowledge nodes persist `stored_thumbnail_url` / `stored_video_url` (`competitor-intel.ts:741-743`). Fail-soft on non-OK fetch, 15 s/60 s timeouts.
- **Issues:**
  1. Dead caveat: line 27 references `brand.products` which isn't in `mcp_tools`. Delete the caveat.
  2. Landing-page screenshot promised by prompt but not implemented anywhere. Either drop the capability from the prompt/schema, or wire a screenshot service (Firecrawl supports `formats: ['screenshot']` but the current `scrapePage` wrapper doesn't surface that).
  3. The `competitor.ads` handler at `mcp-client.ts:380-402` calls `fetchCompetitorAds` *after* `scanAndStoreCompetitorAds` — `scanAndStoreCompetitorAds` already calls `fetchCompetitorAds` internally, so the second call is redundant and doubles ScrapeCreators API spend per scan.

### competitor-creative-library
- **Location:** `C:/Users/naidu/Downloads/GROWTH-OS/growth-os/skills/diagnosis/competitor-creative-library.md`
- **Frontmatter:** PASS. YAML parses; `mcp_tools: [competitor.ads]` clean; `visual_capture: true`; `produces[]` valid (competitor_creative + insight nodes).
- **Tool-registry alignment:** PASS. Single tool `competitor.ads` registered at `mcp-client.ts:380`.
- **Bucket B migration:** N/A — competitor-only skill, no brand-catalog claim in the body.
- **Prompt/tool consistency:** PASS. Workflow ("pull all active ads from Meta Ad Library, capture screenshots/thumbnails, categorize, store as competitor_creative nodes with embeddings") is fully supported by `scanAndStoreCompetitorAds` which already does download + analyze + insert. Gemini vision fields (`format`, `messaging_approach`, `visual_style`, `visual_description`) align 1:1 with `CreativeAnalysis` at `competitor-intel.ts:582-589`.
- **Output schema:** PASS. Single JSON block, nested library structure, format/messaging breakdowns with integer counts, `longest_running_ad` + `new_experiments` objects, `trend_analysis` + `gaps_and_opportunities[]` with downstream `skill` pointers matching `chains_to: [ad-copy, ugc-script]`.
- **Media pipeline:** PASS. `storage_path: "competitor-assets/{brand_id}/creative-library/"` in output (line 132) — the actual upload path in code is `{brandId}/competitors/{competitorSlug}/` (`competitor-intel.ts:689, 710`), so the template string in the output schema is cosmetic and doesn't match the real path; minor doc drift, not a functional defect.
- **Issues:** Output's `storage_path` string is aspirational and doesn't match actual upload location. Also, `semantic_query` references `top_content` nodes in `knowledge.needs` but the produce list never creates `top_content` — expected (it's a read-only reference to brand creatives for benchmarking). No action needed.

### competitor-traffic-report
- **Location:** `C:/Users/naidu/Downloads/GROWTH-OS/growth-os/skills/diagnosis/competitor-traffic-report.md`
- **Frontmatter:** PASS. YAML parses; `mcp_tools: [competitor.traffic, competitor.seo]` clean; monthly schedule `"0 8 1 * *"`; `produces[]` valid.
- **Tool-registry alignment:** PASS. Both tools registered (`mcp-client.ts:423, 443`). Neither is in `TOOL_PLATFORM` (intentional — DataForSEO uses env vars `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD` at `competitor-intel.ts:330-331, 372-374, 410-412`).
- **Bucket B migration:** N/A.
- **Prompt/tool consistency:** PASS-W-NOTES. The output schema expects a rich `traffic_sources` breakdown (`organic`, `paid`, `social`, `direct`) and `source_shifts` narrative (line 78-84), but the real `getTrafficEstimate` implementation at `competitor-intel.ts:329-365` only returns `monthly_visits` and explicitly sets all traffic-source fields to `null`. The skill will have to either degrade gracefully or the LLM will fabricate percentages. Same risk for `SEOMetrics.organic_traffic` / `organic_keywords` which are both hard-null at `competitor-intel.ts:397-398`.
- **Output schema:** PASS. Single well-formed JSON block with `competitor_reports[]`, `keyword_gaps[]`, `trend_summary`, `recommended_actions[]` with `{action, agent, skill, priority}`.
- **Media pipeline:** N/A (data-only skill).
- **Issues:** Traffic-source breakdown is promised in the schema but the underlying DataForSEO call (`domain_technologies/live` at `competitor-intel.ts:336`) is the wrong endpoint for source-split data. To deliver what the schema advertises, the code would need DataForSEO's `domain_analytics/sources/live` or SimilarWeb integration. Flag as spec-vs-impl drift — mid severity because the LLM may fabricate percentages.

### competitor-status-monitor
- **Location:** `C:/Users/naidu/Downloads/GROWTH-OS/growth-os/skills/diagnosis/competitor-status-monitor.md`
- **Frontmatter:** PASS. YAML parses; `mcp_tools: [competitor.status]` clean; daily schedule `"0 7 * * *"`; `credits: 0.5` (only fractional-credit skill in Echo's set); `traverse_depth: 0` (lightweight — correct).
- **Tool-registry alignment:** PASS. `competitor.status` at `mcp-client.ts:481-500` calls `checkCompetitorStatus` (HEAD request with 10 s timeout, `competitor-intel.ts:518-544`) + `searchCompetitorNews` (NewsAPI, `competitor-intel.ts:550-576`).
- **Bucket B migration:** N/A.
- **Prompt/tool consistency:** PASS-W-NOTES. Workflow step 1c checks "if last known social post is > 30 days old" from competitor node properties, but no code path in `competitor-intel.ts` fetches or refreshes `last_social_post` — the field would only exist if populated elsewhere (e.g., by onboarding web-extraction). The LLM will receive undefined for this signal on fresh brands and may skip the check. Not a blocker for first scan; worth noting for fidelity of "shutdown confidence."
- **Output schema:** PASS. Two documented JSON shapes but both share the same top-level schema (`check_date`, `competitors_checked`, `all_clear`, `alerts[]`, optional `statuses[]`) — it's one schema with `alerts` potentially empty, not two formats. The second example just shows the populated-alerts variant.
- **Media pipeline:** N/A.
- **Issues:** Social-activity check has no data source; relies on node properties that may not be set. Minor.

## Cross-cutting issues

1. **Landing-page screenshots promised, not implemented.** `competitor-scan` step 1d + output field `landing_page.screenshot_url` has no backing code. `firecrawl-client.ts` doesn't expose Firecrawl's screenshot format; no Playwright/Puppeteer in `src/lib/`. Either strip from the prompt or extend `scrapePage` to request Firecrawl's `screenshot` output format and persist to `competitor-assets/{brandId}/landings/{domain}.png`.
2. **Dead Bucket-B caveat in competitor-scan.** Line 27's `Use brand.products as your product catalog` is a misapplied template inheritance — competitor skills analyze competitors, not the user's catalog. Remove.
3. **Double ScrapeCreators fetch in `competitor.ads` handler.** `mcp-client.ts:397-399` calls `scanAndStoreCompetitorAds` (which internally calls `fetchCompetitorAds`) and then immediately calls `fetchCompetitorAds` again to populate the `ads` field on the return. Deduplicate by returning the fetched-and-stored ads from `scanAndStoreCompetitorAds` instead of re-fetching.
4. **DataForSEO endpoint mismatch in `getTrafficEstimate`.** Uses `domain_technologies/live` but `competitor-traffic-report`'s schema wants source-split + bounce + avg-duration — all returned as `null`. Either change the endpoint or trim the schema.
5. **Media bucket naming doc drift in `competitor-creative-library` output.** Advertised path `competitor-assets/{brand_id}/creative-library/` vs. real path `{brandId}/competitors/{competitorSlug}/`. Align the docstring to reality.
6. **No `requires:` field on any Echo skill.** Matches sibling agent patterns (e.g., Nova) — not a defect, just confirming the rubric's "requires is sane" check passes vacuously.

## Live-run items deferred

- Actual ScrapeCreators → Gemini → Supabase Storage round-trip for `competitor-scan` / `competitor-creative-library` (requires `SCRAPECREATORS_API_KEY`, `GOOGLE_AI_KEY`, a seeded competitor node with `domain` and optional `social_links.facebook`, and a Supabase service role key).
- DataForSEO calls for `competitor-traffic-report` (requires `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD`).
- NewsAPI freshness + HTTP HEAD reliability for `competitor-status-monitor` (requires `NEWSAPI_KEY`; HTTP HEAD passes without credentials).
- End-to-end validation that the LLM honors the output JSON schema under the `competitor-scan` landing-page gap (will it emit `null`, omit the field, or fabricate a URL?).
- UI rendering of `competitor_creative` nodes in whatever surface displays Echo's output (not verified in this audit).

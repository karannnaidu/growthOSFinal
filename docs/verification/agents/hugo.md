# Hugo — Verification Report

**Date:** 2026-04-17
**Agent:** Hugo (SEO/Content)
**Skills:** 3 (`seo-audit`, `keyword-strategy`, `programmatic-seo`) — all Bucket B (products-only)
**Test mode:** Structural audit (no code edits, no commits)

## Summary

| Skill | Loads | Data resolves | Runs e2e | Output parseable | Output usable | UI renders | Grade |
|-------|-------|---------------|----------|------------------|---------------|------------|-------|
| seo-audit | PASS | FAIL (tool stripped, not migrated) | PASS (pure-LLM by declaration) | PASS | NEEDS_LIVE_RUN | NEEDS_LIVE_RUN | PASS-W-NOTES |
| keyword-strategy | PASS | FAIL (tool stripped, not migrated) | PASS (pure-LLM by declaration) | PASS | NEEDS_LIVE_RUN | NEEDS_LIVE_RUN | PASS-W-NOTES |
| programmatic-seo | PASS | FAIL (tool stripped, not migrated) | PASS (pure-LLM by declaration) | PASS | NEEDS_LIVE_RUN | NEEDS_LIVE_RUN | PASS-W-NOTES |

## Per-skill details

### seo-audit

- **Location:** `growth-os/skills/growth/seo-audit.md` (canonical — note: the top-level `GROWTH-OS/skills/growth/seo-audit.md` is an older pre-migration copy still carrying `mcp_tools: [shopify.products.list]`; the app loads from `growth-os/skills/…`).
- **Frontmatter (verbatim):**

  ```yaml
  id: seo-audit
  name: SEO Audit
  agent: hugo
  category: growth
  complexity: cheap
  credits: 1
  mcp_tools: []
  chains_to: [keyword-strategy]
  schedule: "0 8 * * 2"
  knowledge:
    needs: [keyword, product, competitor, insight, metric]
    semantic_query: "SEO rankings organic traffic meta descriptions keyword performance"
    traverse_depth: 1
    include_agency_patterns: true
  produces:
    - node_type: keyword
    - node_type: insight
      edge_to: keyword
      edge_type: derived_from
    - node_type: metric
  ```

- **Loads:** PASS. YAML parses. All required fields present. `agent: hugo` matches `skills/agents.json`. `schedule: "0 8 * * 2"` (weekly Tuesday) matches Hugo's agent-level schedule — consistent.

- **Data resolves:** FAIL (with caveats). `mcp_tools` is an empty array. Task 7 migration (`shopify.*` → `brand.*`) has not been applied here — instead the `shopify.products.list` declaration was **removed outright** rather than replaced with `brand.products.list`. Consequence under Phase 1 runSkill semantics (`src/lib/skills-engine.ts:307`): the `resolveDeclaredTools` / `computeBlockage` path is skipped entirely when `mcpTools.length === 0`, so the skill will **not** hard-block — but it also will **not** have any product catalog data injected into `liveData`. The skill body still explicitly instructs "Use `brand.products` as your product catalog. If `source !== 'shopify'`, caveat any quantitative claims", and the "Inputs Required" section lists "Shopify product pages: titles, descriptions, meta tags, URLs" as load-bearing. The LLM will be asked to audit a product catalog that was never resolved — it will either hallucinate or produce a generic, un-grounded audit. `brand.products.list` is registered at `src/lib/mcp-client.ts:468` via `resolveBrandProducts`, so the fix is a one-line frontmatter change, not infrastructure work.

- **Runs end-to-end:** PASS (by declaration). With `mcp_tools: []` the engine classifies this as a pure-LLM skill — preflight passes, no blockage, flows straight to model call. This is an artefact of how the migration was performed, not a reflection of the skill's actual data dependency.

- **Output parseable:** PASS. Single well-formed JSON schema under `## Output Format`: `overall_score`, `pages_audited`, `technical_issues.{critical[], warnings[]}`, `content_gaps[]`, `keyword_quick_wins[]`, `top_5_actions[]`. Each action carries `{action, impact, effort, priority}`. No multi-format ambiguity. `produces` (`keyword`, `insight → keyword`, `metric`) reasonably maps onto `keyword_quick_wins[]` + `content_gaps[]` + `overall_score`.

- **Output usable:** NEEDS_LIVE_RUN.

- **UI renders:** NEEDS_LIVE_RUN.

- **Grade:** PASS-W-NOTES.

- **Issues:**
  1. `mcp_tools: []` is a Task 7 under-migration — should be `mcp_tools: [brand.products.list]`. The body copy and "Inputs Required" both reference the product catalog as primary input.
  2. "Inputs Required" also lists GSC (`impressions, clicks, position, CTR`), Ahrefs (backlinks, DR), and GA4 (organic trend). None are declared in `mcp_tools`. If this guidance is load-bearing, `gsc.performance` and `ga4.report.run` should be added; otherwise the prompt sections expecting those signals should be pruned to avoid hallucinated rank/impression numbers.
  3. Output schema produces `pages[]` arrays of Shopify handle slugs (`"sunrise-serum"`, etc.) — consistent with a product-catalog input, reinforcing that `brand.products.list` is the correct missing tool.

### keyword-strategy

- **Location:** `growth-os/skills/growth/keyword-strategy.md`
- **Frontmatter (verbatim):**

  ```yaml
  id: keyword-strategy
  name: Keyword Strategy
  agent: hugo
  category: growth
  complexity: cheap
  credits: 1
  mcp_tools: []
  chains_to: [programmatic-seo, ad-copy]
  knowledge:
    needs: [keyword, product, competitor, insight, persona]
    semantic_query: "keyword strategy search volume intent mapping content opportunities"
    traverse_depth: 2
    include_agency_patterns: true
  produces:
    - node_type: keyword
      edge_to: product
      edge_type: relevant_to
    - node_type: content_plan
      edge_to: keyword
      edge_type: targets
  ---
  ```

- **Loads:** PASS. YAML parses. All fields present. `chains_to: [programmatic-seo, ad-copy]` — `programmatic-seo` is sibling Hugo skill (OK); `ad-copy` is Aria's — cross-agent chain, consistent with the skill's documented "Ad-relevant keywords → chain to Aria's `ad-copy`" at the bottom.

- **Data resolves:** FAIL (same pattern as seo-audit). `mcp_tools: []` post-Task 7 — `shopify.products.list` was stripped rather than rewritten to `brand.products.list`. Body copy: "Use `brand.products` as your product catalog." "Inputs Required" explicitly names "Product catalog (what to rank for — product names, categories, features)" as the first input and "product features and benefits (from Shopify descriptions)" in workflow step 1. No hard-block (empty tools array), but the LLM has no structured catalog to seed keyword clusters from.

- **Runs end-to-end:** PASS (by declaration — pure-LLM per engine).

- **Output parseable:** PASS. Single JSON schema: `strategy_date`, `total_clusters_identified`, `estimated_total_monthly_traffic_opportunity`, `clusters[]` (each with `cluster_name`, `intent`, `keywords[]`, `total_cluster_volume`, `revenue_potential_monthly`, `difficulty_assessment`, `quick_win`, `target_page`, `action_plan[]`, `estimated_traffic_gain`), `roadmap.{month_1_quick_wins, month_2_new_content, month_3_authority}`, `competitor_keyword_gaps[]`. Clean and stable. `produces` node_types (`keyword → product`, `content_plan → keyword`) cleanly extractable from `clusters[]` and `roadmap`.

- **Output usable:** NEEDS_LIVE_RUN.

- **UI renders:** NEEDS_LIVE_RUN.

- **Grade:** PASS-W-NOTES.

- **Issues:**
  1. Same Task 7 under-migration as `seo-audit`: `mcp_tools` should be `[brand.products.list]`.
  2. Workflow also references competitor keyword data and GSC/Ahrefs rankings — none are declared. Either add tools (`gsc.performance`) or trim the "Current rank" columns from the output example to reflect what the LLM can actually produce from catalog + knowledge-graph alone.
  3. `estimated_total_monthly_traffic_opportunity` is a quantitative claim the body explicitly says to caveat when `source !== 'shopify'` — without `brand.products.list` wired in, the `_data_caveats` system prompt injection won't even fire because there's no resolver result to inspect, so the LLM won't receive the "source is brand_data / caveat numbers" signal.

### programmatic-seo

- **Location:** `growth-os/skills/growth/programmatic-seo.md`
- **Frontmatter (verbatim):**

  ```yaml
  id: programmatic-seo
  name: Programmatic SEO
  agent: hugo
  category: growth
  complexity: premium
  credits: 3
  mcp_tools: []
  chains_to: [seo-audit]
  knowledge:
    needs: [keyword, product, competitor, persona, content_plan]
    semantic_query: "programmatic SEO template pages scaled content generation"
    traverse_depth: 2
    include_agency_patterns: true
  produces:
    - node_type: content_template
      edge_to: keyword
      edge_type: targets
    - node_type: page_content
      edge_to: product
      edge_type: promotes
  ```

- **Loads:** PASS. YAML parses. `complexity: premium` + `credits: 3` is consistent with the skill's scope (generates 100+ page templates). `chains_to: [seo-audit]` closes the Hugo triad into a loop (audit → strategy → programmatic → audit).

- **Data resolves:** FAIL (same pattern). `mcp_tools: []` — should be `[brand.products.list]` at minimum. The pattern generator in workflow step 1 is literally `{product} x {use case}`, `{product} x {skin type}`, `{category} x {location}` — the product catalog is the enumeration source. The sample output even shows `variables.product: ["Sunrise Serum", "Glow Moisturizer", "Night Repair Cream", "Gentle Cleanser"]` which can only come from a resolved catalog.

- **Runs end-to-end:** PASS (by declaration — pure-LLM per engine).

- **Output parseable:** PASS. JSON schema: `strategy_date`, `patterns_identified`, `total_pages_generatable`, `estimated_monthly_traffic`, `patterns[]` (each with `pattern`, `example`, `total_pages`, `variables{}`, `aggregate_monthly_volume`, `avg_difficulty`, `template.{title_tag, meta_description, h1, content_blocks[], internal_links{}, schema[]}`, `sample_page{}`), `implementation_plan.{phase_1, phase_2, phase_3}`, `quality_guardrails{}`. Rich, but each field is well-typed. The `content_blocks[].dynamic_fields` pattern is consistent across entries.

- **Output usable:** NEEDS_LIVE_RUN.

- **UI renders:** NEEDS_LIVE_RUN.

- **Grade:** PASS-W-NOTES.

- **Issues:**
  1. Same Task 7 under-migration: `mcp_tools` should be `[brand.products.list]`. This skill is arguably the most dependent on catalog data of the three — the variable enumeration (`variables.product`) cannot be correctly populated without it.
  2. Workflow step 1 also lists "competitor programmatic pages (what templates are they using)" and "Persona data" as inputs — neither has a backing tool. Persona data does flow via `knowledge.needs: […, persona, …]` through the knowledge-graph retrieval path, which is acceptable. Competitor data does not have a declared source and would need to come from Echo's `competitor-scan` output in the knowledge graph (via `needs: [competitor]`).
  3. `chains_to: [seo-audit]` creates a closed loop with `seo-audit → keyword-strategy → programmatic-seo → seo-audit`. Confirm the chain-processor has cycle detection (out of scope for this structural audit — noted for later).

## Aggregate structural grade: PASS-W-NOTES

All 3 skills load cleanly, declare coherent JSON output schemas, and will run end-to-end against the current engine (because `mcp_tools: []` sidesteps the Phase 1 hard-block gate). The blocking concern is **not** a runtime failure — it's a silent **data-grounding gap**: the body copy asks the LLM to reason over a brand's product catalog, but no product-catalog tool is declared, so no `brand.products` data will be injected into the prompt. The LLM will produce plausible-looking output, but quantitative claims (page counts, keyword volumes tied to specific product names, rank estimates) will be ungrounded.

## Known issues noted for later

- **Task 7 completion for Hugo:** all 3 skills need `mcp_tools: [brand.products.list]` added. Currently they were stripped to `[]` instead of rewritten. This is the highest-priority fix — one-line frontmatter change each, no infrastructure work needed (`brand.products.list` is already wired in `src/lib/mcp-client.ts:468`).
- **Stale duplicate skill files:** `GROWTH-OS/skills/growth/{seo-audit,keyword-strategy,programmatic-seo}.md` (top-level, outside `growth-os/`) still carry `mcp_tools: [shopify.products.list]`. Confirm which tree is authoritative and delete or sync the stale copy to avoid a future "which skill ran?" debugging incident.
- **Optional second-tier tools:** if GSC impressions/rank data and Ahrefs-style difficulty scores are genuinely load-bearing for the SEO outputs (quick-wins at rank 8-20, monthly_volume, current_rank), `gsc.performance` should be declared and registered. Otherwise prune those fields from the output schemas so the prompts don't incentivise hallucination.
- **Output `strategy_date` / `analysis_date` example values** (`2026-04-08`) are stale vs today (`2026-04-17`); cosmetic only, LLM fills at runtime.
- **Chain cycle `seo-audit ↔ keyword-strategy ↔ programmatic-seo ↔ seo-audit`** — verify the chain processor handles this (depth cap / visited-set). Out of scope here.

## What needs a live run to verify

- Check 3 (runs e2e) — engine will accept the skill (empty `mcp_tools` passes preflight), but whether the model produces the documented JSON schema consistently under `prompt + no catalog data` vs `prompt + catalog data` needs an actual invocation.
- Check 5 (output usable) — whether Mia or the user can act on `top_5_actions[]`, `roadmap.month_1_quick_wins[]`, and `patterns[].template` end-to-end (auto-chain to `keyword-strategy`, `programmatic-seo`, `ad-copy`).
- Check 6 (UI renders) — `BlockedRunCard` won't trigger for Hugo (no declared tools to block on), so the UI path here is the standard completed-run renderer for the declared JSON shapes. Needs the skill-run detail view tested against a real output payload.

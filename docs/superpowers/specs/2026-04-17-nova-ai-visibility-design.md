# Nova AI Visibility — Design Spec

**Date:** 2026-04-17
**Status:** Approved (brainstorm)
**Depends on:** `2026-04-17-kg-reliability-design.md` (Nova uses `postRun` hook for deterministic KG writes and `diagnostics` for per-engine coverage reporting)
**Blocks:** nothing

## Problem

Nova's declared role is **"AI Visibility"** — optimizing how the brand appears in ChatGPT, Perplexity, Gemini, and Google AI Overviews. But Nova's only skill (`geo-visibility`) is a **geographic market analyzer** that asks for Shopify orders and GA4 traffic by region. The role label and the actual function don't match.

Symptoms the user has seen:
- Nova's detail page asks for Shopify/GA4 connections to do "AI Visibility" work — nonsensical
- No skill in the platform actually probes AI engines, generates AI-citable artifacts, or measures AI share-of-voice
- The `geo-visibility` skill itself is useful but is mislabeled and misowned

What the industry actually does for AI visibility (confirmed via research): derive the brand's **entity DNA** (who the brand is, what it sells, for whom, how it's different), generate the natural-language queries a potential customer would type into an AI engine, probe those engines to see whether the brand is cited, then publish structured artifacts (JSON-LD schema, `llms.txt`, FAQ content) that make the brand citable.

## Solution Overview

Four changes:

1. **Rename and reassign `geo-visibility`.** Move to Atlas, rename to `geographic-markets`. Atlas already owns audiences and markets; this is a natural fit. The skill's logic is untouched.
2. **Add 3 new skills for Nova:**
   - `brand-dna-extractor` — derive the brand's entity profile and candidate AI queries from knowledge graph + website.
   - `ai-visibility-probe` — run candidate queries against ChatGPT / Perplexity / Gemini via platform-owned API keys; record citation outcomes.
   - `ai-visibility-optimize` — generate JSON-LD, `llms.txt`, and FAQ drafts targeting the queries where the brand is absent.
3. **Draft mode.** `ai-visibility-optimize` writes drafts as KG nodes (`ai_artifact` node_type, `status: 'draft'`). User reviews in dashboard. Publishing to Shopify is a future Hugo skill — stubbed for v1 (we show the artifact, copy-paste for now).
4. **Platform-owned API keys.** Growth OS holds the OpenAI / Anthropic / Google Gemini keys. Brands never bring keys. Cost is platform overhead, amortized into skill credits.

No breaking changes for existing skills. `geo-visibility` is renamed but functionally identical. Nova's UI role label remains "AI Visibility" and now actually matches its skills.

---

## 1. `geo-visibility` → `geographic-markets` (Atlas)

### Change

- **Move** `skills/growth/geo-visibility.md` → `skills/growth/geographic-markets.md`.
- **Edit** frontmatter: `id: geographic-markets`, `agent: atlas` (was `nova`).
- **Update** `skills/agents.json`: remove `geo-visibility` from Nova's skills, add `geographic-markets` to Atlas's skills.
- **No logic change.** System prompt, workflow, outputs all stay identical.

### Backfill for existing `skill_runs`

Historical `skill_runs.skill_id = 'geo-visibility'` stays as-is. The skill loader continues to resolve `geo-visibility` as an alias for `geographic-markets` for 30 days, then alias is removed. No migration on `skill_runs`.

### UI

Atlas's detail page picks up the skill automatically via `agents.json`. Nova's detail page no longer lists it.

---

## 2. `brand-dna-extractor` — new skill

### Purpose

Derive the brand's entity profile and generate the candidate AI-engine queries that matter. This is the foundation `ai-visibility-probe` and `ai-visibility-optimize` consume.

### Frontmatter

```yaml
id: brand-dna-extractor
name: Brand DNA Extractor
agent: nova
category: growth
complexity: standard
credits: 2
mcp_tools: [brand.products.list]
chains_to: [ai-visibility-probe]
knowledge:
  needs: [product, brand_guidelines, review_theme, insight]
  semantic_query: "brand positioning category differentiation target customer problem solved"
  traverse_depth: 2
produces:
  - node_type: brand_dna
    edge_to: brand_guidelines
    edge_type: derived_from
  - node_type: ai_query
    edge_to: brand_dna
    edge_type: derived_from
```

### Inputs

- Existing `brand_guidelines` nodes (from Aria's `brand-voice-extractor` if present).
- `product` nodes (via MCP `brand.products.list`).
- `review_theme` and `insight` nodes (what customers actually say).
- Brand website HTML (scraped once via `fetch` — no external MCP).

### Workflow

1. Load inputs from KG (RAG + direct node query).
2. Call Claude Sonnet 4.6 to synthesize an `entity_profile`:
   - `canonical_name`, `category`, `subcategory`
   - `value_props[]` (3–5)
   - `differentiators[]` (what makes brand uniquely citable)
   - `target_customer` (who, with what problem)
   - `competitors[]` (brands AI engines will compare against)
3. From the entity profile, generate `candidate_queries[]` — 30–50 natural-language queries spanning:
   - **Discovery** ("best X for Y", "X without Z")
   - **Comparison** ("brand A vs brand B", "alternatives to X")
   - **Specific problem** ("how to solve Y")
   - **Brand-named** ("is {brand} good", "{brand} review")
4. Persist via `postRun` hook (see Spec A): one `brand_dna` node + N `ai_query` nodes.

### Output shape

```json
{
  "entity_profile": { "canonical_name": "...", "category": "...", "value_props": [...], "differentiators": [...], "target_customer": "...", "competitors": [...] },
  "candidate_queries": [
    { "query": "best sulfate-free shampoo for oily scalp", "intent": "discovery", "priority": "high" },
    { "query": "briogeo vs living proof", "intent": "comparison", "priority": "high" },
    { "query": "why does my hair feel greasy 2 hours after washing", "intent": "problem", "priority": "med" }
  ]
}
```

### postRun

`skills/growth/brand-dna-extractor.postRun.ts` writes:
- One `brand_dna` node (upsert on `brand_id`).
- `ai_query` nodes per candidate query (upsert on `brand_id + query`).
- Edges `ai_query → derived_from → brand_dna`.

---

## 3. `ai-visibility-probe` — new skill

### Purpose

For each `ai_query` in the KG, ask ChatGPT / Perplexity / Gemini the question and check whether the brand is cited. Record per-engine coverage.

### Frontmatter

```yaml
id: ai-visibility-probe
name: AI Visibility Probe
agent: nova
category: growth
complexity: premium
credits: 5
mcp_tools: []
chains_to: [ai-visibility-optimize]
knowledge:
  needs: [brand_dna, ai_query]
  semantic_query: "ai search visibility citation coverage"
  traverse_depth: 1
produces:
  - node_type: ai_probe_result
    edge_to: ai_query
    edge_type: measures
```

### Engines probed

| Engine | API | Key env var | Notes |
|---|---|---|---|
| ChatGPT (web search) | OpenAI Responses API with `web_search_preview` tool | `OPENAI_API_KEY` | Platform-owned |
| Perplexity | `https://api.perplexity.ai/chat/completions` | `PERPLEXITY_API_KEY` | Platform-owned |
| Gemini (Google Search grounding) | Gemini API with `google_search_retrieval` tool | `GOOGLE_AI_KEY` (already present) | Reuses existing key |

Google AI Overviews: no official API. **Out of scope for v1.** We note coverage as `skipped` for `google_overviews` and come back to it when a reliable probe exists.

### Workflow

1. Load `ai_query` nodes with `priority: high` (cap at 20 queries per run to bound cost).
2. For each query, fan out to the 3 engines in parallel.
3. For each (query, engine) pair, record:
   - `cited: boolean` — did the answer mention the brand by canonical name?
   - `citation_rank: number | null` — 1 if first mention, 2 if second, etc.
   - `competitors_cited: string[]` — which competitors were mentioned.
   - `answer_excerpt: string` — first 500 chars of the answer.
4. Aggregate to a coverage summary: `{ chatgpt: 0.40, perplexity: 0.65, gemini: 0.25 }` (share of queries where brand was cited).
5. Write `ai_probe_result` nodes via `postRun`.

### Failure handling

Per Spec A, per-engine failures go into `diagnostics.coverage`. If Perplexity is down, `diagnostics.coverage.perplexity = 'failed'`; the run still completes with ChatGPT + Gemini data. No retries in v1.

### Rate limiting

- ChatGPT: 500 req/min org limit — fine at 20 queries.
- Perplexity: 50 req/min — batch with `Promise.all` but cap concurrency at 10.
- Gemini: 1000 req/min — fine.

If a rate-limit error is returned, record `rate_limited: true` in diagnostics; do not retry within the run.

### Output shape

```json
{
  "queries_probed": 20,
  "coverage": { "chatgpt": 0.40, "perplexity": 0.65, "gemini": 0.25 },
  "results": [
    {
      "query": "best sulfate-free shampoo for oily scalp",
      "engines": {
        "chatgpt": { "cited": false, "competitors_cited": ["Briogeo", "Living Proof"], "excerpt": "..." },
        "perplexity": { "cited": true, "citation_rank": 2, "competitors_cited": ["Briogeo"], "excerpt": "..." },
        "gemini": { "cited": false, "competitors_cited": ["Pureology"], "excerpt": "..." }
      }
    }
  ],
  "gap_queries": [ { "query": "...", "engines_missing": ["chatgpt", "gemini"] } ]
}
```

### postRun

Writes one `ai_probe_result` node per (query, engine) pair, plus edge to the source `ai_query`.

---

## 4. `ai-visibility-optimize` — new skill

### Purpose

For the **gap queries** (where the brand wasn't cited), generate three artifact types that improve citability: JSON-LD structured data, `llms.txt`, and FAQ page drafts.

### Frontmatter

```yaml
id: ai-visibility-optimize
name: AI Visibility Optimizer
agent: nova
category: growth
complexity: standard
credits: 3
mcp_tools: []
chains_to: []
knowledge:
  needs: [brand_dna, ai_probe_result, product, brand_guidelines]
  semantic_query: "ai visibility optimization schema llms faq"
  traverse_depth: 2
produces:
  - node_type: ai_artifact
    edge_to: brand_dna
    edge_type: improves
```

### Artifacts generated

1. **JSON-LD schema.org blocks**
   - `Organization` (name, url, sameAs socials, description, founder if known)
   - `Product` for top 3 products (name, description, brand, offers, aggregateRating if reviews exist)
   - `FAQPage` for top 5 gap queries with brand-accurate answers
2. **`llms.txt`**
   - Following the emerging `llms.txt` convention (see `llmstxt.org`).
   - Sections: `# {Brand Name}`, one-line summary, `## What we sell`, `## Who we're for`, `## Core claims`, `## Where to learn more`.
3. **FAQ page drafts**
   - Markdown content for 5 gap-query FAQs. Each has `question`, `answer` (150–300 words, citation-friendly format: definitive opening sentence, then supporting context).

### Workflow

1. Load `ai_probe_result` nodes where `cited: false` across ≥2 engines (high-impact gaps).
2. Load `brand_dna`, `brand_guidelines`, top `product` nodes.
3. Call Claude Sonnet 4.6 with a synthesis prompt producing all three artifacts in one call.
4. Validate JSON-LD via `schema-dts` typings (compile-time) and a runtime `JSON.parse` + shape check.
5. Write each artifact as an `ai_artifact` node with `status: 'draft'` via `postRun`.

### Draft mode

Each artifact is a KG node. Users see them in Nova's detail page:

```
┌───────────────────────────────────────┐
│ Nova · AI Visibility                  │
├───────────────────────────────────────┤
│ Coverage: ChatGPT 40% · Perplexity    │
│ 65% · Gemini 25%                       │
│                                        │
│ Drafts ready for review:               │
│  [ ] JSON-LD Organization schema       │
│  [ ] JSON-LD Product (Hydrate Shampoo) │
│  [ ] JSON-LD FAQPage (5 Q/A)           │
│  [ ] llms.txt                          │
│  [ ] FAQ page: "best sulfate-free..."  │
│                                        │
│ [Copy to clipboard] [Approve]          │
└───────────────────────────────────────┘
```

"Approve" sets `status: 'approved'` on the node. Actual Shopify publishing is a **future Hugo skill** (`shopify-publish-seo` or similar) — not part of this spec. For v1, approved artifacts are copy-paste by the user into Shopify theme / admin.

### Output shape

```json
{
  "artifacts": [
    { "type": "json_ld_organization", "content": { "@context": "https://schema.org", "@type": "Organization", ... }, "status": "draft" },
    { "type": "json_ld_product", "content": {...}, "status": "draft" },
    { "type": "json_ld_faqpage", "content": {...}, "status": "draft" },
    { "type": "llms_txt", "content": "# Briogeo\n\nClean hair care...\n", "status": "draft" },
    { "type": "faq_markdown", "content": "...", "question": "best sulfate-free shampoo", "status": "draft" }
  ],
  "gap_queries_addressed": 5,
  "estimated_uplift": "Addressing these 5 gaps could lift ChatGPT citation rate from 40% to ~60%"
}
```

### postRun

Writes `ai_artifact` nodes with `properties: { type, content, status, question? }`. Unique on `(brand_id, type, question ?? 'default')` so reruns upsert rather than duplicate.

---

## 5. Platform-owned API keys

### Decision

Growth OS holds the keys. Brands never bring keys. Rationale:
- Brands can't reasonably manage 3+ API key rotations.
- Consolidated usage lets us negotiate volume pricing.
- Costs are predictable and can be amortized into the existing skill credit model.

### Keys required (new)

| Key | Env var | Where used | Est. cost per Nova full cycle |
|---|---|---|---|
| OpenAI | `OPENAI_API_KEY` | `ai-visibility-probe` (ChatGPT) | ~$0.04 (20 queries × gpt-4o-search) |
| Perplexity | `PERPLEXITY_API_KEY` | `ai-visibility-probe` | ~$0.02 (20 queries × sonar) |
| Google Gemini | `GOOGLE_AI_KEY` | `ai-visibility-probe` (already present) | ~$0.01 |
| Anthropic | `ANTHROPIC_API_KEY` (already present) | `brand-dna-extractor`, `ai-visibility-optimize` | ~$0.08 (Sonnet synth calls) |

**Total per full Nova cycle: ~$0.15.** Current credit model (`ai-visibility-probe: 5 credits`, `brand-dna-extractor: 2`, `ai-visibility-optimize: 3` = 10 credits/cycle) covers this comfortably.

### Operational

- Keys go in Vercel env for prod, `.env.local` for dev.
- Key rotation procedure documented in `docs/ops/api-key-rotation.md` (new doc — owner: platform).
- No per-brand key storage in DB.

---

## 6. Data Flow

```
┌─────────────────────┐
│ brand-dna-extractor │  reads: product, brand_guidelines, website
│      (Nova)         │  writes: brand_dna, ai_query[]  (via postRun)
└──────────┬──────────┘
           │ chains to
           ▼
┌─────────────────────┐
│  ai-visibility-probe│  reads: ai_query[] (priority=high, cap 20)
│       (Nova)        │  probes: ChatGPT + Perplexity + Gemini
│                     │  writes: ai_probe_result[]  (via postRun)
│                     │  diagnostics.coverage: per-engine ok/failed
└──────────┬──────────┘
           │ chains to
           ▼
┌─────────────────────┐
│ ai-visibility-      │  reads: ai_probe_result (gaps), brand_dna, product
│    optimize         │  writes: ai_artifact[] (status=draft)
│     (Nova)          │  via postRun
└──────────┬──────────┘
           │
           ▼
     [Nova detail UI]
           │ user approves
           ▼
  [future: Hugo shopify-publish-seo]
```

---

## 7. Dependency on Spec A

Nova relies on three mechanisms from the KG Reliability spec:

1. **`postRun` hook** — all three Nova skills use it to write deterministic KG nodes. Without this, we'd have three more hardcoded cases in `skills-engine.ts`.
2. **`diagnostics.coverage`** — `ai-visibility-probe` needs per-engine failure reporting. The diagnostics JSONB column carries `{ chatgpt: 'ok', perplexity: 'failed', gemini: 'ok' }`.
3. **`produces` enforcement** — Nova introduces new node types (`brand_dna`, `ai_query`, `ai_probe_result`, `ai_artifact`). These must be added to `VALID_NODE_TYPES` and declared in each skill's `produces` block.

If Spec A slips, Nova v1 falls back to fire-and-forget writes with no diagnostics — degraded but shippable.

### New node types to add to `VALID_NODE_TYPES`

- `brand_dna`
- `ai_query`
- `ai_probe_result`
- `ai_artifact`

---

## 8. Non-goals

- **Google AI Overviews probe.** No official API; scraping is fragile. Revisit when Google ships one.
- **Shopify publishing.** Draft-only for v1. Future Hugo skill owns publish.
- **Continuous probing.** Probes run on schedule (`0 8 1 * *` — monthly) or on user trigger. No daily automation.
- **Competitor AI visibility comparison.** We record which competitors got cited, but no competitive dashboard view in v1.
- **Multi-language.** English-only queries and artifacts.
- **Query-generation tuning via A/B.** Queries are generated once per `brand-dna-extractor` run; no learning loop.

---

## 9. Testing

**Unit:**
- `brand-dna-extractor`: mock KG + website → expect 30–50 queries with intent mix.
- `ai-visibility-probe`: mock the 3 engine clients — one ok, one rate-limited, one failed — expect `diagnostics.coverage = { chatgpt: 'ok', perplexity: 'failed', gemini: 'ok' }` and partial results.
- `ai-visibility-optimize`: JSON-LD outputs pass schema-dts type check and `JSON.parse`.

**Integration:**
- Full Nova cycle against a test brand (Briogeo-style seed data): verify `brand_dna` → 30+ `ai_query` → `ai_probe_result` across 3 engines → `ai_artifact` drafts.
- Verify `postRun` writes survive a partial engine failure.

**Manual:**
- Run against the user's seed brand; confirm coverage report matches manual probing (eyeball 5 queries).
- Confirm draft artifacts render in Nova detail page and "Copy to clipboard" works.
- Confirm Atlas detail page lists `geographic-markets` and Nova does not.

---

## 10. Rollout

Sequenced after Spec A ships (diagnostics + postRun are available):

1. Add 4 new node types to `VALID_NODE_TYPES`. Merge.
2. Rename `geo-visibility` → `geographic-markets`, reassign to Atlas. Merge.
3. Add `brand-dna-extractor` skill + `.postRun.ts`. Merge.
4. Add `ai-visibility-probe` skill + `.postRun.ts` + engine clients (`src/lib/ai-engines/{openai,perplexity,gemini}.ts`). Platform API keys added to Vercel env. Merge.
5. Add `ai-visibility-optimize` skill + `.postRun.ts`. Merge.
6. Nova detail page: render artifacts, add approve button. Merge.

Each step is an independent PR. Nova is unusable end-to-end until step 5, but no existing flows regress.

---

## Out of Scope

- Hugo's Shopify-publish skill (separate spec when we prioritize it).
- AI Overviews probe.
- Multi-language.
- Nova dashboard widgets on main mission-control (only Nova's own detail page for v1).
- Historical coverage trend charts (we persist `ai_probe_result`, so a later spec can render trends without schema changes).

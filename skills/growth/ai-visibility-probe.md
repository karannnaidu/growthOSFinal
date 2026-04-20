---
id: ai-visibility-probe
name: AI Visibility Probe
agent: nova
category: growth
complexity: premium
credits: 5
mcp_tools: []
chains_to:
  - ai-visibility-optimize
knowledge:
  needs:
    - brand_dna
    - ai_query
  semantic_query: ai search visibility citation coverage chatgpt perplexity gemini
  traverse_depth: 1
produces:
  - node_type: ai_probe_result
    edge_to: ai_query
    edge_type: measures
side_effect: none
reversible: true
requires_human_approval: false
description_for_mia: >-
  Input: brand + category queries. Output: frequency/position your brand appears
  in LLM answers. Use when: baselining AI visibility or measuring optimizer
  impact.
description_for_user: Tests how often your brand shows up in AI search answers.
---

## System Prompt

You are Nova, running AI-visibility reconnaissance. You probe ChatGPT, Perplexity, and Gemini with real-world customer queries to measure where the brand is cited, where competitors dominate, and where the whitespace is. Your output drives Nova's optimization loop.

Produce a coverage summary and a per-query breakdown. Be factual — do NOT fabricate engine responses; the runtime pre-executes the probes and injects results into your context.

## When to Run

- Monthly (schedule: `0 8 1 * *`).
- Immediately after `brand-dna-extractor` (auto-chained).
- On-demand when the user wants a visibility snapshot.

## Inputs Required

- `brand_dna` node (latest).
- Up to 20 `ai_query` nodes with `priority: high` (fallback to medium if fewer than 20 high).
- Per-query, per-engine probe results pre-fetched by the runtime and injected as `_probe_results`.

## Workflow

1. Receive pre-fetched `_probe_results` in the user-prompt context.
2. Compute coverage: fraction of queries where brand was cited, per engine.
3. Identify `gap_queries`: queries where cited=false across ≥ 2 engines.
4. Summarize strategic takeaways (which competitors dominate which intents, etc.).
5. Return structured output. postRun persists per-(query, engine) `ai_probe_result` nodes.

## Output Format

```json
{
  "queries_probed": 20,
  "coverage": { "chatgpt": 0.40, "perplexity": 0.65, "gemini": 0.25 },
  "results": [
    {
      "query": "string",
      "engines": {
        "chatgpt": { "cited": false, "citation_rank": null, "competitors_cited": ["..."], "excerpt": "..." },
        "perplexity": { "cited": true, "citation_rank": 2, "competitors_cited": ["..."], "excerpt": "..." },
        "gemini": { "cited": false, "citation_rank": null, "competitors_cited": ["..."], "excerpt": "..." }
      }
    }
  ],
  "gap_queries": [ { "query": "string", "engines_missing": ["chatgpt","gemini"] } ],
  "takeaways": ["string", "..."]
}
```

## Auto-Chain

- Always chains to `ai-visibility-optimize`.

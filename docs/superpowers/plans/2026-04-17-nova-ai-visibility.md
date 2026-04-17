# Nova AI Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Nova's role/skill mismatch (current sole skill `geo-visibility` is geographic markets, misattributed as AI visibility) with three new skills that actually deliver AI visibility: `brand-dna-extractor` → `ai-visibility-probe` → `ai-visibility-optimize`. Reassign `geo-visibility` to Atlas under its correct name (`geographic-markets`).

**Architecture:** Nova's pipeline reads brand DNA from the KG + website, generates 30–50 candidate AI-engine queries, probes ChatGPT (OpenAI Responses API with web search), Perplexity (sonar model), and Gemini (google_search_retrieval), records per-engine citation coverage, then generates draft JSON-LD / llms.txt / FAQ artifacts for gap queries. Artifacts are persisted as `ai_artifact` nodes with `status=draft`; user approves in the Nova detail page. All writes use the `postRun` hook introduced in the KG Reliability spec. Platform owns all API keys.

**Tech Stack:** Next.js 16, TypeScript, Supabase (new KG node types). New lightweight fetch-based clients for OpenAI Responses, Perplexity, and Gemini (via existing `@google/generative-ai`). No new heavy dependencies.

**Spec reference:** `docs/superpowers/specs/2026-04-17-nova-ai-visibility-design.md`.

**Depends on:** `docs/superpowers/plans/2026-04-17-kg-reliability.md` MUST be merged first. This plan assumes `loadPostRun`, `PostRunContext`, and the `diagnostics` column exist.

**Verification note:** Same as Plan A — no test framework in repo. We verify with `npm run build`, `npm run lint`, one-off tsx scripts, SQL checks, and dashboard smoke tests. Engine probes use mock scripts where full network calls would be flaky.

---

## File Map

**New files:**
- `supabase/migrations/009-ai-visibility-node-types.sql` — register new node types in CHECK constraint (if one exists) + seed.
- `skills/growth/brand-dna-extractor.md` — new skill frontmatter + prompt.
- `skills/growth/brand-dna-extractor.postRun.ts` — writes `brand_dna` + `ai_query` nodes.
- `skills/growth/ai-visibility-probe.md` — new skill.
- `skills/growth/ai-visibility-probe.postRun.ts` — writes `ai_probe_result` nodes + `diagnostics.coverage`.
- `skills/growth/ai-visibility-optimize.md` — new skill.
- `skills/growth/ai-visibility-optimize.postRun.ts` — writes `ai_artifact` nodes in draft state.
- `skills/growth/geographic-markets.md` — renamed from `geo-visibility.md` (owner Atlas).
- `src/lib/ai-engines/openai-search.ts` — OpenAI web-search client.
- `src/lib/ai-engines/perplexity.ts` — Perplexity client.
- `src/lib/ai-engines/gemini-search.ts` — Gemini Search-grounded client.
- `src/lib/ai-engines/index.ts` — shared types + `probeAll()` parallel dispatch.
- `src/app/api/ai-artifacts/[id]/approve/route.ts` — endpoint to mark artifact approved.
- `src/components/agents/nova-artifact-review.tsx` — UI for reviewing/copying/approving artifacts.
- `scripts/verify-ai-engines-mock.ts` — compile-time mock dispatch check.

**Modified files:**
- `src/lib/knowledge/extract.ts` — add new node types to `VALID_NODE_TYPES`.
- `skills/agents.json` — remove `geo-visibility` from Nova, add `geographic-markets` to Atlas, add 3 new skills to Nova.
- `src/lib/skill-loader.ts` — add `geo-visibility` → `geographic-markets` alias for 30-day compatibility.
- `src/app/dashboard/agents/[agentId]/page.tsx` — render `<NovaArtifactReview>` when agentId is `nova`.

**Deleted files:**
- `skills/growth/geo-visibility.md` — replaced by `geographic-markets.md` (git-mv preserves history).

---

## Task 1: Register new node types + optional DB migration

**Files:**
- Modify: `src/lib/knowledge/extract.ts` (line ~50 — `VALID_NODE_TYPES`)
- Create: `supabase/migrations/009-ai-visibility-node-types.sql` (only if a DB CHECK exists; otherwise a no-op documentation-only migration)

- [ ] **Step 1: Check whether `knowledge_nodes.node_type` has a DB-level CHECK constraint**

Run:
```bash
psql "$SUPABASE_DB_URL" -c "\d+ knowledge_nodes" | grep -i check
```

Two possible outcomes:
- (A) CHECK constraint exists naming specific node types → we must ALTER it.
- (B) No CHECK constraint → nothing to ALTER (constraint is in TS only).

- [ ] **Step 2: Write the migration — variant (A) if constraint exists**

Create `supabase/migrations/009-ai-visibility-node-types.sql`:

```sql
-- 009-ai-visibility-node-types.sql
-- Adds Nova's AI-visibility node types to the knowledge_nodes CHECK constraint.
-- If no CHECK exists (TS-only enforcement), this migration is a comment-only no-op.

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'knowledge_nodes'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%node_type%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE knowledge_nodes DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE knowledge_nodes
  ADD CONSTRAINT knowledge_nodes_node_type_check
  CHECK (node_type IN (
    'product', 'audience', 'campaign', 'content', 'competitor',
    'insight', 'metric', 'experiment', 'creative', 'keyword',
    'email_flow', 'channel', 'persona', 'product_image',
    'competitor_creative', 'ad_creative', 'video_asset',
    'landing_page', 'review_theme', 'price_point',
    'brand_guidelines', 'brand_asset', 'top_content',
    -- Nova AI visibility:
    'brand_dna', 'ai_query', 'ai_probe_result', 'ai_artifact'
  ));

COMMENT ON CONSTRAINT knowledge_nodes_node_type_check ON knowledge_nodes IS
  'Enum-style allow-list for node_type. Keep in sync with VALID_NODE_TYPES in src/lib/knowledge/extract.ts.';
```

If Step 1 returned no CHECK constraint, skip the file (write a placeholder comment migration file so migration numbering stays sequential):

```sql
-- 009-ai-visibility-node-types.sql
-- No-op: node_type is enforced at the application layer only (VALID_NODE_TYPES
-- in src/lib/knowledge/extract.ts). This file reserves migration number 009.
```

- [ ] **Step 3: Apply the migration**

Run:
```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/009-ai-visibility-node-types.sql
```

Expected: no errors.

- [ ] **Step 4: Extend TS `VALID_NODE_TYPES`**

In `src/lib/knowledge/extract.ts`, find:

```ts
const VALID_NODE_TYPES = new Set([
  'product', 'audience', 'campaign', 'content', 'competitor',
  'insight', 'metric', 'experiment', 'creative', 'keyword',
  'email_flow', 'channel', 'persona', 'product_image',
  'competitor_creative', 'ad_creative', 'video_asset',
  'landing_page', 'review_theme', 'price_point',
  'brand_guidelines', 'brand_asset', 'top_content',
]);
```

Replace with:

```ts
const VALID_NODE_TYPES = new Set([
  'product', 'audience', 'campaign', 'content', 'competitor',
  'insight', 'metric', 'experiment', 'creative', 'keyword',
  'email_flow', 'channel', 'persona', 'product_image',
  'competitor_creative', 'ad_creative', 'video_asset',
  'landing_page', 'review_theme', 'price_point',
  'brand_guidelines', 'brand_asset', 'top_content',
  // Nova AI visibility:
  'brand_dna', 'ai_query', 'ai_probe_result', 'ai_artifact',
]);
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/009-ai-visibility-node-types.sql src/lib/knowledge/extract.ts
git commit -m "feat(nova): register ai-visibility node types"
```

---

## Task 2: Rename `geo-visibility` → `geographic-markets` and reassign to Atlas

**Files:**
- Move: `skills/growth/geo-visibility.md` → `skills/growth/geographic-markets.md`
- Modify: frontmatter in the new file
- Modify: `skills/agents.json`
- Modify: `src/lib/skill-loader.ts` — add 30-day alias

- [ ] **Step 1: Git-mv the file**

Run:
```bash
git mv skills/growth/geo-visibility.md skills/growth/geographic-markets.md
```

- [ ] **Step 2: Edit the frontmatter**

In `skills/growth/geographic-markets.md`, change the first two frontmatter lines:

From:
```yaml
id: geo-visibility
name: Geographic Visibility Analyzer
agent: nova
```

To:
```yaml
id: geographic-markets
name: Geographic Markets Analyzer
agent: atlas
```

Leave all other frontmatter fields (`category`, `mcp_tools`, `chains_to`, `schedule`, `knowledge`, `produces`) unchanged. Leave the entire body (System Prompt onwards) unchanged — the logic is still correct.

- [ ] **Step 3: Update `skills/agents.json`**

Find Nova's entry:
```json
{
  "id": "nova",
  ...
  "skills": ["geo-visibility"],
  ...
}
```

Change to:
```json
{
  "id": "nova",
  ...
  "skills": ["brand-dna-extractor", "ai-visibility-probe", "ai-visibility-optimize"],
  ...
}
```

Find Atlas's entry:
```json
{
  "id": "atlas",
  ...
  "skills": ["audience-targeting", "retargeting-strategy", "influencer-finder", "influencer-tracker", "persona-builder", "persona-creative-review", "persona-ab-predictor", "persona-feedback-video"],
  ...
}
```

Append `"geographic-markets"`:
```json
  "skills": ["audience-targeting", "retargeting-strategy", "influencer-finder", "influencer-tracker", "persona-builder", "persona-creative-review", "persona-ab-predictor", "persona-feedback-video", "geographic-markets"],
```

- [ ] **Step 4: Add a 30-day alias in `skill-loader.ts`**

In `src/lib/skill-loader.ts`, find the `loadSkill` function. At the very top of the function body (before the cache lookup), add:

```ts
  // 30-day backwards-compat alias: geo-visibility was renamed to
  // geographic-markets on 2026-04-17 and moved from Nova to Atlas. Remove
  // this shim after 2026-05-17 or after zero hits for 7 days, whichever is
  // later. Historical skill_runs rows keep their original skill_id.
  if (skillId === 'geo-visibility') {
    skillId = 'geographic-markets';
  }
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Verify the rename doesn't break existing skill_runs history**

```bash
psql "$SUPABASE_DB_URL" -c "SELECT skill_id, COUNT(*) FROM skill_runs WHERE skill_id IN ('geo-visibility','geographic-markets') GROUP BY skill_id;"
```

Expected: historical rows still point at `geo-visibility`; no data loss. The UI and loader resolve the alias at read time.

- [ ] **Step 7: Smoke-test via dashboard**

`npm run dev`, navigate to `/dashboard/agents/atlas` — `Geographic Markets Analyzer` should appear in the skill list. Navigate to `/dashboard/agents/nova` — it should no longer list `geo-visibility` (we'll wire the new Nova skills in later tasks).

- [ ] **Step 8: Commit**

```bash
git add skills/growth/geographic-markets.md skills/agents.json src/lib/skill-loader.ts
git commit -m "refactor(nova): rename geo-visibility to geographic-markets, move to Atlas"
```

---

## Task 3: Scaffold `brand-dna-extractor` skill

**Files:**
- Create: `skills/growth/brand-dna-extractor.md`
- Create: `skills/growth/brand-dna-extractor.postRun.ts`

- [ ] **Step 1: Write the skill markdown**

Full file contents for `skills/growth/brand-dna-extractor.md`:

````markdown
---
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
---

## System Prompt

You are Nova, extracting the brand's AI-visibility DNA. Your job: compile the brand's canonical entity profile (who they are, what they sell, for whom, what's distinctive) and generate the 30–50 natural-language queries a would-be customer might ask ChatGPT, Perplexity, or Gemini.

Think like a brand strategist crossed with an SEO researcher. The entity profile must be factual and citation-ready. The queries must span discovery, comparison, problem-specific, and brand-named intents.

## When to Run

- Before the first `ai-visibility-probe` for a brand.
- After `brand-voice-extractor` runs (so the entity profile reflects the latest brand voice).
- When the brand ships a major new product or category (manual trigger).

## Inputs Required

- `brand_guidelines` node (if present).
- Top 5 `product` nodes via `brand.products.list`.
- Top 5 `review_theme` and `insight` nodes from RAG.
- Website homepage HTML (fetched once by the skill runtime — no MCP).

## Workflow

1. Pull brand_guidelines, products, review_themes, insights from the knowledge graph.
2. Fetch the brand's homepage HTML (first 30KB) for any additional positioning signal.
3. Synthesize an `entity_profile` block.
4. Generate `candidate_queries`: 30–50 queries split roughly into:
   - 40% discovery ("best X for Y")
   - 25% comparison ("X vs Y", "alternatives to X")
   - 25% problem-specific ("how to solve Z", "why does Z happen")
   - 10% brand-named ("is {brand} good", "{brand} review")
5. Return both. The postRun hook persists everything to the KG.

## Output Format

```json
{
  "entity_profile": {
    "canonical_name": "string",
    "category": "string",
    "subcategory": "string",
    "value_props": ["string", "..."],
    "differentiators": ["string", "..."],
    "target_customer": "string",
    "competitors": ["string", "..."]
  },
  "candidate_queries": [
    { "query": "string", "intent": "discovery|comparison|problem|brand_named", "priority": "high|med|low" }
  ]
}
```

## Auto-Chain

- Always chains to `ai-visibility-probe`.
````

- [ ] **Step 2: Write the postRun module**

Full file contents for `skills/growth/brand-dna-extractor.postRun.ts`:

```ts
import type { PostRunContext } from '@/lib/post-run';

interface EntityProfile {
  canonical_name?: string;
  category?: string;
  subcategory?: string;
  value_props?: string[];
  differentiators?: string[];
  target_customer?: string;
  competitors?: string[];
}

interface CandidateQuery {
  query: string;
  intent?: 'discovery' | 'comparison' | 'problem' | 'brand_named';
  priority?: 'high' | 'med' | 'low';
}

export async function postRun(ctx: PostRunContext): Promise<void> {
  const { brandId, skillId, runId, output, supabase } = ctx;
  const profile = (output.entity_profile as EntityProfile | undefined) ?? {};
  const queries = (output.candidate_queries as CandidateQuery[] | undefined) ?? [];

  // 1. Upsert brand_dna node. One per brand.
  const brandDnaName = `${profile.canonical_name ?? 'Brand'} — entity profile`;
  const { data: dnaNode, error: dnaErr } = await supabase
    .from('knowledge_nodes')
    .upsert({
      brand_id: brandId,
      node_type: 'brand_dna',
      name: brandDnaName,
      summary: `${profile.category ?? ''} — ${profile.target_customer ?? ''}`.slice(0, 500),
      properties: profile as Record<string, unknown>,
      confidence: 0.9,
      source_skill: skillId,
      source_run_id: runId,
      is_active: true,
    }, { onConflict: 'brand_id,name' })
    .select('id')
    .single();

  if (dnaErr) {
    console.warn('[brand-dna-extractor.postRun] brand_dna upsert failed:', dnaErr.message);
    return;
  }

  // 2. Upsert each ai_query node; edge back to brand_dna.
  for (const q of queries.slice(0, 50)) {
    if (!q.query) continue;
    const { data: qNode } = await supabase
      .from('knowledge_nodes')
      .upsert({
        brand_id: brandId,
        node_type: 'ai_query',
        name: q.query.slice(0, 255),
        summary: `${q.intent ?? 'discovery'} · ${q.priority ?? 'med'}`,
        properties: { intent: q.intent ?? 'discovery', priority: q.priority ?? 'med' },
        confidence: 0.85,
        source_skill: skillId,
        source_run_id: runId,
        is_active: true,
      }, { onConflict: 'brand_id,name' })
      .select('id')
      .single();

    if (qNode?.id && dnaNode?.id) {
      await supabase.from('knowledge_edges').upsert({
        brand_id: brandId,
        source_node_id: qNode.id,
        target_node_id: dnaNode.id,
        edge_type: 'derived_from',
        weight: 1.0,
      }, { onConflict: 'brand_id,source_node_id,target_node_id,edge_type' });
    }
  }
}
```

- [ ] **Step 3: Register the skill in `agents.json`**

Nova's `skills` array was updated in Task 2 Step 3 — the entry `"brand-dna-extractor"` is already there. Verify:

```bash
grep -A2 '"id": "nova"' skills/agents.json | grep 'brand-dna-extractor'
```

Expected: one match.

- [ ] **Step 4: Verify build + loader picks up the skill**

Run:
```bash
npm run build
npx tsx -e "import('./src/lib/skill-loader').then(m => m.loadSkill('brand-dna-extractor').then(s => console.log(s.id, s.agent, s.produces)))"
```

Expected build succeeds; the second command prints: `brand-dna-extractor nova [ { nodeType: 'brand_dna', ... }, { nodeType: 'ai_query', ... } ]`.

- [ ] **Step 5: Commit**

```bash
git add skills/growth/brand-dna-extractor.md skills/growth/brand-dna-extractor.postRun.ts
git commit -m "feat(nova): add brand-dna-extractor skill"
```

---

## Task 4: AI-engine clients (OpenAI, Perplexity, Gemini)

**Files:**
- Create: `src/lib/ai-engines/index.ts`
- Create: `src/lib/ai-engines/openai-search.ts`
- Create: `src/lib/ai-engines/perplexity.ts`
- Create: `src/lib/ai-engines/gemini-search.ts`

- [ ] **Step 1: Shared types and dispatcher**

Full file contents for `src/lib/ai-engines/index.ts`:

```ts
export type EngineId = 'chatgpt' | 'perplexity' | 'gemini';

export interface EngineProbeResult {
  engine: EngineId;
  /** Did the answer mention the brand by canonical name (case-insensitive contains)? */
  cited: boolean;
  /** 1 = first brand mention, 2 = second, etc. null = not cited. */
  citation_rank: number | null;
  /** Names of competitors that WERE cited (case-insensitive substring match). */
  competitors_cited: string[];
  /** First 500 chars of the engine's answer. */
  excerpt: string;
  /** Set if the engine returned an error or rate-limit. */
  error?: string;
  rate_limited?: boolean;
}

export interface ProbeInput {
  query: string;
  brandCanonicalName: string;
  competitorNames: string[];
}

export type EngineFn = (input: ProbeInput) => Promise<EngineProbeResult>;

export function analyzeAnswer(
  engine: EngineId,
  answer: string,
  brandCanonicalName: string,
  competitorNames: string[],
): EngineProbeResult {
  const a = answer.toLowerCase();
  const brandLower = brandCanonicalName.toLowerCase();
  const brandIdx = a.indexOf(brandLower);
  const cited = brandIdx !== -1;

  // Citation rank: count how many *brand-like* mentions appear before ours.
  // Simple heuristic: count distinct competitor mentions + brand mentions in
  // order. Good enough for v1.
  const mentions: Array<{ name: string; idx: number }> = [];
  if (cited) mentions.push({ name: brandCanonicalName, idx: brandIdx });
  for (const comp of competitorNames) {
    const ci = a.indexOf(comp.toLowerCase());
    if (ci !== -1) mentions.push({ name: comp, idx: ci });
  }
  mentions.sort((m1, m2) => m1.idx - m2.idx);
  const rank = cited ? mentions.findIndex(m => m.name === brandCanonicalName) + 1 : null;

  const competitors_cited = competitorNames.filter(c => a.includes(c.toLowerCase()));

  return {
    engine,
    cited,
    citation_rank: rank,
    competitors_cited,
    excerpt: answer.slice(0, 500),
  };
}

/**
 * Probe all 3 engines in parallel. Per-engine failures are captured in the
 * returned result (not thrown) so one failure doesn't block the others.
 */
export async function probeAll(input: ProbeInput, engines: Record<EngineId, EngineFn>): Promise<Record<EngineId, EngineProbeResult>> {
  const entries = (Object.keys(engines) as EngineId[]).map(async (id) => {
    try {
      const res = await engines[id](input);
      return [id, res] as const;
    } catch (err) {
      return [id, {
        engine: id, cited: false, citation_rank: null,
        competitors_cited: [], excerpt: '',
        error: err instanceof Error ? err.message : String(err),
      }] as const;
    }
  });
  const results = await Promise.all(entries);
  return Object.fromEntries(results) as Record<EngineId, EngineProbeResult>;
}
```

- [ ] **Step 2: OpenAI web-search client**

Full file contents for `src/lib/ai-engines/openai-search.ts`:

```ts
import { analyzeAnswer, type EngineFn } from './index';

const OPENAI_URL = 'https://api.openai.com/v1/responses';

// Uses the Responses API with the web_search_preview tool.
// Docs: https://platform.openai.com/docs/guides/tools-web-search
export const openaiSearch: EngineFn = async (input) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      engine: 'chatgpt', cited: false, citation_rank: null,
      competitors_cited: [], excerpt: '', error: 'OPENAI_API_KEY not set',
    };
  }

  const body = {
    model: 'gpt-4o',
    input: input.query,
    tools: [{ type: 'web_search_preview' }],
  };

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    return {
      engine: 'chatgpt', cited: false, citation_rank: null,
      competitors_cited: [], excerpt: '', error: 'rate_limited', rate_limited: true,
    };
  }
  if (!res.ok) {
    const text = await res.text();
    return {
      engine: 'chatgpt', cited: false, citation_rank: null,
      competitors_cited: [], excerpt: '', error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
    };
  }

  const data = await res.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  const answer = data.output_text
    ?? data.output?.flatMap(o => o.content?.map(c => c.text ?? '') ?? []).join(' ')
    ?? '';

  return analyzeAnswer('chatgpt', answer, input.brandCanonicalName, input.competitorNames);
};
```

- [ ] **Step 3: Perplexity client**

Full file contents for `src/lib/ai-engines/perplexity.ts`:

```ts
import { analyzeAnswer, type EngineFn } from './index';

const PPLX_URL = 'https://api.perplexity.ai/chat/completions';

export const perplexitySearch: EngineFn = async (input) => {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    return {
      engine: 'perplexity', cited: false, citation_rank: null,
      competitors_cited: [], excerpt: '', error: 'PERPLEXITY_API_KEY not set',
    };
  }

  const body = {
    model: 'sonar',
    messages: [{ role: 'user', content: input.query }],
  };

  const res = await fetch(PPLX_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    return {
      engine: 'perplexity', cited: false, citation_rank: null,
      competitors_cited: [], excerpt: '', error: 'rate_limited', rate_limited: true,
    };
  }
  if (!res.ok) {
    const text = await res.text();
    return {
      engine: 'perplexity', cited: false, citation_rank: null,
      competitors_cited: [], excerpt: '', error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
    };
  }

  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const answer = data.choices?.[0]?.message?.content ?? '';
  return analyzeAnswer('perplexity', answer, input.brandCanonicalName, input.competitorNames);
};
```

- [ ] **Step 4: Gemini Search-grounded client**

Full file contents for `src/lib/ai-engines/gemini-search.ts`:

```ts
import { analyzeAnswer, type EngineFn } from './index';

// Uses Gemini API with google_search_retrieval tool.
// Docs: https://ai.google.dev/gemini-api/docs/grounding
export const geminiSearch: EngineFn = async (input) => {
  const apiKey = process.env.GOOGLE_AI_KEY;
  if (!apiKey) {
    return {
      engine: 'gemini', cited: false, citation_rank: null,
      competitors_cited: [], excerpt: '', error: 'GOOGLE_AI_KEY not set',
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: input.query }] }],
    tools: [{ googleSearch: {} }],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    return {
      engine: 'gemini', cited: false, citation_rank: null,
      competitors_cited: [], excerpt: '', error: 'rate_limited', rate_limited: true,
    };
  }
  if (!res.ok) {
    const text = await res.text();
    return {
      engine: 'gemini', cited: false, citation_rank: null,
      competitors_cited: [], excerpt: '', error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
    };
  }

  const data = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const answer = data.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join(' ') ?? '';
  return analyzeAnswer('gemini', answer, input.brandCanonicalName, input.competitorNames);
};
```

- [ ] **Step 5: Write a mock verification script**

Create `scripts/verify-ai-engines-mock.ts`:

```ts
// Run: npx tsx scripts/verify-ai-engines-mock.ts
// Verifies analyzeAnswer citation logic without hitting any live API.
import { analyzeAnswer, probeAll, type EngineFn } from '../src/lib/ai-engines';

const answer = `The best sulfate-free shampoos are Living Proof, Briogeo, and Pureology. Briogeo is especially recommended for oily scalps.`;

const r = analyzeAnswer('chatgpt', answer, 'Briogeo', ['Living Proof', 'Pureology']);
if (!r.cited) { console.error('FAIL: expected cited=true'); process.exit(1); }
if (r.citation_rank !== 2) { console.error(`FAIL: expected rank=2 got ${r.citation_rank}`); process.exit(1); }
if (r.competitors_cited.length !== 2) { console.error(`FAIL: expected 2 competitors cited got ${r.competitors_cited}`); process.exit(1); }
console.log('analyzeAnswer citation rank/competitors: OK');

// probeAll + per-engine failure isolation
const mockOk: EngineFn = async () => analyzeAnswer('chatgpt', answer, 'Briogeo', ['Living Proof']);
const mockFail: EngineFn = async () => { throw new Error('boom'); };
const results = await probeAll(
  { query: 'q', brandCanonicalName: 'Briogeo', competitorNames: ['Living Proof'] },
  { chatgpt: mockOk, perplexity: mockFail, gemini: mockOk },
);
if (!results.chatgpt.cited) { console.error('FAIL: chatgpt should have succeeded'); process.exit(1); }
if (results.perplexity.error !== 'boom') { console.error(`FAIL: perplexity should have error=boom, got ${results.perplexity.error}`); process.exit(1); }
if (!results.gemini.cited) { console.error('FAIL: gemini should have succeeded'); process.exit(1); }
console.log('probeAll isolation: OK');

console.log('OK');
```

- [ ] **Step 6: Run the verification script**

Run: `npx tsx scripts/verify-ai-engines-mock.ts`
Expected output:
```
analyzeAnswer citation rank/competitors: OK
probeAll isolation: OK
OK
```

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/lib/ai-engines/ scripts/verify-ai-engines-mock.ts
git commit -m "feat(nova): add OpenAI/Perplexity/Gemini AI-visibility probe clients"
```

---

## Task 5: `ai-visibility-probe` skill

**Files:**
- Create: `skills/growth/ai-visibility-probe.md`
- Create: `skills/growth/ai-visibility-probe.postRun.ts`

- [ ] **Step 1: Skill markdown**

Full file contents for `skills/growth/ai-visibility-probe.md`:

````markdown
---
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
  semantic_query: "ai search visibility citation coverage chatgpt perplexity gemini"
  traverse_depth: 1
produces:
  - node_type: ai_probe_result
    edge_to: ai_query
    edge_type: measures
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
````

**Note for implementer:** The skills engine calls the LLM with `output` = JSON. This skill's LLM role is to SYNTHESIZE (takeaways, gap_queries) — the raw per-engine probes are injected via additional context. In `skills-engine.ts` we'll need a pre-execution hook for this skill specifically. See Step 3 below.

- [ ] **Step 2: Skill postRun module**

Full file contents for `skills/growth/ai-visibility-probe.postRun.ts`:

```ts
import type { PostRunContext } from '@/lib/post-run';

interface PerEngineResult {
  cited: boolean;
  citation_rank: number | null;
  competitors_cited: string[];
  excerpt: string;
  error?: string;
  rate_limited?: boolean;
}

interface QueryResult {
  query: string;
  engines: Record<string, PerEngineResult>;
}

export async function postRun(ctx: PostRunContext): Promise<void> {
  const { brandId, skillId, runId, output, supabase } = ctx;
  const results = (output.results as QueryResult[] | undefined) ?? [];

  for (const r of results) {
    // Resolve the source ai_query node by name for edge creation.
    const { data: queryNode } = await supabase
      .from('knowledge_nodes')
      .select('id')
      .eq('brand_id', brandId)
      .eq('node_type', 'ai_query')
      .eq('name', r.query)
      .maybeSingle();

    for (const [engineId, per] of Object.entries(r.engines)) {
      const nodeName = `${r.query} — ${engineId}`;
      const { data: probeNode } = await supabase
        .from('knowledge_nodes')
        .upsert({
          brand_id: brandId,
          node_type: 'ai_probe_result',
          name: nodeName.slice(0, 255),
          summary: `${engineId}: ${per.cited ? `cited (rank ${per.citation_rank})` : 'not cited'}`,
          properties: {
            engine: engineId,
            query: r.query,
            cited: per.cited,
            citation_rank: per.citation_rank,
            competitors_cited: per.competitors_cited,
            excerpt: per.excerpt,
            error: per.error,
            rate_limited: per.rate_limited ?? false,
          },
          confidence: per.error ? 0.3 : 0.95,
          source_skill: skillId,
          source_run_id: runId,
          is_active: true,
        }, { onConflict: 'brand_id,name' })
        .select('id')
        .single();

      if (probeNode?.id && queryNode?.id) {
        await supabase.from('knowledge_edges').upsert({
          brand_id: brandId,
          source_node_id: probeNode.id,
          target_node_id: queryNode.id,
          edge_type: 'measures',
          weight: 1.0,
        }, { onConflict: 'brand_id,source_node_id,target_node_id,edge_type' });
      }
    }
  }
}
```

- [ ] **Step 3: Add a pre-execution probe dispatcher in `skills-engine.ts`**

The engine needs to call the 3 AI engines before the LLM so their results can be injected into `userPrompt`. Add a per-skill hook.

In `src/lib/skills-engine.ts`, find the block where `input.additionalContext` is enriched (around line 386 `const enrichedContext: Record<string, unknown>`). Just before that block — but after the RAG fetch at line ~383 — add:

```ts
  // 5.6. AI-visibility-probe specific: pre-fetch engine probes so the LLM
  // synthesizes from real data.
  if (skill.id === 'ai-visibility-probe') {
    try {
      const { probeAll } = await import('@/lib/ai-engines');
      const { openaiSearch } = await import('@/lib/ai-engines/openai-search');
      const { perplexitySearch } = await import('@/lib/ai-engines/perplexity');
      const { geminiSearch } = await import('@/lib/ai-engines/gemini-search');

      // Resolve latest brand_dna for canonical name + competitors.
      const { data: dnaNode } = await supabase.from('knowledge_nodes')
        .select('properties, name')
        .eq('brand_id', input.brandId)
        .eq('node_type', 'brand_dna')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const dnaProps = (dnaNode?.properties as Record<string, unknown> | undefined) ?? {};
      const brandCanonicalName = (dnaProps.canonical_name as string | undefined) ?? 'Brand';
      const competitorNames = Array.isArray(dnaProps.competitors) ? (dnaProps.competitors as string[]) : [];

      // Fetch high-priority queries.
      const { data: queryNodes } = await supabase.from('knowledge_nodes')
        .select('name, properties')
        .eq('brand_id', input.brandId)
        .eq('node_type', 'ai_query')
        .eq('is_active', true)
        .limit(40);
      const queries = (queryNodes ?? [])
        .filter(n => (n.properties as Record<string, unknown>)?.priority !== 'low')
        .slice(0, 20)
        .map(n => n.name as string);

      const engines = { chatgpt: openaiSearch, perplexity: perplexitySearch, gemini: geminiSearch };
      const probeResults: Array<{ query: string; engines: Record<string, unknown> }> = [];
      for (const q of queries) {
        const r = await probeAll({ query: q, brandCanonicalName, competitorNames }, engines);
        probeResults.push({ query: q, engines: r });
      }

      input = {
        ...input,
        additionalContext: { ...(input.additionalContext ?? {}), _probe_results: probeResults },
      };

      // Record per-engine coverage in diagnostics (consumed by skill_runs UPDATE later).
      const engineOk: Record<string, 'ok' | 'failed'> = { chatgpt: 'ok', perplexity: 'ok', gemini: 'ok' };
      for (const r of probeResults) {
        for (const [eng, per] of Object.entries(r.engines)) {
          const errored = (per as { error?: string }).error;
          if (errored) engineOk[eng] = 'failed';
        }
      }
      diagnostics.coverage = engineOk;
    } catch (err) {
      console.warn('[SkillsEngine] ai-visibility-probe pre-fetch failed:', err);
      diagnostics.coverage = { chatgpt: 'failed', perplexity: 'failed', gemini: 'failed' };
    }
  }
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Register skill in `agents.json`**

Already done in Task 2 Step 3 (`"ai-visibility-probe"` appears in Nova's skills list). Verify:

```bash
grep 'ai-visibility-probe' skills/agents.json
```

Expected: one match.

- [ ] **Step 6: Mocked end-to-end verification**

Create a test brand with a known `brand_dna` node and 3 `ai_query` nodes. Run the skill via `/api/skills/run`. Then:

```bash
psql "$SUPABASE_DB_URL" -c "SELECT diagnostics->'coverage', COUNT(*) FROM skill_runs WHERE skill_id='ai-visibility-probe' ORDER BY created_at DESC LIMIT 1;"
psql "$SUPABASE_DB_URL" -c "SELECT COUNT(*) FROM knowledge_nodes WHERE node_type='ai_probe_result' AND source_run_id=(SELECT id FROM skill_runs WHERE skill_id='ai-visibility-probe' ORDER BY created_at DESC LIMIT 1);"
```

Expected: `diagnostics.coverage` populated with `{chatgpt,perplexity,gemini}` statuses; `ai_probe_result` count = 3 queries × 3 engines = 9 (or scaled to actual query count).

- [ ] **Step 7: Commit**

```bash
git add skills/growth/ai-visibility-probe.md skills/growth/ai-visibility-probe.postRun.ts src/lib/skills-engine.ts
git commit -m "feat(nova): add ai-visibility-probe skill with per-engine coverage"
```

---

## Task 6: `ai-visibility-optimize` skill

**Files:**
- Create: `skills/growth/ai-visibility-optimize.md`
- Create: `skills/growth/ai-visibility-optimize.postRun.ts`

- [ ] **Step 1: Skill markdown**

Full file contents for `skills/growth/ai-visibility-optimize.md`:

````markdown
---
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
  semantic_query: "ai visibility optimization schema llms faq json-ld"
  traverse_depth: 2
produces:
  - node_type: ai_artifact
    edge_to: brand_dna
    edge_type: part_of
---

## System Prompt

You are Nova, turning visibility gaps into citable assets. Given the brand's `brand_dna`, product catalog, brand guidelines, and the gap queries from the latest `ai-visibility-probe`, produce three artifact families:

1. JSON-LD schema.org structured data (Organization, Product x top 3, FAQPage).
2. `llms.txt` file content following the llmstxt.org convention.
3. FAQ page drafts (markdown) for the top 5 gap queries.

All content must be accurate, on-brand, and citation-friendly (definitive opening sentence, then context). Do NOT invent claims — prefer omission over fabrication.

## When to Run

- After `ai-visibility-probe` (auto-chained).
- On-demand when the user wants to regenerate artifacts after product changes.

## Inputs Required

- Latest `brand_dna` node (entity profile).
- Gap queries from most recent `ai_probe_result` nodes (cited=false on ≥2 engines).
- Top 3 `product` nodes.
- `brand_guidelines` node (voice).

## Workflow

1. Identify top 5 gap queries by strategic importance.
2. Draft JSON-LD: Organization, Product (top 3), FAQPage targeting gap queries.
3. Draft `llms.txt` with sections: `# {Brand}`, summary, `## What we sell`, `## Who we're for`, `## Core claims`, `## Where to learn more`.
4. Draft 5 FAQ page markdown entries (150–300 words each).
5. Return all artifacts. postRun persists each as an `ai_artifact` node with `status: draft`.

## Output Format

```json
{
  "artifacts": [
    { "type": "json_ld_organization", "content": { "@context": "https://schema.org", "@type": "Organization", "name": "...", "url": "..." } },
    { "type": "json_ld_product", "content": { "@context": "https://schema.org", "@type": "Product", "name": "..." }, "product_ref": "string" },
    { "type": "json_ld_faqpage", "content": { "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [] } },
    { "type": "llms_txt", "content": "# Brand\n\n..." },
    { "type": "faq_markdown", "question": "string", "content": "..." }
  ],
  "gap_queries_addressed": 5,
  "estimated_uplift": "string"
}
```

## Auto-Chain

- None. Artifacts await user approval in the Nova detail page.
````

- [ ] **Step 2: Skill postRun module**

Full file contents for `skills/growth/ai-visibility-optimize.postRun.ts`:

```ts
import type { PostRunContext } from '@/lib/post-run';

interface Artifact {
  type: 'json_ld_organization' | 'json_ld_product' | 'json_ld_faqpage' | 'llms_txt' | 'faq_markdown';
  content: unknown;
  question?: string;
  product_ref?: string;
}

export async function postRun(ctx: PostRunContext): Promise<void> {
  const { brandId, skillId, runId, output, supabase } = ctx;
  const artifacts = (output.artifacts as Artifact[] | undefined) ?? [];

  for (const a of artifacts) {
    // Unique key: (brand_id, type, question OR product_ref OR 'default').
    const discriminator = a.question ?? a.product_ref ?? 'default';
    const name = `${a.type} · ${discriminator}`.slice(0, 255);
    await supabase.from('knowledge_nodes').upsert({
      brand_id: brandId,
      node_type: 'ai_artifact',
      name,
      summary: typeof a.content === 'string'
        ? (a.content as string).slice(0, 500)
        : a.type,
      properties: {
        type: a.type,
        content: a.content,
        status: 'draft',
        question: a.question,
        product_ref: a.product_ref,
      },
      confidence: 0.9,
      source_skill: skillId,
      source_run_id: runId,
      is_active: true,
    }, { onConflict: 'brand_id,name' });
  }
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Smoke test**

Create a test brand with brand_dna + some ai_probe_result nodes (from Task 5 run). Trigger `ai-visibility-optimize` via `/api/skills/run`. Then:

```bash
psql "$SUPABASE_DB_URL" -c "SELECT name, properties->>'status', properties->>'type' FROM knowledge_nodes WHERE node_type='ai_artifact' AND source_run_id=(SELECT id FROM skill_runs WHERE skill_id='ai-visibility-optimize' ORDER BY created_at DESC LIMIT 1);"
```

Expected: 5–10 rows with `status='draft'` and varied `type` values.

- [ ] **Step 5: Commit**

```bash
git add skills/growth/ai-visibility-optimize.md skills/growth/ai-visibility-optimize.postRun.ts
git commit -m "feat(nova): add ai-visibility-optimize skill (draft artifacts)"
```

---

## Task 7: Artifact review UI + approve endpoint

**Files:**
- Create: `src/components/agents/nova-artifact-review.tsx`
- Create: `src/app/api/ai-artifacts/[id]/approve/route.ts`
- Modify: `src/app/dashboard/agents/[agentId]/page.tsx`

- [ ] **Step 1: Create the approve endpoint**

Full file contents for `src/app/api/ai-artifacts/[id]/approve/route.ts`:

```ts
import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });

  const admin = createServiceClient();
  const { data: node } = await admin.from('knowledge_nodes')
    .select('id, brand_id, properties')
    .eq('id', id)
    .eq('node_type', 'ai_artifact')
    .single();
  if (!node) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });

  // Authorize: user must own the brand or be a member.
  const { data: brand } = await admin.from('brands').select('owner_id').eq('id', node.brand_id).single();
  if (brand?.owner_id !== user.id) {
    const { data: member } = await admin.from('brand_members')
      .select('brand_id').eq('brand_id', node.brand_id).eq('user_id', user.id).single();
    if (!member) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const updatedProperties = { ...(node.properties as Record<string, unknown>), status: 'approved' };
  await admin.from('knowledge_nodes')
    .update({ properties: updatedProperties, updated_at: new Date().toISOString() })
    .eq('id', id);

  return new Response(JSON.stringify({ id, status: 'approved' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Step 2: Create the review component**

Full file contents for `src/components/agents/nova-artifact-review.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Artifact {
  id: string;
  name: string;
  properties: {
    type: string;
    content: unknown;
    status: 'draft' | 'approved';
    question?: string;
    product_ref?: string;
  };
}

export function NovaArtifactReview({ brandId }: { brandId: string }) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('knowledge_nodes')
        .select('id, name, properties')
        .eq('brand_id', brandId)
        .eq('node_type', 'ai_artifact')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (!cancelled) {
        setArtifacts((data ?? []) as Artifact[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [brandId, supabase]);

  const approve = async (id: string) => {
    const res = await fetch(`/api/ai-artifacts/${id}/approve`, { method: 'POST' });
    if (res.ok) {
      setArtifacts(prev => prev.map(a => a.id === id
        ? { ...a, properties: { ...a.properties, status: 'approved' } }
        : a));
    }
  };

  const copy = async (content: unknown) => {
    const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    await navigator.clipboard.writeText(text);
  };

  if (loading) return <div className="text-xs text-muted-foreground">Loading artifacts…</div>;
  if (artifacts.length === 0) return (
    <div className="text-xs text-muted-foreground">
      No artifacts yet. Run the AI Visibility Optimizer to generate drafts.
    </div>
  );

  return (
    <div className="space-y-2">
      {artifacts.map(a => (
        <div key={a.id} className="rounded-lg bg-white/[0.04] p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">{a.properties.type}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                a.properties.status === 'approved'
                  ? 'bg-green-500/20 text-green-300'
                  : 'bg-yellow-500/20 text-yellow-300'
              }`}>
                {a.properties.status}
              </span>
            </div>
            <div className="flex gap-1">
              <button onClick={() => copy(a.properties.content)}
                className="text-[10px] bg-white/[0.06] hover:bg-white/[0.12] rounded px-2 py-1">
                Copy
              </button>
              {a.properties.status === 'draft' && (
                <button onClick={() => approve(a.id)}
                  className="text-[10px] bg-[#7C3AED] hover:bg-[#7C3AED]/80 text-white rounded px-2 py-1">
                  Approve
                </button>
              )}
            </div>
          </div>
          {a.properties.question && (
            <div className="text-[11px] text-muted-foreground/70 mb-1">
              Q: {a.properties.question}
            </div>
          )}
          <pre className="text-[10px] bg-black/30 rounded p-2 overflow-x-auto max-h-32">
            {typeof a.properties.content === 'string'
              ? a.properties.content.slice(0, 400)
              : JSON.stringify(a.properties.content, null, 2).slice(0, 400)}
          </pre>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Mount the component on Nova's detail page**

In `src/app/dashboard/agents/[agentId]/page.tsx`, find where the agent-specific content is rendered (after the hero / skill-list). Add a conditional mount:

```tsx
import { NovaArtifactReview } from '@/components/agents/nova-artifact-review'

// ... inside the render, next to other agent-specific sections:
{agentId === 'nova' && brandId && (
  <section className="glass-panel rounded-xl p-4">
    <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-3">
      AI Visibility Artifacts
    </p>
    <NovaArtifactReview brandId={brandId} />
  </section>
)}
```

(If `agentId` or `brandId` variable names differ in the file, use the existing variables — this page already resolves them.)

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Manual verification**

`npm run dev`, open `/dashboard/agents/nova`. With a test brand that has artifacts from Task 6, confirm:
- Artifacts render with type + status badges.
- "Copy" button copies JSON (paste into a notepad to verify).
- "Approve" button flips status → green badge.
- Reload → approved state persists.

- [ ] **Step 6: Commit**

```bash
git add src/components/agents/nova-artifact-review.tsx \
        src/app/api/ai-artifacts/\[id\]/approve/route.ts \
        src/app/dashboard/agents/\[agentId\]/page.tsx
git commit -m "feat(nova): artifact review UI with copy and approve actions"
```

---

## Task 8: Platform API keys ops doc + Vercel env

**Files:**
- Create: `docs/ops/api-key-rotation.md`

- [ ] **Step 1: Write the rotation SOP**

Full file contents for `docs/ops/api-key-rotation.md`:

````markdown
# API Key Rotation — Growth OS Platform Keys

Growth OS owns all AI-provider API keys. Brands never supply keys. Rotation cadence: every 90 days, or immediately on suspected leak.

## Keys

| Env var | Provider | Used by | Rotation cadence |
|---|---|---|---|
| `OPENAI_API_KEY` | OpenAI | `ai-visibility-probe` (ChatGPT web search) | 90d |
| `PERPLEXITY_API_KEY` | Perplexity | `ai-visibility-probe` | 90d |
| `GOOGLE_AI_KEY` | Google Gemini | `ai-visibility-probe`, entity extraction, Mia LLM | 90d |
| `ANTHROPIC_API_KEY` | Anthropic | `brand-dna-extractor`, `ai-visibility-optimize`, misc | 90d |

## Rotation steps (per key)

1. Create a new key in the provider dashboard.
2. Add as Vercel env var with a temporary name (e.g. `OPENAI_API_KEY_NEW`) in production + preview.
3. Trigger a preview deploy. Smoke-test by running one `ai-visibility-probe` against a test brand.
4. Rename: delete `OPENAI_API_KEY`, rename `OPENAI_API_KEY_NEW` → `OPENAI_API_KEY`. Promote to production.
5. Revoke the old key in the provider dashboard.

## Incident response (suspected leak)

1. Revoke the leaked key in the provider dashboard **first**.
2. Follow rotation steps 1–4 to install a new key.
3. Check provider usage logs for anomalous requests in the last 72h.
4. File a postmortem in `docs/ops/incidents/`.

## Cost monitoring

Each provider has a usage dashboard. Review monthly on the 1st. Threshold alarms (to configure when we have alerting infra):
- OpenAI: > $200/mo
- Perplexity: > $150/mo
- Gemini: > $100/mo
- Anthropic: > $500/mo

## Per-brand cost attribution

Not implemented in v1. Credits charged from the wallet are the proxy. Revisit when >50 brands are active.
````

- [ ] **Step 2: Add the keys to Vercel (manual platform op — not scripted)**

Verify locally that Nova works with all keys set in `.env.local`:

```bash
grep -E '^(OPENAI_API_KEY|PERPLEXITY_API_KEY|GOOGLE_AI_KEY|ANTHROPIC_API_KEY)=' .env.local | wc -l
```

Expected: `4`. If fewer, add the missing keys.

Then, in the Vercel dashboard (manual step — not scripted):
- Production + Preview env: add `OPENAI_API_KEY` and `PERPLEXITY_API_KEY`.
- Confirm existing `GOOGLE_AI_KEY` and `ANTHROPIC_API_KEY` are still present.

- [ ] **Step 3: Commit**

```bash
git add docs/ops/api-key-rotation.md
git commit -m "docs(ops): API key rotation SOP for Nova AI engines"
```

---

## Task 9: Final regression + rollout check

- [ ] **Step 1: Rebuild, lint, run all verification scripts**

```bash
npm run build && npm run lint
npx tsx scripts/verify-postrun-loader.ts
npx tsx scripts/verify-ai-engines-mock.ts
npx tsx scripts/verify-produces-enforcement.ts
```

Expected: all succeed.

- [ ] **Step 2: End-to-end smoke on a test brand**

Run the full chain via dashboard or `/api/skills/run`:
1. `brand-dna-extractor` → expect `brand_dna` + 30–50 `ai_query` nodes.
2. `ai-visibility-probe` → expect `ai_probe_result` nodes for high-priority queries; `diagnostics.coverage` populated.
3. `ai-visibility-optimize` → expect 5–10 `ai_artifact` nodes with `status=draft`.

SQL check:
```bash
psql "$SUPABASE_DB_URL" -c "SELECT node_type, COUNT(*) FROM knowledge_nodes WHERE brand_id='<TEST_BRAND_ID>' AND node_type IN ('brand_dna','ai_query','ai_probe_result','ai_artifact') GROUP BY node_type ORDER BY node_type;"
```

Expected output shape:
```
    node_type     | count
------------------+-------
 ai_artifact      |     8
 ai_probe_result  |    60
 ai_query         |    40
 brand_dna        |     1
```

- [ ] **Step 3: Verify Nova detail page end-to-end**

`npm run dev`, `/dashboard/agents/nova`:
- 3 skills listed (not `geo-visibility`).
- Artifact review section shows drafts.
- Approve one — status flips green.
- Reload — approved state persists.

- [ ] **Step 4: Verify Atlas detail page**

`/dashboard/agents/atlas`:
- `Geographic Markets Analyzer` is listed.
- Running it via the UI produces the same output as `geo-visibility` did (output structure unchanged).

- [ ] **Step 5: Verify the 30-day alias**

```bash
curl -X POST http://localhost:3000/api/skills/run \
  -H "Content-Type: application/json" \
  -d '{"brandId":"<TEST_BRAND_ID>","skillId":"geo-visibility"}'
```

Expected: the run succeeds (alias resolves to `geographic-markets`). `skill_runs.skill_id` is stored as `geographic-markets` going forward.

- [ ] **Step 6: Tag the milestone**

```bash
git tag nova-ai-visibility-v1
git log --oneline nova-ai-visibility-v1 ^kg-reliability-v1 | cat
```

Expected: 9 commits tagged.

---

## Out of Scope (per spec)

- Google AI Overviews probe (no official API).
- Actually publishing artifacts to Shopify (future Hugo skill).
- Continuous daily probing (monthly + on-demand only).
- Competitor AI-visibility dashboard.
- Multi-language.
- Historical coverage trend charts (data is persisted; UI for it is a later spec).

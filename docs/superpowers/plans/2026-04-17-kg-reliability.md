# KG Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface silent KG failures via a `diagnostics` column on `skill_runs`, enforce each skill's declared `produces` node types in entity extraction, and replace three hardcoded KG-write blocks with a co-located `postRun` hook.

**Architecture:** A single JSONB `diagnostics` column on `skill_runs` captures per-stage status (rag/extract/postRun/coverage). `extractEntities` gains an allow-list filter keyed off `skill.produces`. Skill-loader grows a `loadPostRun(skillId)` helper that dynamic-imports a co-located `.postRun.ts` file; the engine invokes it before the `skill_runs` insert so its outcome is persisted on the same row. Three existing hardcoded write blocks (`image-brief`, `competitor-scan`, `competitor-creative-library`) move into `.postRun.ts` files; their `if (skill.id === ...)` blocks in `skills-engine.ts` are deleted.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (pg + JSONB), existing `callModel` / `ragQuery` / `extractEntities` infrastructure. No new dependencies.

**Spec reference:** `docs/superpowers/specs/2026-04-17-kg-reliability-design.md`.

**Note on verification:** This repo has no test framework (only `next build` + `eslint`). Each task below verifies via compile (`npm run build`), lint (`npm run lint`), one-off tsx scripts for logic we'd otherwise unit-test, and manual SQL checks against a dev Supabase project.

---

## File Map

**New files:**
- `supabase/migrations/008-skill-run-diagnostics.sql` — adds `diagnostics jsonb` column.
- `src/lib/knowledge/diagnostics.ts` — `SkillRunDiagnostics` type + helpers.
- `src/lib/post-run.ts` — `PostRunContext` type + `loadPostRun()`.
- `skills/creative/image-brief.postRun.ts` — migrated image-brief logic.
- `skills/diagnosis/competitor-scan.postRun.ts` — migrated competitor-scan logic.
- `skills/diagnosis/competitor-creative-library.postRun.ts` — migrated competitor-creative-library logic.
- `scripts/verify-postrun-loader.ts` — one-off check that `.postRun.ts` discovery works.
- `scripts/verify-produces-enforcement.ts` — one-off check that unexpected node types are rejected.

**Modified files:**
- `src/lib/skills-engine.ts` — wrap ragQuery, wrap extractEntities call, call postRun, persist diagnostics, delete 3 hardcoded blocks.
- `src/lib/knowledge/extract.ts` — enforce `produces` allow-list, return diagnostics.
- `src/app/dashboard/agents/[agentId]/page.tsx` — render yellow banner when diagnostics have non-ok statuses.

---

## Task 1: Migration — add `diagnostics` column

**Files:**
- Create: `supabase/migrations/008-skill-run-diagnostics.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 008-skill-run-diagnostics.sql
-- Adds a nullable JSONB diagnostics column to skill_runs so RAG / extraction /
-- postRun failures can be surfaced without blocking the run.

ALTER TABLE skill_runs
  ADD COLUMN IF NOT EXISTS diagnostics jsonb NULL;

COMMENT ON COLUMN skill_runs.diagnostics IS
  'Per-stage reliability telemetry: { rag, extract, postRun, coverage } each with { status, error?, ... }. NULL = all stages ok or skill did not exercise KG paths.';
```

- [ ] **Step 2: Apply migration locally**

Run:
```bash
# If using Supabase CLI:
supabase db push
# Or apply directly via psql against your dev DB:
psql "$SUPABASE_DB_URL" -f supabase/migrations/008-skill-run-diagnostics.sql
```

Expected: `ALTER TABLE` success, no errors.

- [ ] **Step 3: Verify the column exists**

Run:
```bash
psql "$SUPABASE_DB_URL" -c "\d skill_runs" | grep diagnostics
```

Expected output (approx):
```
 diagnostics             | jsonb                       |
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/008-skill-run-diagnostics.sql
git commit -m "feat(kg): add diagnostics column to skill_runs"
```

---

## Task 2: `SkillRunDiagnostics` type + helpers

**Files:**
- Create: `src/lib/knowledge/diagnostics.ts`

- [ ] **Step 1: Create the types module**

Full file contents for `src/lib/knowledge/diagnostics.ts`:

```ts
// Per-stage telemetry persisted alongside each skill_run.
// A stage is absent if it did not run (e.g. rag is absent when the skill
// declares no semantic_query). A stage is present with status='ok' when it
// ran successfully — we keep 'ok' explicitly so downstream queries can filter
// with a single `diagnostics->>'stage' != 'ok'` predicate.

export type StageStatus = 'ok' | 'failed' | 'skipped' | 'partial';

export interface RagDiagnostic {
  status: StageStatus;
  error?: string;
  latency_ms?: number;
}

export interface ExtractDiagnostic {
  status: StageStatus;
  error?: string;
  nodes_created?: number;
  unexpected_node_types?: string[];
}

export interface PostRunDiagnostic {
  status: StageStatus;
  error?: string;
}

export interface SkillRunDiagnostics {
  rag?: RagDiagnostic;
  extract?: ExtractDiagnostic;
  postRun?: PostRunDiagnostic;
  // Per-engine coverage for multi-engine skills (Nova). Key = engine id.
  coverage?: Record<string, StageStatus>;
}

// True if any recorded stage is non-ok. Used by the UI to decide whether to
// show the degraded-enrichment banner.
export function hasDegradedStage(d: SkillRunDiagnostics | null | undefined): boolean {
  if (!d) return false;
  if (d.rag && d.rag.status !== 'ok') return true;
  if (d.extract && d.extract.status !== 'ok') return true;
  if (d.postRun && d.postRun.status !== 'ok') return true;
  if (d.coverage) {
    for (const status of Object.values(d.coverage)) {
      if (status !== 'ok') return true;
    }
  }
  return false;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds (this task introduces no imports — just types).

- [ ] **Step 3: Commit**

```bash
git add src/lib/knowledge/diagnostics.ts
git commit -m "feat(kg): add SkillRunDiagnostics type"
```

---

## Task 3: Wrap `ragQuery` in `runSkill` with try/catch that populates `diagnostics.rag`

**Files:**
- Modify: `src/lib/skills-engine.ts` (around line 367–383 — the existing RAG block)

- [ ] **Step 1: Locate and read the current block**

Run:
```bash
grep -n "ragQuery({" src/lib/skills-engine.ts
grep -n "ragContext = null\|ragContext: import" src/lib/skills-engine.ts
```

Expected: one `ragQuery({` call around line 372, one `ragContext` init around line 368.

- [ ] **Step 2: Replace the existing RAG block with a diagnostics-aware version**

Find this block (currently lines ~367–383):

```ts
  // 5.5. Fetch knowledge graph context via RAG (non-fatal)
  let ragContext: import('@/lib/knowledge/rag').RAGResult | null = null;
  if (skill.knowledge?.semanticQuery) {
    try {
      const { ragQuery } = await import('@/lib/knowledge/rag');
      ragContext = await ragQuery({
        brandId: input.brandId,
        query: skill.knowledge.semanticQuery,
        nodeTypes: skill.knowledge.needs,
        limit: 15,
        traverseDepth: skill.knowledge.traverseDepth ?? 1,
        includeAgencyPatterns: skill.knowledge.includeAgencyPatterns ?? false,
      });
    } catch (err) {
      console.warn('[SkillsEngine] ragQuery failed (continuing without knowledge context):', err);
    }
  }
```

Replace with:

```ts
  // 5.5. Fetch knowledge graph context via RAG (non-fatal — records diagnostics)
  let ragContext: import('@/lib/knowledge/rag').RAGResult | null = null;
  const diagnostics: import('@/lib/knowledge/diagnostics').SkillRunDiagnostics = {};
  if (skill.knowledge?.semanticQuery) {
    const ragStart = Date.now();
    try {
      const { ragQuery } = await import('@/lib/knowledge/rag');
      ragContext = await ragQuery({
        brandId: input.brandId,
        query: skill.knowledge.semanticQuery,
        nodeTypes: skill.knowledge.needs,
        limit: 15,
        traverseDepth: skill.knowledge.traverseDepth ?? 1,
        includeAgencyPatterns: skill.knowledge.includeAgencyPatterns ?? false,
      });
      diagnostics.rag = { status: 'ok', latency_ms: Date.now() - ragStart };
    } catch (err) {
      console.warn('[SkillsEngine] ragQuery failed (continuing without knowledge context):', err);
      diagnostics.rag = {
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        latency_ms: Date.now() - ragStart,
      };
    }
  }
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/lib/skills-engine.ts
git commit -m "feat(kg): record rag diagnostics in runSkill"
```

---

## Task 4: Enforce `produces` allow-list in `extractEntities` and return diagnostics

**Files:**
- Modify: `src/lib/knowledge/extract.ts`

- [ ] **Step 1: Expand `ExtractionResult` return type**

At the top of `src/lib/knowledge/extract.ts`, find the existing `ExtractionResult` interface. Replace it with:

```ts
export interface ExtractionResult {
  nodesCreated: number;
  edgesCreated: number;
  snapshotsCreated: number;
  /** Node types the LLM returned that weren't in the skill's `produces` list. */
  unexpectedNodeTypes: string[];
  /** Set to a Node error message if the LLM call itself failed. */
  error?: string;
}
```

(If the existing interface lives elsewhere in the file, edit it in place — keep any other fields it already has.)

- [ ] **Step 2: Replace the node-insertion loop with the allow-list filter**

Find the block starting at line ~175 (`// --- Nodes ---`). The key change: build `allowedTypes` from `skill.produces`, and drop any node whose type isn't in it. If `produces` is empty/absent, keep existing behaviour (accept all VALID types).

Replace the existing `// --- Nodes ---` section through the end of the node-insert loop with:

```ts
  // --- Nodes ---
  // Build per-skill allow-list from `produces`. If the skill declares no
  // produces, we fall back to the global VALID_NODE_TYPES (old behaviour).
  let allowedTypes: Set<string> | null = null;
  try {
    const skill = await loadSkill(skillId);
    if (skill.produces && skill.produces.length > 0) {
      allowedTypes = new Set(skill.produces.map(p => p.nodeType));
    }
  } catch { /* already logged above */ }

  const unexpectedNodeTypes: string[] = [];

  for (const node of extracted.nodes ?? []) {
    if (!node.name || !node.node_type) continue;
    if (!VALID_NODE_TYPES.has(node.node_type)) {
      unexpectedNodeTypes.push(node.node_type);
      continue;
    }
    if (allowedTypes && !allowedTypes.has(node.node_type)) {
      unexpectedNodeTypes.push(node.node_type);
      continue;
    }

    // Generate embedding inline so the node is immediately searchable via RAG
    let embedding: number[] | null = null;
    try {
      const textForEmbedding = `${node.name}. ${node.summary || ''}. ${JSON.stringify(node.properties || {})}`;
      embedding = await embedText(textForEmbedding);
    } catch (err) {
      console.warn(`[extract] Embedding generation failed for "${node.name}":`, err);
    }

    const { data: inserted, error } = await supabase
      .from('knowledge_nodes')
      .insert({
        brand_id: brandId,
        node_type: node.node_type,
        name: node.name.slice(0, 255),
        summary: node.summary?.slice(0, 500) ?? null,
        properties: node.properties ?? {},
        confidence: node.confidence ?? 1.0,
        source_skill: skillId,
        source_run_id: skillRunId,
        embedding,
        is_active: true,
      })
      .select('id')
      .single();

    if (!error && inserted?.id) {
      nodeIdByName.set(node.name, inserted.id as string);
      nodesCreated++;
    } else if (error) {
      console.warn('[Extract] Failed to insert node:', node.name, error.message);
    }
  }
```

- [ ] **Step 3: Update the return statement at the bottom**

Find the existing return of `{ nodesCreated, edgesCreated, snapshotsCreated }` and change it to:

```ts
  return { nodesCreated, edgesCreated, snapshotsCreated, unexpectedNodeTypes };
```

Also update the two early-return sites (empty output and LLM failure). Replace:

```ts
  if (outputJson.length < 30) {
    return { nodesCreated: 0, edgesCreated: 0, snapshotsCreated: 0 };
  }
```

with:

```ts
  if (outputJson.length < 30) {
    return { nodesCreated: 0, edgesCreated: 0, snapshotsCreated: 0, unexpectedNodeTypes: [] };
  }
```

And replace:

```ts
  } catch (err) {
    console.warn('[Extract] LLM extraction failed (non-fatal):', err);
    return { nodesCreated: 0, edgesCreated: 0, snapshotsCreated: 0 };
  }
```

with:

```ts
  } catch (err) {
    console.warn('[Extract] LLM extraction failed (non-fatal):', err);
    return {
      nodesCreated: 0,
      edgesCreated: 0,
      snapshotsCreated: 0,
      unexpectedNodeTypes: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Write a verification script**

Create `scripts/verify-produces-enforcement.ts`:

```ts
// Run: npx tsx scripts/verify-produces-enforcement.ts
// Simulates extractEntities filtering logic without hitting the LLM or DB.
import { loadSkill } from '../src/lib/skill-loader';

async function main() {
  const skill = await loadSkill('seo-audit');
  const allowedTypes = new Set((skill.produces ?? []).map(p => p.nodeType));
  console.log('seo-audit produces:', [...allowedTypes]);

  const llmOutput = [
    { name: 'Keyword gap report', node_type: 'insight' },
    { name: 'Rando product', node_type: 'product' },
    { name: 'Nonsense type', node_type: 'not_a_real_type' },
  ];

  const VALID_NODE_TYPES = new Set([
    'product', 'audience', 'campaign', 'content', 'competitor',
    'insight', 'metric', 'experiment', 'creative', 'keyword',
    'email_flow', 'channel', 'persona', 'product_image',
    'competitor_creative', 'ad_creative', 'video_asset',
    'landing_page', 'review_theme', 'price_point',
    'brand_guidelines', 'brand_asset', 'top_content',
  ]);

  const kept: string[] = [];
  const rejected: string[] = [];
  for (const n of llmOutput) {
    if (!VALID_NODE_TYPES.has(n.node_type)) { rejected.push(n.node_type); continue; }
    if (allowedTypes.size > 0 && !allowedTypes.has(n.node_type)) { rejected.push(n.node_type); continue; }
    kept.push(n.node_type);
  }

  console.log('kept:', kept);
  console.log('rejected:', rejected);

  if (rejected.length === 0) {
    console.error('FAIL: expected at least one rejection');
    process.exit(1);
  }
  console.log('OK');
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 6: Run the verification script**

Run: `npx tsx scripts/verify-produces-enforcement.ts`
Expected output ends with:
```
rejected: [ 'not_a_real_type', ... ]
OK
```

(Exact types depend on `seo-audit`'s `produces` declaration.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/knowledge/extract.ts scripts/verify-produces-enforcement.ts
git commit -m "feat(kg): enforce produces allow-list in extractEntities"
```

---

## Task 5: Wire `extractEntities` diagnostic back into `runSkill`

**Files:**
- Modify: `src/lib/skills-engine.ts` (around line 563–572)

- [ ] **Step 1: Convert the fire-and-forget extraction into awaited-with-diagnostics**

Find the existing block:

```ts
  // 10. Entity extraction — fire-and-forget, non-fatal
  if (status === 'completed' && runId) {
    import('@/lib/knowledge/extract')
      .then(({ extractEntities }) =>
        extractEntities(input.brandId, input.skillId, runId, output),
      )
      .catch((err) => {
        console.warn('[SkillsEngine] Entity extraction failed (non-fatal):', err);
      });
  }
```

**Important:** Note that the `status === 'completed'` check happens *after* the `skill_runs` insert (line ~481). We need to move extraction + postRun to happen **before** the insert so their diagnostics can be persisted on the same row. Cut this block and keep it out of the file for now — Task 7 places the replacement in the right location.

Before cutting, confirm the current shape:

```bash
grep -n "Entity extraction — fire-and-forget" src/lib/skills-engine.ts
```

Expected: one match around line 563.

**Delete** the block shown above. Do not add a replacement yet. Build will fail if extractEntities is now unused — fix that in the next step.

- [ ] **Step 2: Verify the build flags the now-unused extractEntities import**

Run: `npm run build`
Expected: build succeeds (the import was dynamic, so removing the call doesn't cause a TS error).

- [ ] **Step 3: Commit**

```bash
git add src/lib/skills-engine.ts
git commit -m "refactor(kg): remove fire-and-forget extractEntities (moving pre-insert in next commit)"
```

---

## Task 6: Create `post-run.ts` — `PostRunContext` type and `loadPostRun` loader

**Files:**
- Create: `src/lib/post-run.ts`

- [ ] **Step 1: Create the module**

Full file contents for `src/lib/post-run.ts`:

```ts
import path from 'path';
import fs from 'fs';
import { getSkillPath } from '@/lib/skill-loader';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PostRunContext {
  brandId: string;
  skillId: string;
  runId: string;
  /** Skill's LLM output, already JSON-parsed. Treat as unknown and narrow inside. */
  output: Record<string, unknown>;
  /** Service-role client — bypasses RLS. Use only for writes owned by this skill. */
  supabase: SupabaseClient;
  /** Resolved live data from MCP tool calls, same shape as `liveData` in skills-engine. */
  liveData: Record<string, unknown>;
}

export type PostRunFn = (ctx: PostRunContext) => Promise<void>;

// Resolved once per skillId. `null` means we've checked and no .postRun.ts exists.
const postRunCache = new Map<string, PostRunFn | null>();

export async function loadPostRun(skillId: string): Promise<PostRunFn | null> {
  if (postRunCache.has(skillId)) return postRunCache.get(skillId)!;

  const mdPath = getSkillPath(skillId);
  if (!mdPath) {
    postRunCache.set(skillId, null);
    return null;
  }

  // Co-located convention: foo.md -> foo.postRun.ts
  const tsPath = mdPath.replace(/\.md$/, '.postRun.ts');
  if (!fs.existsSync(tsPath)) {
    postRunCache.set(skillId, null);
    return null;
  }

  // Dynamic import. Next.js server builds bundle everything under /skills at
  // build time when reachable from src/. Since this is server-only code we can
  // use require() with the resolved absolute path.
  const mod = await import(/* @vite-ignore */ path.resolve(tsPath));
  const fn = (mod.postRun ?? mod.default) as PostRunFn | undefined;
  if (typeof fn !== 'function') {
    console.warn(`[post-run] ${tsPath} loaded but has no exported postRun function`);
    postRunCache.set(skillId, null);
    return null;
  }

  postRunCache.set(skillId, fn);
  return fn;
}

export function clearPostRunCache(): void {
  postRunCache.clear();
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Write the loader verification script**

Create `scripts/verify-postrun-loader.ts`:

```ts
// Run: npx tsx scripts/verify-postrun-loader.ts
import { loadPostRun, clearPostRunCache } from '../src/lib/post-run';

async function main() {
  clearPostRunCache();

  // A skill we know has no .postRun.ts yet
  const none = await loadPostRun('seo-audit');
  if (none !== null) {
    console.error('FAIL: expected null for seo-audit (no .postRun.ts on disk)');
    process.exit(1);
  }
  console.log('seo-audit -> null OK');

  // A skill that doesn't exist at all
  const missing = await loadPostRun('does-not-exist');
  if (missing !== null) {
    console.error('FAIL: expected null for missing skill');
    process.exit(1);
  }
  console.log('does-not-exist -> null OK');

  console.log('OK');
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Run the verification script**

Run: `npx tsx scripts/verify-postrun-loader.ts`
Expected:
```
seo-audit -> null OK
does-not-exist -> null OK
OK
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/post-run.ts scripts/verify-postrun-loader.ts
git commit -m "feat(kg): add loadPostRun loader and PostRunContext type"
```

---

## Task 7: Wire `extractEntities` + `postRun` + `diagnostics` into `runSkill` before `skill_runs` insert

**Files:**
- Modify: `src/lib/skills-engine.ts`

This is the load-bearing change. It reorders the pipeline so the `skill_runs` insert at line ~482 can include a fully-populated `diagnostics` field.

- [ ] **Step 1: Locate the skill_runs insert block**

Run:
```bash
grep -n "from('skill_runs')" src/lib/skills-engine.ts
```

Expected: matches near line 319 (recent run check), 440 (failed run insert), and 482 (successful run insert). We're editing the 482 one.

- [ ] **Step 2: Add `diagnostics` to the `skill_runs` INSERT**

At this point in the pipeline, only `diagnostics.rag` has been populated (from Task 3). Extraction and postRun run *after* insert (where they have access to the real `runId`) and are persisted via an UPDATE. The INSERT writes whatever's in `diagnostics` at insert-time.

Find:
```ts
  const { data: skillRun, error: runInsertError } = await supabase
    .from('skill_runs')
    .insert({
      brand_id: input.brandId,
      agent_id: skill.agent,
      skill_id: skill.id,
      model_used: model,
      model_tier: skill.complexity,
      credits_used: creditsUsed,
      input: input.additionalContext ?? {},
      output,
      status,
      error_message: qc.pass ? null : qc.reason,
      triggered_by: input.triggeredBy,
      parent_run_id: input.parentRunId ?? null,
      chain_depth: input.chainDepth ?? 0,
      duration_ms: durationMs,
      data_source_summary: toolResolutions,
      completed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
```

Add `diagnostics: Object.keys(diagnostics).length > 0 ? diagnostics : null,` as a new field just before `completed_at`:

```ts
      data_source_summary: toolResolutions,
      diagnostics: Object.keys(diagnostics).length > 0 ? diagnostics : null,
      completed_at: new Date().toISOString(),
```

- [ ] **Step 3: Add extraction + postRun AFTER the insert**

Now that `runId` is available, run `extractEntities` and the postRun hook, then persist their diagnostics via a follow-up UPDATE on the same row.

Add this block **immediately after** `const runId = skillRun?.id ?? '';` (around line 518):

```ts
  // 8.5. Entity extraction + postRun hook (with real runId). Both non-fatal.
  // We persist any new diagnostics via an UPDATE since the INSERT is done.
  let extractDiagSet = false;
  if (status === 'completed' && runId) {
    try {
      const { extractEntities } = await import('@/lib/knowledge/extract');
      const extractResult = await extractEntities(input.brandId, input.skillId, runId, output);
      diagnostics.extract = extractResult.error
        ? { status: 'failed', error: extractResult.error }
        : {
            status: extractResult.unexpectedNodeTypes.length > 0 ? 'partial' : 'ok',
            nodes_created: extractResult.nodesCreated,
            unexpected_node_types: extractResult.unexpectedNodeTypes.length > 0
              ? extractResult.unexpectedNodeTypes
              : undefined,
          };
      extractDiagSet = true;
    } catch (err) {
      diagnostics.extract = { status: 'failed', error: err instanceof Error ? err.message : String(err) };
      extractDiagSet = true;
    }

    try {
      const { loadPostRun } = await import('@/lib/post-run');
      const postRun = await loadPostRun(input.skillId);
      if (postRun) {
        const { createServiceClient } = await import('@/lib/supabase/service');
        await postRun({
          brandId: input.brandId, skillId: input.skillId, runId,
          output, supabase: createServiceClient(), liveData,
        });
        diagnostics.postRun = { status: 'ok' };
        extractDiagSet = true;
      }
    } catch (err) {
      diagnostics.postRun = { status: 'failed', error: err instanceof Error ? err.message : String(err) };
      extractDiagSet = true;
    }

    if (extractDiagSet && Object.keys(diagnostics).length > 0) {
      await supabase.from('skill_runs')
        .update({ diagnostics })
        .eq('id', runId);
    }
  }
```

Net effect: `diagnostics.rag` is set during RAG (Task 3) and lands on the initial INSERT; `diagnostics.extract` and `diagnostics.postRun` are set after the INSERT and applied via UPDATE on the same row.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Verify end-to-end against a dev brand**

Run a skill that exercises RAG (e.g. `seo-audit`) via the dashboard, then:

```bash
psql "$SUPABASE_DB_URL" -c "SELECT id, skill_id, status, diagnostics FROM skill_runs ORDER BY created_at DESC LIMIT 1;"
```

Expected: `diagnostics` column populated with `{"rag": {"status": "ok", ...}, "extract": {...}}`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/skills-engine.ts
git commit -m "feat(kg): persist rag/extract/postRun diagnostics on skill_runs"
```

---

## Task 8: UI banner for degraded runs

**Files:**
- Modify: `src/app/dashboard/agents/[agentId]/page.tsx`

- [ ] **Step 1: Extend the `SkillRun` type**

Find:
```ts
interface SkillRun {
  id: string
  skill_id: string
  status: 'completed' | 'failed' | 'running' | 'blocked'
  ...
  data_source_summary?: Record<string, unknown> | null
}
```

Add one field before the closing brace:

```ts
  diagnostics?: import('@/lib/knowledge/diagnostics').SkillRunDiagnostics | null
```

- [ ] **Step 2: Ensure the supabase select pulls the column**

Run:
```bash
grep -n "select('" src/app/dashboard/agents/\[agentId\]/page.tsx
```

Find the skill_runs select query. Add `diagnostics` to the selected columns.

Example edit (exact existing list will vary — add `, diagnostics` to whatever is already selected):

```ts
.from('skill_runs')
.select('id, skill_id, status, output, model_used, credits_used, duration_ms, created_at, triggered_by, error_message, blocked_reason, missing_platforms, data_source_summary, diagnostics')
```

- [ ] **Step 3: Render the banner in the skill-run card**

Find where each `SkillRun` is rendered (look for a component that maps over runs — likely a child component or inline map). Just after the status badge but before the output, add:

```tsx
{run.diagnostics && (() => {
  const d = run.diagnostics
  const issues: string[] = []
  if (d.rag?.status === 'failed') issues.push(`RAG failed: ${d.rag.error ?? 'unknown'}`)
  if (d.extract?.status === 'failed') issues.push(`Entity extraction failed: ${d.extract.error ?? 'unknown'}`)
  if (d.extract?.status === 'partial' && d.extract.unexpected_node_types?.length) {
    issues.push(`Dropped unexpected node types: ${d.extract.unexpected_node_types.join(', ')}`)
  }
  if (d.postRun?.status === 'failed') issues.push(`postRun failed: ${d.postRun.error ?? 'unknown'}`)
  if (d.coverage) {
    for (const [engine, status] of Object.entries(d.coverage)) {
      if (status !== 'ok') issues.push(`${engine} coverage: ${status}`)
    }
  }
  if (issues.length === 0) return null
  return (
    <div className="mt-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
      <div className="font-medium">Completed with degraded enrichment</div>
      <ul className="mt-1 list-disc list-inside space-y-0.5">
        {issues.map((i, idx) => <li key={idx}>{i}</li>)}
      </ul>
    </div>
  )
})()}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Manually verify the banner**

Start dev server:
```bash
npm run dev
```

Force a partial extraction: temporarily corrupt a skill's `produces` (e.g. set `produces: [{ node_type: 'product' }]` on `seo-audit` which normally produces `insight`), run the skill, visit `/dashboard/agents/hugo`, confirm yellow banner appears for that run.

Revert the `produces` change after manual verification.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/agents/\[agentId\]/page.tsx
git commit -m "feat(kg): show degraded-enrichment banner on skill-run cards"
```

---

## Task 9: Migrate `image-brief` hardcoded writes to `.postRun.ts`

**Files:**
- Create: `skills/creative/image-brief.postRun.ts`
- Modify: `src/lib/skills-engine.ts` (delete lines ~596–639)

- [ ] **Step 1: Create the post-run module**

Full file contents for `skills/creative/image-brief.postRun.ts`:

```ts
import type { PostRunContext } from '@/lib/post-run';

export async function postRun(ctx: PostRunContext): Promise<void> {
  const { brandId, runId, output } = ctx;
  const { generateAdImage } = await import('@/lib/imagen-client');
  const { createMediaNode } = await import('@/lib/fal-client');

  const briefs = Array.isArray(output.briefs)
    ? (output.briefs as Record<string, unknown>[])
    : [output];

  for (const briefRaw of briefs.slice(0, 4)) {
    const brief = briefRaw as Record<string, unknown>;
    const prompt = (brief.prompt || brief.description || JSON.stringify(brief)) as string;
    const referenceImageUrl = (brief.reference_image_url || brief.product_image_url) as string | undefined;
    const img = await generateAdImage({
      prompt,
      referenceImageUrl,
      width: (brief.width as number | undefined) ?? 1024,
      height: (brief.height as number | undefined) ?? 1024,
    });
    if (!img) continue;

    const ext = img.mimeType.includes('png') ? 'png' : 'jpg';
    const storagePath = `${brandId}/ad-creatives/${runId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
    const buffer = Buffer.from(img.base64, 'base64');
    const { error: uploadErr } = await ctx.supabase.storage
      .from('generated-assets')
      .upload(storagePath, buffer, { contentType: img.mimeType, upsert: true });
    if (uploadErr) {
      console.warn('[image-brief.postRun] upload failed:', uploadErr.message);
      continue;
    }

    await createMediaNode(
      brandId,
      'ad_creative',
      (brief.name as string | undefined) || `Creative from image-brief · ${runId.slice(-8)}`,
      storagePath,
      'generated-assets',
      img.mimeType,
      'image-brief',
      runId,
      { prompt, dimensions: `${img.width}x${img.height}` },
    );
  }
}
```

- [ ] **Step 2: Delete the existing hardcoded block in `skills-engine.ts`**

Find and delete the entire block starting with the comment `// Post-execution: image generation for image-brief skill.` through the `}).catch(console.warn);` at the end. This is approximately lines 592–639. Confirm by grepping before and after:

```bash
grep -n "Post-execution: image generation for image-brief" src/lib/skills-engine.ts
```

Expected before: 1 match. After deletion: 0 matches.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds (the dynamic imports we removed don't break anything — `imagen-client` and `fal-client` are still imported from the new `.postRun.ts`).

- [ ] **Step 4: Verify lint**

Run: `npm run lint`
Expected: no errors in changed files.

- [ ] **Step 5: Manually verify against a test brand**

Start dev server (`npm run dev`), trigger `image-brief` via the Creative Studio flow or directly via `/api/skills/run`. Then:

```bash
psql "$SUPABASE_DB_URL" -c "SELECT name, properties->>'dimensions' FROM knowledge_nodes WHERE node_type='ad_creative' ORDER BY created_at DESC LIMIT 4;"
```

Expected: 4 rows with dimensions like `1024x1024`. `diagnostics.postRun.status` on the skill_runs row should be `ok`:

```bash
psql "$SUPABASE_DB_URL" -c "SELECT diagnostics->'postRun' FROM skill_runs WHERE skill_id='image-brief' ORDER BY created_at DESC LIMIT 1;"
```

Expected: `{"status": "ok"}`.

- [ ] **Step 6: Commit**

```bash
git add skills/creative/image-brief.postRun.ts src/lib/skills-engine.ts
git commit -m "refactor(kg): move image-brief hardcoded writes into postRun hook"
```

---

## Task 10: Migrate `competitor-scan` and `competitor-creative-library` to `.postRun.ts`

**Files:**
- Create: `skills/diagnosis/competitor-scan.postRun.ts`
- Create: `skills/diagnosis/competitor-creative-library.postRun.ts`
- Modify: `src/lib/skills-engine.ts` (delete lines ~664–707)

- [ ] **Step 1: Extract the shared logic once**

Both skills currently share the same block. We factor it out into a shared helper and call from each `.postRun.ts`. Create `skills/diagnosis/_competitor-creative-persist.ts`:

```ts
import type { PostRunContext } from '@/lib/post-run';

interface CompetitorAd {
  id: string;
  page_name: string;
  ad_creative_body: string | null;
  media_type: string;
  thumbnail_url: string | null;
  ad_snapshot_url: string | null;
  estimated_days_active: number;
  ad_creative_link_title: string | null;
}

export async function persistCompetitorCreatives(ctx: PostRunContext, sourceSkillId: string): Promise<void> {
  const { brandId, runId, liveData, supabase } = ctx;
  const competitorAds = (liveData.competitor as { ads?: Array<{ competitor: string; ads: CompetitorAd[] }> } | undefined)?.ads;
  if (!competitorAds) return;

  for (const group of competitorAds) {
    for (const ad of (group.ads ?? []).slice(0, 25)) {
      await supabase.from('knowledge_nodes').upsert({
        brand_id: brandId,
        node_type: 'competitor_creative',
        name: `${group.competitor}: ${ad.ad_creative_link_title || ad.id}`,
        summary: ad.ad_creative_body?.slice(0, 300) ?? null,
        properties: {
          competitor_name: group.competitor,
          ad_id: ad.id,
          ad_creative_body: ad.ad_creative_body,
          ad_creative_link_title: ad.ad_creative_link_title,
          media_type: ad.media_type,
          thumbnail_url: ad.thumbnail_url,
          ad_snapshot_url: ad.ad_snapshot_url,
          estimated_days_active: ad.estimated_days_active,
          format: ad.media_type === 'video' ? 'video'
            : ad.media_type === 'image' ? 'static_image'
            : 'unknown',
          messaging_approach: 'unknown',
          estimated_performance: ad.estimated_days_active >= 14 ? 'high'
            : ad.estimated_days_active >= 7 ? 'medium'
            : 'low',
        },
        source_skill: sourceSkillId,
        source_run_id: runId,
        confidence: ad.estimated_days_active >= 14 ? 0.9 : 0.7,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'brand_id,name', ignoreDuplicates: false });
    }
  }
}
```

- [ ] **Step 2: Create `competitor-scan.postRun.ts`**

Full file contents for `skills/diagnosis/competitor-scan.postRun.ts`:

```ts
import type { PostRunContext } from '@/lib/post-run';
import { persistCompetitorCreatives } from './_competitor-creative-persist';

export async function postRun(ctx: PostRunContext): Promise<void> {
  await persistCompetitorCreatives(ctx, 'competitor-scan');
}
```

- [ ] **Step 3: Create `competitor-creative-library.postRun.ts`**

Full file contents for `skills/diagnosis/competitor-creative-library.postRun.ts`:

```ts
import type { PostRunContext } from '@/lib/post-run';
import { persistCompetitorCreatives } from './_competitor-creative-persist';

export async function postRun(ctx: PostRunContext): Promise<void> {
  await persistCompetitorCreatives(ctx, 'competitor-creative-library');
}
```

- [ ] **Step 4: Delete the hardcoded block in skills-engine.ts**

Find and delete the entire block starting with the comment `// Post-execution: persist competitor ad creatives with thumbnails` through the matching closing `}` of the `if ((skill.id === 'competitor-scan' || skill.id === 'competitor-creative-library') ...)`. This is approximately lines 664–707.

Confirm:
```bash
grep -n "Post-execution: persist competitor ad creatives" src/lib/skills-engine.ts
```

Expected after deletion: 0 matches.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Verify loader discovers the new files**

Add two quick cases to `scripts/verify-postrun-loader.ts` (after the existing `seo-audit -> null` check):

```ts
  const cs = await loadPostRun('competitor-scan');
  if (typeof cs !== 'function') { console.error('FAIL: competitor-scan postRun not found'); process.exit(1); }
  console.log('competitor-scan -> function OK');

  const ccl = await loadPostRun('competitor-creative-library');
  if (typeof ccl !== 'function') { console.error('FAIL: competitor-creative-library postRun not found'); process.exit(1); }
  console.log('competitor-creative-library -> function OK');

  const ib = await loadPostRun('image-brief');
  if (typeof ib !== 'function') { console.error('FAIL: image-brief postRun not found'); process.exit(1); }
  console.log('image-brief -> function OK');
```

Run: `npx tsx scripts/verify-postrun-loader.ts`
Expected: all three new lines end with `OK`.

- [ ] **Step 7: Manually verify behavior parity**

Trigger `competitor-scan` against a test brand (via dashboard or `/api/skills/run`), then:

```bash
psql "$SUPABASE_DB_URL" -c "SELECT COUNT(*), MAX(created_at) FROM knowledge_nodes WHERE brand_id='<TEST_BRAND_ID>' AND node_type='competitor_creative';"
```

Expected: count increased from baseline by ≤ (25 ads × N competitors); `MAX(created_at)` is within the last minute.

- [ ] **Step 8: Commit**

```bash
git add skills/diagnosis/_competitor-creative-persist.ts \
        skills/diagnosis/competitor-scan.postRun.ts \
        skills/diagnosis/competitor-creative-library.postRun.ts \
        src/lib/skills-engine.ts \
        scripts/verify-postrun-loader.ts
git commit -m "refactor(kg): move competitor-creative writes into postRun hook"
```

---

## Task 11: Final regression check

- [ ] **Step 1: Rebuild and re-lint**

Run: `npm run build && npm run lint`
Expected: both succeed, no warnings in changed files.

- [ ] **Step 2: Smoke test the three migrated skills end-to-end**

Via the dashboard (or `/api/skills/run`), run each:
- `image-brief` — verify 1–4 `ad_creative` nodes with the correct storage URL.
- `competitor-scan` — verify `competitor_creative` nodes upsert cleanly (idempotent on rerun).
- `competitor-creative-library` — same.

After each run, check `diagnostics`:

```bash
psql "$SUPABASE_DB_URL" -c "SELECT skill_id, diagnostics FROM skill_runs WHERE skill_id IN ('image-brief','competitor-scan','competitor-creative-library') ORDER BY created_at DESC LIMIT 6;"
```

Expected: `diagnostics.postRun.status = 'ok'` on each.

- [ ] **Step 3: Confirm no hardcoded KG blocks remain for these skills**

Run:
```bash
grep -nE "skill\.id === '(image-brief|competitor-scan|competitor-creative-library)'" src/lib/skills-engine.ts
```

Expected: **no matches**. (Other skills like `brand-voice-extractor`, `campaign-launcher`, `health-check`, `ad-performance-analyzer` still have their own blocks — those write to non-KG tables and are explicitly out of scope per the spec.)

- [ ] **Step 4: Tag the milestone**

```bash
git tag kg-reliability-v1
git log --oneline kg-reliability-v1 ^HEAD~12 | cat
```

Expected: 10–12 commits tagged, matching the task structure.

---

## Out of Scope (per spec)

- Retries for RAG / extract / postRun failures (no retry logic added).
- Platform-ops dashboard aggregating diagnostics across runs.
- Migrating non-KG hardcoded writes (`brand-voice-extractor`, `campaign-launcher`, `ad-performance-analyzer`).
- Widening `extractEntities` to handle more output shapes.

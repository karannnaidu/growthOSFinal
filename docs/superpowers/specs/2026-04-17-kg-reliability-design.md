# Knowledge Graph Reliability — Design Spec

**Date:** 2026-04-17
**Status:** Approved (brainstorm)
**Depends on:** nothing — foundational
**Blocks:** `2026-04-17-nova-ai-visibility-design.md`

## Problem

The knowledge graph (KG) is read by `runSkill` (via RAG) and written to by `extractEntities` (via LLM-driven entity extraction). Both paths are **non-fatal** — failures are swallowed silently. Three specific weaknesses today:

1. **Silent failures.** RAG query timeouts or extraction errors leave no trace in `skill_runs` or the UI. A skill can complete with zero KG enrichment and no one notices.
2. **`produces` is advisory.** Skill frontmatter declares `produces: [{ node_type, edge_to, edge_type }]` but `extractEntities` uses it only as a prompt hint to Gemini Flash-Lite. The LLM can produce unrelated node types; validation is limited to a global `VALID_NODE_TYPES` enum.
3. **Hardcoded writes bypass the generic path.** `competitor-scan`, `competitor-creative-library`, and `image-brief` have special-case `if (skill.id === ...)` blocks in `skills-engine.ts` that write nodes directly. Reliable, but the pattern doesn't scale — every new skill that needs deterministic writes adds another special case.

These weaknesses are tolerable at today's 54-skill scale but get worse every time a new skill is added.

## Solution Overview

Three changes to the skills engine and knowledge layer:

1. Add a `diagnostics` JSONB column to `skill_runs`; populate on RAG/extract failure; surface in the skill-run detail UI.
2. Enforce `produces` allow-list in `extractEntities`; reject node types the skill didn't declare, log rejects to `diagnostics.unexpected_node_types`.
3. Introduce a `postRun` convention — skills that need deterministic writes export a function from a co-located `.ts` file. Engine invokes it after `status === 'completed'`. Migrate the three hardcoded skills to the hook.

No breaking changes. Every existing skill continues to work unchanged. `postRun` is opt-in.

---

## 1. Diagnostics — surface silent failures

### Schema

New migration adds one nullable column to `skill_runs`:

```sql
ALTER TABLE skill_runs
  ADD COLUMN diagnostics jsonb NULL;
```

Shape:

```ts
type SkillRunDiagnostics = {
  rag?: { status: 'ok' | 'failed' | 'skipped'; error?: string; latency_ms?: number };
  extract?: { status: 'ok' | 'failed' | 'partial'; error?: string; nodes_created?: number; unexpected_node_types?: string[] };
  postRun?: { status: 'ok' | 'failed'; error?: string };
  coverage?: Record<string, 'ok' | 'skipped' | 'failed'>; // per-engine for skills like Nova
};
```

### Write path

In `runSkill` (skills-engine.ts):
- Wrap `ragQuery` with try/catch → on failure set `diagnostics.rag = { status: 'failed', error }`.
- Wrap `extractEntities` call → on failure set `diagnostics.extract`. On success set `nodes_created`.
- Persist `diagnostics` via the existing `skill_runs` insert (already writes `output`, `error`, etc.).

### Read path / UI

The skill-run detail page (find via `src/app/dashboard/agents/[agentId]/page.tsx` or similar activity feed) shows a yellow banner when `diagnostics` has any non-`ok` status:

> "Completed with degraded enrichment — KG extraction failed (timeout). This run's output is correct, but downstream skills that rely on RAG may have less context."

### Non-goals

- **Not** blocking the skill on failure. The user-visible skill output is independent of KG enrichment.
- **Not** alerting / paging on individual failures. The banner is sufficient; we add a platform-ops dashboard in a later spec if needed.

---

## 2. `produces` enforcement in `extractEntities`

### Change

`src/lib/knowledge/extract.ts` `extractEntities()`:

Before: the LLM produces any entities; `VALID_NODE_TYPES` is the only filter.

After:
- Read skill's declared `produces: [{ node_type }]` from its frontmatter (already loaded by skill-loader).
- Build `allowedTypes = new Set(skill.produces.map(p => p.node_type))`.
- For each entity the LLM returns: if `node_type` is in `allowedTypes` → accept; else → drop and push to `unexpected_node_types[]`.
- Accepted entities proceed through the existing insert flow.
- Diagnostic is returned to caller so `runSkill` can merge into `skill_runs.diagnostics.extract`.

### Edge case — empty `produces`

Skills with no `produces:` declaration (`mia-manager`, `product-context`) already skip extraction entirely. No change.

### Edge case — `produces` too narrow

If enforcement drops everything, we learn two things from `unexpected_node_types`:
- Either the declaration is too narrow (update the skill's frontmatter).
- Or the extractor prompt needs tightening.

Either way, the diagnostic tells us. We do **not** auto-widen `produces`.

---

## 3. `postRun` hook — replace hardcoded writes

### Convention

A skill opts in by placing a `.postRun.ts` file next to its `.md` file:

```
skills/diagnosis/competitor-scan.md
skills/diagnosis/competitor-scan.postRun.ts
```

The `.postRun.ts` exports:

```ts
export interface PostRunContext {
  brandId: string;
  skillId: string;
  runId: string;
  output: unknown;         // skill's LLM output (already JSON-parsed)
  supabase: SupabaseClient; // service-role client
}

export async function postRun(ctx: PostRunContext): Promise<void> { ... }
```

### Discovery

`skill-loader.ts` grows a `loadPostRun(skillId)` function that `require()`s the co-located `.postRun.ts` if present, returns `null` if not. Result cached.

### Engine wiring

In `skills-engine.ts`, after `status === 'completed'` and the existing fire-and-forget `extractEntities`:

```ts
const postRun = await loadPostRun(skill.id);
if (postRun) {
  try {
    await postRun({ brandId, skillId: skill.id, runId, output, supabase });
    diagnostics.postRun = { status: 'ok' };
  } catch (err) {
    diagnostics.postRun = { status: 'failed', error: String(err) };
  }
}
```

`postRun` runs **before** the `skill_runs` insert so `diagnostics.postRun` is persisted on that row.

### Migration of existing hardcoded writes

Three current special-cases in `skills-engine.ts` (identified by audit):

1. `competitor-scan` (lines ~677–703) → `skills/diagnosis/competitor-scan.postRun.ts`
2. `competitor-creative-library` → `skills/diagnosis/competitor-creative-library.postRun.ts`
3. `image-brief` (lines ~595–640) → `skills/creative/image-brief.postRun.ts`

Each new file contains the logic lifted verbatim from skills-engine.ts. The `if (skill.id === ...)` blocks are deleted from skills-engine.ts.

### Non-goals

- **Not** migrating `brand-voice-extractor` (writes to `brand_guidelines` table), `campaign-launcher` (writes to `campaigns`), or `ad-performance-analyzer` (writes to `brand_metrics_history`). Those are table-specific writes, not KG writes — separate concern.

---

## Architecture Overview

```
┌────────────┐   1. skill run requested
│  runSkill  │◄──────────────────────────────┐
└─────┬──────┘                               │
      │                                      │
      ├─► RAG (try/catch → diagnostics.rag) │
      │                                      │
      ├─► LLM call (as today)               │
      │                                      │
      ├─► extractEntities (produces-enforced│
      │   → diagnostics.extract)            │
      │                                      │
      ├─► loadPostRun(skill.id)             │
      │   └─► if exists: call postRun(ctx) │
      │       → diagnostics.postRun         │
      │                                      │
      └─► insert skill_runs row             │
          (output, status, diagnostics) ─────┘
```

---

## Testing

**Unit:**
- `extractEntities` with `produces=[{node_type:'insight'}]` and LLM returns mix of `insight` + `unexpected` → only `insight` persisted, `unexpected_node_types=['unexpected']` in diagnostics.
- `loadPostRun` for a skill with `.postRun.ts` → returns function; for one without → returns `null`.
- Diagnostics shape: all four stages can be `ok`, `failed`, `skipped`, `partial` independently.

**Integration:**
- Simulate RAG failure (mock ragQuery to throw) → skill still completes, diagnostics.rag='failed'.
- Run a migrated skill (e.g. competitor-scan) post-migration → verify same `competitor_creative` nodes are created as before migration (regression test).

**Manual:**
- Run each of the 3 migrated skills against a test brand; compare `knowledge_nodes` before/after commit.
- Trigger a RAG failure (delete vector index temporarily) and watch banner appear.

---

## Rollout

1. Ship migration + diagnostics wiring (no behavior change).
2. Ship `produces` enforcement.
3. Ship `postRun` convention + migrate `image-brief` first (lowest risk — only touches ad creative nodes).
4. Migrate `competitor-scan`.
5. Migrate `competitor-creative-library`.

Each step is an independent PR. If any step regresses, roll back just that step.

---

## Out of Scope

- Platform-ops dashboard aggregating diagnostics across runs.
- Retry logic for RAG or extract failures.
- Widening extraction to handle more output shapes.
- Migrating non-KG hardcoded writes (`brand-voice-extractor` → `brand_guidelines`, etc.) — these are table-specific, not KG concerns.

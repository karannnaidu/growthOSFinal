# Mia-First Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded time-based agent scheduling with Mia as the single orchestrator — dynamic catalog, hybrid wakes, structured requests/watches, split communication lanes, full decision traces.

**Architecture:** New Supabase tables (`watches`, `mia_requests`, `mia_decisions`, `mia_digests`, `mia_events`) + new `src/lib/mia-*` services (catalog, watches, requests, wake, instant, digest) + new cron endpoints (heartbeat, digest, events-drain, watches-sweep) + skill frontmatter additions + deletion of `/api/cron/daily` and `/api/cron/weekly`.

**Tech Stack:** Next.js 16 (App Router) · Supabase (remote, CLI-linked to `GrowthOsFinal`) · TypeScript · `gray-matter` for skill frontmatter · `callModel()` abstraction over Gemini/Claude/Haiku · Vercel cron · no formal test framework — verification via `scripts/verify-*.ts` run with `npx tsx`.

**Spec:** `docs/superpowers/specs/2026-04-21-mia-first-orchestration-design.md` (commit `efa6fbbf`).

---

## Phase Map

Each phase produces a reviewable commit. Phases 1-13 are additive (old system still runs). Phase 14 is the cutover — legacy handlers deleted. Phase 15 is the smoke test.

| # | Phase | Goal | Key files |
|---|---|---|---|
| 1 | Database migration | All new tables + column additions applied to remote Supabase | `supabase/migrations/014-mia-first-orchestration.sql` · `scripts/verify-mia-first-schema.ts` |
| 2 | Skill frontmatter additions | All 57 skills have `side_effect`, `reversible`, `requires_human_approval`, `cost_credits`, `description_for_mia`, `description_for_user` | `skills/**/SKILL.md` · `scripts/verify-skill-frontmatter.ts` |
| 3 | Catalog generator | `getCatalog()` reads skills from disk, projects to catalog shape, applies context filter | `src/lib/mia-catalog.ts` · `scripts/verify-mia-catalog.ts` |
| 4 | Watches service | `createWatch()`, `evalOpenWatches()`, `expireWatches()` with 5 predicate types | `src/lib/mia-watches.ts` · `scripts/verify-mia-watches.ts` |
| 5 | Requests service + lifecycle | `promoteRequestsFromSkillOutput()`, `resolveRequestsForPlatformConnect()` | `src/lib/mia-requests.ts` · `scripts/verify-mia-requests.ts` |
| 6 | Wake cycle core | `runWake(brandId, source)` — the 7-step pipeline | `src/lib/mia-wake.ts` · `scripts/verify-mia-wake.ts` |
| 7 | Instant lane | Chat message writer with throttle/dedup + inline card rendering | `src/lib/mia-instant.ts` · `scripts/verify-mia-instant.ts` · UI updates in chat page |
| 8 | Digest composer | Daily rollup composer | `src/lib/mia-digest.ts` · `scripts/verify-mia-digest.ts` |
| 9 | Cron endpoints | `/api/cron/heartbeat`, `/api/cron/digest`, `/api/cron/watches-sweep`, `/api/cron/events-drain` | 4 route files + `vercel.json` |
| 10 | Event wake sources | Platform-connect hook, skill-delta detector, new-skill detector, user-chat event emission, webhook shim | modifications across existing code |
| 11 | Onboarding integration | `set-focus/route.ts` invokes wake cycle post-Scout | `src/app/api/onboarding/set-focus/route.ts` |
| 12 | CI fixtures | Brand-state fixtures + picker expectations runner | `tests/mia-picker/fixtures/*.json` · `tests/mia-picker/expectations.yaml` · `scripts/verify-mia-picker-fixtures.ts` |
| 13 | Dry-run mode | Per-brand `mia.execution_mode` flag respected in wake step 6 | modifications to wake + chain-processor |
| 14 | Legacy deletion | Delete `/api/cron/daily` + `/weekly` handlers, remove `vercel.json` entries, strip static agent list from `mia-manager/SKILL.md` | 3 file deletions + 2 edits |
| 15 | Smoke test | Dogfood brand 24h staging verification | runbook in `docs/superpowers/runbooks/mia-first-cutover.md` |

Each phase has its own fully-detailed plan file in this directory, created just before that phase executes. The in-flight phase plan is named `2026-04-21-mia-first-phase-NN-<name>.md`.

---

## Phase 1 — Database migration

**Files:**
- Create: `supabase/migrations/014-mia-first-orchestration.sql`
- Create: `scripts/verify-mia-first-schema.ts`

**Approach:** single idempotent migration file applied via `npx supabase db query --linked -f …`. Additive only — no drops, no data backfills. Verification script queries each new table exists and has expected columns.

### Task 1.1 — Write the migration SQL

- [ ] **Step 1: Create the migration file with all additive DDL**

File: `supabase/migrations/014-mia-first-orchestration.sql`

```sql
-- 014-mia-first-orchestration.sql
-- Mia becomes the single orchestrator: new tables for watches, requests,
-- decisions, digests, events; additive columns on skill_runs and chat_messages.
-- Idempotent: re-runs are safe.

-- ------------------------------------------------------------------
-- 1. watches  — Mia's deferred intent, machine-readable
-- ------------------------------------------------------------------
create table if not exists public.watches (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  trigger_type text not null,
  predicate jsonb not null,
  resume_action text not null,
  resume_context text,
  source_decision_id uuid,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  fired_at timestamptz,
  fired_predicate_eval jsonb
);

alter table public.watches drop constraint if exists watches_trigger_type_chk;
alter table public.watches
  add constraint watches_trigger_type_chk
  check (trigger_type in (
    'time_elapsed','data_accumulated','metric_crossed',
    'request_acted_on','skill_ran'
  ));

alter table public.watches drop constraint if exists watches_status_chk;
alter table public.watches
  add constraint watches_status_chk
  check (status in ('open','fired','expired','cancelled'));

create index if not exists watches_brand_status_idx
  on public.watches (brand_id, status);
create index if not exists watches_brand_open_expires_idx
  on public.watches (brand_id, expires_at) where status = 'open';

alter table public.watches enable row level security;
drop policy if exists "watches_brand_members" on public.watches;
create policy "watches_brand_members" on public.watches
  for all using (
    brand_id in (
      select brand_id from public.brand_members where user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------
-- 2. mia_requests — skill-emitted asks with lifecycle
-- ------------------------------------------------------------------
create table if not exists public.mia_requests (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  emitted_by_skill_run_id uuid,
  type text not null,
  payload jsonb not null,
  reason text not null,
  priority text not null default 'medium',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  valid_until timestamptz,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_payload jsonb
);

alter table public.mia_requests drop constraint if exists mia_requests_type_chk;
alter table public.mia_requests
  add constraint mia_requests_type_chk
  check (type in (
    'platform_connect','user_approval','data_needed',
    'info_needed','creative_review'
  ));

alter table public.mia_requests drop constraint if exists mia_requests_priority_chk;
alter table public.mia_requests
  add constraint mia_requests_priority_chk
  check (priority in ('low','medium','high','critical'));

alter table public.mia_requests drop constraint if exists mia_requests_status_chk;
alter table public.mia_requests
  add constraint mia_requests_status_chk
  check (status in ('open','acted_on','dismissed','expired'));

create index if not exists mia_requests_brand_open_idx
  on public.mia_requests (brand_id, status, priority);

alter table public.mia_requests enable row level security;
drop policy if exists "mia_requests_brand_members" on public.mia_requests;
create policy "mia_requests_brand_members" on public.mia_requests
  for all using (
    brand_id in (
      select brand_id from public.brand_members where user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------
-- 3. mia_decisions — full decision trace per wake
-- ------------------------------------------------------------------
create table if not exists public.mia_decisions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  wake_source text not null,
  triggered_at timestamptz not null default now(),
  context_snapshot jsonb not null,
  fired_watch_ids uuid[] not null default '{}',
  picked jsonb not null default '[]',
  considered jsonb not null default '[]',
  rejected jsonb not null default '[]',
  new_watches_created uuid[] not null default '{}',
  requests_resolved uuid[] not null default '{}',
  digest_lines jsonb not null default '[]',
  instant_messages jsonb not null default '[]',
  reasoning text,
  model_version text not null,
  prompt_version text not null,
  seed int,
  llm_cost_credits numeric,
  created_at timestamptz not null default now()
);

alter table public.mia_decisions drop constraint if exists mia_decisions_wake_source_chk;
alter table public.mia_decisions
  add constraint mia_decisions_wake_source_chk
  check (wake_source in (
    'heartbeat','event:platform_connect','event:skill_delta',
    'event:user_chat','event:new_skill','event:webhook','onboarding'
  ));

create index if not exists mia_decisions_brand_time_idx
  on public.mia_decisions (brand_id, triggered_at desc);

alter table public.mia_decisions enable row level security;
drop policy if exists "mia_decisions_brand_members" on public.mia_decisions;
create policy "mia_decisions_brand_members" on public.mia_decisions
  for all using (
    brand_id in (
      select brand_id from public.brand_members where user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------
-- 4. mia_digests — one daily rollup per brand-local date
-- ------------------------------------------------------------------
create table if not exists public.mia_digests (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  digest_date date not null,
  status text not null default 'accumulating',
  sections jsonb not null default '{}',
  posted_at timestamptz,
  channels_posted text[],
  source_decision_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.mia_digests drop constraint if exists mia_digests_status_chk;
alter table public.mia_digests
  add constraint mia_digests_status_chk
  check (status in ('accumulating','posted','skipped'));

alter table public.mia_digests drop constraint if exists mia_digests_brand_date_key;
alter table public.mia_digests
  add constraint mia_digests_brand_date_key unique (brand_id, digest_date);

create index if not exists mia_digests_brand_date_idx
  on public.mia_digests (brand_id, digest_date desc);

alter table public.mia_digests enable row level security;
drop policy if exists "mia_digests_brand_members" on public.mia_digests;
create policy "mia_digests_brand_members" on public.mia_digests
  for all using (
    brand_id in (
      select brand_id from public.brand_members where user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------
-- 5. mia_events — event-wake bus
-- ------------------------------------------------------------------
create table if not exists public.mia_events (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  processed boolean not null default false,
  processed_at timestamptz,
  triggered_wake_id uuid references public.mia_decisions(id),
  created_at timestamptz not null default now()
);

alter table public.mia_events drop constraint if exists mia_events_type_chk;
alter table public.mia_events
  add constraint mia_events_type_chk
  check (event_type in (
    'platform_connect','skill_delta','user_chat','new_skill','webhook'
  ));

create index if not exists mia_events_brand_unprocessed_idx
  on public.mia_events (brand_id, processed, created_at);

alter table public.mia_events enable row level security;
drop policy if exists "mia_events_brand_members" on public.mia_events;
create policy "mia_events_brand_members" on public.mia_events
  for all using (
    brand_id in (
      select brand_id from public.brand_members where user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------
-- 6. skill_runs — add requests_emitted column
-- ------------------------------------------------------------------
alter table public.skill_runs
  add column if not exists requests_emitted jsonb;

-- ------------------------------------------------------------------
-- 7. chat_messages — add author_kind, source_decision_id, inline card refs
-- ------------------------------------------------------------------
alter table public.chat_messages
  add column if not exists author_kind text;

alter table public.chat_messages drop constraint if exists chat_messages_author_kind_chk;
alter table public.chat_messages
  add constraint chat_messages_author_kind_chk
  check (author_kind is null or author_kind in (
    'user','mia_reactive','mia_proactive','mia_digest'
  ));

alter table public.chat_messages
  add column if not exists source_decision_id uuid
  references public.mia_decisions(id);

alter table public.chat_messages
  add column if not exists inline_request_ids uuid[];

alter table public.chat_messages
  add column if not exists inline_watch_ids uuid[];

-- ------------------------------------------------------------------
-- 8. Cross-reference FK for watches.source_decision_id
-- ------------------------------------------------------------------
-- Deferred until after mia_decisions exists (which it does above).
-- Add FK if not already present.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'watches_source_decision_id_fkey'
  ) then
    alter table public.watches
      add constraint watches_source_decision_id_fkey
      foreign key (source_decision_id) references public.mia_decisions(id);
  end if;
end $$;

-- ------------------------------------------------------------------
-- 9. mia_requests.emitted_by_skill_run_id FK
-- ------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mia_requests_emitted_by_skill_run_fkey'
  ) then
    alter table public.mia_requests
      add constraint mia_requests_emitted_by_skill_run_fkey
      foreign key (emitted_by_skill_run_id) references public.skill_runs(id);
  end if;
end $$;

comment on table public.watches is
  'Mia deferred intent. Heartbeat SQL-evals predicates; fired watches drive next wake planning.';
comment on table public.mia_requests is
  'Skill-emitted asks to the user with attribution + lifecycle (open/acted_on/dismissed/expired).';
comment on table public.mia_decisions is
  'Full decision trace per Mia wake. One row per wake. Source of truth for replay/audit.';
comment on table public.mia_digests is
  'Daily rollup — one per brand per date. Accumulates digest_lines from decisions, composer posts at 08:00 brand-local.';
comment on table public.mia_events is
  'Event-wake bus. Webhooks, deltas, chat messages, new-skill signals write here; drain cron consumes.';
```

- [ ] **Step 2: Commit the migration file (not yet applied)**

```bash
git add supabase/migrations/014-mia-first-orchestration.sql
git commit -m "feat(mia): add schema for watches, requests, decisions, digests, events

Idempotent additive migration. Five new tables plus columns on
skill_runs and chat_messages. RLS-enabled with brand_members scoping.
Not yet applied to remote — next task runs supabase db query."
```

### Task 1.2 — Apply the migration to remote Supabase

- [ ] **Step 1: Apply via Supabase CLI**

Run:
```bash
cd /c/Users/naidu/Downloads/GROWTH-OS/growth-os
npx supabase db query --linked -f supabase/migrations/014-mia-first-orchestration.sql
```

Expected: no errors. If a constraint already exists it gets dropped + recreated (that's fine). Note the command output.

- [ ] **Step 2: Spot-check each new table is registered**

Run:
```bash
npx supabase db query --linked "select to_regclass('public.watches'), to_regclass('public.mia_requests'), to_regclass('public.mia_decisions'), to_regclass('public.mia_digests'), to_regclass('public.mia_events');"
```

Expected: all five return their qualified names (not NULL).

- [ ] **Step 3: Verify new columns on existing tables**

Run:
```bash
npx supabase db query --linked "select column_name from information_schema.columns where table_schema='public' and table_name='skill_runs' and column_name='requests_emitted';"
```

Expected: one row returned — `requests_emitted`.

Run:
```bash
npx supabase db query --linked "select column_name from information_schema.columns where table_schema='public' and table_name='chat_messages' and column_name in ('author_kind','source_decision_id','inline_request_ids','inline_watch_ids') order by column_name;"
```

Expected: four rows — `author_kind`, `inline_request_ids`, `inline_watch_ids`, `source_decision_id`.

### Task 1.3 — Write schema verification script

- [ ] **Step 1: Create `scripts/verify-mia-first-schema.ts`**

File: `scripts/verify-mia-first-schema.ts`

```typescript
// Run: npx tsx scripts/verify-mia-first-schema.ts
// Verifies the 014 migration landed on remote Supabase:
//  - 5 new tables exist and are queryable
//  - Additive columns are present on skill_runs and chat_messages
// Exits non-zero on any failure.

import { createServiceClient } from '../src/lib/supabase/service'

type CheckResult = { name: string; ok: boolean; detail: string }

async function main() {
  const client = createServiceClient()
  const results: CheckResult[] = []

  const tables = [
    'watches',
    'mia_requests',
    'mia_decisions',
    'mia_digests',
    'mia_events',
  ]
  for (const t of tables) {
    const { error } = await client
      .from(t)
      .select('id', { count: 'exact', head: true })
    if (error) {
      results.push({ name: `table:${t}`, ok: false, detail: error.message })
    } else {
      results.push({ name: `table:${t}`, ok: true, detail: 'queryable' })
    }
  }

  const columnChecks: Array<{ table: string; column: string }> = [
    { table: 'skill_runs', column: 'requests_emitted' },
    { table: 'chat_messages', column: 'author_kind' },
    { table: 'chat_messages', column: 'source_decision_id' },
    { table: 'chat_messages', column: 'inline_request_ids' },
    { table: 'chat_messages', column: 'inline_watch_ids' },
  ]
  for (const { table, column } of columnChecks) {
    const { error } = await client.from(table).select(column).limit(0)
    if (error) {
      results.push({
        name: `col:${table}.${column}`,
        ok: false,
        detail: error.message,
      })
    } else {
      results.push({
        name: `col:${table}.${column}`,
        ok: true,
        detail: 'present',
      })
    }
  }

  let allOk = true
  for (const r of results) {
    const tag = r.ok ? 'OK  ' : 'FAIL'
    // eslint-disable-next-line no-console
    console.log(`[${tag}] ${r.name.padEnd(40)} ${r.detail}`)
    if (!r.ok) allOk = false
  }

  if (!allOk) {
    console.error('\nSchema verification FAILED.')
    process.exit(1)
  }
  console.log('\nSchema verification passed.')
}

main().catch((err) => {
  console.error('Verification crashed:', err)
  process.exit(2)
})
```

- [ ] **Step 2: Run the verification script**

Run:
```bash
cd /c/Users/naidu/Downloads/GROWTH-OS/growth-os
npx tsx scripts/verify-mia-first-schema.ts
```

Expected: all 10 checks pass (5 tables + 5 columns), final line "Schema verification passed."

- [ ] **Step 3: Commit the verification script**

```bash
git add scripts/verify-mia-first-schema.ts
git commit -m "feat(mia): add schema verification script for 014 migration

Runs head-count queries against all new tables and limit-0 selects
against new columns. Fails loudly with exit code 1 if anything is
missing. Run via: npx tsx scripts/verify-mia-first-schema.ts"
```

### Phase 1 acceptance

- [ ] Migration file committed
- [ ] Migration applied successfully to remote (no errors from `npx supabase db query`)
- [ ] All 5 new tables return their names from `to_regclass`
- [ ] All 5 new columns present in `information_schema.columns`
- [ ] `scripts/verify-mia-first-schema.ts` exits 0
- [ ] No existing table or column was dropped or altered destructively (only additive)

---

## Phases 2-15 — expansion happens just in time

Each subsequent phase gets its own plan file, created immediately before we start that phase. The phase file is named `2026-04-21-mia-first-phase-NN-<name>.md` and lives next to this master plan. This avoids speculative task detail that will drift, and keeps each execution run small and focused.

**Why this decomposition is safe for big-bang:** Phases 1-13 are additive — old system keeps running. Phase 14 (legacy deletion) is the atomic cutover. A revert of Phase 14 restores legacy behavior. Phase 15 (smoke test) happens on staging with the dogfood brand before production rolls forward.

**Spec mapping check** (each spec section has at least one phase that implements it):

| Spec section | Implementing phase(s) |
|---|---|
| Safety metadata on skills | 2 |
| Dynamic skill catalog | 3 |
| Hybrid wakes | 6, 9, 10 |
| Structured requests | 5, 10 |
| Watches | 4, 6 |
| Split lanes | 7, 8 |
| Decision trace + observability | 6, 11 (logging wired in 6; observability in 11 — see below) |
| Day-0 bootstrap | 11 |
| CI fixtures | 12 |
| Dry-run mode | 13 |
| Migration (deletion) | 14 |
| Smoke test | 15 |

**Note on observability (spec §Safety, observability, testing):** structured log emission is wired inline during Phase 6 (wake cycle core). Dashboard query helpers were called out as a separate deliverable in the spec; they fold into Phase 11 (onboarding integration) as part of that commit to avoid a standalone phase for three SELECT helpers.

---

## Execution model

After each phase:
1. Run the phase's verification script(s) — must exit 0.
2. Manual smoke in the app where applicable (e.g., Phase 7 renders inline cards — open Mia chat, confirm render).
3. Commit with the phase's prescribed message.
4. Write the next phase's plan file.
5. Proceed.

We execute Phase 1 now, in this session.

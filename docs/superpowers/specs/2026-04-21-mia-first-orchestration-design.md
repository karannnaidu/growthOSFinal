# Mia-First Orchestration — Design Spec

**Date:** 2026-04-21
**Status:** Draft for review
**Migration mode:** Big-bang (single deploy, no feature flag)

---

## Problem

The current Growth OS architecture claims Mia is the brain picking specialists, but the code hardcodes day-of-week and hour-of-day schedules for most agents (`/api/cron/daily` fires Scout/Navi/Max/Penny by clock; `/api/cron/weekly` fires Luna Mon, Hugo Tue, Atlas Wed, Echo Thu via a `switch` on `dayOfWeek()`). Mia's dynamic picker exists in `mia-orchestrator.ts` (post-flight auto-chain) and `api/mia/trigger` (user-button), but runs *alongside* the crons, not instead of them.

Three concrete failures this causes:

1. **First-time brand experience is thin.** `set-focus/route.ts` fires only Scout `health-check`. New brand sees a diagnosis and nothing actionable. No creatives, no unit economics, no persona work.
2. **Agents fire by clock, not by need.** Monday's email audit runs even if Luna's last audit was yesterday; Wednesday's Atlas persona refresh runs even if nothing changed.
3. **One-way communication.** Mia posts notifications; the user clicks through to act. Skills can't surface "I'd do better with Google Ads connected" because the only machinery for blockers is pre-flight `requires[]` — there's no post-run ask mechanism. Mia's skill knowledge is a hand-written system prompt (`skills/ops/mia-manager/SKILL.md`) that's already drifted from the actual skill inventory on disk.

## Goal

Make Mia the single orchestrator. Her wake cycle produces every dispatch. Time-based crons are replaced by a heartbeat-plus-events model. Skills communicate with Mia via structured requests. Mia communicates with the user via two throttled lanes (instant + daily digest). All decisions are traced and replayable.

## Non-goals

- Changing the individual skill implementations or outputs.
- Redesigning the agent roster (still 12 agents).
- Replacing the existing `chain-processor` queue — it remains the executor; Mia is the decider.
- Building new LLM-vendor abstractions — reuse `callModel()`.
- User-facing UI rewrites beyond rendering inline action cards in Mia chat.

---

## Architecture overview

Six pillars:

1. **Safety metadata on every skill** — `side_effect · reversible · requires_human_approval · cost_credits`. Day-0 (and any bounded context) is a filter expression over this metadata, not a hand-curated allowlist.
2. **Dynamic skill catalog** — Mia's available toolset is generated from disk at wake time from `description_for_mia` frontmatter. Adding a skill = instant Mia awareness with no hand-edit of the system prompt. Solves scenario (b): "Mia should know about a newly launched skill."
3. **Hybrid wakes** — 4x/day brand-local heartbeat (floor, guarantees checks) + 5 event triggers (platform_connect, skill_delta, user_chat, new_skill, webhook; ceiling, responds to real signals). Internal wakes do not produce user-facing messages on their own.
4. **Structured requests & watches** — skills emit `requests[]` in their output (ask-user cards with attribution and lifecycle); Mia creates `watches[]` (machine-readable deferred intent with finite predicate types). Both are the source of truth for their respective user-facing surfaces.
5. **Split lanes** — *instant* (blockers, user chats, security, ask-user cards, deferred-decision notices, pending approvals) and *digest* (1x/day, always posts even when verdict is no-op, with explicit reasoning). Scenario (c) requirement: "self-trigger 4x/day but report 1x/day."
6. **Decision trace** — every wake stores `MiaDecision` with `picked / considered / rejected / reasoning / model_version / prompt_version / seed / llm_cost_credits`. Auditable non-determinism. CI fixtures assert picker behavior per brand-state scenario.

### Flow

```
                            ┌────────────────────────────┐
                            │         WAKE SOURCES       │
                            │  • 4x/day heartbeat cron   │
                            │  • platform connect hook   │
                            │  • skill completes w/delta │
                            │  • user chat message       │
                            │  • new skill on disk       │
                            │  • external webhook        │
                            │  • onboarding (Day 0)      │
                            └───────────────┬────────────┘
                                            │
                                            ▼
   ┌────────────────────────────────────────────────────────────────┐
   │                      MIA WAKE CYCLE                            │
   │                                                                │
   │   1. Resolve wake_source                                       │
   │   2. Gather context                                            │
   │      brand profile · connected platforms · brand_kg            │
   │      mia_memory · open watches · open requests                 │
   │      skill_runs since last wake · unprocessed mia_events       │
   │   3. Eval watches (SQL, no LLM)                                │
   │   4. Build catalog from disk                                   │
   │      apply context filter                                      │
   │   5. LLM plan (Gemini Flash, low temp, seeded)                 │
   │      → MiaDecision                                             │
   │   6. Persist + dispatch                                        │
   │      insert mia_decisions, new_watches, instant_messages       │
   │      enqueue picked[] → chain-processor                        │
   │   7. Async fan-out                                             │
   │      skills run, emit requests_emitted[] → mia_requests        │
   │      significant deltas → mia_events (skill_delta)             │
   └────────────────────────────────────────────────────────────────┘
                                            │
                                            ▼
   ┌────────────────────────────────────────────────────────────────┐
   │     DIGEST COMPOSER (separate cron, 08:00 brand-local)         │
   │     reads mia_decisions since last digest                      │
   │     composes mia_digests row → chat message + push channels    │
   │     always posts, even when verdict is "no-op, watching X"     │
   └────────────────────────────────────────────────────────────────┘
```

---

## Data model

### Skill frontmatter additions (on-disk, every skill in `skills/`)

```yaml
side_effect: none | external_write | spend | send
reversible: true | false
requires_human_approval: true | false
cost_credits: <int>
description_for_mia: >                # contract: when to pick, preconditions, output shape
description_for_user: >               # human-friendly, shown in UI
# existing: id, agent, requires[], chains_to[], mcp_tools[]
```

A CI lint rule enforces all six new fields are non-empty.

### Supabase tables (all `brand_id` scoped, RLS-ready)

**`watches`** — Mia's deferred intent, machine-readable.

```sql
create table if not exists watches (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  trigger_type text not null check (trigger_type in (
    'time_elapsed','data_accumulated','metric_crossed',
    'request_acted_on','skill_ran'
  )),
  predicate jsonb not null,
  resume_action text not null,
  resume_context text,
  source_decision_id uuid,
  status text not null default 'open' check (status in (
    'open','fired','expired','cancelled'
  )),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  fired_at timestamptz,
  fired_predicate_eval jsonb
);
create index if not exists watches_brand_status_idx on watches (brand_id, status);
create index if not exists watches_brand_open_expires_idx on watches (brand_id, expires_at)
  where status = 'open';
```

Predicate shapes by `trigger_type`:
- `time_elapsed`: `{"days": 4}` or `{"at_iso": "2026-04-25T06:00Z"}`
- `data_accumulated`: `{"skill": "ad-performance-analyzer", "min_rows": 30}`
- `metric_crossed`: `{"metric": "roas", "op": ">", "value": 3.0, "window_days": 7}`
- `request_acted_on`: `{"request_id": "..."}`
- `skill_ran`: `{"skill_id": "ad-performance-analyzer", "since_last": true}`

Heartbeat evaluates open watches in SQL. LLM is only invoked when a watch fires (step 5) to decide the `resume_action` path.

**`mia_requests`** — skill-emitted asks to the user, with attribution + lifecycle.

```sql
create table if not exists mia_requests (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  emitted_by_skill_run_id uuid references skill_runs(id),
  type text not null check (type in (
    'platform_connect','user_approval','data_needed',
    'info_needed','creative_review'
  )),
  payload jsonb not null,
  reason text not null,
  priority text not null default 'medium' check (priority in (
    'low','medium','high','critical'
  )),
  status text not null default 'open' check (status in (
    'open','acted_on','dismissed','expired'
  )),
  created_at timestamptz not null default now(),
  valid_until timestamptz,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_payload jsonb
);
create index if not exists mia_requests_brand_open_idx
  on mia_requests (brand_id, status, priority);
```

Payload shape by `type`:
- `platform_connect`: `{"platform": "google_ads", "scopes": [...]}`
- `user_approval`: `{"action": "scale_meta_budget", "from": 40, "to": 60, "currency": "USD"}`
- `data_needed`: `{"kind": "wholesale_margin", "format": "decimal_percent"}`
- `info_needed`: `{"question": "UGC style preference?", "options": ["testimonial", "unboxing", "how-to"]}`
- `creative_review`: `{"creative_ids": [...], "action": "approve_for_launch"}`

Lifecycle events:
- Skill output includes `requests_emitted[]` → chain-processor promotes to `mia_requests` with `status='open'`.
- User action (e.g., connects Google Ads via the platform page) → background hook closes all matching `platform_connect` requests for google_ads as `acted_on`.
- `valid_until` elapsed → scheduled task marks `expired`.

**`mia_decisions`** — full decision trace per wake. Replaces legacy `knowledge_nodes.node_type='mia_decision'` usage.

```sql
create table if not exists mia_decisions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  wake_source text not null check (wake_source in (
    'heartbeat','event:platform_connect','event:skill_delta',
    'event:user_chat','event:new_skill','event:webhook','onboarding'
  )),
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
create index if not exists mia_decisions_brand_time_idx
  on mia_decisions (brand_id, triggered_at desc);
```

**`mia_digests`** — daily rollup, one per brand-local date.

```sql
create table if not exists mia_digests (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  digest_date date not null,
  status text not null default 'accumulating' check (status in (
    'accumulating','posted','skipped'
  )),
  sections jsonb not null default '{}',
  posted_at timestamptz,
  channels_posted text[],
  source_decision_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (brand_id, digest_date)
);
create index if not exists mia_digests_brand_date_idx
  on mia_digests (brand_id, digest_date desc);
```

`sections` shape:

```json
{
  "header": "Ran 4 skills. 2 asks open. Watching 3 things.",
  "insights": [{"text": "...", "source_skill_run_id": "..."}],
  "auto_completed": [{"text": "...", "artifact_ids": [...]}],
  "open_requests": [{"request_id": "...", "summary": "..."}],
  "watches_open": [{"watch_id": "...", "summary": "..."}],
  "reasoning": "Held creatives today — waiting on Max to hit 4-day baseline (ETA Thu). Ran Echo competitor scan instead.",
  "next_check": "12:00 PT"
}
```

**`mia_events`** — event-wake bus.

```sql
create table if not exists mia_events (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  event_type text not null check (event_type in (
    'platform_connect','skill_delta','user_chat','new_skill','webhook'
  )),
  payload jsonb not null,
  processed boolean not null default false,
  processed_at timestamptz,
  triggered_wake_id uuid references mia_decisions(id),
  created_at timestamptz not null default now()
);
create index if not exists mia_events_brand_unprocessed_idx
  on mia_events (brand_id, processed, created_at);
```

### Modifications to existing tables

**`skill_runs`** — add:

```sql
alter table skill_runs add column if not exists requests_emitted jsonb;
```

Skills write their `requests[]` here at completion. Chain-processor reads and promotes to `mia_requests`.

**`chat_messages`** (existing Mia chat storage) — add:

```sql
alter table chat_messages add column if not exists author_kind text
  check (author_kind in ('user','mia_reactive','mia_proactive','mia_digest'));
alter table chat_messages add column if not exists source_decision_id uuid
  references mia_decisions(id);
alter table chat_messages add column if not exists inline_request_ids uuid[];
alter table chat_messages add column if not exists inline_watch_ids uuid[];
```

`author_kind` distinguishes user turns, Mia replying to user (existing behavior), Mia initiating a turn from a wake (new), and Mia posting the daily digest (new). UI renders inline cards from `inline_request_ids` and `inline_watch_ids`.

**`notifications`** — kept as-is. Used for unread badges and routing metadata only; content lives in `chat_messages`.

---

## The wake cycle

Every wake runs the same 7-step pipeline.

### Step 1 — Resolve wake_source

- `heartbeat`: fired by `/api/cron/heartbeat`. Runs every 15min, scans brands whose local time matches one of {06, 12, 18, 00}, respects per-brand debounce.
- `event:<type>`: fired when a row in `mia_events` with `processed=false` exists for a brand. Also respects debounce.
- `onboarding`: fired synchronously from `set-focus/route.ts`.

**Debounce:** max 1 wake per brand per 60s. During debounce, events queue into `mia_events` and the next allowed wake drains them.

### Step 2 — Gather context

Snapshot:
- brand profile + connected platforms + `brand_kg` (knowledge graph)
- `mia_memory` (preferences, decisions, avoid — existing)
- open `watches` (before predicate eval)
- open `mia_requests`
- `skill_runs` since the previous wake (source of "what changed")
- unprocessed `mia_events` for this brand (consumed here; marked `processed=true` at the end of the wake)

Saved to `mia_decisions.context_snapshot`.

### Step 3 — Evaluate watches (SQL, no LLM)

For each open watch, code evaluates `predicate` against current state. Examples:

- `time_elapsed {"days": 4}` with `created_at = 2026-04-17` and now = `2026-04-21` → fires.
- `data_accumulated {"skill": "ad-performance-analyzer", "min_rows": 30}` → runs `select count(*) from ad_performance_rows where brand_id=? and created_at > watch.created_at >= 30`.
- `metric_crossed {"metric": "roas", "op": ">", "value": 3.0, "window_days": 7}` → query aggregated metric, compare.
- `request_acted_on {"request_id": "..."}` → SELECT status from mia_requests.

Fired watches are appended to the planning input. Their IDs captured in `mia_decisions.fired_watch_ids`. Watches past `expires_at` are marked `expired` (separate cron sweep).

### Step 4 — Build catalog

Read `skills/` from disk. Project each skill to:

```json
{
  "id": "ad-copy",
  "agent": "aria",
  "description_for_mia": "...",
  "side_effect": "external_write",
  "reversible": true,
  "requires_human_approval": false,
  "requires": ["brand_dna"],
  "chains_to": ["image-brief"],
  "cost_credits": 3,
  "expected_output": "3-5 ad copy variants with hook/body/CTA structure"
}
```

Apply context filter:
- `onboarding` → `side_effect IN (none, external_write) AND requires_human_approval = false`
- `heartbeat` / `event:*` → full catalog (skills with `requires_human_approval = true` route through pending approvals in step 6 rather than auto-dispatching)

### Step 5 — LLM plan

One Gemini Flash call, `temperature=0.2`, seeded (`seed = hash(brand_id, triggered_at_minute)` for reproducibility within a minute).

System prompt: templated `mia-manager/SKILL.md` — stops listing agents; instead references the injected catalog and describes decision framework.

User prompt includes: context snapshot · catalog (filtered) · fired watches · open requests.

Response schema:

```typescript
interface MiaDecision {
  picked: Array<{skill_id: string; reason: string; expected_cost: number; chains_to_queue?: string[]}>
  considered: Array<{skill_id: string; evaluated: true}>
  rejected: Array<{skill_id: string; reason: string}>
  new_watches: Array<{trigger_type: string; predicate: object; resume_action: string; resume_context: string; expires_at?: string}>
  resolve_requests: Array<{request_id: string; resolution: 'acted_on' | 'dismissed' | 'expired'}>
  digest_lines: Array<{section: 'insights' | 'auto_completed' | 'open_requests' | 'watches_open' | 'reasoning'; text: string; priority?: number}>
  instant_messages: Array<{priority: 'low' | 'medium' | 'high' | 'critical'; title: string; body: string; inline_request_ids?: string[]; inline_watch_ids?: string[]}>
  reasoning: string              // required, non-empty
}
```

Validation: `reasoning` must be non-empty; `picked[].skill_id` must exist in the filtered catalog; malformed response → fallback to "no-op, watches unchanged, reasoning='LLM output malformed, investigating'".

### Step 6 — Persist + dispatch

Transactional:
- insert `mia_decisions` row
- insert `new_watches` into `watches` (capture IDs into `mia_decisions.new_watches_created`)
- update `resolve_requests[]` to their new statuses (capture IDs into `mia_decisions.requests_resolved`)
- write `instant_messages[]` to `chat_messages` (one row each, `author_kind='mia_proactive'`, `source_decision_id` set)
- append `digest_lines[]` to today's `mia_digests` row (upsert by `(brand_id, digest_date)`, `status='accumulating'`)
- enqueue `picked[]` to the existing chain-processor by appending to the `pending_chain` array of a new `knowledge_nodes` row with `node_type='mia_decision'` (unchanged queueing mechanism — this spec reuses the existing successor pattern as-is)

Instant-lane throttle: max 1 message per brand per 60s. If this wake produces multiple instant messages, they're grouped into a single `chat_messages` row with the union of `inline_request_ids` / `inline_watch_ids`.

### Step 7 — Async fan-out

Chain-processor (existing, every 5min) picks up queued skills. After each skill run:

- parse `skill_runs.requests_emitted` → promote to `mia_requests` (open, `emitted_by_skill_run_id` set)
- compute "delta significance" — if configurable thresholds are crossed (e.g., ROAS swing > 15%, new anomaly found), insert `mia_events` row with `event_type='skill_delta'` → triggers next wake

Skills themselves remain unchanged in their internal logic. Only their output contract extends to include `requests_emitted`.

### Day 0 variant

`set-focus/route.ts` modified:

1. Existing: `initializeBrandAgents(brandId, focusAreas)` — keep.
2. Existing: run Scout `health-check` synchronously — keep.
3. New: post "Scout found X" instant message to chat.
4. New: invoke wake cycle with `wake_source='onboarding'`. Context includes Scout's fresh output.
5. Wake picks (typically) `[ad-copy, image-brief, persona-builder, unit-economics, ...]` — all filtered to safe side-effects, no campaign-launcher, no send.
6. Chain-processor runs them in ~minutes. On completion, a second instant message summarizes.
7. First digest posts the following morning at brand-local 08:00.

No campaigns launched on Day 0. No emails sent. No spend. But the brand sees actual output within minutes: creative drafts, persona, unit economics framework. Fixes the "Day 0 is thin" complaint.

### First-heartbeat-of-day invariant

Scout `health-check` hardcoded to run synchronously before step 4, only on the 06:00 brand-local heartbeat and on onboarding. Other heartbeats rely on Mia's planning to re-run Scout if a watch requires it.

---

## Communication lanes

### Instant lane

| Signal | Source | Dedup window | Notes |
|---|---|---|---|
| Hard blocker | pre-flight `requires[]` fails on required skill | per (brand, platform, 24h) | "Can't run Max — Meta disconnected" |
| User-chat reply needed | Mia posts a question, awaits answer | none | thread root |
| Security / billing | account event | none | bypasses throttle |
| Ask-user card | `mia_request` opened | per (brand, type, payload-hash, 7d) | inline button; auto-closes on user action |
| Deferred-decision notice | `watch` created | per watch (one notice at creation) | "Holding X until Y because Z" |
| Pending approval | chain cost > gate OR skill `requires_human_approval=true` | per (brand, skill_run, action) | approve/reject inline |

Throttle: max 1 instant message per brand per 60s. Overflow merges into a single grouped message.

Channel routing: chat always; WhatsApp if `priority >= high` and opted in; email opt-in respected.

### Digest lane

One message per brand per day, posted at 08:00 brand-local by the digest composer cron.

Sections:

```
header             one-line summary
insights           ranked skill findings (top 5)
auto_completed     what Mia did without asking (top 8, overflow → activity log)
open_requests      unresolved mia_requests summary
watches_open       active deferred decisions with ETAs
reasoning          required, narrative — explains silence where it held back
next_check         time of next heartbeat
```

Composition rule: each `mia_decisions.digest_lines[]` item is tagged with `section`. Composer buckets by section, sorts by priority within section, dedups by content-hash, caps per section. `reasoning` is a concatenation + LLM-polish of reasoning fields from all source decisions.

**Always posts**, even with zero activity. If no wakes occurred (system error), a stub digest still posts: *"Mia didn't wake today — system issue, on-call notified."*

Channel routing: chat always; WhatsApp and email opt-in.

---

## Safety, observability, testing

### Decision trace

Every wake writes one `mia_decisions` row. Query patterns supported:

```sql
-- Why did Mia do X on 2026-04-21 morning?
select reasoning, picked, rejected, model_version, prompt_version, seed
from mia_decisions
where brand_id = ? and triggered_at::date = '2026-04-21'
order by triggered_at;

-- Replay: same prompt_version + seed + input → same output shape
-- (temperature > 0, so not bit-exact; but picked/rejected sets are stable)
```

### Prompt versioning

`skills/ops/mia-manager/SKILL.md` becomes a template. `prompt_version` = git SHA of the file at render time. Any edit bumps version automatically. Stored in `mia_decisions.prompt_version`.

### CI fixtures

```
tests/mia-picker/
├── fixtures/
│   ├── new-brand-meta-only.json
│   ├── brand-with-max-baseline-ready.json
│   ├── brand-with-unconnected-gads.json
│   ├── brand-after-platform-connect.json
│   └── ...
└── expectations.yaml
```

Example expectations:

```yaml
- fixture: new-brand-meta-only
  wake_source: onboarding
  must_pick_any_of: [ad-copy, image-brief, unit-economics, persona-builder]
  must_not_pick: [campaign-launcher, abandoned-cart-recovery]
  reasoning_must_mention: [brand dna, no campaign data]

- fixture: brand-with-max-baseline-ready
  wake_source: event:skill_delta
  must_fire_watch_ids: [watch-max-baseline-4d]
  must_pick_any_of: [ad-copy, creative-fatigue-detector]

- fixture: brand-after-platform-connect
  wake_source: event:platform_connect
  must_resolve_requests_of_type: [platform_connect]
  must_pick_any_of: [gads-campaign-launcher]  # hypothetical new skill
```

Runs on every PR touching `skills/`, the catalog builder, or the picker prompt.

### Guardrails (existing, extended)

- chain depth ≤ 5
- daily credits ≤ 50 per brand
- hourly runs ≤ 20 per brand
- wallet balance > 0
- cost gate: projected run > 10 credits → routes to instant-lane approval
- **NEW:** any skill with `side_effect IN (spend, send)` AND `requires_human_approval=true` → never auto-runs; always routes to approval card

### Dry-run mode

Per-brand setting: `mia.execution_mode = 'live' | 'dry_run'`. In dry-run, steps 1-5 still happen + decision persisted, but step 6 dispatch is skipped; instant messages posted as `[DRY RUN] Would have dispatched: X, Y, Z`. Useful for debugging without uninstalling.

### Observability

Emitted from each wake:

```
mia.wake.started    {brand_id, wake_source, context_size_bytes}
mia.wake.llm        {model_version, prompt_version, tokens_in, tokens_out, cost_credits}
mia.wake.decided    {picked_count, considered_count, rejected_count,
                     new_watches, resolved_requests}
mia.wake.dispatched {skill_ids, queued_ms}
mia.watch.fired     {watch_id, trigger_type, predicate_eval}
mia.request.opened  {request_id, type, priority, emitted_by_skill_run_id}
mia.request.closed  {request_id, status, time_open_s}
mia.digest.posted   {brand_id, digest_date, section_counts, channels}
```

---

## Migration (big-bang)

All changes ship in one deployment. Additive first, cleanup last, in this order within the deploy:

1. **Supabase migration** — idempotent `create table if not exists` / `add column if not exists` for all new tables and column additions. Applied via `npx supabase db query --linked -f supabase/migrations/NNN-mia-first.sql`.
2. **Skill frontmatter pass** — add `side_effect`, `reversible`, `requires_human_approval`, `cost_credits`, `description_for_mia`, `description_for_user` to all 57 skill files. Lint rule enforces non-empty on future PRs.
3. **Catalog generator + picker rewrite** — new `src/lib/mia-catalog.ts`, updated `src/lib/mia-orchestrator.ts`, rewritten `src/app/api/mia/trigger/route.ts`. `mia-manager/SKILL.md` templated (stops listing agents).
4. **Watches + requests services** — new `src/lib/mia-watches.ts` (predicate eval, create/fire/expire) and `src/lib/mia-requests.ts` (promote from skill output, lifecycle, auto-close on platform connect). Platform-connect webhook extended to call the auto-close.
5. **Lane composition** — new `src/lib/mia-digest.ts` (composer) and `src/lib/mia-instant.ts` (writer + throttle + dedup). Chat UI extended to render inline request and watch cards by ID.
6. **Cron changes in `vercel.json`:**
   - Remove: `/api/cron/daily`, `/api/cron/weekly`
   - Keep: `/api/cron/chain-processor`, `/api/cron/backfill-embeddings`, `/api/cron/agency-patterns`, `/api/cron/campaign-optimizer`
   - Add: `/api/cron/heartbeat` at `*/15 * * * *` (scans brands whose local time matches a heartbeat hour, respecting debounce)
   - Add: `/api/cron/digest` at `*/15 * * * *` (scans brands whose local 08:00 just passed)
   - Add: `/api/cron/watches-sweep` at `0 */6 * * *` (expires watches past `expires_at`)
7. **Event wake endpoints** — webhook handlers write to `mia_events`; a drain cron at `* * * * *` (Vercel's 1-minute minimum) consumes unprocessed events per brand, respecting the 60s-per-brand debounce. Add `/api/cron/events-drain` to `vercel.json`.
8. **Delete legacy handlers** — remove `src/app/api/cron/daily/route.ts`, `src/app/api/cron/weekly/route.ts`, day-of-week switch logic, static agent list in `mia-manager/SKILL.md`.
9. **CI fixtures shipped with the catalog rewrite** — PR blocked if fixtures fail.

### Rollback

A single `git revert` of the deploy commit restores legacy behavior because:
- new tables aren't required by any pre-existing code path (purely additive reads)
- deleted cron handlers restore from the revert
- skill frontmatter additions are additive; legacy code ignored unknown fields
- data cleanup (empty new tables) can run post-revert at leisure

### Pre-prod smoke

One dogfood brand on staging for 24h before production cutover:
- verify full wake cycle across at least one 06 / 12 / 18 / 00 brand-local transition
- verify digest posts at 08:00
- verify one synthetic `mia_request` round-trips to `acted_on` via platform connect
- verify dry-run mode produces the expected "[DRY RUN]" chat messages without dispatch
- verify CI fixtures pass

---

## Open questions / follow-ups (out of scope for this spec)

- How the new skill `chains_to` metadata interacts with the existing auto-chain cost gate when Mia's plan includes explicit chains (probable answer: gate stays as-is; `picked[]` is pre-approved, `chains_to[]` triggered downstream still goes through the gate).
- UI design for the Mia inbox (instant vs digest tabs, action cards). This spec assumes the existing chat UI extends; visual design is a follow-up.
- Internationalization of digest text. Heartbeat math uses brand-local time zone; digest language is English v1.
- WhatsApp delivery integration (provider, templates, opt-in flow). Stubbed as "opt-in respected" in this spec; implementation plan will decide.
- Webhook registry (which external webhooks are first-class event sources). Initial v1 focuses on the platform-connect hook; others follow.

---

## Appendix — What gets deleted in this spec

- `src/app/api/cron/daily/route.ts` — entire file
- `src/app/api/cron/weekly/route.ts` — entire file
- Day-of-week switch logic in any remaining cron code
- The hand-maintained agent / skill list in `skills/ops/mia-manager/SKILL.md` (replaced by templated catalog injection)
- `vercel.json` entries for `/api/cron/daily` and `/api/cron/weekly`

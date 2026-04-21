# Campaigns × Max Integration — Design Spec

**Date:** 2026-04-21
**Status:** Draft → pending user review
**Owner:** karan

## Problem

Today's `/dashboard/campaigns/new` wizard runs a 7-step flow that only invokes **Aria** (`ad-copy`, `image-brief`) and **Atlas** (`persona-creative-review`). The POST to `/api/campaigns/launch` then invokes Max's `campaign-launcher` — a pure execution skill with no MCP tools and no checks.

Result: Max is a button-presser, not a media buyer. The wizard does **zero** pre-flight:

- No `pixel-capi-health` check → user can launch into an account where Purchase events aren't firing. Spend happens, nothing reports back.
- No `asc-readiness-audit` → user can pick a budget below Meta's 50-event/week threshold and never exit learning.
- No `account-structure-audit` → user can compound existing fragmentation without warning.
- No `learning-phase-monitor` → existing stuck ad sets aren't flagged.
- No `budget-allocation` → user-entered budget is never sanity-checked.
- **Audience targeting is hardcoded** to `{ countries: ['IN'], age 18–65 }`. Max's targeting brain and the brand's Brand DNA + Knowledge Graph are ignored entirely.

Separately, the chat surface at `/dashboard/mia` has no recognized launch-intent path — users who want to "just launch a Diwali campaign at ₹2k/day" have to context-switch to the wizard.

## Goal

Close both gaps with a single shared skill chain, exposed through two surfaces:

- **Track B — Smart Wizard:** keep the existing wizard, inject Max's pre-flight checks (async, non-blocking UX) and an audience-targeting step sourced from Brand DNA + KG + Meta history.
- **Track C — Chat-Led Launch:** Mia parses launch intent in chat, hands off to Max in-thread, Max walks the user through pre-flight → substantive plan card → images → launch in 3–4 turns.

Both tracks invoke the same backend chain.

## Non-goals

- Google Ads / TikTok Ads launch flows (out of scope; Meta only).
- Replacing `campaign-launcher` (stays unchanged — it's already the correct pure-execution skill).
- Creative generation changes (Aria's `ad-copy` and `image-brief` are unchanged).
- Historical campaign editing / optimization (that's `campaign-optimizer`'s lane).

## Architecture

```
[brand selected]
        │
        ▼
  preflight-orchestrator (library: src/lib/preflight.ts)
  ├─ pixel-capi-health        (Max, parallel)
  ├─ asc-readiness-audit      (Max, parallel)
  ├─ account-structure-audit  (Max, parallel)
  └─ learning-phase-monitor   (Max, parallel)
  → { verdict, warnings, details, cached_at }
        │
        ▼
  audience-targeting (NEW Max skill)
  Reads: brand_dna + KG (audience, persona, insight, region) + meta.breakdowns if connected
  Produces: 1–3 audience tiers with rationale
        │
        ▼
  ad-copy (Aria) → persona-creative-review (Atlas) → image-brief (Aria) → fal.ai images → campaign-launcher (Max, unchanged)
```

**Surfaces:**
- **Track B (wizard):** `/dashboard/campaigns/new` — 8 steps (existing 7 + audience inserted at step 5; pre-flight runs async in background on brand select).
- **Track C (chat):** `/dashboard/campaigns` "New Campaign" button routes to `/dashboard/mia?intent=launch&brand=<id>`. Mia auto-sends a system message into the thread, invokes preflight, hands the user to Max.

## Skill & file inventory

### New
- `skills/optimization/audience-targeting.md` — Max skill. Fuses Brand DNA + KG + Meta breakdowns into 1–3 tiers.
- `src/lib/preflight.ts` — library orchestrator. Not a skill; internal plumbing.
- `src/app/api/mia/launch-intent/route.ts` — POST endpoint that preflight-checks and dispatches Max's launch-conversation flow.
- `skills/acquisition/launch-conversation.md` — lightweight Max orchestrator skill that drives the chat-led flow turn-by-turn.
- `supabase/migrations/NNN-preflight-results.sql` — new table for preflight cache.
- `src/components/campaigns/PreflightBanner.tsx` — banner component for wizard (checking / ready / warning / blocked states).
- `src/components/campaigns/AudienceStep.tsx` — wizard step 5 UI (tier cards, editable chips, "ask Max to re-propose").
- `src/components/mia/MaxHandoffCard.tsx` — chat card rendered when Mia hands off to Max.
- `src/components/mia/MaxBundleCard.tsx` — chat card containing audience + copy variants + image brief + approval CTA.

### Modified
- `src/app/dashboard/campaigns/new/page.tsx` — 8-step flow; kicks off preflight on brand select; banner; new audience step.
- `src/app/dashboard/campaigns/page.tsx` — "New Campaign" button routes to `/dashboard/mia?intent=launch&brand=...` (C option from Q7).
- `src/app/api/campaigns/launch/route.ts` — accept optional `preflightResultId` and include it in `additionalContext` so `campaign-launcher` has visibility into what was checked.
- `src/app/dashboard/mia/page.tsx` / Mia chat route — recognize `?intent=launch` search param, auto-dispatch Mia intent parser.
- `src/app/api/mia/chat/route.ts` — add launch-intent branch that calls `runPreflight` and invokes `launch-conversation` skill.
- `skills/agents.json` — register `audience-targeting` and `launch-conversation` under Max.

### Unchanged
- `campaign-launcher`, `pixel-capi-health`, `asc-readiness-audit`, `account-structure-audit`, `learning-phase-monitor`, `ad-copy`, `persona-creative-review`, `image-brief`.

## Pre-flight orchestrator — `src/lib/preflight.ts`

**Public API:**
```typescript
export interface PreflightWarning {
  skill: string
  severity: 'info' | 'warning' | 'high'
  message: string
  fix_skill?: string
}

export interface PreflightDetails {
  pixel: unknown | null          // pixel-capi-health output, null if errored
  asc: unknown | null            // asc-readiness-audit output
  structure: unknown | null      // account-structure-audit output
  learning: unknown | null       // learning-phase-monitor output
}

export interface PreflightResult {
  brand_id: string
  verdict: 'ready' | 'warning' | 'blocked'
  blocked_reason: string | null
  warnings: PreflightWarning[]
  details: PreflightDetails
  cached_at: string
  stale: boolean
}

export async function runPreflight(
  brandId: string,
  opts?: { force?: boolean },
): Promise<PreflightResult>
```

**Implementation steps:**
1. Unless `opts.force`, read `preflight_results` where `brand_id = $1 AND cached_at > now() - interval '15 minutes'`. If hit, return with `stale: false`.
2. Check Meta connection via `getPlatformStatus(brandId)`. If `meta` is false, short-circuit to `{ verdict: 'blocked', blocked_reason: 'Connect Meta to launch campaigns.' }` and upsert. Skip skill invocations.
3. Otherwise, invoke four skills in parallel via `runSkill({ brandId, skillId, triggeredBy: 'preflight' })`.
4. Extract `critical_findings` and severity from each skill's output. Collect into `warnings`.
5. Compute verdict:
   - `blocked` if `details.pixel?.checks?.pixel_capi?.status === 'blocked'`.
   - `warning` if any skill returned at least one `high` or `warning` severity finding.
   - `ready` otherwise.
6. Upsert row into `preflight_results`.
7. Return.

**Error handling:** each skill invocation is wrapped in try/catch. Skill errors result in `details.<skill> = null` and a single warning "Couldn't verify <skill>". They do **not** cause blocked verdict. Blocked is reserved for confirmed `pixel_capi.status === 'blocked'` or missing Meta connection.

**Why not a skill:** a skill invocation creates a `skill_runs` row, a Mia decision, and potentially chains. That's the wrong shape for a background check fired automatically on wizard open. The four underlying skills still create their own runs (good — shows in activity log).

## Supabase migration — `preflight_results`

```sql
create table if not exists preflight_results (
  brand_id uuid primary key references brands(id) on delete cascade,
  verdict text not null check (verdict in ('ready','warning','blocked')),
  blocked_reason text,
  warnings jsonb not null default '[]'::jsonb,
  details jsonb not null default '{}'::jsonb,
  cached_at timestamptz not null default now()
);

create index if not exists preflight_results_cached_at_idx on preflight_results(cached_at);

alter table preflight_results enable row level security;

drop policy if exists "brand members read preflight" on preflight_results;
create policy "brand members read preflight" on preflight_results for select
  using (
    brand_id in (select id from brands where owner_id = auth.uid())
    or brand_id in (select brand_id from brand_members where user_id = auth.uid())
  );
```

Service-role writes only (no client write policy). `src/lib/preflight.ts` uses `createServiceClient()`.

## Audience-targeting skill — `skills/optimization/audience-targeting.md`

**Frontmatter:**
```yaml
id: audience-targeting
name: Audience Targeting
agent: max
category: optimization
complexity: mid
credits: 2
mcp_tools:
  - meta_ads.insights.breakdowns
  - shopify.customers.list
requires: []
chains_to:
  - ad-copy
knowledge:
  needs:
    - brand_dna
    - audience
    - persona
    - insight
    - region
    - metric
  semantic_query: target customer audience persona demographic region interest cohort positioning
  traverse_depth: 2
  include_agency_patterns: true
produces:
  - node_type: audience
    edge_to: brand_dna
    edge_type: derived_from
  - node_type: audience
    edge_to: insight
    edge_type: derived_from
side_effect: none
reversible: true
requires_human_approval: false
description_for_mia: >-
  Input: brand_dna + KG + Meta breakdowns (if available). Output: 1–3 targeting
  tiers with rationale and source badges. Use when: launching a new campaign or
  re-proposing after user rejects the first draft.
description_for_user: Proposes who to target based on your brand DNA and past performance.
```

**Workflow (system prompt directives):**
1. Read `brand_dna` node via KG. Extract target customer, problem solved, geographic focus.
2. Read existing `audience`, `persona`, `insight`, `region` nodes (already in RAG context via `needs`).
3. If Meta connected, examine `meta.breakdowns` for last 30d — identify top 3 age/gender/region cohorts by ROAS.
4. Fuse into 1–3 tiers:
   - **Tier 1 (always):** prospecting cold — broadest reach, seeded from Brand DNA core persona + geo focus.
   - **Tier 2 (if Meta history exists with ≥50 Purchase events in 30d):** data-backed warm — tightest cohort by ROAS from breakdowns.
   - **Tier 3 (if Shopify connected with ≥100 customers):** lookalike seed — flagged as "build in Meta from Shopify customer export".
5. Each tier includes: `source: 'brand_dna' | 'meta_history' | 'fusion'`, `targeting` (Meta-API JSON), `reasoning`, `expected_weekly_reach_estimate`.

**Output contract (JSON, no markdown fences):**
```json
{
  "tiers": [
    {
      "name": "Prospecting — India Tier-1 Female 28-45",
      "source": "fusion",
      "targeting": {
        "geo_locations": { "countries": ["IN"], "regions": [...] },
        "age_min": 28,
        "age_max": 45,
        "genders": [2],
        "flexible_spec": [{"interests": [...]}]
      },
      "reasoning": "Brand DNA positions X for Y. Meta 30d data shows female 28-44 at 3.2x ROAS in Maharashtra/Delhi.",
      "expected_weekly_reach_estimate": "800k–1.2M"
    }
  ],
  "fallback_reason": null,
  "summary": "3 tiers ready. Tier 1 is your safest bet; tier 2 uses 30d performance data."
}
```

**Fallback rules encoded in the prompt:**
- No Meta history → single tier from Brand DNA, labelled `"Starting point — we'll refine after 2 weeks of data."` and `fallback_reason: "no_meta_history"`.
- Meta connected, zero Purchase events → single broad tier, `fallback_reason: "no_conversion_signal"`.
- No Brand DNA node (edge case, shouldn't happen post-onboarding) → emit `error: "brand_dna_missing"` and recommend `brand-dna-extractor`.

## Launch-conversation skill — `skills/acquisition/launch-conversation.md`

Lightweight Max orchestrator for Track C. Drives the chat flow turn by turn. Not a pure-execution skill — it holds conversation state across multiple Mia turns.

**Frontmatter:**
```yaml
id: launch-conversation
name: Launch Conversation
agent: max
category: acquisition
complexity: standard
credits: 3
mcp_tools: []
requires:
  - meta
chains_to:
  - audience-targeting
  - ad-copy
  - image-brief
  - campaign-launcher
knowledge:
  needs:
    - brand_dna
    - campaign
    - audience
  semantic_query: campaign launch conversation plan budget audience creative
  traverse_depth: 1
produces:
  - node_type: campaign
    edge_to: audience
    edge_type: targets
side_effect: none
reversible: true
requires_human_approval: true
description_for_mia: >-
  Input: launch intent from user. Output: multi-turn conversation driving through
  preflight → plan card → images → launch approval. Use when: Mia detects launch
  intent in chat.
description_for_user: Walks you through launching a campaign in chat.
```

**State machine (per skill run):**
```
awaiting_intent → awaiting_approval_of_plan → awaiting_approval_of_images → launching → completed
                                            ↘ cancelled
```

Persisted in `skill_runs.state_json` (new column, nullable). Each Mia turn loads the skill run, advances state, emits next card. Abandoned runs > 24h old auto-close.

## Wizard UX spec (Track B)

### Step 0 — Invisible pre-flight
- On `useEffect(() => { runPreflightClient(brandId) }, [brandId])` where `runPreflightClient` is a client wrapper that POSTs to `/api/preflight/run`.
- Response populates local state: `{ verdict, warnings, blocked_reason, details }`.

### Banner states (top of wizard, always visible)
| State | Visual | Copy | Actions |
|---|---|---|---|
| `checking` | muted pill, spinner | "Checking your Meta setup…" | — |
| `ready` | green dot, collapsed | "All systems go" | click to expand for details |
| `warning` | yellow, expanded | "N warnings — you can still launch" | per-warning "Fix with <skill>" button |
| `blocked` | red, full width | "Launch blocked: <reason>" | "Fix with <skill>" (opens Mia thread with Max), "Save as draft" |

When `blocked`: steps 2+ disabled. User can only stay on step 1 (define) to save draft, or click fix action.

### Step 5 — Audience (new)
- Fires `runSkill('audience-targeting', { brandId, additionalContext: { objective, budget } })` on entry.
- Renders 1–3 `<AudienceTierCard>` components, each with:
  - Name, source badge (`brand_dna` / `meta_history` / `fusion`)
  - Editable chips: age range (dual slider), gender (checkboxes), regions (multiselect), interests (chip input)
  - Reasoning (collapsed by default)
- Footer: "Not quite right? **[Ask Max to re-propose]**" — opens inline input, re-runs skill with user feedback appended as `additionalContext.user_feedback`.
- User selects which tiers to launch (default: all). Selections flow into `audienceTiers` in the launch payload.

### Step 8 — Final (updated)
- Pre-launch summary card listing:
  - Campaign name, objective, budget
  - Selected audience tier summaries
  - Selected creatives (thumbnails + headline)
  - **Preflight warnings** (non-blocking, for transparency)
- CTAs: "Launch now" / "Save as draft" / "Back to step 7".

## Chat-led flow (Track C)

### Entry
`/dashboard/campaigns` "New Campaign" button href: `/dashboard/mia?intent=launch&brand=<id>`.

On `/dashboard/mia` mount with `intent=launch`:
1. Auto-send system-authored message into thread: `"User wants to launch a campaign for <brand_name>."`
2. POST to `/api/mia/chat` with that message.
3. Chat route detects `intent=launch` or parses launch intent from the message, invokes `runPreflight`, then invokes `launch-conversation` skill with state `awaiting_intent`.

### Turn 1 — Mia bridges
Mia's message: `"Max is taking this. Running pre-flight…"`
Mia's assistant-rendered card: `<MaxHandoffCard>` with preflight summary.

### Turn 2 — Max's opening card (`<MaxOpeningCard>`)
```
Pre-flight: ✓ ready · ⚠ 2 warnings (structure fragmentation, ASC borderline)
Budget: my suggestion is ₹1,800–2,500/day based on your last 30d spend rhythm.

I need two things:
1. Angle / theme for this campaign  [text input]
2. Budget                           [₹2,000/day ▼ editable]

Or just say "propose everything" and I'll make the call.
```

### Turn 3 — User responds
Free text. Max's chat handler parses angle + budget (or "propose everything"), advances state to `awaiting_approval_of_plan`.

### Turn 4 — Max's bundle card (`<MaxBundleCard>`)
In parallel, Max invokes:
- `audience-targeting` with context `{ objective, budget, angle }`.
- `ad-copy` with context `{ brandId, angle, audience: <proposed tier 1> }`.
- `image-brief` with context `{ brandId, angle, copy: <first variant> }`.

Bundle card displays:
- Audience tiers (reusing `<AudienceTierCard>`)
- 3 ad-copy variants (editable inline)
- Image brief summary (not yet generated)
- CTA: "Approve & generate images"

### Turn 5 — Max generates images
State → `awaiting_approval_of_images`. 30–90s fal.ai generation → image grid → "Approve & launch ₹2,000/day campaign?"

### Turn 6 — User approves
State → `launching`. Max invokes `campaign-launcher` with full payload. On success → state `completed`, Max confirms with Meta IDs.

### Escape hatch
Every Max message has a subtle "Switch to wizard" action. Click → persists current skill-run state, routes to `/dashboard/campaigns/new?brand=<id>&seed=<skill_run_id>`. Wizard loads and hydrates from state_json, starting at the appropriate step (typically step 5 if audience is already approved, step 7 if images are done).

## Error handling & edge cases

| Scenario | Behavior |
|---|---|
| Meta not connected | Preflight verdict = `blocked`, reason `"Connect Meta to launch"`. Banner routes to `/dashboard/settings/platforms`. |
| Pixel has 0 Purchase events in 7d | `asc-readiness-audit` flags `warning`; structure-audit may too. Not blocking — manual CBO still viable. |
| `pixel-capi-health` itself errors | Warning emitted ("Couldn't verify pixel"). Verdict `warning`, not `blocked`. User can proceed. |
| All four preflight skills error | Verdict `warning` with summary "Pre-flight checks failed — you can still launch, but we couldn't validate setup." |
| User edits audience manually, deviates from Max's proposal | No veto. Track event `audience_override` in `skill_runs.metadata` for future learning. |
| User launches with budget below Max's min | Toast: "Max flagged this budget as below the 50-event threshold — may not exit learning phase." Non-blocking. |
| Chat-led: user abandons mid-flow | `launch-conversation` state persisted per turn. Mia resumes: "You started a launch 2h ago — pick up?" Auto-closes after 24h. |
| Wizard escape hatch from chat | `?seed=<skill_run_id>` hydrates wizard with campaign name, objective, budget, audience, creatives as applicable. |
| `audience-targeting` returns zero tiers | Never happens by contract; fallback always emits at least Tier 1 from Brand DNA. If brand_dna missing, skill errors and recommends `brand-dna-extractor`. |
| Concurrent preflight runs for same brand | Cache read is best-effort; if two wizards open simultaneously and both miss cache, both run. Upsert on `brand_id` primary key means last writer wins — fine, outputs should be near-identical. |

## Testing

### Unit
- `src/lib/preflight.ts`:
  - Cache hit within 15min
  - Cache miss / stale → re-runs
  - Force refresh bypasses cache
  - Meta not connected → immediate `blocked`
  - Verdict computation: all combinations of 4 skill outputs (table-driven)
  - Skill error → null slot in details, warning emitted, verdict not blocked
- `audience-targeting`:
  - No Meta history → single Brand DNA tier
  - Meta connected with <50 Purchase events → single broad tier
  - Meta connected with history → up to 3 fused tiers
  - brand_dna missing → error + recommendation

### Integration (test Supabase)
- `POST /api/campaigns/launch` legacy payload still works (back-compat).
- `POST /api/preflight/run`: cache hit/miss, blocked short-circuit.
- `POST /api/mia/launch-intent`: intent → preflight → launch-conversation dispatch → state transitions persisted.

### Manual / e2e
- Wizard on brand with broken pixel: banner shows blocked, steps 2+ disabled, "Fix with pixel-capi-health" opens Mia thread with Max.
- Wizard on clean brand: banner green, audience step shows 3 tiers, launch succeeds, Meta IDs returned.
- Chat: "launch a Diwali campaign ₹2k/day" on `/dashboard/mia` → Max handoff → bundle card → images → launch.
- Chat → wizard escape hatch at turn 4 → wizard resumes at step 5 with audience + copy + budget pre-populated.
- Chat: user abandons at turn 3, returns 10 min later → Mia offers to resume.

## Rollout

1. Ship `preflight_results` table + `src/lib/preflight.ts` + wizard banner. Gate behind feature flag `preflight_v1`. Cost: 1 migration, 1 lib, 1 component.
2. Ship `audience-targeting` skill + wizard step 5. Gate behind flag `audience_targeting_v1`. Cost: 1 new skill, 1 new component.
3. Ship Track C (chat-led launch). Gate behind flag `chat_launch_v1`. Update `/dashboard/campaigns` "New Campaign" button to route to Mia. Cost: 1 new skill, 1 API route, 2 chat cards, router update.
4. Enable all flags for internal brands first, monitor 7 days, then flip for all.

## Open questions deferred to implementation

- Exact `additionalContext` shape for `launch-conversation` state persistence (will emerge from executing-plans phase).
- Whether `PreflightBanner` lives in a new shared component directory or under `campaigns/`. Default: `src/components/campaigns/`.
- Loading state for fal.ai image generation in chat (30–90s) — likely reuse existing pattern from `MessageCreativeCard`. Confirm during implementation.

---

*Spec written 2026-04-21. Next step: user review, then hand off to writing-plans.*

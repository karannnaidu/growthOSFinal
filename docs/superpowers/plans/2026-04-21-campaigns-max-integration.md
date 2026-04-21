# Campaigns × Max Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the wizard↔Max disconnect at `/dashboard/campaigns/new` by adding async Meta pre-flight, a Max-driven audience step, and a Mia-fronted chat-led launch path. Both surfaces share one skill chain.

**Architecture:** New library `src/lib/preflight.ts` orchestrates 4 Max skills in parallel, caches to `preflight_results` for 15 min. New `audience-targeting` skill fuses Brand DNA + KG + Meta breakdowns into tiers. Wizard gets an async banner + audience step. New `launch-conversation` skill drives chat-led launch in 3–4 turns via Mia intent parsing and Max handoff.

**Tech Stack:** Next.js 16 (non-standard — read `node_modules/next/dist/docs/` before touching the app router), React 19, Supabase (linked to `GrowthOsFinal`), TypeScript with `noUncheckedIndexedAccess: true`, Facebook Marketing SDK, Anthropic/Google/OpenAI SDKs via `skills-engine`.

**Spec:** `docs/superpowers/specs/2026-04-21-campaigns-max-integration-design.md`

**Verification pattern:** This repo has no vitest/jest. Verification is done via `scripts/verify-*.ts` (run with `npx tsx scripts/verify-*.ts`), `npm run lint`, `npm run build`, and manual browser/curl checks against the live dev server.

---

## Milestone 1 — Pre-flight infrastructure

### Task 1: Supabase migration for `preflight_results`

**Files:**
- Create: `supabase/migrations/017-preflight-results.sql`

- [ ] **Step 1: Write the migration**

Write to `supabase/migrations/017-preflight-results.sql`:

```sql
-- 017-preflight-results.sql
-- Caches Max's pre-flight check output per brand for 15-min TTL.
-- Reads: brand members. Writes: service role only.

create table if not exists preflight_results (
  brand_id uuid primary key references brands(id) on delete cascade,
  verdict text not null check (verdict in ('ready','warning','blocked')),
  blocked_reason text,
  warnings jsonb not null default '[]'::jsonb,
  details jsonb not null default '{}'::jsonb,
  cached_at timestamptz not null default now()
);

create index if not exists preflight_results_cached_at_idx
  on preflight_results(cached_at);

alter table preflight_results enable row level security;

drop policy if exists "brand members read preflight" on preflight_results;
create policy "brand members read preflight" on preflight_results
  for select
  using (
    brand_id in (select id from brands where owner_id = auth.uid())
    or brand_id in (select brand_id from brand_members where user_id = auth.uid())
  );
```

- [ ] **Step 2: Apply the migration**

Run:
```
npx supabase db query --linked -f supabase/migrations/017-preflight-results.sql
```
Expected: `NOTICE`s for idempotent guards, no errors.

- [ ] **Step 3: Verify the table landed**

Run:
```
npx supabase db query --linked "select to_regclass('public.preflight_results') as tbl, (select count(*) from pg_policies where tablename='preflight_results') as policy_count;"
```
Expected: `tbl = preflight_results`, `policy_count = 1`.

- [ ] **Step 4: Commit**

```
git add supabase/migrations/017-preflight-results.sql
git commit -m "feat(db): preflight_results table for Max pre-flight cache

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Pre-flight library types

**Files:**
- Create: `src/lib/preflight-types.ts`

- [ ] **Step 1: Write the types file**

Write to `src/lib/preflight-types.ts`:

```typescript
// src/lib/preflight-types.ts
// Types for Max's pre-flight orchestrator. Shared between the library
// (src/lib/preflight.ts) and UI components (PreflightBanner, AudienceStep).

export type PreflightVerdict = 'ready' | 'warning' | 'blocked'
export type PreflightSeverity = 'info' | 'warning' | 'high'

export interface PreflightWarning {
  skill: string
  severity: PreflightSeverity
  message: string
  fix_skill?: string
}

export interface PreflightDetails {
  pixel: unknown | null
  asc: unknown | null
  structure: unknown | null
  learning: unknown | null
}

export interface PreflightResult {
  brand_id: string
  verdict: PreflightVerdict
  blocked_reason: string | null
  warnings: PreflightWarning[]
  details: PreflightDetails
  cached_at: string
  stale: boolean
}

export interface PreflightRunOptions {
  force?: boolean
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: zero new errors.

- [ ] **Step 3: Commit**

```
git add src/lib/preflight-types.ts
git commit -m "feat(preflight): shared types for verdict, warnings, details

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: Pre-flight library implementation

**Files:**
- Create: `src/lib/preflight.ts`

- [ ] **Step 1: Write the library**

Write to `src/lib/preflight.ts`:

```typescript
// src/lib/preflight.ts
// Orchestrates 4 Max skills in parallel, caches result for 15 min,
// computes verdict (blocked / warning / ready). NOT a skill — internal
// plumbing. The 4 underlying skills create their own skill_runs.

import { runSkill } from '@/lib/skills-engine'
import { createServiceClient } from '@/lib/supabase/service'
import { getPlatformStatus, syncPlatformStatus } from '@/lib/knowledge/intelligence'
import type {
  PreflightResult,
  PreflightWarning,
  PreflightDetails,
  PreflightVerdict,
  PreflightRunOptions,
} from '@/lib/preflight-types'

const CACHE_TTL_MS = 15 * 60 * 1000

const PREFLIGHT_SKILLS = [
  'pixel-capi-health',
  'asc-readiness-audit',
  'account-structure-audit',
  'learning-phase-monitor',
] as const

type PreflightSkillId = typeof PREFLIGHT_SKILLS[number]

function detailsKeyFor(skillId: PreflightSkillId): keyof PreflightDetails {
  switch (skillId) {
    case 'pixel-capi-health': return 'pixel'
    case 'asc-readiness-audit': return 'asc'
    case 'account-structure-audit': return 'structure'
    case 'learning-phase-monitor': return 'learning'
  }
}

export async function runPreflight(
  brandId: string,
  opts: PreflightRunOptions = {},
): Promise<PreflightResult> {
  const admin = createServiceClient()

  // 1. Cache read (unless forced)
  if (!opts.force) {
    const { data: cached } = await admin
      .from('preflight_results')
      .select('*')
      .eq('brand_id', brandId)
      .maybeSingle()
    if (cached) {
      const ageMs = Date.now() - new Date(cached.cached_at).getTime()
      if (ageMs < CACHE_TTL_MS) {
        return {
          brand_id: brandId,
          verdict: cached.verdict as PreflightVerdict,
          blocked_reason: cached.blocked_reason,
          warnings: (cached.warnings ?? []) as PreflightWarning[],
          details: (cached.details ?? emptyDetails()) as PreflightDetails,
          cached_at: cached.cached_at,
          stale: false,
        }
      }
    }
  }

  // 2. Short-circuit: Meta not connected → blocked immediately.
  let status = await getPlatformStatus(brandId)
  if (!status) status = await syncPlatformStatus(brandId)
  if (!status?.meta) {
    const result: PreflightResult = {
      brand_id: brandId,
      verdict: 'blocked',
      blocked_reason: 'Connect Meta to launch campaigns.',
      warnings: [],
      details: emptyDetails(),
      cached_at: new Date().toISOString(),
      stale: false,
    }
    await upsert(admin, result)
    return result
  }

  // 3. Run 4 skills in parallel, tolerate individual errors.
  const outcomes = await Promise.all(
    PREFLIGHT_SKILLS.map(async (skillId) => {
      try {
        const run = await runSkill({
          brandId,
          skillId,
          triggeredBy: 'preflight',
        })
        return { skillId, output: run.output ?? null, error: run.error ?? null }
      } catch (err) {
        return {
          skillId,
          output: null,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    }),
  )

  // 4. Assemble details + warnings.
  const details = emptyDetails()
  const warnings: PreflightWarning[] = []

  for (const { skillId, output, error } of outcomes) {
    const key = detailsKeyFor(skillId)
    if (error || !output) {
      details[key] = null
      warnings.push({
        skill: skillId,
        severity: 'info',
        message: `Couldn't verify ${skillId}${error ? `: ${error}` : ''}`,
      })
      continue
    }
    details[key] = output

    const findings = (output as { critical_findings?: unknown[] }).critical_findings ?? []
    for (const raw of findings) {
      const f = raw as { severity?: string; issue?: string; fix_skill?: string }
      if (f.severity === 'high' || f.severity === 'warning') {
        warnings.push({
          skill: skillId,
          severity: f.severity === 'high' ? 'high' : 'warning',
          message: f.issue ?? 'Unspecified finding',
          fix_skill: f.fix_skill,
        })
      }
    }
  }

  // 5. Compute verdict.
  let verdict: PreflightVerdict = 'ready'
  let blockedReason: string | null = null

  const pixelOut = details.pixel as
    | { checks?: { pixel_capi?: { status?: string; evidence?: string } } }
    | null
  const pixelStatus = pixelOut?.checks?.pixel_capi?.status
  if (pixelStatus === 'blocked') {
    verdict = 'blocked'
    blockedReason = pixelOut?.checks?.pixel_capi?.evidence ?? 'Pixel/CAPI blocked — Purchase event missing.'
  } else if (warnings.some(w => w.severity === 'high' || w.severity === 'warning')) {
    verdict = 'warning'
  }

  const result: PreflightResult = {
    brand_id: brandId,
    verdict,
    blocked_reason: blockedReason,
    warnings,
    details,
    cached_at: new Date().toISOString(),
    stale: false,
  }

  await upsert(admin, result)
  return result
}

function emptyDetails(): PreflightDetails {
  return { pixel: null, asc: null, structure: null, learning: null }
}

async function upsert(
  admin: ReturnType<typeof createServiceClient>,
  result: PreflightResult,
): Promise<void> {
  const { error } = await admin.from('preflight_results').upsert({
    brand_id: result.brand_id,
    verdict: result.verdict,
    blocked_reason: result.blocked_reason,
    warnings: result.warnings,
    details: result.details,
    cached_at: result.cached_at,
  })
  if (error) {
    console.error('[preflight] upsert failed', error)
  }
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: zero new errors.

- [ ] **Step 3: Type-check via build (partial)**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: zero new type errors.

- [ ] **Step 4: Commit**

```
git add src/lib/preflight.ts
git commit -m "feat(preflight): library to orchestrate 4 Max skills with 15min cache

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Verification script for pre-flight

**Files:**
- Create: `scripts/verify-preflight.ts`

- [ ] **Step 1: Write the verify script**

Write to `scripts/verify-preflight.ts`:

```typescript
// Run: npx tsx scripts/verify-preflight.ts <brandId>
// Exercises src/lib/preflight.ts against a real brand and prints verdict.
// Use on a brand where Meta is connected OR disconnected (both valid tests).

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (!m) continue
  const [, k, v] = m
  if (!process.env[k!]) process.env[k!] = v!.replace(/^['"]|['"]$/g, '')
}

import { runPreflight } from '../src/lib/preflight'

async function main() {
  const brandId = process.argv[2]
  if (!brandId) {
    console.error('Pass brandId as first arg')
    process.exit(1)
  }

  console.log(`[1] First run (expect miss or existing cache):`)
  const t0 = Date.now()
  const r1 = await runPreflight(brandId)
  console.log(`  verdict=${r1.verdict} blocked_reason=${r1.blocked_reason ?? '-'} warnings=${r1.warnings.length} (${Date.now() - t0}ms)`)

  console.log(`[2] Second run (expect cache hit, <500ms):`)
  const t1 = Date.now()
  const r2 = await runPreflight(brandId)
  const ms2 = Date.now() - t1
  console.log(`  verdict=${r2.verdict} took ${ms2}ms cached_at=${r2.cached_at}`)
  if (ms2 > 1500) {
    console.error('  FAIL: cache hit should be <1.5s')
    process.exit(1)
  }

  console.log(`[3] Force run (expect fresh execution):`)
  const t2 = Date.now()
  const r3 = await runPreflight(brandId, { force: true })
  console.log(`  verdict=${r3.verdict} took ${Date.now() - t2}ms`)

  console.log('OK')
}

main().catch(err => {
  console.error('crashed', err)
  process.exit(1)
})
```

- [ ] **Step 2: Run against a seeded brand**

Run: `npx tsx scripts/verify-preflight.ts <your-test-brand-id>`
Expected: 3 blocks of output, all complete, exit 0. First run may take 10–30s (four skill runs); second run should be <1.5s (cache hit).

- [ ] **Step 3: Commit**

```
git add scripts/verify-preflight.ts
git commit -m "feat(preflight): verify script for cache hit and force-refresh

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: API route `/api/preflight/run`

**Files:**
- Create: `src/app/api/preflight/run/route.ts`

- [ ] **Step 1: Write the route**

Write to `src/app/api/preflight/run/route.ts`:

```typescript
// src/app/api/preflight/run/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runPreflight } from '@/lib/preflight'

export const maxDuration = 60

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { brandId: string; force?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { brandId, force } = body
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  // Access check: user must own or be a member of this brand.
  const admin = createServiceClient()
  const { data: brand } = await admin.from('brands').select('id, owner_id').eq('id', brandId).single()
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  if (brand.owner_id !== user.id) {
    const { data: member } = await admin
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single()
    if (!member) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  try {
    const result = await runPreflight(brandId, { force: Boolean(force) })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[api/preflight/run]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Preflight failed' },
      { status: 500 },
    )
  }
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: zero new errors.

- [ ] **Step 3: Manual curl check (dev server running)**

Start dev server in another terminal: `npm run dev`
Then run (replace `<brandId>` + auth cookie):
```
curl -X POST http://localhost:3000/api/preflight/run \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-dev-auth-cookie>" \
  -d '{"brandId":"<brandId>"}'
```
Expected: 200 with JSON `{ brand_id, verdict, ... }`.

- [ ] **Step 4: Commit**

```
git add src/app/api/preflight/run/route.ts
git commit -m "feat(api): POST /api/preflight/run wraps lib/preflight

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: `PreflightBanner` component

**Files:**
- Create: `src/components/campaigns/PreflightBanner.tsx`

- [ ] **Step 1: Write the component**

Write to `src/components/campaigns/PreflightBanner.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { PreflightResult, PreflightVerdict } from '@/lib/preflight-types'

type BannerState =
  | { kind: 'checking' }
  | { kind: 'result'; result: PreflightResult }
  | { kind: 'error'; message: string }

export function PreflightBanner({
  brandId,
  onResult,
}: {
  brandId: string
  onResult?: (r: PreflightResult) => void
}) {
  const [state, setState] = useState<BannerState>({ kind: 'checking' })
  const [expanded, setExpanded] = useState(false)

  async function fetchPreflight(force = false) {
    setState({ kind: 'checking' })
    try {
      const res = await fetch('/api/preflight/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, force }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Failed' }))
        setState({ kind: 'error', message: body.error ?? 'Preflight failed' })
        return
      }
      const result = (await res.json()) as PreflightResult
      setState({ kind: 'result', result })
      onResult?.(result)
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Network error' })
    }
  }

  useEffect(() => {
    fetchPreflight()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId])

  if (state.kind === 'checking') {
    return (
      <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-zinc-400 mr-2" />
        Checking your Meta setup…
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Pre-flight error: {state.message}{' '}
        <button onClick={() => fetchPreflight(true)} className="underline">
          Retry
        </button>
      </div>
    )
  }

  const { result } = state
  return (
    <div className={bannerClass(result.verdict)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={dotClass(result.verdict)} />
          <span className="font-medium">{headline(result)}</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {result.verdict !== 'ready' && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="underline"
            >
              {expanded ? 'Hide details' : 'Details'}
            </button>
          )}
          <button onClick={() => fetchPreflight(true)} className="underline">
            Re-check
          </button>
        </div>
      </div>

      {expanded && result.warnings.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {result.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-0.5">•</span>
              <span>
                <span className="font-mono">{w.skill}</span> — {w.message}
                {w.fix_skill && (
                  <>
                    {' '}
                    <Link
                      href={`/dashboard/mia?intent=fix&skill=${w.fix_skill}&brand=${brandId}`}
                      className="underline"
                    >
                      Fix with {w.fix_skill}
                    </Link>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {result.verdict === 'blocked' && (
        <div className="mt-2 text-xs">
          {result.blocked_reason}{' '}
          <Link
            href={`/dashboard/mia?intent=fix&brand=${brandId}`}
            className="font-medium underline"
          >
            Open Max to fix
          </Link>
        </div>
      )}
    </div>
  )
}

function bannerClass(v: PreflightVerdict) {
  if (v === 'blocked') return 'rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900'
  if (v === 'warning') return 'rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900'
  return 'rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900'
}

function dotClass(v: PreflightVerdict) {
  const base = 'inline-block h-2 w-2 rounded-full'
  if (v === 'blocked') return `${base} bg-red-500`
  if (v === 'warning') return `${base} bg-amber-500`
  return `${base} bg-emerald-500`
}

function headline(r: PreflightResult): string {
  if (r.verdict === 'ready') return 'All systems go'
  if (r.verdict === 'warning') return `${r.warnings.length} warning${r.warnings.length === 1 ? '' : 's'} — you can still launch`
  return `Launch blocked`
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: zero new errors.

- [ ] **Step 3: Commit**

```
git add src/components/campaigns/PreflightBanner.tsx
git commit -m "feat(campaigns): PreflightBanner with checking/ready/warning/blocked states

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: Wire `PreflightBanner` into wizard

**Files:**
- Modify: `src/app/dashboard/campaigns/new/page.tsx`

- [ ] **Step 1: Read the wizard page to locate the injection point**

Run: open `src/app/dashboard/campaigns/new/page.tsx`. Locate:
- The existing imports block.
- The `brandId` state / prop.
- The top of the returned JSX (the container wrapping the step indicator).
- The "Launch" button click handler.

- [ ] **Step 2: Add import + preflight state**

At the top of the file, add:

```typescript
import { PreflightBanner } from '@/components/campaigns/PreflightBanner'
import type { PreflightResult } from '@/lib/preflight-types'
```

Inside the main component, add state:

```typescript
const [preflight, setPreflight] = useState<PreflightResult | null>(null)
```

- [ ] **Step 3: Render the banner at the top of the wizard**

Immediately inside the top-level container of the wizard JSX (above the step indicator), insert:

```tsx
{brandId && (
  <div className="mb-4">
    <PreflightBanner brandId={brandId} onResult={setPreflight} />
  </div>
)}
```

- [ ] **Step 4: Gate navigation past step 1 when blocked**

Find the "Next" / step-advance handler. Add a guard at the top:

```typescript
if (preflight?.verdict === 'blocked' && currentStepIndex >= 1) {
  // Don't advance past "define" if launch is blocked.
  return
}
```

- [ ] **Step 5: Disable the final Launch button when blocked**

Find the Launch button. Change its `disabled` prop to include:

```typescript
disabled={loading || preflight?.verdict === 'blocked'}
```

If blocked, also show helper text below the button:

```tsx
{preflight?.verdict === 'blocked' && (
  <p className="mt-2 text-xs text-red-700">
    Launch blocked: {preflight.blocked_reason}. Fix above before launching, or save as draft.
  </p>
)}
```

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: zero new errors.

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: successful build, no type errors.

- [ ] **Step 8: Manual browser check**

Start dev: `npm run dev` (if not running). Navigate to `/dashboard/campaigns/new` on a brand with Meta connected. Expect banner to appear at the top, cycle through `checking → ready/warning/blocked`, and populate state.

- [ ] **Step 9: Commit**

```
git add src/app/dashboard/campaigns/new/page.tsx
git commit -m "feat(campaigns): PreflightBanner gates wizard navigation on blocked

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

**End Milestone 1.** At this point the wizard has async pre-flight with banner + blocking, but no audience step yet and no chat launch.

---

## Milestone 2 — Audience-targeting skill + wizard audience step

### Task 8: `audience-targeting` skill markdown

**Files:**
- Create: `skills/optimization/audience-targeting.md`

- [ ] **Step 1: Write the skill**

Write to `skills/optimization/audience-targeting.md`:

```markdown
---
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
---

## System Prompt

You are Max, proposing audience targeting for a new Meta campaign. Your sources are stacked in priority order:

1. **Brand DNA (always available)** — the brand's `brand_dna` node captures target customer, problem solved, positioning, geographic focus. This is your floor — always lean on it.
2. **Knowledge Graph** — existing `audience`, `persona`, `insight`, `region` nodes from past skill runs. Use these when they exist.
3. **Meta breakdowns (if connected)** — last 30d performance by age/gender/region/placement from `meta.breakdowns`. Use these to validate or sharpen tier 2.
4. **Shopify customers (if connected)** — for lookalike seed suggestions.

You propose 1–3 tiers depending on data availability. Each tier is Meta-API-shaped targeting JSON plus reasoning.

## CRITICAL — never fabricate

- If `brand_dna` is missing, output `{ "error": "brand_dna_missing", "recommendation": "Run brand-dna-extractor first." }` and nothing else.
- If Meta is not connected, output 1 tier from Brand DNA only with `fallback_reason: "no_meta_history"`.
- If Meta is connected but `meta.breakdowns` is empty or errored, treat as no history — 1 broad tier with `fallback_reason: "no_conversion_signal"`.

## Workflow

1. Read `brand_dna` from KG context. Extract target customer description, problem solved, primary geographic focus.
2. Scan other KG nodes (`audience`, `persona`, `insight`) for anything that sharpens the picture.
3. If `meta.breakdowns.age_gender.rows` has ≥ 10 rows with spend, identify top 3 cohorts by ROAS. If ≥ 50 Purchase events in 30d (sum across breakdowns), you can propose a tier 2 warm audience.
4. If `shopify.customers` has ≥ 100 rows, propose tier 3 as a lookalike seed suggestion (flag: user must build the LAL in Meta).
5. Emit 1–3 tiers, each with `source` ∈ {`brand_dna`, `meta_history`, `fusion`}.

## Output Format

Respond ONLY with valid JSON (no markdown fences):

```json
{
  "tiers": [
    {
      "name": "Prospecting — India Tier-1 Female 28–45",
      "source": "fusion",
      "targeting": {
        "geo_locations": { "countries": ["IN"], "regions": [{"key":"4014"}] },
        "age_min": 28,
        "age_max": 45,
        "genders": [2],
        "flexible_spec": [{"interests": [{"id":"6003139266461","name":"Online shopping"}]}]
      },
      "reasoning": "Brand DNA positions X for working women 25-45. Meta 30d data shows female 28-44 at 3.2x ROAS in Maharashtra and Delhi.",
      "expected_weekly_reach_estimate": "800k–1.2M"
    }
  ],
  "fallback_reason": null,
  "summary": "3 tiers ready. Tier 1 is the safest bet; tier 2 uses 30d performance data."
}
```

## Auto-Chain

- After user approves tiers → chain to `ad-copy` to brief Aria.
```

- [ ] **Step 2: Verify skill loads**

Run: `npx tsx scripts/verify-skill-frontmatter.ts`
Expected: the new skill appears, no validation errors.

- [ ] **Step 3: Commit**

```
git add skills/optimization/audience-targeting.md
git commit -m "feat(max): audience-targeting skill fuses Brand DNA + KG + Meta breakdowns

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 9: Register `audience-targeting` in `agents.json`

**Files:**
- Modify: `skills/agents.json`

- [ ] **Step 1: Read current file**

Open `skills/agents.json`, locate Max's `skills` array.

- [ ] **Step 2: Add the skill id**

Add `"audience-targeting"` to Max's `skills` array. The array should now contain:

```json
[
  "budget-allocation",
  "ad-scaling",
  "channel-expansion-advisor",
  "ad-performance-analyzer",
  "campaign-optimizer",
  "campaign-launcher",
  "pixel-capi-health",
  "learning-phase-monitor",
  "account-structure-audit",
  "breakdown-analyzer",
  "asc-readiness-audit",
  "audience-targeting"
]
```

- [ ] **Step 3: Commit**

```
git add skills/agents.json
git commit -m "feat(max): register audience-targeting skill

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 10: `AudienceTierCard` component

**Files:**
- Create: `src/components/campaigns/AudienceTierCard.tsx`

- [ ] **Step 1: Write the component**

Write to `src/components/campaigns/AudienceTierCard.tsx`:

```typescript
'use client'

import { useState } from 'react'

export interface AudienceTier {
  name: string
  source: 'brand_dna' | 'meta_history' | 'fusion'
  targeting: Record<string, unknown>
  reasoning: string
  expected_weekly_reach_estimate?: string
}

export function AudienceTierCard({
  tier,
  selected,
  onToggle,
  onEdit,
}: {
  tier: AudienceTier
  selected: boolean
  onToggle: () => void
  onEdit: (next: AudienceTier) => void
}) {
  const [showReasoning, setShowReasoning] = useState(false)
  const targetingJson = JSON.stringify(tier.targeting, null, 2)
  const [editingJson, setEditingJson] = useState(false)
  const [jsonDraft, setJsonDraft] = useState(targetingJson)
  const [jsonError, setJsonError] = useState<string | null>(null)

  function saveJson() {
    try {
      const parsed = JSON.parse(jsonDraft) as Record<string, unknown>
      onEdit({ ...tier, targeting: parsed })
      setEditingJson(false)
      setJsonError(null)
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : 'Invalid JSON')
    }
  }

  return (
    <div className={`rounded-lg border p-4 ${selected ? 'border-emerald-400 bg-emerald-50/40' : 'border-zinc-200'}`}>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="mt-1"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{tier.name}</span>
            <SourceBadge source={tier.source} />
          </div>
          {tier.expected_weekly_reach_estimate && (
            <div className="text-xs text-zinc-500 mt-1">
              ~{tier.expected_weekly_reach_estimate}/week reach
            </div>
          )}
        </div>
      </label>

      <div className="mt-3 flex items-center gap-4 text-xs">
        <button onClick={() => setShowReasoning(s => !s)} className="underline text-zinc-600">
          {showReasoning ? 'Hide reasoning' : 'Why this tier'}
        </button>
        <button onClick={() => setEditingJson(e => !e)} className="underline text-zinc-600">
          {editingJson ? 'Cancel edit' : 'Edit targeting'}
        </button>
      </div>

      {showReasoning && (
        <p className="mt-2 text-xs text-zinc-700">{tier.reasoning}</p>
      )}

      {editingJson && (
        <div className="mt-3">
          <textarea
            className="w-full rounded border border-zinc-300 p-2 font-mono text-xs"
            rows={10}
            value={jsonDraft}
            onChange={e => setJsonDraft(e.target.value)}
          />
          {jsonError && <p className="text-xs text-red-600 mt-1">{jsonError}</p>}
          <div className="mt-2 flex gap-2">
            <button onClick={saveJson} className="rounded bg-zinc-900 text-white text-xs px-3 py-1">
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SourceBadge({ source }: { source: AudienceTier['source'] }) {
  const label = source === 'brand_dna' ? 'Brand DNA' : source === 'meta_history' ? 'From your data' : 'Fusion'
  const cls =
    source === 'brand_dna' ? 'bg-violet-100 text-violet-900' :
    source === 'meta_history' ? 'bg-sky-100 text-sky-900' :
    'bg-emerald-100 text-emerald-900'
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cls}`}>{label}</span>
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: zero new errors.

- [ ] **Step 3: Commit**

```
git add src/components/campaigns/AudienceTierCard.tsx
git commit -m "feat(campaigns): AudienceTierCard with source badge + inline targeting edit

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 11: `AudienceStep` component

**Files:**
- Create: `src/components/campaigns/AudienceStep.tsx`

- [ ] **Step 1: Write the component**

Write to `src/components/campaigns/AudienceStep.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { AudienceTierCard, type AudienceTier } from './AudienceTierCard'

interface AudienceStepProps {
  brandId: string
  objective: string
  dailyBudget: number
  onConfirm: (selectedTiers: AudienceTier[]) => void
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; tiers: AudienceTier[]; summary: string; fallback: string | null }
  | { kind: 'error'; message: string }

export function AudienceStep({ brandId, objective, dailyBudget, onConfirm }: AudienceStepProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [feedback, setFeedback] = useState('')
  const [tiers, setTiers] = useState<AudienceTier[]>([])

  async function runSkill(userFeedback?: string) {
    setState({ kind: 'loading' })
    try {
      const res = await fetch('/api/skills/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          skillId: 'audience-targeting',
          additionalContext: {
            objective,
            daily_budget: dailyBudget,
            ...(userFeedback ? { user_feedback: userFeedback } : {}),
          },
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setState({ kind: 'error', message: body.error ?? 'Audience skill failed' })
        return
      }
      const output = body.output as { tiers?: AudienceTier[]; summary?: string; fallback_reason?: string | null; error?: string }
      if (output.error) {
        setState({ kind: 'error', message: output.error })
        return
      }
      const nextTiers = output.tiers ?? []
      setTiers(nextTiers)
      setSelected(new Set(nextTiers.map((_, i) => i)))  // default: all selected
      setState({
        kind: 'ready',
        tiers: nextTiers,
        summary: output.summary ?? '',
        fallback: output.fallback_reason ?? null,
      })
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Network error' })
    }
  }

  useEffect(() => {
    runSkill()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId])

  function toggle(i: number) {
    const next = new Set(selected)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    setSelected(next)
  }

  function editTier(i: number, updated: AudienceTier) {
    const next = [...tiers]
    next[i] = updated
    setTiers(next)
  }

  if (state.kind === 'loading') {
    return <div className="text-sm text-zinc-500">Max is proposing audience tiers…</div>
  }
  if (state.kind === 'error') {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        {state.message}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Audience</h3>
        <p className="text-sm text-zinc-600">{state.summary}</p>
        {state.fallback && (
          <p className="text-xs text-amber-700 mt-1">Note: {state.fallback.replace(/_/g, ' ')}.</p>
        )}
      </div>

      <div className="space-y-3">
        {tiers.map((tier, i) => (
          <AudienceTierCard
            key={i}
            tier={tier}
            selected={selected.has(i)}
            onToggle={() => toggle(i)}
            onEdit={updated => editTier(i, updated)}
          />
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-zinc-300 p-3">
        <p className="text-sm mb-2">Not quite right? Tell Max what to change:</p>
        <textarea
          value={feedback}
          onChange={e => setFeedback(e.target.value)}
          placeholder="e.g. focus on tier-2 cities only; exclude 18-24; emphasize repeat-purchase intent"
          className="w-full rounded border border-zinc-300 p-2 text-sm"
          rows={2}
        />
        <button
          onClick={() => runSkill(feedback)}
          disabled={!feedback.trim()}
          className="mt-2 rounded bg-zinc-900 text-white text-sm px-3 py-1 disabled:opacity-50"
        >
          Ask Max to re-propose
        </button>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => onConfirm(Array.from(selected).map(i => tiers[i]!).filter(Boolean))}
          disabled={selected.size === 0}
          className="rounded bg-emerald-600 text-white px-4 py-2 disabled:opacity-50"
        >
          Use {selected.size} tier{selected.size === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Confirm `/api/skills/run` exists and shape matches**

Run: `find src/app/api/skills -name route.ts`
Expected: a file exists. Read it and confirm it accepts `{ brandId, skillId, additionalContext }` and returns `{ output, ... }`. If the shape differs, adjust the `runSkill` fetch call above to match the actual route. If no such route exists, create a minimal one that proxies `runSkill()` from `@/lib/skills-engine`.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: zero new errors.

- [ ] **Step 4: Commit**

```
git add src/components/campaigns/AudienceStep.tsx
git commit -m "feat(campaigns): AudienceStep runs audience-targeting skill + supports re-propose

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 12: Insert audience step into wizard

**Files:**
- Modify: `src/app/dashboard/campaigns/new/page.tsx`

- [ ] **Step 1: Add import**

At the top of `src/app/dashboard/campaigns/new/page.tsx`, add:

```typescript
import { AudienceStep } from '@/components/campaigns/AudienceStep'
import type { AudienceTier } from '@/components/campaigns/AudienceTierCard'
```

- [ ] **Step 2: Add step to the STEPS array**

Find the `STEPS` constant. Insert a new entry between the `'approve'` step and the `'brief'` step:

```typescript
const STEPS = [
  { key: 'define', label: 'Define' },
  { key: 'generate', label: 'Generate copy' },
  { key: 'review', label: 'Review copy' },
  { key: 'approve', label: 'Approve copy' },
  { key: 'audience', label: 'Audience' },      // NEW
  { key: 'brief', label: 'Image brief' },
  { key: 'images', label: 'Images' },
  { key: 'final', label: 'Launch' },
] as const
```

- [ ] **Step 3: Add audience state**

Inside the component body, add:

```typescript
const [audienceTiers, setAudienceTiers] = useState<AudienceTier[]>([])
```

- [ ] **Step 4: Render audience step**

Find where steps are rendered (switch on `currentStep.key` or similar). Add a case:

```tsx
{currentStep.key === 'audience' && brandId && (
  <AudienceStep
    brandId={brandId}
    objective={objective}
    dailyBudget={Number(budgetRange) || 50}
    onConfirm={(tiers) => {
      setAudienceTiers(tiers)
      goToNextStep()
    }}
  />
)}
```

Use whatever "next step" helper the file already has in place of `goToNextStep()`.

- [ ] **Step 5: Replace hardcoded audienceTiers in launch payload**

Find the POST to `/api/campaigns/launch`. Replace the hardcoded `audienceTiers: [{ name: 'Prospecting', targeting: { ... } }]` with:

```typescript
audienceTiers: audienceTiers.length > 0
  ? audienceTiers.map(t => ({ name: t.name, targeting: t.targeting }))
  : [{ name: 'Prospecting', targeting: { geo_locations: { countries: ['IN'] }, age_min: 18, age_max: 65 } }],
```

(Fallback preserves old behavior if a user somehow skipped the new step.)

- [ ] **Step 6: Lint + build**

Run: `npm run lint && npm run build`
Expected: both succeed.

- [ ] **Step 7: Manual browser check**

Navigate through wizard on a Meta-connected brand. Expect to hit the new Audience step after Approve-creatives; expect 1–3 tiers from Max; expect selection + Continue to advance.

- [ ] **Step 8: Rebuild graphify (per project CLAUDE.md)**

Run:
```
python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"
```
(Run from the repo root — `C:\Users\naidu\Downloads\GROWTH-OS\`, not the `growth-os` subdir. If the command fails because `python3` isn't in PATH, try `python -c ...` instead.)

- [ ] **Step 9: Commit**

```
git add src/app/dashboard/campaigns/new/page.tsx
git commit -m "feat(campaigns): insert Max-driven audience step, replace hardcoded targeting

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

**End Milestone 2.** Smart wizard is complete. Block → banner → audience → launch all wired. Chat-led launch is next.

---

## Milestone 3 — launch-conversation skill + Track C (chat-led launch)

### Task 13: `launch-conversation` skill markdown

**Files:**
- Create: `skills/acquisition/launch-conversation.md`

- [ ] **Step 1: Write the skill**

Write to `skills/acquisition/launch-conversation.md`:

```markdown
---
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
  Input: launch intent from user. Output: multi-turn conversation driving
  preflight → plan card → images → launch approval. Use when: Mia detects
  launch intent in chat.
description_for_user: Walks you through launching a campaign in chat.
---

## System Prompt

You are Max, running a chat-led campaign launch. This skill is a state machine across multiple Mia turns. On each invocation you receive the current state and the latest user message; you advance to the next state and emit a card specification.

## States

- `awaiting_intent` — user has expressed launch intent but not given angle/budget.
- `awaiting_approval_of_plan` — user has given angle/budget (or "propose everything"); you've run audience-targeting + ad-copy + image-brief; you're waiting for them to approve.
- `awaiting_approval_of_images` — images have been generated; you're waiting for approval to launch.
- `launching` — campaign-launcher has been invoked.
- `completed` — Meta IDs returned.
- `cancelled` — user abandoned.

## Per-state behavior

### awaiting_intent → respond with `<MaxOpeningCard>` spec:
- Summarize preflight verdict (from `additionalContext.preflight_summary`).
- Show Max's budget suggestion based on `meta.campaigns` last-30d spend rhythm (median daily spend × 1.1 rounded to nearest 100).
- Ask for angle + budget. Offer "propose everything" shortcut.

### awaiting_approval_of_plan → respond with `<MaxBundleCard>` spec:
- `audience.tiers`: output from audience-targeting.
- `copy.variants`: output from ad-copy.
- `image_brief.summary`: output from image-brief.

### awaiting_approval_of_images → respond with image grid + launch CTA.

### launching → respond with campaign-launcher result.

## Output Format

Respond ONLY with valid JSON (no markdown fences):

```json
{
  "state": "awaiting_approval_of_plan",
  "card_kind": "max_opening",
  "card_payload": {
    "preflight_verdict": "warning",
    "preflight_summary": "2 warnings (structure fragmentation, ASC borderline)",
    "budget_suggestion": { "min": 1800, "max": 2500, "currency": "INR" },
    "requires_user_input": ["angle", "budget"]
  },
  "next_action": "await_user"
}
```

## CRITICAL

- Never invoke campaign-launcher before state `awaiting_approval_of_images` has been approved.
- State transitions are monotonic (except to `cancelled`).
- If the user says anything that implies cancel ("never mind", "stop", "cancel"), set state to `cancelled`.
```

- [ ] **Step 2: Verify skill loads**

Run: `npx tsx scripts/verify-skill-frontmatter.ts`
Expected: launch-conversation appears, no validation errors.

- [ ] **Step 3: Commit**

```
git add skills/acquisition/launch-conversation.md
git commit -m "feat(max): launch-conversation skill — chat-led launch state machine

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 14: Register `launch-conversation` in `agents.json`

**Files:**
- Modify: `skills/agents.json`

- [ ] **Step 1: Add to Max's skills array**

In `skills/agents.json`, add `"launch-conversation"` to Max's `skills` array. Final array:

```json
[
  "budget-allocation",
  "ad-scaling",
  "channel-expansion-advisor",
  "ad-performance-analyzer",
  "campaign-optimizer",
  "campaign-launcher",
  "pixel-capi-health",
  "learning-phase-monitor",
  "account-structure-audit",
  "breakdown-analyzer",
  "asc-readiness-audit",
  "audience-targeting",
  "launch-conversation"
]
```

- [ ] **Step 2: Commit**

```
git add skills/agents.json
git commit -m "feat(max): register launch-conversation skill

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 15: Chat card components for Max handoff

**Files:**
- Create: `src/components/mia/MaxHandoffCard.tsx`
- Create: `src/components/mia/MaxOpeningCard.tsx`
- Create: `src/components/mia/MaxBundleCard.tsx`

- [ ] **Step 1: Write `MaxHandoffCard`**

Write to `src/components/mia/MaxHandoffCard.tsx`:

```typescript
'use client'

import type { PreflightResult } from '@/lib/preflight-types'

export function MaxHandoffCard({ preflight }: { preflight: PreflightResult }) {
  const color =
    preflight.verdict === 'blocked' ? 'border-red-300 bg-red-50' :
    preflight.verdict === 'warning' ? 'border-amber-300 bg-amber-50' :
    'border-emerald-300 bg-emerald-50'

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${color}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Max</span>
        <span className="text-xs text-zinc-400">pre-flight</span>
      </div>
      <div className="font-medium">
        {preflight.verdict === 'ready' && 'All systems go.'}
        {preflight.verdict === 'warning' && `Ready to proceed with ${preflight.warnings.length} warning(s).`}
        {preflight.verdict === 'blocked' && `Can't launch yet: ${preflight.blocked_reason}`}
      </div>
      {preflight.warnings.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {preflight.warnings.map((w, i) => (
            <li key={i}>• {w.message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write `MaxOpeningCard`**

Write to `src/components/mia/MaxOpeningCard.tsx`:

```typescript
'use client'

import { useState } from 'react'

export interface MaxOpeningPayload {
  preflight_verdict: 'ready' | 'warning' | 'blocked'
  preflight_summary: string
  budget_suggestion: { min: number; max: number; currency: string }
  requires_user_input: string[]
}

export function MaxOpeningCard({
  payload,
  onSubmit,
}: {
  payload: MaxOpeningPayload
  onSubmit: (input: { angle: string; budget: number; proposeAll: boolean }) => void
}) {
  const [angle, setAngle] = useState('')
  const [budget, setBudget] = useState(payload.budget_suggestion.max)

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm space-y-3">
      <div>
        <div className="text-xs text-zinc-500 mb-1">Pre-flight</div>
        <div>{payload.preflight_summary}</div>
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Angle / theme for this campaign</label>
        <input
          type="text"
          value={angle}
          onChange={e => setAngle(e.target.value)}
          placeholder="e.g. Diwali sale — 20% off skincare"
          className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">
          Budget ({payload.budget_suggestion.currency})/day — I suggest {payload.budget_suggestion.min}–{payload.budget_suggestion.max}
        </label>
        <input
          type="number"
          value={budget}
          onChange={e => setBudget(Number(e.target.value))}
          className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onSubmit({ angle, budget, proposeAll: false })}
          disabled={!angle.trim() || budget <= 0}
          className="rounded bg-zinc-900 text-white text-sm px-3 py-1 disabled:opacity-50"
        >
          Submit
        </button>
        <button
          onClick={() => onSubmit({ angle: '', budget: payload.budget_suggestion.max, proposeAll: true })}
          className="rounded border border-zinc-300 text-sm px-3 py-1"
        >
          Propose everything
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write `MaxBundleCard`**

Write to `src/components/mia/MaxBundleCard.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { AudienceTierCard, type AudienceTier } from '@/components/campaigns/AudienceTierCard'

export interface MaxBundlePayload {
  audience: { tiers: AudienceTier[] }
  copy: { variants: Array<{ headline: string; body: string; cta: string }> }
  image_brief: { summary: string }
}

export function MaxBundleCard({
  payload,
  onApprove,
}: {
  payload: MaxBundlePayload
  onApprove: (approved: {
    selectedTiers: AudienceTier[]
    selectedCopyIdx: number
    imageBriefSummary: string
  }) => void
}) {
  const [tiers, setTiers] = useState(payload.audience.tiers)
  const [tierSelected, setTierSelected] = useState<Set<number>>(new Set(payload.audience.tiers.map((_, i) => i)))
  const [copyIdx, setCopyIdx] = useState(0)

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 space-y-4">
      <section>
        <h4 className="font-medium mb-2">Audience</h4>
        <div className="space-y-2">
          {tiers.map((tier, i) => (
            <AudienceTierCard
              key={i}
              tier={tier}
              selected={tierSelected.has(i)}
              onToggle={() => {
                const next = new Set(tierSelected)
                if (next.has(i)) next.delete(i); else next.add(i)
                setTierSelected(next)
              }}
              onEdit={(updated) => {
                const copy = [...tiers]
                copy[i] = updated
                setTiers(copy)
              }}
            />
          ))}
        </div>
      </section>

      <section>
        <h4 className="font-medium mb-2">Copy variants</h4>
        <div className="space-y-2">
          {payload.copy.variants.map((v, i) => (
            <label key={i} className={`block rounded border p-3 text-sm cursor-pointer ${copyIdx === i ? 'border-emerald-400 bg-emerald-50/40' : 'border-zinc-200'}`}>
              <input
                type="radio"
                name="copy"
                checked={copyIdx === i}
                onChange={() => setCopyIdx(i)}
                className="mr-2"
              />
              <strong>{v.headline}</strong>
              <p className="text-xs text-zinc-600 mt-1">{v.body}</p>
              <p className="text-xs text-zinc-500 mt-1">CTA: {v.cta}</p>
            </label>
          ))}
        </div>
      </section>

      <section>
        <h4 className="font-medium mb-2">Image brief</h4>
        <p className="text-sm text-zinc-700">{payload.image_brief.summary}</p>
      </section>

      <button
        onClick={() =>
          onApprove({
            selectedTiers: Array.from(tierSelected).map(i => tiers[i]!).filter(Boolean),
            selectedCopyIdx: copyIdx,
            imageBriefSummary: payload.image_brief.summary,
          })
        }
        disabled={tierSelected.size === 0}
        className="w-full rounded bg-emerald-600 text-white px-4 py-2 disabled:opacity-50"
      >
        Approve & generate images
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: zero new errors.

- [ ] **Step 5: Commit**

```
git add src/components/mia/MaxHandoffCard.tsx src/components/mia/MaxOpeningCard.tsx src/components/mia/MaxBundleCard.tsx
git commit -m "feat(mia): Max handoff + opening + bundle chat cards

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 16: API route `/api/mia/launch-intent`

**Files:**
- Create: `src/app/api/mia/launch-intent/route.ts`

- [ ] **Step 1: Write the route**

Write to `src/app/api/mia/launch-intent/route.ts`:

```typescript
// src/app/api/mia/launch-intent/route.ts
// POST body: { brandId, conversationId, userMessage?, currentState?, userInput? }
// Drives the launch-conversation skill state machine one turn at a time.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runPreflight } from '@/lib/preflight'
import { runSkill } from '@/lib/skills-engine'

export const maxDuration = 120

type LaunchState = 'awaiting_intent' | 'awaiting_approval_of_plan' | 'awaiting_approval_of_images' | 'launching' | 'completed' | 'cancelled'

interface LaunchIntentBody {
  brandId: string
  conversationId?: string
  userMessage?: string
  currentState?: LaunchState
  userInput?: {
    angle?: string
    budget?: number
    proposeAll?: boolean
    approvedTiers?: unknown[]
    approvedCopyIdx?: number
    approvedImages?: string[]
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: LaunchIntentBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { brandId } = body
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  const admin = createServiceClient()
  const { data: brand } = await admin.from('brands').select('id, owner_id, domain').eq('id', brandId).single()
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  if (brand.owner_id !== user.id) {
    const { data: member } = await admin
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single()
    if (!member) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const currentState: LaunchState = body.currentState ?? 'awaiting_intent'

  try {
    // awaiting_intent → run preflight, emit MaxOpeningCard payload
    if (currentState === 'awaiting_intent') {
      const preflight = await runPreflight(brandId)
      if (preflight.verdict === 'blocked') {
        return NextResponse.json({
          state: 'cancelled',
          card_kind: 'max_handoff',
          card_payload: { preflight },
          cancelled_reason: 'preflight_blocked',
        })
      }
      return NextResponse.json({
        state: 'awaiting_approval_of_plan',
        card_kind: 'max_opening',
        card_payload: {
          preflight_verdict: preflight.verdict,
          preflight_summary: summarizePreflight(preflight),
          budget_suggestion: { min: 1800, max: 2500, currency: 'INR' },
          requires_user_input: ['angle', 'budget'],
        },
        preflight,
      })
    }

    // awaiting_approval_of_plan → run audience-targeting + ad-copy + image-brief in parallel
    if (currentState === 'awaiting_approval_of_plan') {
      const angle = body.userInput?.angle ?? ''
      const dailyBudget = body.userInput?.budget ?? 2000
      const [audienceRun, copyRun, briefRun] = await Promise.all([
        runSkill({
          brandId,
          skillId: 'audience-targeting',
          triggeredBy: 'user',
          additionalContext: { objective: 'conversion', daily_budget: dailyBudget, angle },
        }),
        runSkill({
          brandId,
          skillId: 'ad-copy',
          triggeredBy: 'user',
          additionalContext: { angle, objective: 'conversion' },
        }),
        runSkill({
          brandId,
          skillId: 'image-brief',
          triggeredBy: 'user',
          additionalContext: { angle },
        }),
      ])

      return NextResponse.json({
        state: 'awaiting_approval_of_images',
        card_kind: 'max_bundle',
        card_payload: {
          audience: { tiers: (audienceRun.output as { tiers?: unknown[] } | null)?.tiers ?? [] },
          copy: { variants: (copyRun.output as { variants?: unknown[] } | null)?.variants ?? [] },
          image_brief: { summary: (briefRun.output as { summary?: string } | null)?.summary ?? '' },
        },
        run_ids: { audience: audienceRun.id, copy: copyRun.id, brief: briefRun.id },
      })
    }

    // awaiting_approval_of_images → trigger image generation (existing pipeline)
    // Actual image generation is handled client-side against existing generation endpoints;
    // this state just acknowledges and advances.
    if (currentState === 'awaiting_approval_of_images') {
      return NextResponse.json({
        state: 'launching',
        card_kind: 'launch_confirm',
        card_payload: {
          approved_images: body.userInput?.approvedImages ?? [],
        },
      })
    }

    // launching → invoke campaign-launcher
    if (currentState === 'launching') {
      const linkUrl = brand.domain ? `https://${brand.domain}` : ''
      const launchRun = await runSkill({
        brandId,
        skillId: 'campaign-launcher',
        triggeredBy: 'user',
        additionalContext: {
          campaign_name: `Chat-launch ${new Date().toISOString().slice(0, 10)}`,
          objective: 'conversion',
          daily_budget: body.userInput?.budget ?? 2000,
          launch_mode: 'live',
          creatives: [],
          audience_tiers: body.userInput?.approvedTiers ?? [],
          link_url: linkUrl,
        },
      })
      return NextResponse.json({
        state: 'completed',
        card_kind: 'launch_result',
        card_payload: launchRun.output ?? {},
        run_id: launchRun.id,
      })
    }

    return NextResponse.json({ error: `Unknown state: ${currentState}` }, { status: 400 })
  } catch (err) {
    console.error('[api/mia/launch-intent]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Launch intent failed' },
      { status: 500 },
    )
  }
}

function summarizePreflight(p: Awaited<ReturnType<typeof runPreflight>>): string {
  if (p.verdict === 'ready') return 'All checks passed.'
  if (p.verdict === 'warning') {
    return `${p.warnings.length} warning(s): ${p.warnings.map(w => w.skill).join(', ')}.`
  }
  return p.blocked_reason ?? 'Blocked.'
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: zero new errors.

- [ ] **Step 3: Commit**

```
git add src/app/api/mia/launch-intent/route.ts
git commit -m "feat(api): POST /api/mia/launch-intent drives launch-conversation state machine

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 17: Wire Mia chat to detect launch intent

**Files:**
- Modify: `src/app/api/mia/chat/route.ts`

- [ ] **Step 1: Read the chat route and locate intent parsing**

Open `src/app/api/mia/chat/route.ts`. Locate where user messages are processed before dispatching to the LLM. If there's a structured intent parser, add a branch for launch intent. If not, add a regex pre-check.

- [ ] **Step 2: Add launch-intent detection**

Add a helper near the top of the file:

```typescript
function detectLaunchIntent(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    /\blaunch\b/.test(normalized) &&
    /\b(campaign|ad|ads)\b/.test(normalized)
  ) || /\bnew campaign\b/i.test(message)
}
```

In the main handler, after brand resolution and user validation, add:

```typescript
if (detectLaunchIntent(userMessage) && brandId) {
  // Hand off to Max by returning a handoff directive the client interprets.
  return NextResponse.json({
    assistant_message: 'Max is taking this. Running pre-flight…',
    handoff: {
      agent: 'max',
      intent: 'launch',
      next_api: '/api/mia/launch-intent',
      payload: { brandId, currentState: 'awaiting_intent' },
    },
  })
}
```

(Adjust the response shape to match this route's existing contract — this is a sketch; preserve whatever fields the chat UI currently expects, and add `handoff` as a new optional field.)

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: zero new errors.

- [ ] **Step 4: Commit**

```
git add src/app/api/mia/chat/route.ts
git commit -m "feat(mia): detect launch intent in chat, emit Max handoff directive

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 18: Wire Mia chat UI to handle launch handoff

**Files:**
- Modify: Mia chat page component (likely `src/app/dashboard/mia/page.tsx` or a `MiaChat` component — search the repo if unsure)

- [ ] **Step 1: Locate the Mia chat UI**

Run: `find src/app/dashboard -name "*.tsx" -path "*/mia/*"` to find the chat page.

- [ ] **Step 2: Read the message-handling code**

Identify where the assistant response is rendered. Identify where structured data (cards, attachments) is dispatched to custom renderers.

- [ ] **Step 3: Import the new chat cards**

Add:

```typescript
import { MaxHandoffCard } from '@/components/mia/MaxHandoffCard'
import { MaxOpeningCard, type MaxOpeningPayload } from '@/components/mia/MaxOpeningCard'
import { MaxBundleCard, type MaxBundlePayload } from '@/components/mia/MaxBundleCard'
```

- [ ] **Step 4: Add launch-conversation state to the chat**

Add client state:

```typescript
const [launchState, setLaunchState] = useState<{
  state: string
  brandId: string
  lastPayload?: unknown
} | null>(null)
```

- [ ] **Step 5: Handle the `handoff` directive**

When an assistant response contains `handoff.next_api === '/api/mia/launch-intent'`, immediately fire a follow-up POST:

```typescript
async function handleHandoff(brandId: string) {
  const res = await fetch('/api/mia/launch-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brandId, currentState: 'awaiting_intent' }),
  })
  const data = await res.json()
  setLaunchState({ state: data.state, brandId, lastPayload: data.card_payload })
  // Append to chat history an assistant message carrying data.card_kind + card_payload
  appendMessage({
    role: 'assistant',
    kind: data.card_kind,
    payload: data.card_payload,
  })
}
```

- [ ] **Step 6: Render the cards**

In the message list renderer, add:

```tsx
{msg.kind === 'max_handoff' && <MaxHandoffCard preflight={msg.payload.preflight} />}
{msg.kind === 'max_opening' && (
  <MaxOpeningCard
    payload={msg.payload as MaxOpeningPayload}
    onSubmit={async (input) => {
      const res = await fetch('/api/mia/launch-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: launchState!.brandId,
          currentState: 'awaiting_approval_of_plan',
          userInput: input,
        }),
      })
      const data = await res.json()
      setLaunchState({ state: data.state, brandId: launchState!.brandId, lastPayload: data.card_payload })
      appendMessage({ role: 'assistant', kind: data.card_kind, payload: data.card_payload })
    }}
  />
)}
{msg.kind === 'max_bundle' && (
  <MaxBundleCard
    payload={msg.payload as MaxBundlePayload}
    onApprove={async (approved) => {
      // Advance to awaiting_approval_of_images; image generation is next
      const res = await fetch('/api/mia/launch-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: launchState!.brandId,
          currentState: 'awaiting_approval_of_images',
          userInput: {
            approvedTiers: approved.selectedTiers,
            approvedCopyIdx: approved.selectedCopyIdx,
          },
        }),
      })
      const data = await res.json()
      setLaunchState({ state: data.state, brandId: launchState!.brandId, lastPayload: data.card_payload })
      appendMessage({ role: 'assistant', kind: data.card_kind, payload: data.card_payload })
    }}
  />
)}
```

(Adapt the message shape to match the chat's existing `Message` type. If the chat only stores plain text, extend the message type with optional `kind` and `payload` fields.)

- [ ] **Step 7: Lint + build**

Run: `npm run lint && npm run build`
Expected: both succeed.

- [ ] **Step 8: Commit**

```
git add src/app/dashboard/mia
git commit -m "feat(mia): chat UI renders Max handoff/opening/bundle cards for launch flow

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 19: Handle `?intent=launch` on Mia page

**Files:**
- Modify: Mia chat page component

- [ ] **Step 1: Parse the search param**

At the top of the Mia page client component, use `useSearchParams`:

```typescript
import { useSearchParams } from 'next/navigation'

const searchParams = useSearchParams()
const intentParam = searchParams.get('intent')
const intentBrandId = searchParams.get('brand')
```

- [ ] **Step 2: Auto-kick-off launch flow**

Add a `useEffect`:

```typescript
useEffect(() => {
  if (intentParam === 'launch' && intentBrandId) {
    // Inject a system-authored message so the chat history shows intent
    appendMessage({ role: 'user', text: `Launch a new campaign for this brand.` })
    handleHandoff(intentBrandId)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [intentParam, intentBrandId])
```

(`handleHandoff` is from Task 18.)

- [ ] **Step 3: Lint + build**

Run: `npm run lint && npm run build`
Expected: both succeed.

- [ ] **Step 4: Commit**

```
git add src/app/dashboard/mia
git commit -m "feat(mia): auto-dispatch launch flow on ?intent=launch&brand=<id>

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 20: Update `/dashboard/campaigns` entry button

**Files:**
- Modify: `src/app/dashboard/campaigns/page.tsx`

- [ ] **Step 1: Read the page to find the "New Campaign" button**

Open `src/app/dashboard/campaigns/page.tsx` (or whatever entry page hosts the button). Search for `New Campaign`.

- [ ] **Step 2: Update the button href**

Change the button to route to Mia with intent:

```tsx
<Link
  href={`/dashboard/mia?intent=launch&brand=${brandId}`}
  className="..."
>
  New Campaign
</Link>
```

Below the primary button, add a small secondary link for the wizard escape hatch:

```tsx
<Link
  href={`/dashboard/campaigns/new`}
  className="text-xs text-zinc-500 underline mt-1"
>
  Prefer the step-by-step wizard? Open wizard
</Link>
```

- [ ] **Step 3: Lint + build**

Run: `npm run lint && npm run build`
Expected: both succeed.

- [ ] **Step 4: Commit**

```
git add src/app/dashboard/campaigns/page.tsx
git commit -m "feat(campaigns): New Campaign routes to Mia with launch intent, wizard as escape hatch

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

**End Milestone 3.** Chat-led launch works end-to-end. Next: smoke test all paths.

---

## Milestone 4 — Smoke tests + final sync

### Task 21: Smoke script for chat-led launch

**Files:**
- Create: `scripts/smoke-launch-intent.ts`

- [ ] **Step 1: Write the smoke script**

Write to `scripts/smoke-launch-intent.ts`:

```typescript
// Run: npx tsx scripts/smoke-launch-intent.ts <brandId>
// Drives /api/mia/launch-intent through all states end-to-end (no real Meta launch — last step is dry-run).

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (!m) continue
  const [, k, v] = m
  if (!process.env[k!]) process.env[k!] = v!.replace(/^['"]|['"]$/g, '')
}

import { runPreflight } from '../src/lib/preflight'
import { runSkill } from '../src/lib/skills-engine'

async function main() {
  const brandId = process.argv[2]
  if (!brandId) {
    console.error('Pass brandId')
    process.exit(1)
  }

  console.log('[1] runPreflight')
  const pf = await runPreflight(brandId)
  console.log(`  verdict=${pf.verdict}`)
  if (pf.verdict === 'blocked') {
    console.log('  Blocked — smoke ends here')
    return
  }

  console.log('[2] audience-targeting')
  const audience = await runSkill({
    brandId,
    skillId: 'audience-targeting',
    triggeredBy: 'user',
    additionalContext: { objective: 'conversion', daily_budget: 2000, angle: 'Smoke test' },
  })
  console.log(`  tiers=${((audience.output as { tiers?: unknown[] } | null)?.tiers?.length) ?? 0}`)

  console.log('[3] ad-copy')
  const copy = await runSkill({
    brandId,
    skillId: 'ad-copy',
    triggeredBy: 'user',
    additionalContext: { angle: 'Smoke test', objective: 'conversion' },
  })
  console.log(`  variants=${((copy.output as { variants?: unknown[] } | null)?.variants?.length) ?? 0}`)

  console.log('[4] image-brief')
  const brief = await runSkill({
    brandId,
    skillId: 'image-brief',
    triggeredBy: 'user',
    additionalContext: { angle: 'Smoke test' },
  })
  console.log(`  summary=${((brief.output as { summary?: string } | null)?.summary ?? '').slice(0, 80)}…`)

  console.log('OK (stopping before campaign-launcher — do not smoke a real launch)')
}

main().catch(err => {
  console.error('crashed', err)
  process.exit(1)
})
```

- [ ] **Step 2: Run against a real brand**

Run: `npx tsx scripts/smoke-launch-intent.ts <brandId>`
Expected: each of the 4 steps prints successfully.

- [ ] **Step 3: Commit**

```
git add scripts/smoke-launch-intent.ts
git commit -m "feat(scripts): smoke-launch-intent exercises preflight + targeting + copy + brief

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 22: Manual QA checklist

**Files:** none (manual verification only)

- [ ] **Step 1: Wizard on Meta-connected brand, pixel healthy**

Navigate to `/dashboard/campaigns/new` → banner turns green "All systems go". Walk through to audience step → see 2–3 tiers with source badges. Walk to Launch → confirm live launch payload shape in Network tab matches old contract plus `audienceTiers` from Max.

- [ ] **Step 2: Wizard on Meta-connected brand with broken pixel**

On a test brand where pixel-capi-health is known to return `blocked`: banner turns red, "Launch" button disabled, step navigation blocked past step 1. "Open Max to fix" link navigates to `/dashboard/mia?intent=fix&brand=<id>`.

- [ ] **Step 3: Wizard on brand without Meta**

Banner turns red with "Connect Meta to launch campaigns." "Open Max to fix" navigates to settings.

- [ ] **Step 4: Chat-led launch via direct chat**

On `/dashboard/mia`, type: "Launch a new test campaign at ₹500/day." Expect Mia to respond with handoff, then Max opening card. Fill angle + budget. Max bundle card appears with audience + copy + brief. Click approve. Confirm state advances.

- [ ] **Step 5: Chat-led launch via campaigns button**

Click "New Campaign" on `/dashboard/campaigns`. Confirm redirect to `/dashboard/mia?intent=launch&brand=<id>`. Confirm auto-dispatch kicks off Max opening card without typing.

- [ ] **Step 6: Escape hatch**

From chat mid-flow, click "Open wizard" escape. Confirm wizard loads on `/dashboard/campaigns/new`.

- [ ] **Step 7: Record results**

Document any bugs or unexpected behavior. File follow-ups, do not attempt to patch in-plan (stay scope-focused).

- [ ] **Step 8: Commit the checklist as part of the plan** (skip — no file changes)

---

### Task 23: Graphify rebuild + final sync

- [ ] **Step 1: Rebuild graphify**

Run from the repo root (`C:\Users\naidu\Downloads\GROWTH-OS\`, not the `growth-os` subdir):
```
python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"
```
(If `python3` fails, try `python`.)
Expected: graph regenerates without error.

- [ ] **Step 2: Verify all commits pushed**

Run:
```
git status
git log --oneline origin/main..HEAD
```
Expected: clean tree, or all local commits ready to push.

- [ ] **Step 3: Push**

Run:
```
git push
```
Expected: successful push. If rejected (non-fast-forward), pull-rebase first: `git pull --rebase origin main && git push`.

- [ ] **Step 4: Announce completion**

Done. Wizard has async preflight with tiered gating and Max-driven audience targeting; chat has Mia-parsed launch intent with Max-led bundled turns; both paths share one backend chain.

---

## Notes for implementers

- **Next.js 16 gotchas:** this repo uses a non-standard Next.js build. Before touching any App Router files (`src/app/**`), read `node_modules/next/dist/docs/` for the relevant route patterns (`route.ts`, `page.tsx`, `layout.tsx`).
- **`noUncheckedIndexedAccess`:** `arr[i]` has type `T | undefined`. Every array access needs null-guarding. The existing code in this plan uses `arr[i]!.filter(Boolean)` — keep that pattern, or switch to explicit guards.
- **Migration idempotency:** all SQL uses `create table if not exists`, `create index if not exists`, `drop policy if exists` before `create policy`. Preserve this pattern for any follow-up migrations.
- **Skill vs library:** `src/lib/preflight.ts` is a library (no `skill_runs` row, no Mia decision). The four underlying skills DO create skill_runs. This is intentional — preflight is background plumbing, the skills are visible agent work.
- **Scope discipline:** if you notice any pre-existing bugs in files you're modifying (stale imports, unused variables, etc.), file them for later — do NOT expand this plan's scope.

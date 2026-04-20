# DEVLOG + Public Changelog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an auto-generated internal DEVLOG (from git history), a hand-written `DEVELOPERS.md` onboarding guide, and a curated public `/changelog` page linked from every landing-page footer.

**Architecture:** Three independent artifacts. (1) A Node script + GitHub Action regenerates `growth-os/DEVLOG.md` on every push to `main`. (2) `growth-os/DEVELOPERS.md` is a static onboarding guide. (3) A typed content file at `growth-os/content/changelog.ts` is rendered by `src/app/changelog/page.tsx` and linked from `public-footer.tsx`. The three pieces can be shipped in any order; plan orders them by dependency (automation first so DEVLOG exists when DEVELOPERS.md references it).

**Tech Stack:** Node 20+ (scripting), GitHub Actions, Next.js 16 (app router, non-standard — see `growth-os/AGENTS.md`), TypeScript, Tailwind.

**Source spec:** `growth-os/docs/superpowers/specs/2026-04-21-devlog-and-changelog-design.md`

**Working directory for all steps:** `growth-os/` (the Next.js app). Paths in this plan are relative to `growth-os/` unless prefixed with `.github/` (repo root).

---

## Phase 1 — DEVLOG automation

### Task 1: Write `build-devlog.mjs` script

**Files:**
- Create: `growth-os/scripts/build-devlog.mjs`

- [ ] **Step 1: Create the script**

Path: `growth-os/scripts/build-devlog.mjs`

```javascript
#!/usr/bin/env node
/**
 * Regenerates growth-os/DEVLOG.md from the full git history.
 * Idempotent: running twice produces identical output.
 *
 * Run manually:   node scripts/build-devlog.mjs
 * Run in CI:      triggered by .github/workflows/devlog.yml
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const DEVLOG_PATH = resolve(REPO_ROOT, 'DEVLOG.md')

const BOT_SUBJECT_PREFIX = 'chore(devlog):'
const GROUP_HEADER = (isoDate) => `## Week of ${isoDate}`

function readGitLog() {
  // Delimiter chosen to avoid collision with commit subjects.
  const FMT = '%H\x1f%s\x1f%an\x1f%aI'
  const stdout = execSync(
    `git log --pretty=format:"${FMT}" --no-merges`,
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 },
  )
  if (!stdout.trim()) return []
  return stdout.split('\n').map((line) => {
    const [sha, subject, author, isoDate] = line.split('\x1f')
    return { sha, subject, author, isoDate }
  })
}

function isBotCommit(c) {
  return c.subject.startsWith(BOT_SUBJECT_PREFIX)
}

/** ISO week start (Monday) for a given YYYY-MM-DDTHH:MM:SS+TZ string. */
function isoWeekStart(isoDate) {
  const d = new Date(isoDate)
  // UTC to avoid TZ drift between local and CI runners.
  const day = d.getUTCDay() // 0 Sun .. 6 Sat
  const diffToMon = (day + 6) % 7
  const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMon))
  return mon.toISOString().slice(0, 10)
}

function groupByWeek(commits) {
  const groups = new Map()
  for (const c of commits) {
    const key = isoWeekStart(c.isoDate)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(c)
  }
  // Sort groups: newest week first. Commits already come newest-first from git log.
  return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
}

function renderEntry(c) {
  const shortSha = c.sha.slice(0, 8)
  const date = c.isoDate.slice(0, 10)
  return `- **${shortSha}** — ${c.subject} *(${c.author}, ${date})*`
}

function renderDevlog(groups) {
  const today = new Date().toISOString().slice(0, 10)
  const header = [
    '# DEVLOG',
    '',
    'Auto-generated from git history on every push to `main`. Do not edit by hand —',
    'changes will be overwritten. For the user-facing changelog, see /changelog.',
    '',
    `Last updated: ${today}`,
    '',
  ].join('\n')
  const body = groups
    .map(([weekStart, commits]) =>
      [GROUP_HEADER(weekStart), '', ...commits.map(renderEntry), ''].join('\n'),
    )
    .join('\n')
  return `${header}\n${body}`
}

function main() {
  const commits = readGitLog().filter((c) => !isBotCommit(c))
  const output = renderDevlog(groupByWeek(commits))
  const existing = existsSync(DEVLOG_PATH) ? readFileSync(DEVLOG_PATH, 'utf8') : ''
  if (existing === output) {
    console.log('[build-devlog] no changes')
    process.exit(0)
  }
  writeFileSync(DEVLOG_PATH, output, 'utf8')
  console.log(`[build-devlog] wrote ${DEVLOG_PATH}`)
}

main()
```

- [ ] **Step 2: Run the script to generate DEVLOG.md**

Run from `growth-os/`:

```bash
node scripts/build-devlog.mjs
```

Expected stdout: `[build-devlog] wrote <path>/DEVLOG.md`

- [ ] **Step 3: Inspect the output**

Open `growth-os/DEVLOG.md`. Confirm:
- Title line `# DEVLOG` and the boilerplate paragraph are present
- First `## Week of YYYY-MM-DD` header exists
- Recent commit subjects appear (e.g. `fix(settings): always-visible delete button...`)
- No merge commits, no `chore(devlog):` lines

- [ ] **Step 4: Verify idempotency**

Run the script a second time:

```bash
node scripts/build-devlog.mjs
```

Expected stdout: `[build-devlog] no changes`

If it says "wrote" on a clean second run, the output is nondeterministic — fix before continuing (most likely cause: the `Last updated` line changing on a day boundary; if so, re-run and confirm within the same day, or adjust to a commit-derived date).

- [ ] **Step 5: Commit**

```bash
git add growth-os/scripts/build-devlog.mjs growth-os/DEVLOG.md
git commit -m "feat(devlog): add build-devlog script and initial DEVLOG.md"
```

---

### Task 2: Add GitHub Action workflow

**Files:**
- Create: `.github/workflows/devlog.yml` (at **repo root**, not inside `growth-os/`)

- [ ] **Step 1: Create the workflow file**

Path: `.github/workflows/devlog.yml`

```yaml
name: Update DEVLOG

on:
  push:
    branches: [main]

permissions:
  contents: write

jobs:
  update-devlog:
    runs-on: ubuntu-latest
    # Skip when the triggering commit was made by the bot itself.
    if: "!contains(github.event.head_commit.message, '[skip ci]') && !startsWith(github.event.head_commit.message, 'chore(devlog):')"
    steps:
      - name: Checkout full history
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Regenerate DEVLOG.md
        working-directory: growth-os
        run: node scripts/build-devlog.mjs

      - name: Commit if changed
        run: |
          if [[ -n "$(git status --porcelain growth-os/DEVLOG.md)" ]]; then
            git config user.name  "devlog-bot"
            git config user.email "devlog-bot@users.noreply.github.com"
            git add growth-os/DEVLOG.md
            git commit -m "chore(devlog): update [skip ci]"
            git push
          else
            echo "DEVLOG unchanged — nothing to commit"
          fi
```

- [ ] **Step 2: Verify repo Actions permissions**

On GitHub repo settings → Actions → General → Workflow permissions, confirm "Read and write permissions" is selected. If it's "Read repository contents permission" the bot cannot push back and the workflow will fail. Fix in the UI if needed. If user doesn't want to change this, flag it — no code change fixes it.

- [ ] **Step 3: Commit the workflow**

```bash
git add .github/workflows/devlog.yml
git commit -m "feat(ci): auto-regenerate DEVLOG.md on push to main"
```

- [ ] **Step 4: Trigger the workflow via a noop push**

Only after confirming Step 2. Push the current branch to its remote and merge/push to `main` through the normal flow. On next push to `main` watch the Actions tab:
- The `update-devlog` job should run.
- If commits have been added since the last DEVLOG regenerate, a new commit `chore(devlog): update [skip ci]` should land on `main`.
- That bot commit must NOT retrigger the workflow (verify by looking at Actions — no second run).

If the bot commit DOES trigger another run, double-check the `if:` condition in the workflow and the commit message format.

---

## Phase 2 — DEVELOPERS.md

### Task 3: Write `DEVELOPERS.md` onboarding guide

**Files:**
- Create: `growth-os/DEVELOPERS.md`
- Modify: `growth-os/README.md` (add pointer to `DEVELOPERS.md`)

- [ ] **Step 1: Create `DEVELOPERS.md`**

Path: `growth-os/DEVELOPERS.md`

```markdown
# Growth OS — Developer Guide

Onboarding reference for new contributors. For a chronological log of every
code change, see [DEVLOG.md](./DEVLOG.md). For the user-facing changelog, see
[/changelog](https://growthOS.ai/changelog) *(URL TBD at deploy)*.

## Architecture overview

Growth OS is a Next.js 16 app backed by Supabase, wired to a set of AI agents
that run marketing workflows for D2C brands. The codebase has a few unusual
shapes worth knowing before you write anything.

- **Next.js 16 is non-standard here.** Read `growth-os/AGENTS.md` before
  editing app-router code. APIs and file conventions may differ from what
  most tutorials document. When in doubt, check the `node_modules/next/dist/docs/`
  reference the AGENTS.md file points at.
- **Supabase is the primary backend.** The CLI is already linked to project
  `GrowthOsFinal`. Apply migrations with
  `npx supabase db query --linked -f supabase/migrations/NNN-name.sql`.
  See `growth-os/CLAUDE.md` for the full workflow.
- **Agents live under `src/app/agents/` and are coordinated by skills.**
  Each skill is a Markdown file under `growth-os/skills/` describing a
  capability. Skills are invoked through `src/app/api/...` routes.
- **Public pages use shared nav + footer.** `src/components/landing/public-nav.tsx`
  and `public-footer.tsx` are wrapped around every marketing page. Don't
  inline new navs or footers — extend the shared components.

## Local setup

1. Clone and install:

   ```bash
   git clone https://github.com/karannnaidu/growthOSFinal.git
   cd growthOSFinal/growth-os
   npm install
   ```

2. Copy `.env.example` to `.env.local` if it exists; otherwise ask the
   maintainer for the env var list. You will need at minimum:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

3. Run the dev server:

   ```bash
   npm run dev
   ```

   App at `http://localhost:3000`.

## Conventions

### Commit messages

Conventional commits. The type prefix drives two pipelines:

- **DEVLOG.md** (auto-generated) — all non-merge commits appear, grouped by
  ISO week.
- **Public changelog** (curated) — write entries by hand in
  `growth-os/content/changelog.ts`. Use the commit type to decide which
  section an entry belongs to:

  | Commit type | Public changelog section | Shows on /changelog? |
  |---|---|---|
  | `feat:` | What's new | Yes |
  | `fix:` / `perf:` | Improvements | Yes |
  | `chore:` / `docs:` / `refactor:` / `test:` | — | No |

### File layout

- `growth-os/src/app/` — Next.js app router pages and API routes.
- `growth-os/src/components/` — shared components. `landing/` is the marketing
  site; `ui/` is the shadcn-style primitive layer.
- `growth-os/src/lib/` — server-side helpers (Supabase clients, agents, etc).
- `growth-os/skills/` — skill Markdown files.
- `growth-os/supabase/migrations/` — numbered migrations (`NNN-name.sql`, not
  timestamped).
- `growth-os/content/` — authored content rendered by public pages
  (currently: changelog).
- `growth-os/scripts/` — Node CLI helpers (verify scripts, one-off migrations,
  `build-devlog.mjs`).
- `growth-os/docs/superpowers/specs/` — design docs for non-trivial features.
- `growth-os/docs/superpowers/plans/` — implementation plans that executed
  those specs.

### Shipping a user-visible change

1. Land the feature commit(s) to `main` with a conventional-commit message.
2. Add an entry to `growth-os/content/changelog.ts` under today's date,
   written in Growth OS voice (clear, user-facing — not a git log line).
3. Push. `DEVLOG.md` updates automatically via
   `.github/workflows/devlog.yml`.
4. Your changelog entry ships on the next deploy; the `/changelog` page is
   statically rendered at build time.

## References

- [DEVLOG.md](./DEVLOG.md) — auto-generated commit history
- [/changelog](./src/app/changelog/page.tsx) — public-facing changelog page
- [CLAUDE.md](./CLAUDE.md) — Supabase migration rules, graphify setup
- [AGENTS.md](./AGENTS.md) — Next.js 16 caveats
- [docs/superpowers/specs/](./docs/superpowers/specs/) — feature designs
- [docs/superpowers/plans/](./docs/superpowers/plans/) — implementation plans
```

- [ ] **Step 2: Update `README.md` to point at DEVELOPERS.md**

Path: `growth-os/README.md`

Current file is the default Next.js create-next-app template. Replace the entire contents with:

```markdown
# Growth OS

AI marketing platform for D2C brands. 12 agents. One dashboard.

## Run locally

```bash
npm install
npm run dev
```

App at `http://localhost:3000`.

## For contributors

See **[DEVELOPERS.md](./DEVELOPERS.md)** for the architecture overview, local
setup details, and project conventions. For a chronological log of every
change, see [DEVLOG.md](./DEVLOG.md).

## Links

- Public site: https://growthOS.ai *(URL TBD)*
- Public changelog: [/changelog](./src/app/changelog/page.tsx)
- Design specs: [docs/superpowers/specs/](./docs/superpowers/specs/)
```

- [ ] **Step 3: Commit**

```bash
git add growth-os/DEVELOPERS.md growth-os/README.md
git commit -m "docs: add DEVELOPERS.md and trim README to contributor pointer"
```

---

## Phase 3 — Public changelog page

Decision: storing entries in a typed TS file (`content/changelog.ts`) rather
than MDX. Reasons: (1) spec's fallback path — zero new deps, zero Next.js
config, and this codebase flags non-standard Next.js conventions; (2) TypeScript
catches shape errors at build time; (3) single-file authoring is preserved.

### Task 4: Create typed changelog content file

**Files:**
- Create: `growth-os/content/changelog.ts`

- [ ] **Step 1: Create the content file**

Path: `growth-os/content/changelog.ts`

```typescript
/**
 * Public changelog content. Edited by hand when shipping user-visible features.
 *
 * Newest entries first. Each `date` is YYYY-MM-DD (ship date, not commit date).
 * Write `title` and `body` in Growth OS voice: clear, user-facing, not a git
 * log line. Use commit type to pick `type`:
 *
 *   - feat:        → 'whats-new'
 *   - fix: / perf: → 'improvement'
 *   - other:       → don't add here (stays in DEVLOG only)
 */

export type ChangelogItemType = 'whats-new' | 'improvement' | 'fix'

export interface ChangelogItem {
  type: ChangelogItemType
  title: string
  body?: string
}

export interface ChangelogEntry {
  /** YYYY-MM-DD */
  date: string
  items: ChangelogItem[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-04-21',
    items: [
      {
        type: 'whats-new',
        title: 'Changelog is live',
        body: 'Track every user-facing improvement to Growth OS on this page.',
      },
    ],
  },
]

/** Labels rendered under each date grouping. */
export const SECTION_LABELS: Record<ChangelogItemType, string> = {
  'whats-new': "What's new",
  improvement: 'Improvements',
  fix: 'Fixes',
}

/** Section render order inside each date. */
export const SECTION_ORDER: ChangelogItemType[] = ['whats-new', 'improvement', 'fix']
```

- [ ] **Step 2: Commit**

```bash
git add growth-os/content/changelog.ts
git commit -m "feat(changelog): add typed content source for public changelog"
```

---

### Task 5: Build the `/changelog` page

**Files:**
- Create: `growth-os/src/app/changelog/page.tsx`
- Create: `growth-os/src/app/changelog/client.tsx`

Matches the existing public-page pattern (server `page.tsx` that handles auth + metadata, delegating rendering to a client component) — see `src/app/about/page.tsx` and `src/app/about/client.tsx`.

- [ ] **Step 1: Create the server entry**

Path: `growth-os/src/app/changelog/page.tsx`

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ChangelogPageClient from './client'

export const metadata = {
  title: 'Changelog — Growth OS',
  description: 'New features, improvements, and fixes. Shipped regularly.',
  openGraph: {
    title: 'Changelog — Growth OS',
    description: 'New features, improvements, and fixes. Shipped regularly.',
    type: 'website',
  },
}

export default async function ChangelogPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')
  return <ChangelogPageClient />
}
```

- [ ] **Step 2: Create the client renderer**

Path: `growth-os/src/app/changelog/client.tsx`

```tsx
'use client'

import { PublicNav } from '@/components/landing/public-nav'
import { PublicFooter } from '@/components/landing/public-footer'
import {
  CHANGELOG,
  SECTION_LABELS,
  SECTION_ORDER,
  type ChangelogEntry,
  type ChangelogItemType,
} from '../../../content/changelog'

function formatDate(iso: string): string {
  // "2026-04-21" → "Apr 21, 2026"
  const parts = iso.split('-').map(Number)
  const y = parts[0] ?? 1970
  const m = parts[1] ?? 1
  const d = parts[2] ?? 1
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function groupItems(entry: ChangelogEntry) {
  const grouped: Record<ChangelogItemType, typeof entry.items> = {
    'whats-new': [],
    improvement: [],
    fix: [],
  }
  for (const item of entry.items) grouped[item.type].push(item)
  return grouped
}

export default function ChangelogPageClient() {
  return (
    <div className="!bg-[#f8f9ff] !text-[#0b1c30] font-body selection:bg-[#e9ddff] selection:text-[#5516be] min-h-screen">
      <PublicNav />
      <main className="pt-20">
        <section className="mx-auto w-full max-w-3xl px-6 py-16">
          <header className="mb-12">
            <h1 className="font-heading text-4xl font-bold text-[#0b1c30] md:text-5xl">
              Changelog
            </h1>
            <p className="mt-3 text-lg text-[#45464d]">
              New features, improvements, and fixes. Shipped regularly.
            </p>
          </header>

          <ol className="flex flex-col gap-12">
            {CHANGELOG.map((entry) => {
              const grouped = groupItems(entry)
              return (
                <li
                  key={entry.date}
                  className="border-t border-[#e5eeff] pt-8"
                >
                  <p className="font-heading text-sm font-semibold uppercase tracking-wider text-[#6b38d4]">
                    {formatDate(entry.date)}
                  </p>
                  <div className="mt-4 flex flex-col gap-6">
                    {SECTION_ORDER.map((type) => {
                      const items = grouped[type]
                      if (items.length === 0) return null
                      return (
                        <div key={type}>
                          <h2 className="font-heading text-base font-semibold text-[#0b1c30]">
                            {SECTION_LABELS[type]}
                          </h2>
                          <ul className="mt-2 flex flex-col gap-3">
                            {items.map((item, idx) => (
                              <li key={idx}>
                                <p className="font-heading text-base font-semibold text-[#0b1c30]">
                                  {item.title}
                                </p>
                                {item.body && (
                                  <p className="mt-1 text-sm leading-relaxed text-[#45464d]">
                                    {item.body}
                                  </p>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                    })}
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      </main>
      <PublicFooter />
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run from `growth-os/`:

```bash
npx tsc --noEmit
```

Expected: exit code 0, no output. Note: the import uses a relative path (`../../../content/changelog`) rather than the `@/` alias because the alias maps to `./src/*` and `content/` lives outside `src/`.

- [ ] **Step 4: Visual verification in dev server**

```bash
npm run dev
```

Open `http://localhost:3000/changelog`. Confirm:
- Public nav and footer render
- "Changelog" H1 with subtitle visible
- One entry for 2026-04-21 under "What's new" heading
- Typography and colors match the rest of the marketing site (compare to `/about`)

- [ ] **Step 5: Commit**

```bash
git add growth-os/src/app/changelog/
git commit -m "feat(changelog): add public /changelog page"
```

---

### Task 6: Add footer link and final verification

**Files:**
- Modify: `growth-os/src/components/landing/public-footer.tsx`

- [ ] **Step 1: Add the Changelog link**

Path: `growth-os/src/components/landing/public-footer.tsx`

Find the "Resources" column (around line 29-36, the `<div>` containing `<h5>...Resources</h5>` and `<ul>`). Add a Changelog `<li>` as the first item in that list.

Replace this block:

```tsx
<div>
  <h5 className="font-heading text-sm font-semibold uppercase tracking-wider text-[#0b1c30]">Resources</h5>
  <ul className="mt-3 flex flex-col gap-2">
    <li><Link href="/market" className="text-sm text-[#45464d] hover:text-[#6b38d4]">Market</Link></li>
    <li><Link href="/support" className="text-sm text-[#45464d] hover:text-[#6b38d4]">Support</Link></li>
    <li><Link href="mailto:hello@growthOS.ai" className="text-sm text-[#45464d] hover:text-[#6b38d4]">Contact</Link></li>
  </ul>
</div>
```

with:

```tsx
<div>
  <h5 className="font-heading text-sm font-semibold uppercase tracking-wider text-[#0b1c30]">Resources</h5>
  <ul className="mt-3 flex flex-col gap-2">
    <li><Link href="/changelog" className="text-sm text-[#45464d] hover:text-[#6b38d4]">Changelog</Link></li>
    <li><Link href="/market" className="text-sm text-[#45464d] hover:text-[#6b38d4]">Market</Link></li>
    <li><Link href="/support" className="text-sm text-[#45464d] hover:text-[#6b38d4]">Support</Link></li>
    <li><Link href="mailto:hello@growthOS.ai" className="text-sm text-[#45464d] hover:text-[#6b38d4]">Contact</Link></li>
  </ul>
</div>
```

- [ ] **Step 2: Verify the link appears on every public page**

With `npm run dev` still running, visit each of these in the browser and scroll to the footer. Confirm "Changelog" appears in the Resources column and clicks through to `/changelog`:

- `http://localhost:3000/`
- `http://localhost:3000/market`
- `http://localhost:3000/pricing`
- `http://localhost:3000/agents`
- `http://localhost:3000/about`
- `http://localhost:3000/security`
- `http://localhost:3000/agency`

- [ ] **Step 3: Commit**

```bash
git add growth-os/src/components/landing/public-footer.tsx
git commit -m "feat(landing): link Changelog from public footer"
```

---

## Self-review checklist (for the implementer at the end)

- [ ] `DEVLOG.md` exists in `growth-os/` with recent commits grouped by week
- [ ] `.github/workflows/devlog.yml` runs on push to `main` (confirm via Actions tab on next push)
- [ ] Bot commits (`chore(devlog):` with `[skip ci]`) do NOT retrigger the workflow
- [ ] `DEVELOPERS.md` reads cleanly top-to-bottom and links to DEVLOG and /changelog
- [ ] `README.md` is no longer the default Next.js template
- [ ] `/changelog` renders with nav + footer and matches landing styling
- [ ] Footer "Changelog" link appears on every public page and clicks through
- [ ] `npx tsc --noEmit` passes

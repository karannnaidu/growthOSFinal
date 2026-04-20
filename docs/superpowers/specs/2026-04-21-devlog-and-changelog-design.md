# DEVLOG + Public Changelog — Design

**Date:** 2026-04-21
**Author:** karan
**Status:** approved (design), pending implementation plan

## Goal

Two linked outcomes:

1. **Keep developer documentation continuously in sync with shipped code** so new contributors can onboard without reading the full git history.
2. **Give users a public changelog** at `/changelog`, linked from every landing-page footer, styled in Growth OS voice.

## Non-goals

- RSS / Atom feed (future work)
- User-submitted changelog entries
- Per-product or per-agent changelogs (single chronological stream only)
- Email notifications when entries ship

## Artifacts

| Path | Audience | Authoring | Update cadence |
|---|---|---|---|
| `growth-os/DEVLOG.md` | Internal devs | Auto-generated from `git log` | On every push to `main` |
| `growth-os/DEVELOPERS.md` | New devs | Hand-written | When architecture / setup / conventions change |
| `growth-os/content/changelog.mdx` *(or `.ts` fallback)* | Public | Hand-written in Growth OS voice | When shipping user-visible features |
| `growth-os/src/app/changelog/page.tsx` | — | Code (renders content file) | Rarely |
| `growth-os/src/components/landing/public-footer.tsx` | — | Code (adds `/changelog` link) | Once |
| `.github/workflows/devlog.yml` | — | Code (CI) | Once |
| `growth-os/scripts/build-devlog.mjs` | — | Code | Once |

### Separation of concerns

- **DEVLOG.md** — *what happened* technically. Every non-merge commit. Noisy by design. Source of truth: git history.
- **DEVELOPERS.md** — *how things work*. Stable. Architecture overview, setup, conventions. Replaces the default Next.js README content for onboarding.
- **changelog.mdx** — *what shipped to users*. Curated, in Growth OS voice, grouped by ship date with "What's new" / "Improvements" / "Fixes" sections.

## DEVLOG automation (GitHub Action)

### Trigger

- `push` to branch `main`
- Skip when the pushing commit was made by the bot itself (detected via commit subject prefix `chore(devlog):` and/or `[skip ci]` in the message)

### Flow

```
push to main
  └─ actions/checkout with fetch-depth: 0
  └─ node scripts/build-devlog.mjs
        ├─ git log --pretty=format:"%H|%s|%an|%aI" --no-merges
        ├─ filter out chore(devlog) bot commits
        ├─ group by ISO week (Monday start, "Week of YYYY-MM-DD")
        └─ write growth-os/DEVLOG.md (full rewrite, idempotent)
  └─ if git status --porcelain shows DEVLOG.md changed:
        ├─ git add growth-os/DEVLOG.md
        ├─ git commit -m "chore(devlog): update [skip ci]"
        └─ git push (uses built-in GITHUB_TOKEN)
```

### DEVLOG.md format

```markdown
# DEVLOG

Auto-generated from git history on every push to `main`. Do not edit by hand —
changes will be overwritten. For the user-facing changelog, see /changelog.

Last updated: 2026-04-21

## Week of 2026-04-21
- **1c95af06** — fix(settings): always-visible delete button on Brand DNA product cards *(karan, 2026-04-21)*
- **67af6163** — feat(onboarding): carry store + plan intent from landing to onboarding *(karan, 2026-04-20)*
...

## Week of 2026-04-14
...
```

### Design choices

- **Full rewrite vs append** — full rewrite on every run. No append / no drift. Handles rebases, force-pushes, and cherry-picks correctly by construction.
- **ISO week grouping** — balances density. Daily would fragment; monthly would bury recent work.
- **Short SHA + subject + author + ISO date** — grep-able, links back to commits naturally.
- **No-op safety** — if regenerated content equals existing file, no commit is made. Action still succeeds.
- **Bot loop prevention** — `[skip ci]` in the bot commit message combined with the filter in the script prevents retriggering.
- **Permissions** — workflow declares `permissions: contents: write` so `GITHUB_TOKEN` can push.

### Edge cases

| Case | Behavior |
|---|---|
| First run on empty DEVLOG | Generates from full history |
| Force-push / rebase on main | Next run rewrites DEVLOG to match new history |
| Bot commits | Filtered out by subject-prefix match |
| Two pushes in rapid succession | Each run is a full rewrite; second run is a no-op if nothing changed |
| CI fails mid-run | No partial commit; next push retries |

## Public changelog page

### Route

`/changelog` → `growth-os/src/app/changelog/page.tsx` (statically rendered at build time — no runtime DB hit).

### Content authoring

Primary plan: single MDX file with frontmatter listing entries.

```mdx
---
entries:
  - date: 2026-04-21
    items:
      - type: whats-new
        title: Carry store + plan intent from landing to onboarding
        body: Your selected plan and store now pre-fill through signup.
      - type: improvement
        title: Bare domains work in the hero URL input
        body: Type "acme.com" — no https:// needed.
  - date: 2026-04-20
    items:
      - type: fix
        title: GA4 pill no longer overlaps Mia in the fragmentation diagram
        body: Visual glitch on /market resolved.
---
```

**Fallback plan:** if MDX setup in Next.js 16 requires meaningful new dependencies or config churn given the "this is NOT the Next.js you know" warning in `growth-os/AGENTS.md`, switch to a plain TypeScript data file (`growth-os/content/changelog.ts`) exporting the same shape as an array. Single-file authoring preserved, zero new deps. Decision made during implementation.

### Commit-type → public-section mapping

Used as editorial guidance when hand-writing entries (not auto-extraction):

| Commit type | Public section | Included in public? |
|---|---|---|
| `feat:` | What's new | Yes |
| `fix:` / `perf:` | Improvements | Yes |
| `chore:` / `docs:` / `refactor:` / `test:` | — | No (DEVLOG only) |

### Page layout

```
PublicNav
  ┌─────────────────────────────────────┐
  │  Changelog                    [H1]  │
  │  New features, improvements,        │
  │  and fixes. Shipped regularly.      │
  │                                     │
  │  Apr 21, 2026                       │
  │    What's new                       │
  │      • <title>                      │
  │        <body>                       │
  │    Improvements                     │
  │      • <title>                      │
  │        <body>                       │
  │                                     │
  │  Apr 20, 2026                       │
  │    ...                              │
  └─────────────────────────────────────┘
PublicFooter
```

### Styling

Reuse existing landing tokens — no new design tokens:

- Headings: `#0b1c30`, `font-heading`
- Body: `#45464d`
- Dividers: `#e5eeff`
- Max content width matches landing (`max-w-7xl`)

### Metadata

- `<title>`: "Changelog — Growth OS"
- Description: "New features, improvements, and fixes."
- OG image: reuse landing default

### Footer link

Add one line under "Resources" in `src/components/landing/public-footer.tsx`:

```tsx
<li><Link href="/changelog" className="text-sm text-[#45464d] hover:text-[#6b38d4]">Changelog</Link></li>
```

## DEVELOPERS.md scope

Hand-written, replaces the default Next.js boilerplate currently in `README.md` for onboarding purposes. README stays focused on "how to run dev server"; `DEVELOPERS.md` is the contributor handbook.

Sections:

1. **Architecture overview** — Next.js 16 app (non-standard, see `AGENTS.md`), Supabase backend, skills system at `growth-os/skills/`, agents at `src/app/agents/`, landing at `src/app/(public)/*` + `src/components/landing/`.
2. **Local setup** — clone, `npm install`, env vars required, `npm run dev`, Supabase CLI link.
3. **Project conventions** — conventional commits (used to populate DEVLOG and guide changelog authoring), file layout rules, Supabase migration workflow (reference `growth-os/CLAUDE.md` and `growth-os/AGENTS.md`).
4. **Where to find things** — map of top-level directories with one-line descriptions.
5. **How to ship a user-visible change** — write the feature, land the commit, add a curated entry to `content/changelog.mdx` in Growth OS voice.
6. **References** — link to `DEVLOG.md`, `/changelog`, `CLAUDE.md`, `AGENTS.md`, existing specs in `docs/superpowers/specs/`.

## Testing

- **DEVLOG generation** — run `node scripts/build-devlog.mjs` locally, diff output against expectation on a known history slice. Idempotency: run twice, assert no change on second run.
- **GitHub Action** — test on a throwaway branch first by temporarily adding that branch to the workflow trigger; confirm bot commit lands and does not retrigger itself.
- **Public changelog page** — visit `/changelog` in dev server, confirm entries render grouped by date with correct section headings, confirm footer link appears on `/`, `/pricing`, `/about`, `/agents`, `/security`, `/agency`, `/market`.
- **Regression check** — existing landing pages and public footer still render unchanged aside from the new link.

## Open questions resolved during brainstorming

- **Authoring model** — hybrid (B): auto DEVLOG + curated public changelog
- **DEVLOG automation mechanism** — GitHub Action on push to main (B)
- **Public changelog storage** — single file (A): `content/changelog.mdx`, falling back to `content/changelog.ts` if MDX setup is non-trivial
- **Dev docs scope** — DEVLOG + DEVELOPERS.md (B)
- **Commit-type mapping** — `feat` → What's new; `fix`/`perf` → Improvements; everything else → DEVLOG only

## Risks

- **Next.js 16 MDX setup** — codebase flags non-standard Next.js; fallback to `.ts` data file mitigates.
- **GitHub Action write permissions** — requires `permissions: contents: write` in workflow; default `GITHUB_TOKEN` supports this but repo settings must allow Actions to write. Verify before first run.
- **Entry rot** — curated changelog relies on discipline; `DEVELOPERS.md` section 5 establishes the habit.

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
   `growth-os/.github/workflows/devlog.yml`.
4. Your changelog entry ships on the next deploy; the `/changelog` page is
   statically rendered at build time.

## References

- [DEVLOG.md](./DEVLOG.md) — auto-generated commit history
- [/changelog](./src/app/changelog/page.tsx) — public-facing changelog page
- [CLAUDE.md](./CLAUDE.md) — Supabase migration rules, graphify setup
- [AGENTS.md](./AGENTS.md) — Next.js 16 caveats
- [docs/superpowers/specs/](./docs/superpowers/specs/) — feature designs
- [docs/superpowers/plans/](./docs/superpowers/plans/) — implementation plans

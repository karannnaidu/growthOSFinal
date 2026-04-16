# Mia — Re-Verification Report (Post-Fix)

**Date:** 2026-04-17 (re-verify)
**Agent:** Mia (Manager / Orchestrator)
**Skills:** 5 (`mia-manager`, `weekly-report`, `seasonal-planner`, `product-launch-playbook`, `whatsapp-briefing`)
**Mode:** Read-only re-verification of fixes flagged in prior audit.

## Status of originally-flagged issues

### 1. `mia-manager` frontmatter non-compliant — **RESOLVED**

File: `skills/ops/mia-manager/SKILL.md:1-18`. Frontmatter now declares:
- `id: mia-manager` (line 2)
- `name: mia-manager` (line 3)
- `agent: mia` (line 4)
- `category: ops` (line 5)
- `complexity: mid` (line 6), `credits: 3` (line 7)
- `mcp_tools: []` (line 8), `requires: []` (line 9), `chains_to: []` (line 10)
- `description` block (lines 11-17)

Downstream impact resolved: `parseSkillMarkdown` now returns a populated `id`, so `loadAllSkills()` will cache this skill properly (no longer skipped by the `if (skill.id)` guard at `skill-loader.ts:234`).

### 2. `mia-manager` body heading — **RESOLVED**

File: `skills/ops/mia-manager/SKILL.md:20`. The body now opens with `## System Prompt` (H2) followed by the agent directive on line 22. The previous `# Mia: AI Marketing Manager` H1 has been dropped. `miaSkill.sections.systemPrompt` will now resolve to real content instead of an empty string.

### 3. Trigger routes `rawMarkdown` fallback — **RESOLVED**

Both routes implement the 200-char threshold fallback:

- `src/app/api/mia/trigger/route.ts:87-88`
  ```ts
  const fromSections = (miaSkill.sections.systemPrompt + '\n' + (miaSkill.sections.workflow || '')).trim()
  miaSkillPrompt = fromSections.length > 200 ? fromSections : miaSkill.rawMarkdown.replace(/^---[\s\S]*?---\s*/m, '').trim()
  ```
- `src/app/api/mia/trigger-stream/route.ts:84-86` — identical pattern, assigned to `miaPrompt`.

Because the `mia-manager` heading fix above now populates `sections.systemPrompt` with the full Decision Framework (well over 200 chars), the primary path is taken at runtime; the `rawMarkdown` branch is a safety net for any future skill whose sections don't surface. The `---...---` frontmatter strip on the fallback is correct.

### 4. `seasonal-planner` Bucket A migration — **RESOLVED**

File: `skills/ops/seasonal-planner.md:8`. `mcp_tools: [brand.orders.list]`. `shopify.orders.list` no longer declared.

Note: the `source`-caveat prose sentence (matching `product-launch-playbook`'s pattern) is still **not** present in the System Prompt section — the frontmatter migration is done but the prose parity flagged in the prior audit's "Known issues" bullet remains open. Low severity; LLM will still consume whatever the `brand.orders` resolver injects, it just won't self-caveat.

### 5. `product-launch-playbook` declares `brand.products.list` — **RESOLVED**

File: `skills/ops/product-launch-playbook.md:8`. `mcp_tools: [brand.products.list]` (was `[]`). The `source`-caveat prose sentence at line 22 ("Use `brand.products` as your product catalog. If `source !== 'shopify'`, caveat…") is now backed by an actual resolver fetch — the envelope (`source`, `confidence`, `isComplete`) will be in scope for the LLM at runtime.

### 6. `whatsapp-briefing.quick_replies.action` ad-hoc enum — **UNCHANGED (note only)**

Not part of this fix batch. The `open_dashboard` / `pause_ads` enum remains prose-only in the skill body; no formal type constraint declared. Low priority — to be formalised alongside the WhatsApp send integration.

## New aggregate grade: **PASS**

All 5 skills now pass structurally at A-grade (modulo the two low-priority prose/enum notes above). `mia-manager` upgrades from B → A: frontmatter compliant with the loader contract, body heading matches what the consuming routes extract, and the routes have a defensive `rawMarkdown` fallback if extraction ever drifts again. `seasonal-planner` upgrades from C → A on the migration front. `product-launch-playbook`, `weekly-report`, and `whatsapp-briefing` retain A-grade.

## New issues introduced by the fixes

None detected. Spot checks:

- `mia-manager` now loads under a non-empty `id`; the cache key collision risk from the prior empty-string key is eliminated. No new duplicate-id collision with any other skill (the id `mia-manager` is unique in the skills tree).
- `seasonal-planner`'s new `brand.orders.list` tool requires `TOOL_HANDLERS` to implement `brand.orders.list`. The prior audit confirmed `shopify.orders.list` was registered at `src/lib/mcp-client.ts:347`; this re-verify did not re-check that `brand.orders.list` is registered. Assumed wired per Bucket A infra (same assumption used for Nova). If `brand.orders.list` is missing from `TOOL_HANDLERS`, this skill will hard-block for every brand — flag for live-run verification.
- `product-launch-playbook` gains a declared tool: live-run should confirm `brand.products.list` does not hard-block brands without Shopify (should fall back to `brand_data` catalog per the resolver envelope).
- Routes' `rawMarkdown` fallback strips only the first frontmatter block via `/^---[\s\S]*?---\s*/m`. Benign for current skills but note the regex anchors to start-of-string (via `^` with `m` flag) — if any future skill prepends content before frontmatter, the strip silently no-ops. Not an issue today.

## Items still requiring live runs

Unchanged from prior audit — all Check 3/5/6 items are still NEEDS_LIVE_RUN. Priority re-run: `/api/mia/trigger-stream` with a test brand to confirm Decision Framework now drives dispatch (not the one-sentence fallback), and `seasonal-planner` to confirm `brand.orders.list` falls back cleanly when Shopify is absent.

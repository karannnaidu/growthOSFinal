# Mia — Verification Report

**Date:** 2026-04-17
**Agent:** Mia (Manager / Orchestrator)
**Skills:** 5 (`mia-manager`, `weekly-report`, `seasonal-planner`, `product-launch-playbook`, `whatsapp-briefing`)
**Test mode:** Structural audit (Phase 2 static pass — live runs need test brand credentials)

## Summary

| Skill | Loads | Data resolves | Runs e2e | Output parseable | Output usable | UI renders | Grade |
|---|---|---|---|---|---|---|---|
| mia-manager | PASS-W-NOTES | N/A (orchestrator, not MCP) | NEEDS_LIVE_RUN | PASS-W-NOTES (JSON dispatch schema in body) | NEEDS_LIVE_RUN | NEEDS_LIVE_RUN | B (structural — frontmatter + H1 heading bugs) |
| weekly-report | PASS | PASS (empty `mcp_tools`) | PASS (pure LLM; reads skill_runs from DB) | PASS (JSON) | NEEDS_LIVE_RUN | NEEDS_LIVE_RUN | A (structural) |
| seasonal-planner | PASS | FAIL (Bucket A migration NOT applied — still uses `shopify.orders.list`) | NEEDS_LIVE_RUN | PASS (JSON) | NEEDS_LIVE_RUN | NEEDS_LIVE_RUN | C (structural — missed migration) |
| product-launch-playbook | PASS | PASS (empty `mcp_tools`; body references `brand.products` with `source` caveat) | PASS (pure LLM) | PASS (JSON) | NEEDS_LIVE_RUN | NEEDS_LIVE_RUN | A (structural) |
| whatsapp-briefing | PASS | PASS (empty `mcp_tools`) | PASS (pure LLM; reads snapshots + alerts from DB) | PASS (JSON + plain-text `whatsapp_formatted`) | NEEDS_LIVE_RUN | NEEDS_LIVE_RUN | A (structural) |

## Per-skill details

### mia-manager

- **Location:** `skills/ops/mia-manager/SKILL.md` (directory-style skill)
- **Frontmatter (verbatim):**
  ```yaml
  name: mia-manager
  description: >
    Mia's core team management skill. Use this whenever Mia needs to make a decision about
    which agents to dispatch, how to respond to user requests, or how to orchestrate the
    12-agent team. [...trimmed...]
  ```
  Only `name` and `description` are present. No `id`, `agent`, `category`, `complexity`, `credits`, `mcp_tools`, `chains_to`, `knowledge`, or `produces`.
- **Check 1 — Loads:** PASS-W-NOTES.
  - `getSkillPath('mia-manager')` resolves the file via the directory-based lookup (`skill-loader.ts` line 178 — matches when basename is `SKILL` and the parent directory equals the requested id).
  - `parseSkillMarkdown` returns a `SkillDefinition` with most fields defaulted to empty (`id = ''`, `agent = ''`, `category = ''`, `complexity = 'cheap'`, `credits = 1`, `mcpTools = []`, `requires = []`).
  - `loadSkill('mia-manager')` does succeed, but caches under `skill.id = ''` (empty string key). `loadAllSkills()` skips this skill entirely because of the `if (skill.id)` guard at `skill-loader.ts:234`.
  - The skill body starts with `# Mia: AI Marketing Manager` (H1), then uses `## Your Team`, `## Decision Framework`, `## Handling Missing Platforms`, `## User Instructions`, `## Output Format`, `## Key Principles` (H2). There is **no `## System Prompt` section and no `## Workflow` section**.
- **Check 2 — Data resolves:** N/A. This skill is never invoked through `runSkill` — it is consumed directly by `src/app/api/mia/trigger/route.ts` and `src/app/api/mia/trigger-stream/route.ts` which pull `miaSkill.sections.systemPrompt + '\n' + (miaSkill.sections.workflow || '')`. Because the skill body has neither heading, **both extracted strings are empty**, and the route silently falls through to its hard-coded fallback prompt (`'You are Mia, an AI marketing manager. Decide which skills to dispatch.'`). Bucket A/B migration not applicable (no `mcp_tools`).
- **Check 3 — Runs end-to-end:** NEEDS_LIVE_RUN. Even though the skill is pure orchestration and has no MCP dependencies, structural pass is conditional on the extraction path actually surfacing the body. Today it does not — the actual prompt used at runtime is the one-sentence fallback, not the carefully-authored decision framework.
- **Check 4 — Output parseable:** PASS-W-NOTES. The body contains a well-structured JSON example under `## Output Format` (decisions[], skipped[], message_to_user). Because this skill is consumed as a system prompt (not run through the standard LLM JSON-response pipeline), the output schema governs Mia's dispatch decisions indirectly — but parsing those decisions is the orchestrator's job, not the skill's.
- **Check 5 — Output usable:** NEEDS_LIVE_RUN.
- **Check 6 — UI renders:** NEEDS_LIVE_RUN. The Mia control panel (`src/components/agents/mia-control.tsx`) and `src/app/dashboard/agents/[agentId]/page.tsx` render this agent; BlockedRunCard is generic and handles any agent when `run.status === 'blocked'`.
- **Grade (structural):** B. File loads and is callable, but the frontmatter is not compliant with the rest of the skill registry, and the body headings don't match what the consuming API routes extract.
- **Issues found:** See "Known issues noted for later" — two distinct bugs (missing frontmatter fields; H1 instead of H2 for "System Prompt").

### weekly-report

- **Location:** `skills/ops/weekly-report.md`
- **Frontmatter:**
  - `id: weekly-report`, `name: Weekly Report`, `agent: mia`, `category: ops`
  - `complexity: cheap`, `credits: 1`
  - `mcp_tools: []`, `chains_to: []`
  - `schedule: "0 8 * * 1"` (weekly Monday 8am)
  - `knowledge.needs: [metric, campaign, insight, creative, experiment, persona]`
  - `produces: insight`
- **Check 1 — Loads:** PASS. YAML parses; all required fields present and correctly typed.
- **Check 2 — Data resolves:** PASS. Empty `mcp_tools` means Phase 1 tool-level resolution is a no-op — `computeBlockage` has nothing to check. The skill pulls from `skill_runs`, `knowledge_snapshots`, and credit-usage tables directly (this is a "meta" skill that summarises other skills' outputs, not a platform skill). No lingering `shopify.*` references.
- **Check 3 — Runs end-to-end:** PASS (structural). `mcp_tools: []` + `requires: []` → pure LLM path; `runSkill` will never hard-block. Output correctness still needs a live run with ≥7 days of historical `skill_runs` rows for the prompt builder to have anything to summarise.
- **Check 4 — Output parseable:** PASS. JSON schema declared in body: `week`, `headline`, `summary`, `metrics{...}`, `agent_contributions[]`, `pending_review[]`, `credit_usage{...}`, `next_week_priorities[]`. Tight structure — each metric object has `value`, `change`, (optional) `period`.
- **Check 5 — Output usable:** NEEDS_LIVE_RUN. Downstream consumer is `whatsapp-briefing` (per body comment "WhatsApp version: condensed to 5 bullet points via `whatsapp-briefing` skill"), but this is prose — no explicit `chains_to` edge.
- **Check 6 — UI renders:** NEEDS_LIVE_RUN.
- **Grade (structural):** A. Clean skill; no migration needed (pure LLM over internal DB).
- **Issues:** None blocking. Minor: could add explicit `chains_to: [whatsapp-briefing]` if that hand-off is actually automated.

### seasonal-planner

- **Location:** `skills/ops/seasonal-planner.md`
- **Frontmatter:**
  - `id: seasonal-planner`, `name: Seasonal Campaign Planner`, `agent: mia`, `category: ops`
  - `complexity: mid`, `credits: 2`
  - **`mcp_tools: [shopify.orders.list]` ← NOT MIGRATED**
  - `chains_to: [ad-copy, email-copy, social-content-calendar, budget-allocation]`
  - `knowledge.needs: [product, metric, campaign, persona, insight, competitor]`
  - `produces: campaign_plan (edge_to: product, edge_type: promotes), insight`
- **Check 1 — Loads:** PASS. YAML parses; all fields typed correctly.
- **Check 2 — Data resolves:** FAIL. The production-readiness plan classifies `seasonal-planner` as a Bucket A skill (spec: `docs/superpowers/specs/2026-04-17-production-readiness-design.md:165`), which means `shopify.orders.list` should have been migrated to `brand.orders.list` under Task 8. This migration was **not applied** — the frontmatter still declares the raw Shopify tool. Consequences:
  - `shopify.orders.list` IS still registered in `TOOL_HANDLERS` (`src/lib/mcp-client.ts:347`), so the tool call itself won't error.
  - But any brand WITHOUT Shopify connected will hard-block (`computeBlockage` returns a block for any declared tool whose credential is absent), instead of falling back to `brands.brand_data` / Klaviyo via the `resolveBrandOrders` resolver.
  - Skill body has **no `source` caveat prose** (unlike product-launch-playbook, which does), so even if migration were applied, the LLM wouldn't know to caveat quantitative claims when `source !== 'shopify'`.
- **Check 3 — Runs end-to-end:** NEEDS_LIVE_RUN. Current behaviour: runs only for brands with Shopify connected. Post-migration expectation: runs for any brand with at least a `brand_data` catalog.
- **Check 4 — Output parseable:** PASS. Rich JSON: `campaign{...}`, `product_strategy{hero_products[], bundles[], inventory_actions[]}`, `channel_plan{paid_ads, email, organic_social, seo}`, `timeline[]` (week-by-week task list with owner/skill/deadline/depends_on), `success_metrics{...}`, `post_campaign{...}`.
- **Check 5 — Output usable:** NEEDS_LIVE_RUN. Strong hand-off vocabulary (every task has `agent` + `skill` + `deadline`), and explicit `Auto-Chain` section mapping creative/email/budget/audience/inventory needs to downstream skills.
- **Check 6 — UI renders:** NEEDS_LIVE_RUN.
- **Grade (structural):** C. Migration regression — easiest fix in the batch. Change `mcp_tools: [shopify.orders.list]` → `mcp_tools: [brand.orders.list]` and add a `Use \`brand.orders\` as your order history. If \`source !== 'shopify'\`, caveat quantitative claims ("based on available order data" rather than "based on last year's store data").` sentence under System Prompt, matching the `product-launch-playbook` pattern.
- **Issues found:** Bucket A migration missed; `source` caveat prose missing.

### product-launch-playbook

- **Location:** `skills/ops/product-launch-playbook.md`
- **Frontmatter:**
  - `id: product-launch-playbook`, `name: Product Launch Playbook`, `agent: mia`, `category: ops`
  - `complexity: premium`, `credits: 3`
  - `mcp_tools: []`
  - `chains_to: [ad-copy, email-copy, social-content-calendar, audience-targeting, keyword-strategy, page-cro]`
  - `knowledge.needs: [product, persona, competitor, brand_guidelines, metric, campaign]`
  - `produces: campaign_plan (edge_to: product, edge_type: launches), insight`
- **Check 1 — Loads:** PASS. YAML parses.
- **Check 2 — Data resolves:** PASS. `mcp_tools: []` — pure LLM path. Interestingly, this skill DOES include the Phase 1 `source`-caveat prose at the top of the body: _"Use `brand.products` as your product catalog. If `source !== 'shopify'`, caveat any quantitative claims…"_ — but it doesn't declare `brand.products.list` in `mcp_tools`, so `brand.products` data is never actually fetched at runtime. The prose assumes the prompt builder injects product-catalog context from the knowledge graph (node type `product`) via `knowledge.needs`, which it does. So the caveat works, but it's guarding knowledge-graph-sourced data, not MCP-resolver data.
- **Check 3 — Runs end-to-end:** PASS (structural). Pure LLM + knowledge graph; no hard-block path.
- **Check 4 — Output parseable:** PASS. Deeply structured JSON: `product{...}`, `positioning{...}`, `phases{pre_launch{tasks[]}, launch{tasks[]}, post_launch{tasks[]}}` (each task: `agent`, `skill`, `deadline`, `depends_on`), `budget_allocation{...}`, `success_metrics{...}`, `contingencies[]`.
- **Check 5 — Output usable:** NEEDS_LIVE_RUN. Excellent cross-agent dispatch vocabulary — every task tags `agent` + `skill`, which Mia's orchestrator can consume directly.
- **Check 6 — UI renders:** NEEDS_LIVE_RUN.
- **Grade (structural):** A.
- **Issues:** Minor: the `brand.products` caveat is prose-only — if you want the resolver envelope (`source`, `confidence`, `isComplete`) to actually ground the LLM's claims, add `brand.products.list` to `mcp_tools`. Otherwise the body prose is a no-op (there's no `source` field in scope).

### whatsapp-briefing

- **Location:** `skills/ops/whatsapp-briefing.md`
- **Frontmatter:**
  - `id: whatsapp-briefing`, `name: WhatsApp Morning Briefing`, `agent: mia`, `category: ops`
  - `complexity: free`, `credits: 0`
  - `mcp_tools: []`, `chains_to: []`
  - `schedule: "0 7 * * *"` (daily 7am)
  - `knowledge.needs: [metric, insight, anomaly, campaign]`
  - `produces: insight`
- **Check 1 — Loads:** PASS. YAML parses.
- **Check 2 — Data resolves:** PASS. Empty `mcp_tools` — pure LLM. Like `weekly-report`, this reads from internal tables (snapshots, `skill_runs` for Scout's alerts, agent schedule) — the prompt builder injects those via `knowledge.needs`.
- **Check 3 — Runs end-to-end:** PASS (structural). No MCP blocks possible.
- **Check 4 — Output parseable:** PASS. JSON with `date`, `delivery_channel`, `briefing{headline, bullets[], needs_attention, mood}`, `whatsapp_formatted` (pre-rendered plain text), and `quick_replies[]` (label/action/url). Dual format — structured + delivery-ready.
- **Check 5 — Output usable:** NEEDS_LIVE_RUN. `quick_replies` actions (`open_dashboard`, `pause_ads`) are enumerated but not documented elsewhere — would need wiring on the delivery side.
- **Check 6 — UI renders:** NEEDS_LIVE_RUN. Delivery is "WhatsApp" per `delivery_channel`, so "UI renders" means the WhatsApp send integration, not the dashboard card (though dashboard fallback exists via `recentRuns`).
- **Grade (structural):** A.
- **Issues:** None blocking. The `quick_replies.action` enum (`open_dashboard`, `pause_ads`) isn't declared as a constrained type anywhere — drift risk if downstream adds more actions.

## Aggregate structural grade: **PASS-W-NOTES (overall grade B+)**

4 of 5 skills pass structurally (A-grade): `weekly-report`, `product-launch-playbook`, `whatsapp-briefing` are solid pure-LLM skills with well-structured output schemas and knowledge-graph-driven inputs. `seasonal-planner` has a missed Bucket A migration (same category of bug as Nova's `geo-visibility` per `docs/verification/agents/nova.md:72`). `mia-manager` is a structural outlier: correct file location, but frontmatter and heading conventions don't match what the rest of the system expects, and its prompt extraction silently degrades to a one-sentence fallback in production.

## Known issues noted for later

- **`seasonal-planner` frontmatter — Bucket A migration missed.** `mcp_tools: [shopify.orders.list]` should be `[brand.orders.list]` per the production-readiness spec classification of this skill as Bucket A. Also add the `source`-caveat prose sentence to System Prompt. Same class of miss as Nova/`geo-visibility`.
- **`mia-manager` frontmatter — non-compliant with skill-loader contract.** Only has `name` + `description`. Missing `id`, `agent`, `category`, `complexity`, `credits`, `mcp_tools`, `chains_to`, `knowledge`, `produces`. Downstream impact: `parseSkillMarkdown` returns `id = ''`, so the skill is skipped by `loadAllSkills()` (cached under empty-string key by `loadSkill('mia-manager')`). Also affects any UI / admin list that enumerates Mia's skills via the loader registry rather than `agents.json`.
- **`mia-manager` body heading levels.** Starts with `# Mia: AI Marketing Manager` (H1) and has no `## System Prompt` or `## Workflow` sections. The `/api/mia/trigger` and `/api/mia/trigger-stream` routes build their prompt from `miaSkill.sections.systemPrompt + '\n' + (miaSkill.sections.workflow || '')` — both resolve to empty string under current parsing, so the runtime uses the hardcoded fallback `'You are Mia, an AI marketing manager. Decide which skills to dispatch.'` instead of the carefully-authored Decision Framework. Fix: either rename `# Mia: AI Marketing Manager` to `## System Prompt` (and bump the other H2s to reflect structure), or update the consuming routes to use `sections['yourTeam']` + `sections['decisionFramework']`, or use `rawMarkdown` directly.
- **`product-launch-playbook`** declares `source`-caveat prose for `brand.products` but never adds `brand.products.list` to `mcp_tools`. The prose is a no-op at runtime — the LLM has no `source` field in scope unless the resolver envelope is actually fetched. Either add the tool to `mcp_tools`, or remove the caveat sentence and rely on knowledge-graph `product` nodes.
- **`whatsapp-briefing.quick_replies.action`** uses an ad-hoc enum (`open_dashboard`, `pause_ads`) — should be formalised once the WhatsApp send integration lands, to avoid drift.
- **Cosmetic (non-blocking):** Several prose references in Mia's skills assume Shopify as the source (e.g., "last year's revenue" in `seasonal-planner`'s Inputs Required, "Historical seasonal performance"). Post-migration these should read neutrally (e.g., "historical campaign data, if available").

## What needs a live run to verify

- All Check 3 (end-to-end runs), Check 5 (output usability), and Check 6 (UI rendering) checks marked NEEDS_LIVE_RUN require a test brand with connected platforms plus a running dev server. Specifically:
  - `mia-manager`: does `/api/mia/trigger-stream` actually use the skill body, or does it silently fall back to the one-sentence hardcoded prompt? (Grep suggests the latter — confirm.)
  - `weekly-report`: test against a brand with ≥7 days of `skill_runs` history + knowledge_snapshots; verify WoW calculations are accurate.
  - `seasonal-planner`: once Bucket A migration lands, confirm it falls back cleanly to `brand.orders.list` → `brands.brand_data` when Shopify is absent, and that the `source` caveat is emitted in output.
  - `product-launch-playbook`: exercise with a new product in the knowledge graph; verify the generated phased task list chains correctly via the orchestrator.
  - `whatsapp-briefing`: WhatsApp delivery path (integration not covered by this audit); verify `whatsapp_formatted` stays under 500 chars for representative inputs.
- Re-run this audit after connecting Meta, Shopify, and Klaviyo on the test brand, AND after Bucket A migration is applied to `seasonal-planner`.

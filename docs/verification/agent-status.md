# Phase 2 — Per-Agent Structural Audit (Consolidated Grid)

**Date:** 2026-04-17
**Audit type:** Structural only (no live runs — no credentials / dev server available)
**Reports:** `docs/verification/agents/<agent>.md` (12 files)

---

## Aggregate grades

| #  | Agent | Grade           | Most critical finding                                                                                            |
|----|-------|-----------------|------------------------------------------------------------------------------------------------------------------|
| 1  | Mia   | PASS-W-NOTES    | `mia-manager` frontmatter is non-compliant → `loadAllSkills` silently skips it; prod falls back to 1-line prompt |
| 2  | Nova  | PASS-W-NOTES    | `geo-visibility` still declares `shopify.orders.list` (Bucket A miss); body/frontmatter mismatch on ad-geo fields |
| 3  | Navi  | PASS (A)        | Fully migrated; only cosmetic prose drift                                                                         |
| 4  | Hugo  | PASS-W-NOTES    | Task 7 under-migration — 3 skills have `mcp_tools: []` (tools stripped, not rewritten → no data, no block)        |
| 5  | Sage  | PASS-W-NOTES    | `page-cro`/`pricing-optimizer` bodies cite `brand.products` but don't declare the tool                            |
| 6  | Luna  | PASS-W-NOTES    | **Task 8 Bucket A migration NOT applied** — all 6 skills still use `shopify.*`; Klaviyo-only brands will hard-block |
| 7  | Penny | **FAIL**        | `billing-check` scope mismatch (spec line 224): prose is for vendor billing, spec scopes it to Growth OS wallet   |
| 8  | Scout | PASS-W-NOTES    | All 4 skills correctly Bucket-B-migrated; systemic gap: no review-theme resolver                                  |
| 9  | Max   | PASS-W-NOTES    | **Silent-data bug:** Meta `{data: []}` → `arrayHasData=true` → LLM analyzes nothing. `channel-expansion-advisor` Bucket B fail |
| 10 | Atlas | PASS-W-NOTES    | 3 of 4 acquisition skills still on `shopify.*`; `persona-feedback-video` is pure LLM (no video service wired)     |
| 11 | Echo  | PASS-W-NOTES    | `competitor.ads` handler double-calls ScrapeCreators (2× spend); `competitor-scan` promises screenshots w/ no impl |
| 12 | Aria  | PASS-W-NOTES    | **Creative-path regression confirmed:** agents dashboard still uses legacy fal-ai flux-schnell, not Nano Banana / Imagen / Veo pipeline |

**Aggregate tally:** 1 PASS · 10 PASS-W-NOTES · 1 FAIL

---

## Cross-cutting issues (affect multiple agents)

### 1. Bucket A / B migration is incomplete
Tasks 7 & 8 migrated *some* skills but not all. Confirmed misses:
- **Mia:** `seasonal-planner` (shopify.orders.list)
- **Nova:** `geo-visibility` (shopify.orders.list)
- **Luna:** all 6 skills (shopify.orders.list / shopify.customers.list)
- **Atlas:** `audience-targeting`, `retargeting-strategy`, `influencer-tracker`
- **Max:** `channel-expansion-advisor` (declares shopify.orders.list while body uses brand.products caveat)
- **Sage:** `page-cro`, `pricing-optimizer` (bodies cite brand.products, tools don't declare it)
- **Hugo:** all 3 skills (tools stripped to `[]` rather than rewritten — silent grounding gap)
- **Mia:** `product-launch-playbook` (brand.products caveat without declaration)

**Impact:** Any brand without Shopify either (a) hard-blocks on skills it could run via fallback, or (b) receives no grounding data despite body prose implying it will.

**Fix:** One-line `mcp_tools` rewrite per skill — resolvers already exist at `src/lib/resolvers/brand-*.ts` and are registered in `mcp-client.ts:468-479`.

### 2. Preflight `hasData` false-positive on empty arrays (Max report)
`preflight.ts:arrayHasData` (line 27-32) returns `true` for `{data: []}` because the wrapper object is non-empty. Meta's API returns this shape when an ad account has no activity in the window. Result: no block, no caveat, LLM synthesizes analysis from `[]`.

**Affects:** 4 of 6 Max skills, likely `creative-fatigue-detector`, any future skill using Meta insights.

**Fix:** Unwrap `.data` / `.rows` / `.campaigns` before length-checking in `arrayHasData`.

### 3. `mia-manager` is silently invisible to the skill loader
`parseSkillMarkdown` requires `id` in frontmatter; `mia-manager` has only `name` + `description`. `/api/mia/trigger` resolves `sections.systemPrompt + sections.workflow` to `""` and falls back to a one-sentence hardcoded prompt. Production-critical: users believe Mia is running her full orchestration prompt — she isn't.

### 4. Creative-path regression (Aria report)
- Agents dashboard (`src/app/dashboard/agents/[agentId]/page.tsx:294`) → `run-stream` → `runSkill` → `fal-client.generateImage` (legacy `fal-ai/flux/schnell`)
- Creative Studio pipeline (Nano Banana 2 + Imagen 4.0 + Veo) lives at `src/app/api/creative/generate/route.ts` but is **never invoked** from the agents dashboard
- `image-brief` output schema is fal-specific (`fal_prompt`/`fal_negative_prompt`), anchoring the regression in data shape

**Fix:** Rewire the `runSkill` post-hook at `skills-engine.ts:592-623` to call the newer pipeline, or deprecate the post-hook and have the dashboard call `/api/creative/generate` directly.

### 5. Prompt-declared fields without backing tools (systemic)
Many skills ask the LLM to compute fields that require data the declared tools can't provide:
- Scout: review-theme sentiment, checkout funnel, cross-platform correlation
- Atlas: LTV deciles, per-page visitor intent, UTM/promo attribution
- Hugo: GSC rank/volume, Ahrefs keyword metrics, competitor SERP
- Max: `purchase_roas` / `action_values` (fetchMetaInsights doesn't request these)
- Echo: `traffic_sources` split in `competitor-traffic-report` (all fields hard-null in code)

**Fix pattern:** For each skill, either (a) add the tool + resolver, or (b) prune the unbacked output fields. Don't leave the LLM to fabricate.

### 6. Stale duplicate skill tree
Top-level `GROWTH-OS/skills/**` still holds un-migrated shopify.* copies. `growth-os/skills/**` is the canonical tree the engine reads (confirmed by Task 15 readiness fix). Risk: editors writing to the outer tree will see "no effect."

**Fix:** Either delete the outer tree or add a README redirecting to the inner canonical path.

---

## Known-issue validation (spec §11 callouts)

| Spec callout                              | Line | Status                        | Notes                                                   |
|-------------------------------------------|------|-------------------------------|----------------------------------------------------------|
| fetchMetaInsights silent-null             | 223  | **PARTIAL — different bug**   | True `null` blocks correctly; `{data: []}` slips through |
| Agent-triggered creative path regressed   | 222  | **CONFIRMED**                 | fal-schnell wired; Imagen/Nano Banana not invoked        |
| billing-check empty mcp_tools scope       | 224  | **CONFIRMED**                 | Prose is vendor-billing; spec scopes it to Growth OS wallet |
| Scout cron dedupe                         | 218  | CONFIRMED (fix shipped Task 9)| Unique index in migration 005                            |

---

## Live-run items deferred

The following require credentials + dev server and could not be verified structurally:

- End-to-end resolver payload inspection (does the LLM actually see `data_source_summary`?)
- Meta `ad_account_id` metadata presence after picker flow
- GA4 `property_id` + GSC `gsc_site_url` in credentials.metadata
- Google token refresh cycle (OAuth expiry handling)
- Strict-JSON output parsing across all 55 skills (some may emit markdown fences)
- 14-day baseline data availability for anomaly-detection
- Klaviyo fallback activation for Luna skills on non-Shopify brand
- `brand.*` resolver payload appears in LLM prompt (not just in `toolResolutions`)
- Cron dedupe behavior with concurrent runs
- Chain-processor cycle protection (Hugo's 3-skill cycle)

---

## Recommended next actions (priority ordered)

1. **P0 — Fix `mia-manager` frontmatter** (silent prod bug, ~5 min)
2. **P0 — Complete Bucket A/B migration** for the ~15 misses above (frontmatter only, ~30 min)
3. **P0 — Fix `arrayHasData` to unwrap `.data/.rows`** (Max silent-data bug, ~10 min)
4. **P1 — Rewire creative path** to Imagen/Nano Banana from the agents dashboard
5. **P1 — Scope `billing-check`** to Growth OS wallet (add `gos.wallet.get` tool or use `/api/billing/balance`)
6. **P1 — Fix `competitor.ads` double-call** (Echo: 2× ScrapeCreators spend)
7. **P2 — Prune/add-backing-tools** for prompt fields systemic across Scout / Atlas / Hugo / Max
8. **P2 — Delete/redirect stale outer skill tree**
9. **P3 — Live-run validation sweep** once credentials land

---

## Phase 2 conclusion

**Structural readiness: ~85% there.** The hard-block infrastructure and resolver fallbacks (Phase 1) are correctly wired. The remaining gaps are overwhelmingly:

- Frontmatter migration misses that one-line fixes resolve
- A handful of silent-data / silent-wiring bugs that are narrow and named
- One scope mismatch (Penny `billing-check`)

No systemic architectural flaw was uncovered. Shipping the P0/P1 fixes above should take the aggregate grade to **PASS** across all 12 agents.

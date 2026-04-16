# Production Readiness — Design Spec

**Date:** 2026-04-17
**Author:** Karan + Claude
**Goal:** Make Growth OS investor-demo ready by eliminating silent failures, fabricated outputs, and platform-lock-in — without forcing users to connect more than they need to.

---

## The Problem (in one paragraph)

Growth OS today *looks* functional but fails silently. A user with only Meta connected has **67% of skills marked "blocked"** under the current pre-flight check, yet the same skills still run and write "completed" rows to `skill_runs` — producing hallucinated outputs with no real data behind them. Meanwhile, many of those "blocked" skills don't actually need Shopify at all; they only need a product catalog, which is already extracted from the user's URL during onboarding. The result is an app that lies to users (fabricated briefings) and asks for platforms it doesn't need.

---

## Guiding Principles

1. **Never fabricate.** A skill with insufficient real data must refuse to run, not confabulate.
2. **Ask once, use many.** Brand DNA extracted at onboarding is a first-class data source, equal to any connector.
3. **Tell users what's missing and how to fix it.** Every block surfaces a "connect X to unlock this" CTA, not a toast.
4. **Don't show what doesn't work.** Stubbed connectors hide until implemented.
5. **Graceful degradation beats heroic partial output.** If we can't run a skill fully, we say so in the output itself — we don't hide the gap.

---

## Scope

### In scope
- Platform connector substrate (MCP client, credentials, stubs)
- Skill pre-flight + hard-block + UI surfacing
- Brand-level data abstraction (`brand.*` tools)
- Skill frontmatter migration (~20 skills)
- Onboarding / settings setup guide UX
- Google Admin API auto-discovery (GA4 + Ads)
- Scout cron dedupe
- Per-agent verification using a 6-check rubric against a live test brand

### Out of scope (noted for later)
- Implementing actual MCP servers (we keep the REST impl; rename or rebrand the layer later)
- Ahrefs / Snapchat / ChatGPT Ads connectors (hide these for now)
- Per-agent *feature* improvements beyond fixing known breakage
- Graphify rebuild (defer until pitch is done)

---

## Architecture Changes

### 1. Brand-Level Data Resolver

A new layer in `src/lib/mcp-client.ts` that resolves **brand-scoped** data tools — independent of which commerce platform the brand uses.

```
brand.products.list    → Shopify > brand_data.products (from extraction) > CSV upload > website scrape
brand.customers.list   → Shopify > Klaviyo profiles > CSV upload > null
brand.orders.list      → Shopify > CSV upload > null
brand.brand_dna        → Always available after onboarding (from `brands.brand_data`)
```

**Note on Stripe:** Stripe in this codebase is Growth OS's own billing (subscription payments to us, stored in `wallets.stripe_customer_id`). It is **not** a pipe into the brand's customer-payment processor, so it does **not** appear in `brand.orders.list`. If a future brand uses Stripe Checkout for their store, we'll add a separate `brand_stripe` credential type — out of scope for this spec.

Each resolver returns:
```ts
{
  data: T[] | null,
  source: 'shopify' | 'brand_data' | 'stripe' | 'klaviyo' | 'csv' | 'scrape' | null,
  confidence: 'high' | 'medium' | 'low',  // shopify=high, extraction=medium, scrape=low
  isComplete: boolean,                    // false if we only got partial data
}
```

Why `source` and `confidence` matter: they flow into the skill prompt so the LLM knows whether it's reasoning over live order data (authoritative) or extracted product info (descriptive only). This lets skills self-qualify their output — e.g., a `pricing-optimizer` that only has extracted products instead of Shopify orders can say *"Based on your product catalog from your website — connect Shopify to get margin-aware pricing"* instead of inventing revenue numbers.

### 2. Hard-Block in `runSkill`

Current state: `preFlightCheck` returns `{ canRun: false, blocked: true }` but the calling code runs the skill anyway with empty data.

New state: `runSkill` evaluates each declared `mcp_tool`:
- If a tool has **zero resolvable sources** for this brand → mark skill `status='blocked'`, write `blocked_reason` and `missing_platforms` to `skill_runs`, **return before LLM call**.
- If a tool has a **lower-confidence source** (extraction instead of live) → still run, but inject `data_caveats` into the prompt so the LLM discloses it.

New `skill_runs` columns:
- `status` gains value `'blocked'` (in addition to `pending`/`running`/`completed`/`failed`)
- `blocked_reason text` — human-readable ("Connect Shopify or import a product CSV to run unit-economics")
- `missing_platforms text[]` — machine-readable for UI CTAs
- `data_source_summary jsonb` — per-tool source + confidence

### 3. UI — Blocked Skills Become Connect-CTA Cards

On the agent detail page and Mia briefing, blocked skill runs render as:

```
[Penny · cash-flow-forecast]
  I couldn't run this.
  Connect Shopify (or Stripe) to unlock cash-flow forecasting.
  [Connect Shopify]   [Import orders CSV instead]
```

Not a toast. Not a silent skip. A persistent card the user can act on.

### 4. Setup Guide UX

A reusable `<SetupHint />` component that:
- Renders a collapsed "Where do I find this?" row under any manual-entry field.
- Expands to show numbered steps + screenshots + external link.
- Lives next to: GA4 property ID field, Meta ad account picker, Klaviyo API key, Shopify access token, Google Ads customer ID.

Content lives in `src/content/setup-hints/<platform>.mdx` so copy can be edited without touching components.

### 5. Google Admin API Auto-Discovery

**Problem today:** After Google OAuth, user is told to paste their GA4 property ID. They don't know where to find it.

**Fix:** After OAuth callback, call:
- `https://analyticsadmin.googleapis.com/v1beta/accounts` → list accounts
- For each account: `/accountSummaries` → list GA4 properties
- Present a dropdown: *"Which property should Growth OS use?"*
- Same for Google Ads: `customers:listAccessibleCustomers` → dropdown.

No more manual paste for the 90% of users with a single property.

### 6. Scout Cron Dedupe

`src/app/api/cron/daily/route.ts` currently loops brands → for each agent-scheduled skill, calls `runSkill`. No per-day idempotency. Fix:

```ts
const alreadyRan = await supabase
  .from('skill_runs')
  .select('id')
  .eq('brand_id', brandId)
  .eq('skill_id', skillId)
  .gte('created_at', startOfTodayUtc)
  .in('status', ['completed', 'running'])
  .maybeSingle();
if (alreadyRan) continue;
```

Plus a unique partial index on `(brand_id, skill_id, DATE_TRUNC('day', created_at))` WHERE status IN ('completed','running') to make it race-safe.

### 7. Hide Stub Connectors

In `src/app/onboarding/platforms/page.tsx` and the Settings page, render Ahrefs / Snapchat / ChatGPT Ads behind a `coming_soon` flag. Leave the MCP handler stubs in code for later wiring; just don't advertise what doesn't work.

### 8. Meta Ad Account Picker

Meta callback today auto-picks the first ad account. If the user manages multiple (agencies, which is the ICP) — wrong account gets connected.

Fix: after OAuth, call `me/adaccounts`, present a picker, store the chosen `ad_account_id`.

---

## Skill Frontmatter Migration

Audited all 48 skills. Classified by real data needs:

### Bucket A — Needs order/customer data (keep `shopify.*` tools, also allow fallbacks)
12 skills: `cash-flow-forecast`, `unit-economics`, `reorder-calculator`, `abandoned-cart-recovery`, `churn-prevention`, `loyalty-program-designer`, `review-collector`, `customer-signal-analyzer`, `returns-analyzer`, `persona-builder`, `anomaly-detection`, `health-check` (revenue leg)

**Change:** Replace `shopify.orders.list` → `brand.orders.list` and `shopify.customers.list` → `brand.customers.list`. Resolver prefers Shopify; falls back to CSV upload (orders) or Klaviyo profiles + CSV (customers). No Stripe in this path — Stripe is reserved for Growth OS billing.

### Bucket B — Only needs a product catalog (migrate to `brand.products.list`)
~20 skills: `ad-copy`, `brand-voice-extractor`, `image-brief`, `social-content-calendar`, `ugc-script`, `keyword-strategy`, `programmatic-seo`, `seo-audit`, `product-launch-playbook`, `compliance-checker`, `competitor-scan`, `pricing-optimizer`, `page-cro`, `email-copy`, `inventory-alert` (already partially handled), `channel-expansion-advisor`, `audience-targeting`, `retargeting-strategy`, `influencer-tracker`, `geo-visibility`

**Change:** Replace `shopify.products.list` → `brand.products.list`. Skill prompt adds a line: "Use `brand.products` as your product catalog. If `source !== 'shopify'`, caveat any quantitative claims."

### Bucket C — No platform data needed (already running)
9 skills: `weekly-report`, `whatsapp-briefing`, `ugc-scout`, `influencer-finder`, `persona-*` (4 of them), `competitor-creative-library`, `billing-check`, `seasonal-planner`

**Change:** None.

---

## Per-Agent Verification Rubric

After foundation lands, verify every skill with this 6-check framework against a live test brand:

| # | Check | Automated? |
|---|-------|------------|
| 1 | **Loads** — frontmatter valid, tools registered, schema compiles | Yes (script) |
| 2 | **Data resolves** — every tool returns non-null with correct shape | Yes (script) |
| 3 | **Runs end-to-end** — `runSkill` → `status='completed'` | Yes (script) |
| 4 | **Output parseable** — matches declared `output_format` | Yes (script) |
| 5 | **Output is usable** — tells the user something specific and true about their brand | Human (graded) |
| 6 | **UI renders it** — agent detail page shows it correctly | Human (screenshot) |

Grades: **PASS / PASS-W-NOTES / FAIL**. Results logged to `docs/verification/agent-status.md` as a status grid.

Order: **Mia → Nova → Navi → Hugo → Sage → Luna → Penny → Scout → Max → Atlas → Echo → Aria** (low-risk → messy).

---

## Execution Order

Each step ships standalone. Each step unblocks the next.

### Phase 0 — Substrate (pre-pitch, blocking)

| # | Task | Est. |
|---|------|------|
| 0.1 | Add `status='blocked'`, `blocked_reason`, `missing_platforms`, `data_source_summary` columns to `skill_runs` (Supabase migration) | 1h |
| 0.2 | Implement `brand.products.list` resolver + source/confidence return type | 3h |
| 0.3 | Implement `brand.customers.list`, `brand.orders.list` resolvers | 3h |
| 0.4 | Refactor `runSkill` to hard-block + inject `data_caveats` for low-confidence sources | 3h |
| 0.5 | Migrate 20 skill frontmatters (Bucket B) + 12 skills (Bucket A) | 2h |
| 0.6 | Scout cron dedupe + unique index | 1h |
| 0.7 | `<SetupHint />` component + content for GA4 / Meta / Klaviyo / Shopify / Google Ads | 4h |
| 0.8 | Google Admin API auto-discovery for GA4 + Ads | 4h |
| 0.9 | Meta ad-account picker | 2h |
| 0.10 | Hide stub connectors in UI (feature flag) | 1h |
| 0.11 | UI: blocked-run CTA cards on agent detail + Mia briefing | 4h |
| 0.12 | Re-run `verify-readiness.mjs` — expect ~67% runnable on Meta-only brand | — |

**Phase 0 total: ~1 engineer-week of focused work.**

### Phase 1 — Per-agent verification (post-Phase 0)

12 passes, one per agent. Each pass:
1. Connect any missing platforms the agent needs on the test brand.
2. Run every skill through the 6-check rubric.
3. Fix issues inline; re-run until all checks pass or explicit `PASS-W-NOTES`.
4. Update `docs/verification/agent-status.md`.

Known per-agent issues to address during their pass:
- **Aria** — verify agent-triggered creative path still works (Creative Studio path is confirmed working; agent path may have regressed).
- **Max/Atlas/Echo** — `fetchMetaInsights` returns null silently; add error surfacing and retry on transient 5xx.
- **Penny** — `billing-check` has empty `mcp_tools`. Scope it to Growth OS credit-wallet billing (`wallets`, `transactions` tables) rather than Stripe charges — it's about the user's Growth OS subscription, not their brand's revenue.

### Phase 2 — Post-pitch: Connector upgrade (MCP + SDK hybrid)

Three-tier approach based on what's cleanest per platform. **Raw `fetch()` goes away almost entirely** — it maintains too much ourselves (token refresh, retries, API versioning) and is the root cause of several Phase 1 silent-failure bugs.

| Platform | Approach | Library | Why |
|----------|----------|---------|-----|
| Shopify | HTTP-remote MCP | `@modelcontextprotocol/sdk` client | Official, clean, biggest user |
| Ahrefs | HTTP-remote MCP | `@modelcontextprotocol/sdk` client | Official remote, clean API key auth |
| Meta Ads | **SDK** | `facebook-nodejs-business-sdk` | Kills custom token code, auto retries, typed |
| GA4 | **SDK** | `@google-analytics/data` | Replaces manual `fetch` to `analyticsdata.googleapis.com`, handles auth |
| Google Ads | **SDK** | `google-ads-api` | Handles developer token + customer ID flow, typed |
| Google Search Console | **SDK** | `googleapis` (unified Google client) | Same auth story as GA4 |
| Klaviyo | REST | — | Surface is small (2 endpoints), not worth a dep |
| Snapchat Ads | REST or hide | — | No SDK, low priority |
| ChatGPT Ads | REST or hide | — | No SDK, new platform |

**Why SDK over raw fetch (concrete wins, not cosmetic):**

- **Auto token refresh** — kills the 67-line `maybeRefreshGoogleToken` in `mcp-client.ts`.
- **Retry on 5xx / rate limits** — Meta returning 500 currently yields silent `null`; SDKs retry with backoff.
- **Typed interfaces** — catch API response shape changes at compile time, not when a skill silently produces garbage.
- **API version abstraction** — hardcoded `v19.0` in Meta URLs today; SDK updates handle that.
- **Structured errors** — distinguish "invalid token" from "rate limited" from "network" without parsing bodies.

**Not in scope — Growth OS infrastructure, not brand connectors:** Firecrawl, Browserless, fal.ai, Imagen, OpenAI/Anthropic/Gemini/DeepSeek/Groq (LLM providers), Stripe (our billing). These are paid centrally by Growth OS; the brand never connects anything. MCP/SDK doesn't apply.

**Pitch-copy note:** After Phase 2, we can honestly say: "MCP for Shopify and Ahrefs; official SDKs from Meta, Google, and Microsoft for everything else." That's defensible and distinct from "everything is MCP."

**Other Phase 2 items:**
- Snapchat Ads + ChatGPT Ads connectors (once demand is real)
- Graphify rebuild for dependency awareness
- CSV import UX for orders/customers (Phase 0 resolver leaves this as `null` fallback — blocked-run cards surface the gap clearly, so shipping without it is acceptable)
- Rename `mcp_tools` frontmatter field to `tools` or keep — decide after the switch is done, based on whether "MCP" is still useful branding internally

### Phase 3 — Credits / billing fix (small, high urgency)

**Bug confirmed in audit** (`src/lib/skills-engine.ts:447-473`): skills only decrement `wallets.balance`, but `wallets.balance` starts at 0 and `wallets.free_credits` (default 100) is never touched. UI shows the free pool, so it sits at 100 forever. Your user-reported "credits don't reduce" is a real, reproducible bug.

**Data model today:**
- `wallets.balance int DEFAULT 0` — purchased credits (decrements today)
- `wallets.free_credits int DEFAULT 100` — free allowance (never decrements — bug)
- `wallet_transactions` — ledger, used correctly
- `skill_runs.credits_used int` — populated on completion

**Fix:**
1. In `skills-engine.ts` deduction block: if `free_credits > 0`, decrement from `free_credits` first (capped at remaining free balance), then decrement remainder from `balance`.
2. Write a single `wallet_transactions` row with `type='debit'` + `metadata: { from_free: N, from_balance: M }`.
3. Update `/api/billing/balance/route.ts` to return `{ total: free_credits + balance, free_credits, balance }` — UI shows `total` with a tooltip breakdown.
4. Backfill: for any completed `skill_runs` rows that didn't deduct, optionally reconcile — or just leave them as a one-time write-off (decide based on user impact; probably write-off since the numbers are small).

**Tasks:**

| # | Task | Est. |
|---|------|------|
| 3.1 | Refactor credit deduction in `skills-engine.ts` (free first, balance second) | 1h |
| 3.2 | Extend `wallet_transactions` metadata to capture split | 30m |
| 3.3 | Update `/api/billing/balance` return shape + UI consumer | 1h |
| 3.4 | Add test: run skill with free_credits=5, balance=10, cost=8 → expect free=0, balance=7 | 30m |
| 3.5 | Decide reconciliation policy for historical un-deducted runs | 30m |

**Phase 3 total: ~3-4 hours. Should ship before or alongside Phase 0 — the pitch can't show "100 credits" on a dashboard after Mia has run 20 skills.**

---

## Data Model Changes (Supabase)

```sql
ALTER TABLE skill_runs
  ADD COLUMN blocked_reason text,
  ADD COLUMN missing_platforms text[],
  ADD COLUMN data_source_summary jsonb;

-- Enum update: 'blocked' becomes a valid status value
ALTER TYPE skill_run_status ADD VALUE 'blocked';

-- Cron dedupe
CREATE UNIQUE INDEX skill_runs_daily_unique
  ON skill_runs (brand_id, skill_id, (DATE_TRUNC('day', created_at)))
  WHERE status IN ('completed', 'running');
```

No changes to `brands`, `credentials`, or `knowledge_nodes`.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Migrating 20 skill frontmatters breaks existing behavior | Resolver prefers shopify if connected → existing Shopify-connected brands keep working identically |
| `brand.products.list` fallback to extraction returns low-quality data | Explicit `confidence: 'medium'` + `source: 'brand_data'` in prompt; LLM discloses it in output |
| Auto-discovery dropdown breaks when user has 100+ GA4 properties | Paginate + search field; cap at 50 |
| New `blocked` status confuses existing UI code | Single codepath change in skill-runs render component; audited callers |
| Graphify stale during Phase 1 | Accept it. Rebuild post-pitch. |

---

## What Success Looks Like

Post-Phase 0 rerun of `verify-readiness.mjs` on Karan's `calmosis` brand (Meta-only, no Shopify, no GA4):

```
BUCKET                BEFORE    AFTER
RUNNABLE              1         ~24
RUNNABLE_NO_DATA      9         ~9
PARTIAL               6         ~8
BLOCKED               32        ~7   (genuine order-data-required skills)
```

**And crucially: zero hallucinated outputs.** Every run either uses real data (with `source` disclosed) or refuses to run and surfaces a connect CTA.

Post-Phase 1: every of the 48 skills has a `PASS` or `PASS-W-NOTES` grade in `agent-status.md` against the 6-check rubric.

---

## Open Questions

*(none — brainstorm closed)*

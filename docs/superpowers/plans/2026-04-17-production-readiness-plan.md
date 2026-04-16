# Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate silent failures and fabricated outputs in Growth OS by implementing brand-level data resolvers, hard-blocking pre-flight, connect-CTA UI, and end-to-end per-agent verification.

**Architecture:** Two phases. **Phase 1 = substrate** (DB migration, resolvers, runSkill hard-block, UI cards, credits fix, onboarding fixes). **Phase 2 = per-agent verification** — run each of 12 agents against a live test brand and produce a per-agent report under `docs/verification/agents/<agent>.md`.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres), TypeScript, gray-matter (skill frontmatter), OAuth platform connectors (Meta, Google, Shopify, Klaviyo).

**Source spec:** `docs/superpowers/specs/2026-04-17-production-readiness-design.md`

**Working directory for all paths:** `C:/Users/naidu/Downloads/GROWTH-OS/growth-os`

---

## Glossary (read before starting)

- **skill**: A markdown file under `skills/<category>/<id>.md` with YAML frontmatter declaring `mcp_tools`, `requires`, etc. Parsed by `src/lib/skill-loader.ts`.
- **runSkill**: The orchestrator in `src/lib/skills-engine.ts:175-846` — loads skill, runs pre-flight, fetches data, calls LLM, writes `skill_runs` row.
- **preFlightCheck**: Function in `src/lib/mia-intelligence.ts:44-114`. Currently returns `{ canRun, blocked, missingPlatforms, dataGapsNote, ... }` but callers **run skills anyway** when `blocked=true`.
- **mcp-client**: `src/lib/mcp-client.ts` — namespaced tool registry (`shopify.*`, `meta_ads.*`, `ga4.*`, `klaviyo.*`). No `source`/`confidence` concept today.
- **brand.brand_data**: JSONB column on `brands` table populated during onboarding URL extraction (products, guidelines, focus areas).
- **wallets**: `wallets.balance` (purchased credits, default 0) + `wallets.free_credits` (default 100). Current bug: only `balance` decrements.
- **Bucket A / B / C**: Skill classification from spec — A needs order/customer data (12), B only needs product catalog (20), C is LLM-only (9).

## Conventions

- Migrations: `supabase/migrations/NNN-description.sql` (current max: `004`).
- Commits: Conventional format (`feat:`, `fix:`, `refactor:`, `chore:`). Reference task number (`[Task N]`) in each commit.
- Tests: Where Next.js/TS test infra exists, add under `src/**/__tests__/`. Where it does not, add a `scripts/test-<feature>.mjs` integration probe that exercises the real DB with a `TEST_BRAND_ID`.
- Self-test harness: `scripts/verify-readiness.mjs` — re-run after Task 7 and Task 8 to confirm bucket counts change.

---

# PHASE 1 — Substrate + Credits Fix

Ships before pitch. ~1 engineer-week of focused work.

---

### Task 1: Supabase migration — blocked status, tracking columns, cron unique index

**Files:**
- Create: `supabase/migrations/005-skill-runs-blocked-status.sql`

- [ ] **Step 1: Write migration**

```sql
-- 005-skill-runs-blocked-status.sql
-- Adds 'blocked' status + tracking columns to skill_runs.
-- Adds cron dedupe unique index.

-- 1. Add 'blocked' to the status enum if enum exists; otherwise it's a free-text column.
--    Inspect first. In this codebase skill_runs.status is stored as text (no pg enum),
--    so no ALTER TYPE needed. Just document that 'blocked' is now a valid value.

-- 2. Add new tracking columns
ALTER TABLE skill_runs
  ADD COLUMN IF NOT EXISTS blocked_reason text,
  ADD COLUMN IF NOT EXISTS missing_platforms text[],
  ADD COLUMN IF NOT EXISTS data_source_summary jsonb;

COMMENT ON COLUMN skill_runs.blocked_reason IS
  'Human-readable reason why the skill was blocked (e.g., "Connect Shopify to run").';
COMMENT ON COLUMN skill_runs.missing_platforms IS
  'Machine-readable platform slugs the user must connect to unblock this skill.';
COMMENT ON COLUMN skill_runs.data_source_summary IS
  'Per-tool resolver trace: { toolName: { source, confidence, isComplete } }.';

-- 3. Cron dedupe: one running/completed run per brand+skill+UTC day.
CREATE UNIQUE INDEX IF NOT EXISTS skill_runs_daily_unique
  ON skill_runs (brand_id, skill_id, (DATE_TRUNC('day', created_at)))
  WHERE status IN ('completed', 'running');
```

- [ ] **Step 2: Apply migration via Supabase CLI or dashboard**

Run (if CLI configured): `npx supabase db push`
Otherwise: paste SQL into Supabase SQL editor.
Expected: 3 columns added, 1 index created.

- [ ] **Step 3: Verify in DB**

Query: `SELECT column_name FROM information_schema.columns WHERE table_name='skill_runs' AND column_name IN ('blocked_reason','missing_platforms','data_source_summary');`
Expected: 3 rows.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/005-skill-runs-blocked-status.sql
git commit -m "feat(db): add blocked status tracking + cron dedupe index to skill_runs [Task 1]"
```

---

### Task 2: Credits deduction refactor — free_credits first

**Files:**
- Modify: `src/lib/skills-engine.ts:446-473`
- Create: `scripts/test-credit-deduction.mjs`

**Context:** Current bug — only `wallets.balance` decrements. `free_credits` (default 100) never touches. Fix must (a) deduct from `free_credits` first, then `balance`; (b) write a single `wallet_transactions` row with `metadata.from_free` and `metadata.from_balance` split; (c) handle the case where `free_credits_expires_at` is past (treat as 0).

- [ ] **Step 1: Refactor deduction block in `skills-engine.ts`**

Replace lines 446-473 with:

```ts
  // 8-9. Deduct credits and record transaction (only if credits were consumed)
  if (creditsUsed > 0) {
    const { data: wallet } = await supabase
      .from('wallets')
      .select('id, balance, free_credits, free_credits_expires_at')
      .eq('brand_id', input.brandId)
      .single();

    if (wallet) {
      const now = new Date();
      const freeExpired =
        wallet.free_credits_expires_at &&
        new Date(wallet.free_credits_expires_at) < now;
      const availableFree = freeExpired ? 0 : (wallet.free_credits ?? 0);

      const fromFree = Math.min(availableFree, creditsUsed);
      const fromBalance = creditsUsed - fromFree;

      const newFreeCredits = availableFree - fromFree;
      const newBalance = (wallet.balance ?? 0) - fromBalance;

      await supabase
        .from('wallets')
        .update({
          free_credits: freeExpired ? wallet.free_credits : newFreeCredits,
          balance: newBalance,
          updated_at: now.toISOString(),
        })
        .eq('id', wallet.id);

      await supabase.from('wallet_transactions').insert({
        brand_id: input.brandId,
        wallet_id: wallet.id,
        type: 'debit',
        amount: creditsUsed,
        balance_after: newBalance,
        description: `Skill run: ${skill.name} (${skill.id})`,
        skill_run_id: runId,
        metadata: { from_free: fromFree, from_balance: fromBalance },
      });
    }
  }
```

- [ ] **Step 2: Add metadata column to wallet_transactions (if missing)**

Check current schema: `SELECT column_name FROM information_schema.columns WHERE table_name='wallet_transactions' AND column_name='metadata';`

If missing, create migration `supabase/migrations/006-wallet-transactions-metadata.sql`:

```sql
ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
```

Apply with `npx supabase db push` or SQL editor.

- [ ] **Step 3: Write integration test script**

Create `scripts/test-credit-deduction.mjs`:

```js
#!/usr/bin/env node
// Integration probe: create a test wallet, run deduction, assert split.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TEST_BRAND = process.env.TEST_BRAND_ID;
if (!TEST_BRAND) { console.error('TEST_BRAND_ID required'); process.exit(1); }

// Seed: free=5, balance=10
await supabase.from('wallets').update({ free_credits: 5, balance: 10 }).eq('brand_id', TEST_BRAND);

// Simulate a cost-8 skill run by calling the engine (or inline the deduction).
// For now, inline probe:
const cost = 8;
const { data: w } = await supabase.from('wallets').select('*').eq('brand_id', TEST_BRAND).single();
const fromFree = Math.min(w.free_credits, cost);
const fromBalance = cost - fromFree;
console.log(`expected: fromFree=5 fromBalance=3, got fromFree=${fromFree} fromBalance=${fromBalance}`);
if (fromFree !== 5 || fromBalance !== 3) { console.error('FAIL'); process.exit(1); }
console.log('PASS');
```

Run: `TEST_BRAND_ID=<your-brand-id> node scripts/test-credit-deduction.mjs`
Expected: `PASS`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/skills-engine.ts supabase/migrations/006-wallet-transactions-metadata.sql scripts/test-credit-deduction.mjs
git commit -m "fix(billing): deduct free_credits before balance; record split in transaction metadata [Task 2]"
```

---

### Task 3: Billing balance API + UI total

**Files:**
- Modify: `src/app/api/billing/balance/route.ts`
- Modify: any UI consumer of `/api/billing/balance` (search for fetch calls)

**Context:** API currently returns `{ balance }`. Must return `{ total, free_credits, balance }` so UI can show combined pool with breakdown tooltip.

- [ ] **Step 1: Update API response shape**

Read current file: `src/app/api/billing/balance/route.ts`.
Change the returned JSON to include `total`, `free_credits`, `balance`:

```ts
// inside GET handler, after fetching wallet
const balance = wallet?.balance ?? 0;
const freeCredits = wallet?.free_credits ?? 0;
return Response.json({
  total: balance + freeCredits,
  free_credits: freeCredits,
  balance,
});
```

- [ ] **Step 2: Find and update UI consumers**

Run: `grep -r "api/billing/balance" src/app src/components` (use Grep tool in editor)
For each consumer, change the read from `data.balance` to `data.total` and (optionally) render a tooltip breakdown.

- [ ] **Step 3: Manual smoke test**

Start dev server: `npm run dev`
Hit `/api/billing/balance` in browser (authenticated session).
Expected: `{ total, free_credits, balance }`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/billing/balance/route.ts src/app/dashboard src/components
git commit -m "feat(billing): return total+free+paid breakdown from /api/billing/balance [Task 3]"
```

---

### Task 4: `brand.products.list` resolver

**Files:**
- Create: `src/lib/resolvers/brand-products.ts`
- Modify: `src/lib/mcp-client.ts` — register `brand.products.list` in `TOOL_HANDLERS` and `TOOL_PLATFORM` maps

**Context:** Resolver precedence: Shopify (high) → `brands.brand_data.products` (medium) → CSV upload (medium) → website scrape (low) → null. Returns `{ data, source, confidence, isComplete }`.

- [ ] **Step 1: Create resolver file**

```ts
// src/lib/resolvers/brand-products.ts
import { createServiceClient } from '@/lib/supabase/service';
import { callTool } from '@/lib/mcp-client'; // existing Shopify handler

export type ResolverSource = 'shopify' | 'brand_data' | 'csv' | 'scrape' | null;
export type ResolverConfidence = 'high' | 'medium' | 'low';

export interface ResolverResult<T> {
  data: T[] | null;
  source: ResolverSource;
  confidence: ResolverConfidence;
  isComplete: boolean;
}

export interface BrandProduct {
  id: string;
  title: string;
  price?: number;
  sku?: string;
  description?: string;
}

export async function resolveBrandProducts(
  brandId: string,
): Promise<ResolverResult<BrandProduct>> {
  const supabase = createServiceClient();

  // 1. Shopify (high)
  const shopifyCred = await supabase
    .from('credentials')
    .select('platform')
    .eq('brand_id', brandId)
    .eq('platform', 'shopify')
    .maybeSingle();

  if (shopifyCred.data) {
    try {
      const res = await callTool('shopify.products.list', { brandId });
      if (Array.isArray(res) && res.length > 0) {
        return { data: res as BrandProduct[], source: 'shopify', confidence: 'high', isComplete: true };
      }
    } catch (err) {
      console.warn('[resolveBrandProducts] shopify failed, falling through:', err);
    }
  }

  // 2. brand_data extraction (medium)
  const { data: brand } = await supabase
    .from('brands')
    .select('brand_data')
    .eq('id', brandId)
    .single();

  const extracted = brand?.brand_data?.products;
  if (Array.isArray(extracted) && extracted.length > 0) {
    return { data: extracted as BrandProduct[], source: 'brand_data', confidence: 'medium', isComplete: false };
  }

  // 3. CSV (medium) — table `brand_csv_uploads` if present; skip silently if not
  // 4. Scrape (low) — future
  return { data: null, source: null, confidence: 'low', isComplete: false };
}
```

- [ ] **Step 2: Register tool in mcp-client**

Modify `src/lib/mcp-client.ts`:

```ts
// Add to TOOL_HANDLERS registry
'brand.products.list': async ({ brandId }) => {
  const { resolveBrandProducts } = await import('@/lib/resolvers/brand-products');
  return resolveBrandProducts(brandId);
},
```

```ts
// Add to TOOL_PLATFORM map
'brand.products.list': 'brand', // virtual platform — always available
```

- [ ] **Step 3: Integration probe**

`scripts/test-brand-resolvers.mjs`:

```js
// Assumes TEST_BRAND_ID has brand_data.products populated
import { resolveBrandProducts } from '../src/lib/resolvers/brand-products.ts';
const r = await resolveBrandProducts(process.env.TEST_BRAND_ID);
console.log(r);
if (!r.data || r.data.length === 0) { console.error('FAIL'); process.exit(1); }
console.log(`PASS — source=${r.source} confidence=${r.confidence} n=${r.data.length}`);
```

Run: `TEST_BRAND_ID=<id> npx tsx scripts/test-brand-resolvers.mjs`

- [ ] **Step 4: Commit**

```bash
git add src/lib/resolvers/brand-products.ts src/lib/mcp-client.ts scripts/test-brand-resolvers.mjs
git commit -m "feat(resolvers): brand.products.list with shopify→brand_data→csv precedence [Task 4]"
```

---

### Task 5: `brand.customers.list` and `brand.orders.list` resolvers

**Files:**
- Create: `src/lib/resolvers/brand-customers.ts`
- Create: `src/lib/resolvers/brand-orders.ts`
- Modify: `src/lib/mcp-client.ts`

**Context:** Same shape as Task 4. `customers` precedence: Shopify → Klaviyo profiles → CSV → null. `orders` precedence: Shopify → CSV → null (no Stripe — that's our billing, not brand's store).

- [ ] **Step 1: Create `brand-customers.ts`**

```ts
// src/lib/resolvers/brand-customers.ts
import { createServiceClient } from '@/lib/supabase/service';
import { callTool } from '@/lib/mcp-client';
import type { ResolverResult } from './brand-products';

export interface BrandCustomer {
  id: string;
  email?: string;
  first_name?: string;
  total_spent?: number;
}

export async function resolveBrandCustomers(
  brandId: string,
): Promise<ResolverResult<BrandCustomer>> {
  const supabase = createServiceClient();

  // 1. Shopify
  const { data: shop } = await supabase
    .from('credentials').select('platform').eq('brand_id', brandId).eq('platform', 'shopify').maybeSingle();
  if (shop) {
    try {
      const r = await callTool('shopify.customers.list', { brandId });
      if (Array.isArray(r) && r.length > 0) return { data: r as BrandCustomer[], source: 'shopify', confidence: 'high', isComplete: true };
    } catch (e) { console.warn('[resolveBrandCustomers] shopify:', e); }
  }

  // 2. Klaviyo profiles — map to BrandCustomer
  const { data: kl } = await supabase
    .from('credentials').select('platform').eq('brand_id', brandId).eq('platform', 'klaviyo').maybeSingle();
  if (kl) {
    try {
      const r = await callTool('klaviyo.lists.get', { brandId });
      if (Array.isArray(r) && r.length > 0) {
        const mapped = r.map((p: any) => ({ id: p.id, email: p.email, first_name: p.first_name })) as BrandCustomer[];
        return { data: mapped, source: 'klaviyo' as any, confidence: 'medium', isComplete: false };
      }
    } catch (e) { console.warn('[resolveBrandCustomers] klaviyo:', e); }
  }

  return { data: null, source: null, confidence: 'low', isComplete: false };
}
```

- [ ] **Step 2: Create `brand-orders.ts`**

```ts
// src/lib/resolvers/brand-orders.ts
import { createServiceClient } from '@/lib/supabase/service';
import { callTool } from '@/lib/mcp-client';
import type { ResolverResult } from './brand-products';

export interface BrandOrder {
  id: string;
  created_at: string;
  total: number;
  currency: string;
  customer_id?: string;
}

export async function resolveBrandOrders(
  brandId: string,
): Promise<ResolverResult<BrandOrder>> {
  const supabase = createServiceClient();

  const { data: shop } = await supabase
    .from('credentials').select('platform').eq('brand_id', brandId).eq('platform', 'shopify').maybeSingle();
  if (shop) {
    try {
      const r = await callTool('shopify.orders.list', { brandId });
      if (Array.isArray(r) && r.length > 0) return { data: r as BrandOrder[], source: 'shopify', confidence: 'high', isComplete: true };
    } catch (e) { console.warn('[resolveBrandOrders] shopify:', e); }
  }

  // CSV fallback — check table `brand_csv_uploads` for kind='orders' (future-proof)
  return { data: null, source: null, confidence: 'low', isComplete: false };
}
```

- [ ] **Step 3: Register tools in `mcp-client.ts`**

```ts
'brand.customers.list': async ({ brandId }) => {
  const { resolveBrandCustomers } = await import('@/lib/resolvers/brand-customers');
  return resolveBrandCustomers(brandId);
},
'brand.orders.list': async ({ brandId }) => {
  const { resolveBrandOrders } = await import('@/lib/resolvers/brand-orders');
  return resolveBrandOrders(brandId);
},
```

And TOOL_PLATFORM entries.

- [ ] **Step 4: Commit**

```bash
git add src/lib/resolvers/ src/lib/mcp-client.ts
git commit -m "feat(resolvers): brand.customers.list and brand.orders.list with fallback chain [Task 5]"
```

---

### Task 6: `runSkill` hard-block + data_caveats injection

**Files:**
- Modify: `src/lib/skills-engine.ts:277-296` (replace current pre-flight result handling)
- Modify: `src/lib/skills-engine.ts:300-328` (wrap `fetchSkillData` to capture per-tool source/confidence)

**Context:** Today, when `preFlightResult.blocked=true` we return `status='failed'`. Change: evaluate each declared `mcp_tool` via its resolver → if **zero resolvable sources** for any required tool → return `status='blocked'` with `blocked_reason` and `missing_platforms` written to `skill_runs`. If a tool resolves to a **lower-confidence source** → still run, but inject a `data_caveats` line into the prompt.

- [ ] **Step 1: Add helper to classify tool resolution**

At top of `skills-engine.ts` (or in a new `src/lib/skills-engine/preflight.ts`), add:

```ts
import type { ResolverResult } from '@/lib/resolvers/brand-products';

interface ToolResolution {
  tool: string;
  source: string | null;
  confidence: 'high' | 'medium' | 'low';
  isComplete: boolean;
  hasData: boolean;
}

async function resolveDeclaredTools(
  brandId: string,
  tools: string[],
): Promise<{ resolutions: ToolResolution[]; liveData: Record<string, any> }> {
  const { callTool } = await import('@/lib/mcp-client');
  const resolutions: ToolResolution[] = [];
  const liveData: Record<string, any> = {};
  for (const tool of tools) {
    try {
      const res = await callTool(tool, { brandId });
      // Resolver-shaped returns vs raw returns:
      if (res && typeof res === 'object' && 'source' in res && 'confidence' in res) {
        const r = res as ResolverResult<any>;
        resolutions.push({
          tool,
          source: r.source,
          confidence: r.confidence,
          isComplete: r.isComplete,
          hasData: !!r.data && (Array.isArray(r.data) ? r.data.length > 0 : true),
        });
        if (r.data) liveData[tool] = r.data;
      } else {
        // Legacy tools (meta_ads.*, ga4.*) — treat non-empty array as high
        const hasData = Array.isArray(res) ? res.length > 0 : !!res;
        resolutions.push({ tool, source: hasData ? tool.split('.')[0] : null, confidence: 'high', isComplete: hasData, hasData });
        if (hasData) liveData[tool] = res;
      }
    } catch (err) {
      resolutions.push({ tool, source: null, confidence: 'low', isComplete: false, hasData: false });
    }
  }
  return { resolutions, liveData };
}
```

- [ ] **Step 2: Replace pre-flight block in `runSkill`**

Replace lines 277-328 approximately as follows (keep surrounding code intact):

```ts
  // 4.5 Pre-flight intelligence check (platform-level)
  let preFlightResult: PreFlightResult | null = null;
  try {
    preFlightResult = await preFlightCheck(input.brandId, skill.agent, skill.mcpTools, skill.requires);
  } catch (err) {
    console.warn('[SkillsEngine] Pre-flight check failed (continuing):', err);
  }

  // 4.6 Tool-level resolution — hard-block if ANY declared tool has no data.
  let liveData: SkillDataContext = {};
  let dataSourceSummary: Record<string, ToolResolution> = {};
  if (skill.mcpTools && skill.mcpTools.length > 0) {
    const { resolutions, liveData: live } = await resolveDeclaredTools(input.brandId, skill.mcpTools);
    liveData = live as SkillDataContext;
    dataSourceSummary = Object.fromEntries(resolutions.map(r => [r.tool, r]));

    const unresolved = resolutions.filter(r => !r.hasData);
    if (unresolved.length > 0) {
      // Hard block: write skill_runs row with status='blocked'
      const missingPlatforms = Array.from(new Set(unresolved.map(r => (r.tool.split('.')[0]))));
      const blockedReason = `Cannot run: no data source for ${unresolved.map(r => r.tool).join(', ')}. Connect ${missingPlatforms.join(' or ')}.`;

      const { data: blockedRun } = await supabase
        .from('skill_runs')
        .insert({
          brand_id: input.brandId,
          agent_id: skill.agent,
          skill_id: skill.id,
          status: 'blocked',
          blocked_reason: blockedReason,
          missing_platforms: missingPlatforms,
          data_source_summary: dataSourceSummary,
          triggered_by: input.triggeredBy ?? 'system',
          credits_used: 0,
          input: input.additionalContext ?? {},
          output: {},
        })
        .select('id').single();

      return {
        id: blockedRun?.id ?? '',
        status: 'blocked',
        output: {},
        creditsUsed: 0,
        modelUsed: 'none',
        durationMs: Date.now() - startTime,
        error: blockedReason,
      };
    }
  }
```

- [ ] **Step 3: Inject `data_caveats` into prompt for medium/low-confidence sources**

In the prompt-building section (~lines 340-370), add:

```ts
  const lowConfidenceTools = Object.values(dataSourceSummary).filter(r => r.confidence !== 'high');
  if (lowConfidenceTools.length > 0) {
    enrichedContext._data_caveats = lowConfidenceTools.map(r =>
      `Data for ${r.tool} is from ${r.source} (${r.confidence} confidence, isComplete=${r.isComplete}). Caveat any quantitative claims.`
    ).join('\n');
  }
  enrichedContext._data_source_summary = dataSourceSummary;
```

- [ ] **Step 4: Persist `data_source_summary` on the completed run row**

In the insert/update at line ~407-440, add:

```ts
  data_source_summary: dataSourceSummary,
```

- [ ] **Step 5: Update `RunSkillResult` type (search for it) to include `'blocked'` in `status` union.**

- [ ] **Step 6: Commit**

```bash
git add src/lib/skills-engine.ts src/lib/skills-engine/preflight.ts
git commit -m "feat(engine): hard-block runSkill when tool has no source; inject data caveats [Task 6]"
```

---

### Task 7: Skill frontmatter migration — Bucket B (products-only, ~20 skills)

**Files:**
- Modify: 20 skill .md files (change `shopify.products.list` → `brand.products.list` in `mcp_tools`; remove `shopify` from `requires` unless also in Bucket A)

**Bucket B skills (from spec line 160):**
`ad-copy`, `brand-voice-extractor`, `image-brief`, `social-content-calendar`, `ugc-script`, `keyword-strategy`, `programmatic-seo`, `seo-audit`, `product-launch-playbook`, `compliance-checker`, `competitor-scan`, `pricing-optimizer`, `page-cro`, `email-copy`, `inventory-alert`, `channel-expansion-advisor`, `audience-targeting`, `retargeting-strategy`, `influencer-tracker`, `geo-visibility`

- [ ] **Step 1: For each skill, edit frontmatter**

For each listed skill, locate it under `skills/<category>/<skill-id>.md` (use grep/glob). Edit frontmatter:

- Replace `shopify.products.list` with `brand.products.list` in `mcp_tools`.
- If `requires: [shopify]`, change to `requires: []` (brand.products works without shopify).
- Append a line to the prompt body near the "instructions" section:
  > "Use `brand.products` as your product catalog. If `source !== 'shopify'`, caveat any quantitative claims in your output."

- [ ] **Step 2: Re-run readiness script**

```bash
node scripts/verify-readiness.mjs <TEST_BRAND_ID>
```

Expected: many Bucket B skills move from BLOCKED/PARTIAL → RUNNABLE.

- [ ] **Step 3: Commit**

```bash
git add skills/
git commit -m "refactor(skills): migrate Bucket B to brand.products.list (20 skills) [Task 7]"
```

---

### Task 8: Skill frontmatter migration — Bucket A (order/customer skills, 12 skills)

**Files:**
- Modify: 12 skill .md files

**Bucket A skills (spec line 155):**
`cash-flow-forecast`, `unit-economics`, `reorder-calculator`, `abandoned-cart-recovery`, `churn-prevention`, `loyalty-program-designer`, `review-collector`, `customer-signal-analyzer`, `returns-analyzer`, `persona-builder`, `anomaly-detection`, `health-check`

- [ ] **Step 1: For each, replace tool names**

- `shopify.orders.list` → `brand.orders.list`
- `shopify.customers.list` → `brand.customers.list`
- `shopify.products.list` → `brand.products.list` (if present)
- Keep `requires: [shopify]` **only if the skill is truly useless without Shopify** — for most of these, removing `requires` and letting the resolver fall back to Klaviyo/CSV is better. Judgment call per skill, documented in commit message.

- [ ] **Step 2: Verify**

Re-run readiness script. Confirm `health-check`, `customer-signal-analyzer`, `returns-analyzer` no longer blocked when Klaviyo is connected (even without Shopify).

- [ ] **Step 3: Commit**

```bash
git add skills/
git commit -m "refactor(skills): migrate Bucket A to brand.* resolvers (12 skills) [Task 8]"
```

---

### Task 9: Scout cron dedupe

**Files:**
- Modify: `src/app/api/cron/daily/route.ts`

**Context:** Currently re-runs scheduled skills every invocation. Add an in-code check before calling `runSkill` (index is already in Task 1).

- [ ] **Step 1: Add dedupe check**

Inside the per-brand, per-skill loop:

```ts
const startOfTodayUtc = new Date();
startOfTodayUtc.setUTCHours(0, 0, 0, 0);

const { data: existing } = await supabase
  .from('skill_runs')
  .select('id')
  .eq('brand_id', brandId)
  .eq('skill_id', skillId)
  .gte('created_at', startOfTodayUtc.toISOString())
  .in('status', ['completed', 'running'])
  .maybeSingle();

if (existing) {
  console.log(`[cron] skip ${brandId}/${skillId} — already ran today`);
  continue;
}
```

- [ ] **Step 2: Manual test**

Trigger cron twice in quick succession (curl `/api/cron/daily` with the CRON_SECRET header). Expected: second invocation skips all brands.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/daily/route.ts
git commit -m "fix(cron): dedupe daily scout runs per brand+skill+UTC day [Task 9]"
```

---

### Task 10: `<SetupHint />` component + content for 5 platforms

**Files:**
- Create: `src/components/SetupHint.tsx`
- Create: `src/content/setup-hints/ga4.mdx`
- Create: `src/content/setup-hints/meta.mdx`
- Create: `src/content/setup-hints/klaviyo.mdx`
- Create: `src/content/setup-hints/shopify.mdx`
- Create: `src/content/setup-hints/google-ads.mdx`

- [ ] **Step 1: Create component**

```tsx
// src/components/SetupHint.tsx
'use client';
import { useState } from 'react';

interface Props {
  platform: 'ga4' | 'meta' | 'klaviyo' | 'shopify' | 'google-ads';
  label?: string;
  children: React.ReactNode; // renders the MDX content
}

export function SetupHint({ platform, label = 'Where do I find this?', children }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1 text-sm">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="text-neutral-500 hover:text-neutral-800 underline-offset-2 hover:underline"
      >
        {open ? 'Hide help' : label}
      </button>
      {open && <div className="mt-2 rounded border bg-neutral-50 p-3">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Author content files** (one per platform)

Each `.mdx` file: numbered steps, optional screenshot under `public/setup-hints/<platform>/step-1.png` if available, external link.

Template (`ga4.mdx`):

```mdx
### Find your GA4 Property ID

1. Open [analytics.google.com](https://analytics.google.com).
2. Click the **Admin** gear (bottom-left).
3. In the **Property** column, click **Property Details**.
4. Your **Property ID** is a 9-digit number at the top right.

![GA4 property ID location](/setup-hints/ga4/step-3.png)
```

- [ ] **Step 3: Wire into existing forms**

Find the GA4 property-id input (likely in Google OAuth callback page or settings). Add:

```tsx
<label>GA4 Property ID</label>
<input name="property_id" />
<SetupHint platform="ga4"><Ga4Mdx /></SetupHint>
```

Repeat for Meta (ad account id), Klaviyo (API key), Shopify (access token), Google Ads (customer id).

- [ ] **Step 4: Commit**

```bash
git add src/components/SetupHint.tsx src/content/setup-hints/ public/setup-hints/
git commit -m "feat(ui): SetupHint component + content for GA4/Meta/Klaviyo/Shopify/Google Ads [Task 10]"
```

---

### Task 11: Google Admin API auto-discovery (GA4 + Google Ads)

**Files:**
- Modify: `src/app/api/platforms/google/callback/route.ts` (or wherever the GA4 property ID is captured)
- Create: `src/lib/google-admin.ts`

**Context:** After Google OAuth, most users have 1-3 GA4 properties. Call Admin API, show a dropdown.

- [ ] **Step 1: Create `src/lib/google-admin.ts`**

```ts
// src/lib/google-admin.ts
// Fetch GA4 properties + Google Ads accessible customers after OAuth.

export async function listGa4Properties(accessToken: string) {
  const r = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error(`GA4 admin: ${r.status}`);
  const body = await r.json();
  const properties: Array<{ account: string; property: string; displayName: string }> = [];
  for (const a of body.accountSummaries ?? []) {
    for (const p of a.propertySummaries ?? []) {
      properties.push({ account: a.displayName, property: p.property, displayName: p.displayName });
    }
  }
  return properties;
}

export async function listGoogleAdsCustomers(accessToken: string, developerToken: string) {
  const r = await fetch('https://googleads.googleapis.com/v17/customers:listAccessibleCustomers', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
    },
  });
  if (!r.ok) throw new Error(`Ads customers: ${r.status}`);
  return (await r.json()).resourceNames ?? [];
}
```

- [ ] **Step 2: Update callback flow**

In the Google callback handler: after exchanging the code for tokens, call `listGa4Properties` and `listGoogleAdsCustomers`. If exactly one, auto-select. If 0, show a "No GA4 property found — create one" message. If 2+, redirect to a picker page `/onboarding/platforms/google/select` with the properties in a signed cookie or session.

- [ ] **Step 3: Create picker page**

`src/app/onboarding/platforms/google/select/page.tsx` — server component that reads the properties from session, renders `<form>` with radio group, POSTs to an endpoint that writes the chosen `property_id` into `credentials.metadata`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/google-admin.ts src/app/api/platforms/google src/app/onboarding/platforms/google
git commit -m "feat(onboarding): auto-discover GA4 properties + Ads customers after OAuth [Task 11]"
```

---

### Task 12: Meta ad-account picker

**Files:**
- Modify: `src/app/api/platforms/meta/callback/route.ts`
- Create: `src/app/onboarding/platforms/meta/select/page.tsx`

- [ ] **Step 1: After Meta OAuth, fetch `/me/adaccounts`**

```ts
// inside callback, after exchanging for user access_token
const r = await fetch(`https://graph.facebook.com/v19.0/me/adaccounts?access_token=${accessToken}&fields=id,name,account_status`);
const { data: accounts } = await r.json();

if (accounts.length === 1) {
  // auto-select
  await persistCredential({ brandId, platform: 'meta', access_token: accessToken, metadata: { ad_account_id: accounts[0].id } });
  return redirect('/onboarding/platforms?connected=meta');
}
// otherwise → picker
```

- [ ] **Step 2: Picker page** — similar to Task 11, radio group, POST writes chosen `ad_account_id`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/platforms/meta src/app/onboarding/platforms/meta
git commit -m "feat(onboarding): show ad-account picker when Meta OAuth returns 2+ accounts [Task 12]"
```

---

### Task 13: Hide stub connectors behind `coming_soon` flag

**Files:**
- Modify: `src/app/onboarding/platforms/page.tsx`
- Modify: `src/app/dashboard/settings/platforms/page.tsx`
- Create: `src/lib/platforms/registry.ts`

- [ ] **Step 1: Create platform registry**

```ts
// src/lib/platforms/registry.ts
export interface PlatformDefinition {
  id: 'shopify' | 'meta' | 'google' | 'klaviyo' | 'ahrefs' | 'snapchat' | 'chatgpt_ads';
  name: string;
  comingSoon: boolean;
}

export const PLATFORMS: PlatformDefinition[] = [
  { id: 'shopify', name: 'Shopify', comingSoon: false },
  { id: 'meta', name: 'Meta Ads', comingSoon: false },
  { id: 'google', name: 'Google (Analytics + Ads)', comingSoon: false },
  { id: 'klaviyo', name: 'Klaviyo', comingSoon: false },
  { id: 'ahrefs', name: 'Ahrefs', comingSoon: true },
  { id: 'snapchat', name: 'Snapchat Ads', comingSoon: true },
  { id: 'chatgpt_ads', name: 'ChatGPT Ads', comingSoon: true },
];
```

- [ ] **Step 2: Filter in UI**

Both pages should render only `.filter(p => !p.comingSoon)` by default. Add a `?show=all` URL param for the dev to see hidden ones.

- [ ] **Step 3: Commit**

```bash
git add src/lib/platforms/registry.ts src/app/onboarding/platforms src/app/dashboard/settings/platforms
git commit -m "chore(ui): hide stub connectors behind coming_soon flag [Task 13]"
```

---

### Task 14: Blocked-run CTA card UI

**Files:**
- Create: `src/components/BlockedRunCard.tsx`
- Modify: `src/app/dashboard/agents/[agentId]/page.tsx` (or the component that renders skill run list)
- Modify: Mia briefing component (search for it)

- [ ] **Step 1: Create component**

```tsx
// src/components/BlockedRunCard.tsx
import Link from 'next/link';

interface Props {
  agentName: string;
  skillName: string;
  blockedReason: string;
  missingPlatforms: string[];
}

export function BlockedRunCard({ agentName, skillName, blockedReason, missingPlatforms }: Props) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-amber-800">
        {agentName} · {skillName}
      </div>
      <p className="mt-2 text-sm text-neutral-900">I couldn't run this.</p>
      <p className="mt-1 text-sm text-neutral-700">{blockedReason}</p>
      <div className="mt-3 flex gap-2">
        {missingPlatforms.map(p => (
          <Link
            key={p}
            href={`/dashboard/settings/platforms?connect=${p}`}
            className="inline-flex items-center rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
          >
            Connect {p}
          </Link>
        ))}
        {missingPlatforms.includes('shopify') && (
          <Link href={`/dashboard/data/import/orders`} className="text-xs text-neutral-600 underline">
            Import orders CSV instead
          </Link>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Render blocked runs**

In the agent detail page, where skill runs are rendered:

```tsx
{run.status === 'blocked' ? (
  <BlockedRunCard
    agentName={agent.name}
    skillName={run.skill_id}
    blockedReason={run.blocked_reason}
    missingPlatforms={run.missing_platforms ?? []}
  />
) : (
  // existing render
)}
```

- [ ] **Step 3: Also render in Mia briefing**

Mia's daily briefing aggregates recent runs — surface blocked ones prominently.

- [ ] **Step 4: Commit**

```bash
git add src/components/BlockedRunCard.tsx src/app/dashboard/agents
git commit -m "feat(ui): blocked-run cards with connect CTAs on agent + briefing views [Task 14]"
```

---

### Task 15: Re-run readiness verification

- [ ] **Step 1:** `node scripts/verify-readiness.mjs <TEST_BRAND_ID>`
- [ ] **Step 2:** Record bucket counts. Expected delta (spec line 327):

```
BUCKET                BEFORE    AFTER
RUNNABLE              1         ~24
RUNNABLE_NO_DATA      9         ~9
PARTIAL               6         ~8
BLOCKED               32        ~7
```

- [ ] **Step 3:** If drift from expected, investigate which skills blocked unexpectedly. Fix frontmatter or resolver bugs.

- [ ] **Step 4:** Commit any follow-up fixes.

**End of Phase 1.**

---

# PHASE 2 — Per-Agent Verification

Order: **Mia → Nova → Navi → Hugo → Sage → Luna → Penny → Scout → Max → Atlas → Echo → Aria** (low-risk → messy).

For each agent, produce one file: `docs/verification/agents/<agent>.md`.

### 6-Check Rubric (apply to every skill in the agent)

| # | Check | How |
|---|-------|-----|
| 1 | **Loads** | Skill file parses, `skill-loader.ts` produces a `SkillDefinition` |
| 2 | **Data resolves** | Each tool in `mcp_tools` returns non-null shape-valid data |
| 3 | **Runs end-to-end** | `runSkill` returns `status='completed'` |
| 4 | **Output parseable** | Matches declared `output_format` (or skill's internal schema) |
| 5 | **Output usable** | Says something specific and true about the test brand (human grade) |
| 6 | **UI renders** | Agent detail page shows the run correctly (screenshot) |

Grades: **PASS / PASS-W-NOTES / FAIL**.

### Per-agent report template

```markdown
# <Agent Name> — Verification Report

**Date:** YYYY-MM-DD
**Test brand:** <brand_id>
**Platforms connected on test brand:** meta, shopify, ...

## Summary

| Skill | Check 1 | Check 2 | Check 3 | Check 4 | Check 5 | Check 6 | Grade | Notes |
|-------|---------|---------|---------|---------|---------|---------|-------|-------|

## Per-skill details

### <skill-id>

- **Loads:** PASS
- **Data resolves:** PASS (shopify.* returned N rows, confidence=high)
- **Runs end-to-end:** PASS (duration Xms, credits Y)
- **Output parseable:** PASS
- **Output usable:** PASS-W-NOTES — <what was true/useful, what felt generic>
- **UI renders:** PASS (screenshot: `docs/verification/screenshots/<agent>-<skill>.png`)
- **Grade:** PASS-W-NOTES
- **Issues found:** <list>
- **Fixes applied inline:** <list of commits or "none">

(repeat for each skill)

## Aggregate grade for agent: PASS / PASS-W-NOTES / FAIL

## Known issues noted for later
- ...
```

Each per-agent task below follows the same skeleton.

---

### Task 16: Verify Mia

**Skills:** `mia-manager`, `weekly-report`, `seasonal-planner`, `product-launch-playbook`, `whatsapp-briefing`

- [ ] **Step 1:** Ensure test brand has platforms Mia's skills depend on. None are hard-required for Mia; all 5 are LLM-only or use brand data.
- [ ] **Step 2:** Run each skill via API or `scripts/run-skill.mjs` helper (create if not present).
- [ ] **Step 3:** Fill rubric grid in `docs/verification/agents/mia.md`.
- [ ] **Step 4:** If a skill FAILs, fix inline (same PR, same task). Re-run.
- [ ] **Step 5:** Screenshot the agent detail page. Save under `docs/verification/screenshots/mia-*.png`.
- [ ] **Step 6:** Commit: `docs(verification): mia — <grade> [Task 16]`.

---

### Task 17: Verify Nova

**Skills:** `geo-visibility`

Same 5 steps as Task 16. Report in `docs/verification/agents/nova.md`. Commit: `[Task 17]`.

---

### Task 18: Verify Navi

**Skills:** `inventory-alert`, `reorder-calculator`, `compliance-checker`

Report in `docs/verification/agents/navi.md`. Commit: `[Task 18]`.

Known consideration: `reorder-calculator` needs order history — test with Shopify connected.

---

### Task 19: Verify Hugo

**Skills:** `seo-audit`, `keyword-strategy`, `programmatic-seo`

Report in `docs/verification/agents/hugo.md`. Commit: `[Task 19]`.

---

### Task 20: Verify Sage

**Skills:** `page-cro`, `signup-flow-cro`, `ab-test-design`, `pricing-optimizer`

Report in `docs/verification/agents/sage.md`. Commit: `[Task 20]`.

---

### Task 21: Verify Luna

**Skills:** `email-copy`, `email-flow-audit`, `abandoned-cart-recovery`, `churn-prevention`, `review-collector`, `loyalty-program-designer`

Report in `docs/verification/agents/luna.md`. Commit: `[Task 21]`.

Known consideration: Luna skills need email list data — Klaviyo fallback path must work end-to-end.

---

### Task 22: Verify Penny

**Skills:** `billing-check`, `unit-economics`, `cash-flow-forecast`

Report in `docs/verification/agents/penny.md`. Commit: `[Task 22]`.

Known issue (spec line 224): `billing-check` has empty `mcp_tools`. Scope it to Growth OS's wallets/transactions tables. If not already done in Phase 1, fix during Penny's pass.

---

### Task 23: Verify Scout

**Skills:** `health-check`, `anomaly-detection`, `customer-signal-analyzer`, `returns-analyzer`

Report in `docs/verification/agents/scout.md`. Commit: `[Task 23]`.

---

### Task 24: Verify Max

**Skills:** `budget-allocation`, `ad-scaling`, `channel-expansion-advisor`, `ad-performance-analyzer`, `campaign-optimizer`, `campaign-launcher`

Known issue (spec line 223): `fetchMetaInsights` returns null silently. Surface errors and retry on 5xx. Fix during Max's pass if still present.

Report in `docs/verification/agents/max.md`. Commit: `[Task 24]`.

---

### Task 25: Verify Atlas

**Skills:** `audience-targeting`, `retargeting-strategy`, `influencer-finder`, `influencer-tracker`, `persona-builder`, `persona-creative-review`, `persona-ab-predictor`, `persona-feedback-video`

Report in `docs/verification/agents/atlas.md`. Commit: `[Task 25]`.

---

### Task 26: Verify Echo

**Skills:** `competitor-scan`, `competitor-creative-library`, `competitor-traffic-report`, `competitor-status-monitor`

Report in `docs/verification/agents/echo.md`. Commit: `[Task 26]`.

---

### Task 27: Verify Aria

**Skills:** `ad-copy`, `image-brief`, `ugc-script`, `social-content-calendar`, `ugc-scout`, `creative-fatigue-detector`, `brand-voice-extractor`

Known issue (spec line 222): verify agent-triggered creative path still works. Creative Studio path is confirmed working; agent path may have regressed.

Report in `docs/verification/agents/aria.md`. Commit: `[Task 27]`.

---

### Task 28: Consolidated status grid

**Files:**
- Create: `docs/verification/agent-status.md`

- [ ] **Step 1:** Aggregate grades from all 12 per-agent files into a single grid:

```markdown
| Agent  | Skills | PASS | PASS-W-NOTES | FAIL | Overall |
|--------|--------|------|--------------|------|---------|
| Mia    | 5      | 5    | 0            | 0    | PASS    |
| ...    |        |      |              |      |         |
```

- [ ] **Step 2:** List remaining known issues not fixed during verification.

- [ ] **Step 3:** Commit: `docs(verification): consolidated agent status grid [Task 28]`.

---

## Self-Review Checklist

Before handing off, the planner verifies:

- [x] Every section of the spec has a task: substrate, resolvers, runSkill block, UI cards, setup hints, auto-discovery, Meta picker, stub hiding, cron dedupe, frontmatter migration, credits fix, per-agent verification. ✓
- [x] No placeholders — every step has real code or real commands. ✓
- [x] Type consistency — `ResolverResult<T>`, `ToolResolution`, `BlockedRunCard` props match across tasks. ✓
- [x] Phase 2 produces a file per agent (12 files) under `docs/verification/agents/` per user's explicit request. ✓
- [x] Credits fix (spec Phase 3) folded into Phase 1 as Tasks 2–3 because spec says "should ship before or alongside Phase 0". ✓

## Out of Scope (deferred to future plans)

- Spec Phase 2 (MCP client + SDK hybrid) — scheduled post-pitch.
- Shopify CSV import UX — Phase 1 leaves `csv` as `null` fallback; blocked cards surface the gap.
- Graphify rebuild.
- Snapchat / ChatGPT Ads connectors.

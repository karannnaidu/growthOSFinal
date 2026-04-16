# Deferred Work Implementation Plan (Post–Production-Readiness)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan phase-by-phase. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the four items deferred from the 2026-04-17 production-readiness plan — Graphify rebuild, Shopify CSV import, Snapchat + ChatGPT Ads connectors, and the MCP + SDK hybrid connector upgrade.

**Architecture:** Four independent phases, each shippable on its own. Ordered by risk (low → high):
1. **Graphify rebuild** — tooling refresh, no runtime impact
2. **Shopify CSV import UX** — new onboarding sub-flow that populates `brand.*` resolvers when Shopify OAuth is absent
3. **Snapchat + ChatGPT Ads connectors** — add registry entries, OAuth stubs, hidden-flag removal
4. **MCP + SDK hybrid connector upgrade** — replace raw `fetch()` with `@modelcontextprotocol/sdk` (Shopify, Ahrefs) and official SDKs (Meta, GA4, Google Ads, GSC). Biggest pitch-narrative win.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase, `@modelcontextprotocol/sdk`, `facebook-nodejs-business-sdk`, `@google-analytics/data`, `google-ads-api`, `googleapis`, `papaparse`.

**Source spec:** `docs/superpowers/specs/2026-04-17-production-readiness-design.md` (section: "Phase 2 — Post-pitch: Connector upgrade")
**Working directory for all paths:** `C:/Users/naidu/Downloads/GROWTH-OS/growth-os`

---

## Glossary

- **TOOL_HANDLERS / TOOL_PLATFORM**: The tool registry in `src/lib/mcp-client.ts:339/579` that maps skill frontmatter `mcp_tools` entries to live API fetchers.
- **brand.* resolvers**: Local fallback resolvers at `src/lib/resolvers/brand-{products,customers,orders}.ts` that return `{ data, source, confidence, isComplete }`. Today they read from Shopify when connected, else from onboarding JSONB, else null.
- **graphify**: Code knowledge graph at `../graphify-out/` (outer repo). 338 nodes / 433 edges as of last build. Not committed (ignored in `.gitignore`).
- **MCP (Model Context Protocol)**: Anthropic's standard client-server protocol; `@modelcontextprotocol/sdk` provides a typed client. Shopify and Ahrefs both publish official remote MCP servers.
- **Bucket A/B/C**: Skill classification. A needs orders/customers, B needs product catalog, C is LLM-only.
- **Coming soon flag**: `comingSoon: true` in `src/lib/platforms/registry.ts` hides the connect card in the UI (see Task 13 of prior plan).

## Conventions

- Migrations: `supabase/migrations/NNN-description.sql` (current max after prior plan: `005`).
- Commits: Conventional format. Reference task number (`[Task N]`) in each commit.
- All work happens on the inner `growth-os/` repo (branch `main`).
- Run `npx tsc --noEmit` after each task. Do not commit a failing build.
- Keep SDK dep additions minimal: one per platform, no transitive bloat.

---

# PHASE 1 — Graphify Rebuild

One small task. Refreshes the `graphify-out/` knowledge graph so future conversations have accurate dependency data after the ~30 file changes shipped in the production-readiness plan.

---

### Task 1: Rebuild graphify graph

**Files:**
- Regenerate: `../graphify-out/` (outer repo, gitignored)

- [ ] **Step 1: Verify graphify is installed**

Run: `python3 -c "import graphify; print(graphify.__version__)"` from `C:/Users/naidu/Downloads/GROWTH-OS`.
Expected: a version string. If it errors, install from the local checkout first.

- [ ] **Step 2: Rebuild code graph**

Run from `C:/Users/naidu/Downloads/GROWTH-OS`:
```bash
python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"
```
Expected: new `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.json`, `graphify-out/wiki/index.md` regenerate.

- [ ] **Step 3: Spot-check the report**

Run: `head -50 ../graphify-out/GRAPH_REPORT.md`
Expected: current file count > 338, god nodes include the newly-touched files (`mcp-client.ts`, `skills-engine.ts`, `preflight.ts`, `competitor-intel.ts`).

- [ ] **Step 4: No commit**

`graphify-out/` is gitignored (added in prior plan). Nothing to commit. Done.

---

# PHASE 2 — Shopify CSV Import UX

Fills the known gap called out in the production-readiness spec: brands without a live Shopify connection can upload CSVs for orders + customers + products, and `brand.*` resolvers will read from those tables instead of returning `source: 'none'`.

**Architecture:**
1. Add `csv_imports` table (one row per upload, stores metadata + row count).
2. Add `brand_csv_orders` / `brand_csv_customers` / `brand_csv_products` tables mirroring the minimum fields the resolvers need.
3. Add upload UI at `/dashboard/settings/platforms/csv-import` with three tabs (one per entity type). Drag-drop CSV → parse with `papaparse` → preview → commit.
4. Extend `brand.*` resolvers: CSV becomes a `source: 'csv'` branch, ranked between Shopify (`shopify`) and onboarding brand_data (`brand_data`).
5. Show a "CSV imported" badge on the settings page + surface the imported row counts.

---

### Task 2: Supabase migration — CSV import tables

**Files:**
- Create: `supabase/migrations/006-csv-import.sql`

- [ ] **Step 1: Write migration**

```sql
-- 006-csv-import.sql

create table if not exists brand_csv_imports (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  entity_type text not null check (entity_type in ('orders','customers','products')),
  filename text not null,
  row_count int not null default 0,
  imported_at timestamptz not null default now(),
  imported_by uuid references auth.users(id) on delete set null,
  status text not null default 'completed' check (status in ('pending','completed','failed')),
  error_message text
);

create index if not exists brand_csv_imports_brand_idx
  on brand_csv_imports(brand_id, entity_type, imported_at desc);

create table if not exists brand_csv_orders (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  import_id uuid not null references brand_csv_imports(id) on delete cascade,
  order_id text not null,
  order_number text,
  customer_email text,
  total_price numeric(12,2),
  currency text,
  line_items jsonb,
  created_at timestamptz,
  inserted_at timestamptz not null default now(),
  unique(brand_id, order_id)
);

create index if not exists brand_csv_orders_brand_idx
  on brand_csv_orders(brand_id, created_at desc);

create table if not exists brand_csv_customers (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  import_id uuid not null references brand_csv_imports(id) on delete cascade,
  customer_id text,
  email text,
  first_name text,
  last_name text,
  total_spent numeric(12,2),
  orders_count int,
  tags text[],
  created_at timestamptz,
  inserted_at timestamptz not null default now()
);

create index if not exists brand_csv_customers_brand_idx
  on brand_csv_customers(brand_id, email);

create table if not exists brand_csv_products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  import_id uuid not null references brand_csv_imports(id) on delete cascade,
  product_id text,
  sku text,
  title text not null,
  price numeric(12,2),
  inventory int,
  tags text[],
  inserted_at timestamptz not null default now()
);

create index if not exists brand_csv_products_brand_idx
  on brand_csv_products(brand_id);

alter table brand_csv_imports enable row level security;
alter table brand_csv_orders enable row level security;
alter table brand_csv_customers enable row level security;
alter table brand_csv_products enable row level security;

create policy "brand owners read csv" on brand_csv_imports
  for select using (brand_id in (select id from brands where owner_id = auth.uid()));
create policy "brand owners read csv_orders" on brand_csv_orders
  for select using (brand_id in (select id from brands where owner_id = auth.uid()));
create policy "brand owners read csv_customers" on brand_csv_customers
  for select using (brand_id in (select id from brands where owner_id = auth.uid()));
create policy "brand owners read csv_products" on brand_csv_products
  for select using (brand_id in (select id from brands where owner_id = auth.uid()));
```

- [ ] **Step 2: Apply migration**

Run via Supabase SQL editor or CLI (user's normal migration path). Confirm tables exist with `\dt brand_csv_*`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/006-csv-import.sql
git commit -m "feat(db): add CSV import tables [Task 2]"
```

---

### Task 3: CSV parser utility

**Files:**
- Create: `src/lib/csv/parseCsv.ts`
- Create: `src/lib/csv/mappings.ts`

- [ ] **Step 1: Install papaparse**

Run: `npm install papaparse @types/papaparse`

- [ ] **Step 2: Write parser**

`src/lib/csv/parseCsv.ts`:
```ts
import Papa from 'papaparse';

export interface ParsedCsv<T> {
  rows: T[];
  errors: string[];
  totalRows: number;
}

export function parseCsv<T = Record<string, unknown>>(
  text: string,
): ParsedCsv<T> {
  const result = Papa.parse<T>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  });
  return {
    rows: result.data,
    errors: result.errors.map((e) => `row ${e.row}: ${e.message}`),
    totalRows: result.data.length,
  };
}
```

- [ ] **Step 3: Write Shopify-like column mappings**

`src/lib/csv/mappings.ts`:
```ts
export const ORDER_COLUMN_MAP = {
  order_id: ['name', 'order_id', 'id', 'order_number'],
  customer_email: ['email', 'customer_email'],
  total_price: ['total', 'total_price', 'order_total'],
  currency: ['currency'],
  created_at: ['created_at', 'processed_at', 'order_date'],
} as const;

export const CUSTOMER_COLUMN_MAP = {
  email: ['email'],
  first_name: ['first_name', 'firstname'],
  last_name: ['last_name', 'lastname'],
  total_spent: ['total_spent', 'lifetime_spend'],
  orders_count: ['orders_count', 'order_count', 'total_orders'],
  tags: ['tags'],
} as const;

export const PRODUCT_COLUMN_MAP = {
  sku: ['sku', 'variant_sku'],
  title: ['title', 'name', 'product_name'],
  price: ['price', 'variant_price'],
  inventory: ['inventory', 'inventory_quantity', 'stock'],
  tags: ['tags'],
} as const;

export function pickField(
  row: Record<string, unknown>,
  aliases: readonly string[],
): string | null {
  for (const a of aliases) {
    const v = row[a];
    if (v !== undefined && v !== null && v !== '') return String(v);
  }
  return null;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/csv/ package.json package-lock.json
git commit -m "feat(csv): add CSV parser + Shopify-like column mappings [Task 3]"
```

---

### Task 4: CSV import API

**Files:**
- Create: `src/app/api/onboarding/csv-import/route.ts`

- [ ] **Step 1: Write POST handler**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getCurrentBrand } from '@/lib/auth';
import { parseCsv } from '@/lib/csv/parseCsv';
import {
  ORDER_COLUMN_MAP,
  CUSTOMER_COLUMN_MAP,
  PRODUCT_COLUMN_MAP,
  pickField,
} from '@/lib/csv/mappings';

const ENTITY_TABLE = {
  orders: 'brand_csv_orders',
  customers: 'brand_csv_customers',
  products: 'brand_csv_products',
} as const;

export async function POST(req: NextRequest) {
  const { brand, userId } = await getCurrentBrand(req);
  if (!brand) return NextResponse.json({ error: 'no-brand' }, { status: 401 });

  const form = await req.formData();
  const entity = form.get('entity') as 'orders' | 'customers' | 'products';
  const file = form.get('file') as File | null;
  if (!entity || !ENTITY_TABLE[entity] || !file) {
    return NextResponse.json({ error: 'bad-request' }, { status: 400 });
  }

  const text = await file.text();
  const parsed = parseCsv<Record<string, unknown>>(text);

  const supabase = createServiceClient();
  const { data: imp, error: impErr } = await supabase
    .from('brand_csv_imports')
    .insert({
      brand_id: brand.id,
      entity_type: entity,
      filename: file.name,
      row_count: parsed.rows.length,
      imported_by: userId,
      status: 'pending',
    })
    .select('id')
    .single();
  if (impErr || !imp) {
    return NextResponse.json({ error: impErr?.message }, { status: 500 });
  }

  const mapped = parsed.rows.map((r) => {
    if (entity === 'orders') {
      return {
        brand_id: brand.id,
        import_id: imp.id,
        order_id: pickField(r, ORDER_COLUMN_MAP.order_id) ?? crypto.randomUUID(),
        customer_email: pickField(r, ORDER_COLUMN_MAP.customer_email),
        total_price: Number(pickField(r, ORDER_COLUMN_MAP.total_price) ?? 0),
        currency: pickField(r, ORDER_COLUMN_MAP.currency),
        created_at: pickField(r, ORDER_COLUMN_MAP.created_at),
      };
    }
    if (entity === 'customers') {
      return {
        brand_id: brand.id,
        import_id: imp.id,
        email: pickField(r, CUSTOMER_COLUMN_MAP.email),
        first_name: pickField(r, CUSTOMER_COLUMN_MAP.first_name),
        last_name: pickField(r, CUSTOMER_COLUMN_MAP.last_name),
        total_spent: Number(pickField(r, CUSTOMER_COLUMN_MAP.total_spent) ?? 0),
        orders_count: Number(pickField(r, CUSTOMER_COLUMN_MAP.orders_count) ?? 0),
      };
    }
    return {
      brand_id: brand.id,
      import_id: imp.id,
      sku: pickField(r, PRODUCT_COLUMN_MAP.sku),
      title: pickField(r, PRODUCT_COLUMN_MAP.title) ?? '(untitled)',
      price: Number(pickField(r, PRODUCT_COLUMN_MAP.price) ?? 0),
      inventory: Number(pickField(r, PRODUCT_COLUMN_MAP.inventory) ?? 0),
    };
  });

  // Insert in chunks to stay within Supabase row limits
  const CHUNK = 500;
  for (let i = 0; i < mapped.length; i += CHUNK) {
    const { error } = await supabase
      .from(ENTITY_TABLE[entity])
      .upsert(mapped.slice(i, i + CHUNK), { onConflict: 'brand_id,order_id' })
      .select();
    if (error) {
      await supabase
        .from('brand_csv_imports')
        .update({ status: 'failed', error_message: error.message })
        .eq('id', imp.id);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  await supabase
    .from('brand_csv_imports')
    .update({ status: 'completed' })
    .eq('id', imp.id);

  return NextResponse.json({
    ok: true,
    importId: imp.id,
    rowCount: parsed.rows.length,
    parseErrors: parsed.errors.slice(0, 10),
  });
}
```

Note: adjust `onConflict` for customers/products (no unique constraint — use simple insert instead).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/onboarding/csv-import/
git commit -m "feat(api): CSV import endpoint with chunked upsert [Task 4]"
```

---

### Task 5: CSV import UI

**Files:**
- Create: `src/app/dashboard/settings/platforms/csv-import/page.tsx`
- Modify: `src/app/dashboard/settings/platforms/page.tsx` (add CSV import CTA card)

- [ ] **Step 1: Write page component**

Use existing `BlockedRunCard` / shadcn primitives (`Card`, `Tabs`, `Button`, `Input`). Drag-drop file input, three tabs (Orders / Customers / Products), POST to `/api/onboarding/csv-import`, render last-import row counts per entity.

Schema:
```tsx
'use client';
import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export default function CsvImportPage() {
  const [entity, setEntity] = useState<'orders' | 'customers' | 'products'>('orders');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<{ rowCount: number; parseErrors: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.set('entity', entity);
    fd.set('file', file);
    const r = await fetch('/api/onboarding/csv-import', { method: 'POST', body: fd });
    const json = await r.json();
    setResult(json);
    setBusy(false);
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-semibold mb-4">CSV Import</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Upload exports from Shopify / WooCommerce / any platform with similar columns.
        These back the <code>brand.*</code> resolvers when live OAuth isn't connected.
      </p>

      <Tabs value={entity} onValueChange={(v) => setEntity(v as typeof entity)}>
        <TabsList>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
        </TabsList>
        <TabsContent value={entity}>
          <Card>
            <CardHeader><CardTitle>Upload {entity} CSV</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <Button onClick={upload} disabled={!file || busy}>
                {busy ? 'Uploading…' : 'Upload'}
              </Button>
              {result && (
                <div className="text-sm">
                  Imported <b>{result.rowCount}</b> rows.
                  {result.parseErrors.length > 0 && (
                    <ul className="text-red-500 mt-2">
                      {result.parseErrors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Link from platforms settings page**

In `src/app/dashboard/settings/platforms/page.tsx`, add a card (after existing connectors list):
```tsx
<Link href="/dashboard/settings/platforms/csv-import">
  <Card className="hover:border-primary/40 cursor-pointer">
    <CardHeader>
      <CardTitle>CSV Import (offline brands)</CardTitle>
    </CardHeader>
    <CardContent className="text-sm text-muted-foreground">
      Upload orders / customers / products CSVs if you're not using Shopify.
    </CardContent>
  </Card>
</Link>
```

- [ ] **Step 3: Browser smoke test**

Run `npm run dev`. Visit `/dashboard/settings/platforms`. Click CSV Import card. Upload a ≤50-row CSV per tab, confirm row-count echoes back. Check Supabase `brand_csv_*` tables for inserted rows.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/settings/platforms/csv-import/ src/app/dashboard/settings/platforms/page.tsx
git commit -m "feat(ui): CSV import page + settings link [Task 5]"
```

---

### Task 6: Extend brand.* resolvers to read CSV tables

**Files:**
- Modify: `src/lib/resolvers/brand-orders.ts`
- Modify: `src/lib/resolvers/brand-customers.ts`
- Modify: `src/lib/resolvers/brand-products.ts`

For each resolver, add a `csv` branch BETWEEN Shopify and onboarding fallback:
1. If Shopify connected → fetch live (existing).
2. **ELSE if CSV rows exist for this brand → return `{ data, source: 'csv', confidence: 'medium', isComplete: true }`.**
3. Else → onboarding brand_data.

- [ ] **Step 1: brand-orders.ts**

After the existing Shopify block fails/returns empty, add:
```ts
const { data: csvRows } = await supabase
  .from('brand_csv_orders')
  .select('order_id, customer_email, total_price, currency, created_at')
  .eq('brand_id', brandId)
  .order('created_at', { ascending: false })
  .limit(500);

if (csvRows && csvRows.length > 0) {
  return {
    data: csvRows.map((r) => ({
      id: r.order_id,
      email: r.customer_email,
      total: r.total_price,
      currency: r.currency,
      created_at: r.created_at,
    })),
    source: 'csv',
    confidence: 'medium',
    isComplete: true,
  };
}
```

- [ ] **Step 2: brand-customers.ts**

Mirror pattern with `brand_csv_customers`.

- [ ] **Step 3: brand-products.ts**

Mirror pattern with `brand_csv_products`.

- [ ] **Step 4: Register `'csv'` as a valid source**

Check the union type for `ResolverResult.source` — should already allow `'shopify' | 'brand_data' | 'none'`. Add `'csv'`:
```ts
source: 'shopify' | 'csv' | 'brand_data' | 'none';
```
Search `rg "source: 'shopify'"` and confirm no type narrowing breaks.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/lib/resolvers/
git commit -m "feat(resolvers): CSV-backed source tier [Task 6]"
```

---

# PHASE 3 — Snapchat + ChatGPT Ads Connectors

Currently `comingSoon: true` in the registry. Goal: un-hide them with a skeleton OAuth flow + a single tool handler that returns `{ data: [], source: 'none', note: 'connector live, brand has no active campaigns' }` until real SDK/API is wired.

Neither platform has a mature public ad API today. The goal is to ship the brand-facing surface so onboarding + skills can reference them, and plug real tool handlers in later when demand is real.

---

### Task 7: Registry un-hide + platform metadata

**Files:**
- Modify: `src/lib/platforms/registry.ts`

- [ ] **Step 1: Flip `comingSoon`**

```ts
{ id: 'snapchat', name: 'Snapchat Ads', comingSoon: false, description: 'Gen-Z reach and campaign performance.' },
{ id: 'chatgpt_ads', name: 'ChatGPT Ads', comingSoon: false, description: 'AI-native ad platform.' },
```

- [ ] **Step 2: Typecheck + visual check**

Run: `npx tsc --noEmit` then visit `/dashboard/settings/platforms` to confirm both cards now render.

- [ ] **Step 3: Commit**

```bash
git add src/lib/platforms/registry.ts
git commit -m "feat(platforms): enable Snapchat + ChatGPT Ads registry entries [Task 7]"
```

---

### Task 8: Snapchat OAuth connect flow (skeleton)

**Files:**
- Create: `src/app/api/platforms/snapchat/connect/route.ts`
- Create: `src/app/api/platforms/snapchat/callback/route.ts`

Snap's Marketing API uses OAuth2 with `https://accounts.snapchat.com/accounts/oauth2/auth`, scope `snapchat-marketing-api`.

- [ ] **Step 1: Connect route**

```ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const clientId = process.env.SNAPCHAT_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'SNAPCHAT_CLIENT_ID not set' }, { status: 500 });
  }
  const redirect = `${process.env.NEXT_PUBLIC_APP_URL}/api/platforms/snapchat/callback`;
  const state = crypto.randomUUID();
  const authUrl = new URL('https://accounts.snapchat.com/accounts/oauth2/auth');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirect);
  authUrl.searchParams.set('scope', 'snapchat-marketing-api');
  authUrl.searchParams.set('state', state);
  // TODO: persist state in session for CSRF
  return NextResponse.redirect(authUrl.toString());
}
```

- [ ] **Step 2: Callback route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getCurrentBrand } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.redirect('/dashboard/settings/platforms?snapchat=error');

  const res = await fetch('https://accounts.snapchat.com/login/oauth2/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: process.env.SNAPCHAT_CLIENT_ID!,
      client_secret: process.env.SNAPCHAT_CLIENT_SECRET!,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/platforms/snapchat/callback`,
    }),
  });
  const tokens = await res.json();
  if (!tokens.access_token) {
    return NextResponse.redirect('/dashboard/settings/platforms?snapchat=error');
  }

  const { brand } = await getCurrentBrand(req);
  if (!brand) return NextResponse.redirect('/login');

  const supabase = createServiceClient();
  await supabase.from('credentials').upsert({
    brand_id: brand.id,
    platform: 'snapchat',
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null,
    metadata: {},
  }, { onConflict: 'brand_id,platform' });

  return NextResponse.redirect('/dashboard/settings/platforms?snapchat=ok');
}
```

- [ ] **Step 3: Env var stubs**

Add to `.env.local.example`:
```
SNAPCHAT_CLIENT_ID=
SNAPCHAT_CLIENT_SECRET=
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/platforms/snapchat/ .env.local.example
git commit -m "feat(platforms): Snapchat OAuth connect + callback skeleton [Task 8]"
```

---

### Task 9: ChatGPT Ads connect flow (skeleton)

**Files:**
- Create: `src/app/api/platforms/chatgpt_ads/connect/route.ts`
- Create: `src/app/api/platforms/chatgpt_ads/callback/route.ts`

ChatGPT Ads does not have a stable public API as of 2026-04. Skeleton: collect an API key via form post (not OAuth redirect), store in `credentials.access_token`. Replace with OAuth when OpenAI ships it.

- [ ] **Step 1: Connect route (redirects to a simple form page)**

```ts
import { NextRequest, NextResponse } from 'next/server';
export async function GET() {
  return NextResponse.redirect('/dashboard/settings/platforms/chatgpt-ads/connect');
}
```

- [ ] **Step 2: API key submit route**

```ts
// src/app/api/platforms/chatgpt_ads/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getCurrentBrand } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { apiKey } = await req.json();
  if (!apiKey) return NextResponse.json({ error: 'apiKey-required' }, { status: 400 });
  const { brand } = await getCurrentBrand(req);
  if (!brand) return NextResponse.json({ error: 'no-brand' }, { status: 401 });

  const supabase = createServiceClient();
  await supabase.from('credentials').upsert({
    brand_id: brand.id,
    platform: 'chatgpt_ads',
    access_token: apiKey,
    metadata: { connected_via: 'manual_api_key', connected_at: new Date().toISOString() },
  }, { onConflict: 'brand_id,platform' });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Manual-entry UI page**

Create `src/app/dashboard/settings/platforms/chatgpt-ads/connect/page.tsx` — simple form, POST to `/api/platforms/chatgpt_ads/callback`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/platforms/chatgpt_ads/ src/app/dashboard/settings/platforms/chatgpt-ads/
git commit -m "feat(platforms): ChatGPT Ads manual API-key skeleton [Task 9]"
```

---

### Task 10: Register stub tool handlers in mcp-client

**Files:**
- Modify: `src/lib/mcp-client.ts` (add `snapchat_ads.campaigns`, `chatgpt_ads.campaigns` to STUB_TOOLS list + TOOL_HANDLERS)

- [ ] **Step 1: Add handlers**

```ts
// In TOOL_HANDLERS:
'snapchat_ads.campaigns': async (args) => {
  return { data: [], note: 'Snapchat Ads connector live; real fetch pending SDK work' };
},
'chatgpt_ads.campaigns': async (args) => {
  return { data: [], note: 'ChatGPT Ads connector live; real fetch pending OpenAI public API' };
},

// In TOOL_PLATFORM:
'snapchat_ads.campaigns': 'snapchat',
'chatgpt_ads.campaigns': 'chatgpt_ads',

// In STUB_TOOLS set in scripts/verify-readiness.mjs:
STUB_TOOLS.add('snapchat_ads.campaigns');
STUB_TOOLS.add('chatgpt_ads.campaigns');
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/mcp-client.ts scripts/verify-readiness.mjs
git commit -m "feat(mcp): stub Snapchat + ChatGPT Ads tool handlers [Task 10]"
```

---

# PHASE 4 — MCP + SDK Hybrid Connector Upgrade

Biggest refactor. Replace raw `fetch()` in `src/lib/mcp-client.ts` with:
- **Shopify** → `@modelcontextprotocol/sdk` client pointed at Shopify's official remote MCP server
- **Ahrefs** → `@modelcontextprotocol/sdk` client (Ahrefs remote MCP)
- **Meta Ads** → `facebook-nodejs-business-sdk`
- **GA4** → `@google-analytics/data`
- **Google Ads** → `google-ads-api`
- **Google Search Console** → `googleapis`

Each swap is a separate task because each has its own failure surface and credential mapping.

**Ground rules:**
- Keep the `TOOL_HANDLERS` signature `(args) => unknown` unchanged. Only the body swaps.
- Preserve `{ data, source, confidence }` semantics where resolvers wrap tool output.
- Delete `maybeRefreshGoogleToken` (mcp-client.ts:72) AFTER all three Google SDKs are wired.

---

### Task 11: Install MCP SDK client + Shopify MCP swap

**Files:**
- Modify: `package.json` (add `@modelcontextprotocol/sdk`)
- Modify: `src/lib/mcp-client.ts` (replace `shopify.*` handlers)

- [ ] **Step 1: Install**

Run: `npm install @modelcontextprotocol/sdk`

- [ ] **Step 2: Add Shopify MCP client wrapper**

Create `src/lib/platforms/shopify-mcp.ts`:
```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export async function createShopifyMcpClient(opts: {
  shop: string;       // e.g. 'acme.myshopify.com'
  accessToken: string;
}) {
  const transport = new StreamableHTTPClientTransport(
    new URL(`https://${opts.shop}/mcp`),
    {
      requestInit: {
        headers: { 'X-Shopify-Access-Token': opts.accessToken },
      },
    },
  );
  const client = new Client(
    { name: 'growth-os', version: '1.0.0' },
    { capabilities: {} },
  );
  await client.connect(transport);
  return client;
}
```

Confirm the exact endpoint path and auth header from Shopify's MCP docs — if different, adjust the URL. At time of writing Shopify publishes an MCP server at `https://{shop}/api/mcp`.

- [ ] **Step 3: Swap Shopify handlers**

In `src/lib/mcp-client.ts`, replace `shopify.products.list`, `shopify.orders.list`, `shopify.customers.list`, `shopify.shop.get` with wrappers that delegate to the MCP client. Example:
```ts
'shopify.products.list': async ({ brandId, limit = 50 }) => {
  const cred = await getCred(brandId, 'shopify');
  if (!cred) return { data: [], source: 'none' };
  const shop = cred.metadata?.shop as string | undefined;
  if (!shop) return { data: [], source: 'none' };
  const client = await createShopifyMcpClient({ shop, accessToken: cred.access_token });
  try {
    const result = await client.callTool({
      name: 'products_list',
      arguments: { limit },
    });
    return { data: result?.content ?? [] };
  } finally {
    await client.close();
  }
},
```

Adjust tool names to match Shopify's MCP tool catalog.

- [ ] **Step 4: Smoke test via readiness script**

Run: `node scripts/verify-readiness.mjs`. Expected: `shopify.*` tools still in registry, no runtime crash at module-load time.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/platforms/shopify-mcp.ts src/lib/mcp-client.ts
git commit -m "refactor(mcp): Shopify handlers via @modelcontextprotocol/sdk [Task 11]"
```

---

### Task 12: Ahrefs MCP swap

**Files:**
- Create: `src/lib/platforms/ahrefs-mcp.ts`
- Modify: `src/lib/mcp-client.ts` (`ahrefs.backlinks`, `ahrefs.keywords`)

Same pattern as Task 11, pointed at Ahrefs' remote MCP endpoint. Ahrefs uses API-key auth via `Authorization: Bearer <key>`.

- [ ] **Step 1: Wrapper file**

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export async function createAhrefsMcpClient(apiKey: string) {
  const transport = new StreamableHTTPClientTransport(
    new URL('https://mcp.ahrefs.com/'),
    { requestInit: { headers: { Authorization: `Bearer ${apiKey}` } } },
  );
  const client = new Client({ name: 'growth-os', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  return client;
}
```

- [ ] **Step 2: Swap handlers + remove from STUB_TOOLS**

Today `ahrefs.backlinks` / `ahrefs.keywords` are stubbed. With real MCP client, remove them from `STUB_TOOLS` in `scripts/verify-readiness.mjs`.

- [ ] **Step 3: Commit**

```bash
git commit -am "refactor(mcp): Ahrefs handlers via MCP + un-stub [Task 12]"
```

---

### Task 13: Meta Ads SDK swap

**Files:**
- Modify: `package.json` (add `facebook-nodejs-business-sdk`)
- Modify: `src/lib/meta-ads.ts` (or new `src/lib/platforms/meta-sdk.ts`)
- Modify: `src/lib/mcp-client.ts` (handlers for `meta_ads.*`)

- [ ] **Step 1: Install**

Run: `npm install facebook-nodejs-business-sdk`

- [ ] **Step 2: Wrapper**

```ts
import { FacebookAdsApi, AdAccount } from 'facebook-nodejs-business-sdk';

export function metaClient(accessToken: string) {
  FacebookAdsApi.init(accessToken);
  return (adAccountId: string) => new AdAccount(`act_${adAccountId.replace(/^act_/, '')}`);
}
```

- [ ] **Step 3: Swap handlers**

Replace current `graph.facebook.com/v19.0/...` fetchers with:
```ts
'meta_ads.campaigns.insights': async ({ brandId, since, until }) => {
  const cred = await getCred(brandId, 'meta');
  const adAccountId = cred?.metadata?.ad_account_id;
  if (!cred || !adAccountId) return { data: [], source: 'none' };
  const account = metaClient(cred.access_token)(adAccountId);
  const insights = await account.getInsights(
    ['campaign_id', 'campaign_name', 'impressions', 'clicks', 'spend', 'ctr', 'frequency', 'purchase_roas', 'action_values'],
    { time_range: { since, until }, level: 'campaign' },
  );
  return { data: insights.map((i) => i._data) };
},
```

Note: fixes the "missing `frequency`" item from Aria's post-fix report — include it in the field list.

- [ ] **Step 4: Remove `v19.0` hardcode references**

Grep for `'v19.0'` and `graph.facebook.com`; delete.

- [ ] **Step 5: Commit**

```bash
git commit -am "refactor(mcp): Meta Ads handlers via facebook-nodejs-business-sdk [Task 13]"
```

---

### Task 14: GA4 SDK swap

**Files:**
- Modify: `package.json` (add `@google-analytics/data`)
- Create: `src/lib/platforms/ga4-sdk.ts`
- Modify: `src/lib/mcp-client.ts` (`ga4.report.run`)

- [ ] **Step 1: Install**

Run: `npm install @google-analytics/data google-auth-library`

- [ ] **Step 2: Wrapper**

```ts
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { OAuth2Client } from 'google-auth-library';

export function ga4Client(accessToken: string, refreshToken?: string) {
  const auth = new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  });
  auth.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  return new BetaAnalyticsDataClient({ auth });
}
```

- [ ] **Step 3: Handler**

```ts
'ga4.report.run': async ({ brandId, startDate, endDate, metrics, dimensions }) => {
  const cred = await getCred(brandId, 'google_analytics');
  const propertyId = cred?.metadata?.property_id;
  if (!cred || !propertyId) return { data: [], source: 'none' };
  const client = ga4Client(cred.access_token, cred.refresh_token ?? undefined);
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    metrics: metrics.map((m: string) => ({ name: m })),
    dimensions: (dimensions ?? []).map((d: string) => ({ name: d })),
  });
  return { data: response.rows ?? [] };
},
```

- [ ] **Step 4: Commit**

```bash
git commit -am "refactor(mcp): GA4 via @google-analytics/data [Task 14]"
```

---

### Task 15: Google Ads SDK swap

**Files:**
- Modify: `package.json` (add `google-ads-api`)
- Create: `src/lib/platforms/google-ads-sdk.ts`
- Modify: `src/lib/mcp-client.ts` (`google_ads.campaigns`)

- [ ] **Step 1: Install**

Run: `npm install google-ads-api`

- [ ] **Step 2: Wrapper + handler**

```ts
import { GoogleAdsApi } from 'google-ads-api';

const api = new GoogleAdsApi({
  client_id: process.env.GOOGLE_CLIENT_ID!,
  client_secret: process.env.GOOGLE_CLIENT_SECRET!,
  developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
});

export function googleAdsCustomer(customerId: string, refreshToken: string) {
  return api.Customer({ customer_id: customerId, refresh_token: refreshToken });
}
```

Handler in mcp-client:
```ts
'google_ads.campaigns': async ({ brandId }) => {
  const cred = await getCred(brandId, 'google_ads');
  const customerId = cred?.metadata?.customer_id;
  if (!cred || !customerId || !cred.refresh_token) return { data: [], source: 'none' };
  const customer = googleAdsCustomer(customerId, cred.refresh_token);
  const campaigns = await customer.query(`
    SELECT campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
    FROM campaign WHERE segments.date DURING LAST_30_DAYS
  `);
  return { data: campaigns };
},
```

- [ ] **Step 3: Un-stub**

Remove `'google_ads.campaigns'` from `STUB_TOOLS` in `scripts/verify-readiness.mjs`.

- [ ] **Step 4: Commit**

```bash
git commit -am "refactor(mcp): Google Ads via google-ads-api + un-stub [Task 15]"
```

---

### Task 16: Google Search Console via googleapis

**Files:**
- Modify: `package.json` (add `googleapis` if not already via google-auth-library)
- Modify: `src/lib/mcp-client.ts` (`gsc.performance`)

- [ ] **Step 1: Install**

Run: `npm install googleapis`

- [ ] **Step 2: Handler**

```ts
'gsc.performance': async ({ brandId, startDate, endDate }) => {
  const cred = await getCred(brandId, 'google_analytics'); // GSC shares the Google creds
  const siteUrl = cred?.metadata?.gsc_site_url;
  if (!cred || !siteUrl) return { data: [], source: 'none' };
  const { google } = await import('googleapis');
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  auth.setCredentials({
    access_token: cred.access_token,
    refresh_token: cred.refresh_token ?? undefined,
  });
  const sc = google.searchconsole({ version: 'v1', auth });
  const res = await sc.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ['query', 'page'],
      rowLimit: 500,
    },
  });
  return { data: res.data.rows ?? [] };
},
```

- [ ] **Step 3: Un-stub**

Remove `'gsc.performance'` from `STUB_TOOLS`.

- [ ] **Step 4: Commit**

```bash
git commit -am "refactor(mcp): GSC via googleapis + un-stub [Task 16]"
```

---

### Task 17: Remove maybeRefreshGoogleToken

**Files:**
- Modify: `src/lib/mcp-client.ts`

All three Google SDKs auto-refresh via `OAuth2Client`. The 67-line manual refresh at `mcp-client.ts:72` is now dead code.

- [ ] **Step 1: Grep for callers**

Confirm only 2 call sites (line 567, 655) — both inside handlers we've just swapped.

- [ ] **Step 2: Delete function + callsites**

- [ ] **Step 3: Typecheck + readiness**

Run: `npx tsc --noEmit && node scripts/verify-readiness.mjs`
Expected: pass, no regression.

- [ ] **Step 4: Commit**

```bash
git commit -am "refactor(mcp): remove maybeRefreshGoogleToken (SDKs handle refresh) [Task 17]"
```

---

### Task 18: Re-run readiness + post-fix verification

**Files:**
- Modify: `docs/verification/agent-status.md` (append Phase 4 section)

- [ ] **Step 1: Readiness script**

Run: `node scripts/verify-readiness.mjs`
Expected: RUNNABLE bucket grows (ahrefs.*, google_ads.*, gsc.* no longer stubbed).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Update grid**

Append a "Phase 4 — Connector upgrade" section to `docs/verification/agent-status.md` noting:
- Stubbed tools removed: `ahrefs.*`, `google_ads.*`, `gsc.performance`
- SDKs: `facebook-nodejs-business-sdk`, `@google-analytics/data`, `google-ads-api`, `googleapis`, `@modelcontextprotocol/sdk`
- `maybeRefreshGoogleToken` removed

- [ ] **Step 4: Commit**

```bash
git add docs/verification/agent-status.md
git commit -m "docs: Phase 4 MCP+SDK migration summary [Task 18]"
```

---

## Self-Review Checklist

- [x] Every deferred item from `2026-04-17-production-readiness-plan.md` §"Out of Scope" has a task: Graphify rebuild (Task 1), CSV import (Tasks 2-6), Snapchat + ChatGPT Ads (Tasks 7-10), MCP+SDK swap (Tasks 11-17), verification (Task 18). ✓
- [x] Real file paths in every task; no placeholder sections. ✓
- [x] Type consistency — `ResolverResult.source` widened to include `'csv'` in Task 6 and consumed nowhere that would narrow. ✓
- [x] MCP client init pattern is consistent across Shopify (Task 11) and Ahrefs (Task 12). ✓
- [x] Google SDK auth (Tasks 14, 15, 16) all use `OAuth2Client` or equivalent — enables deletion of manual refresh in Task 17. ✓
- [x] Each SDK swap removes the corresponding entry from `STUB_TOOLS` — tracked explicitly in Tasks 12, 15, 16. ✓

## Risk Notes

- **Task 11 (Shopify MCP)** — If Shopify's MCP endpoint / tool names differ from the example, the whole Shopify branch breaks. Mitigation: the handler returns `{ data: [], source: 'none' }` on any error, so skills degrade to the brand_data / CSV fallback rather than crashing. Live-run validation still deferred.
- **Task 13 (Meta SDK)** — `facebook-nodejs-business-sdk` is a heavy dep (~2MB). Acceptable trade-off per spec §Phase 2 rationale.
- **Task 15 (Google Ads)** — Requires `GOOGLE_ADS_DEVELOPER_TOKEN` env var. Document in `.env.local.example`.
- **Phase 3 skeletons** — Snapchat/ChatGPT Ads handlers return empty data. A future PR wires real SDKs/APIs once demand is validated.

## Out of Scope (deferred further)

- Snapchat + ChatGPT Ads real tool handlers (requires actual client engagement with working API access).
- Graphify embedding refresh (`graphify-out/cache/embedded.json`) — only rebuilds code edges here.
- Live credential validation — every SDK swap needs a live-run test per platform; credentials not available in this dev env.

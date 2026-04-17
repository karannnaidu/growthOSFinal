/**
 * verify-readiness.mjs
 *
 * For a given brand, inspects:
 *   - Which platforms are connected (credentials table)
 *   - Which skills exist on disk + their declared mcp_tools
 *   - Buckets each skill into: Runnable / Blocked / Partial
 *
 * Run with: node scripts/verify-readiness.mjs [brandId?]
 * If brandId omitted, uses the first brand in the DB.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf-8');
function getEnv(key) {
  const line = envContent.split('\n').find((l) => l.startsWith(key + '='));
  return line?.split('=').slice(1).join('=').trim();
}

const supabase = createClient(
  getEnv('NEXT_PUBLIC_SUPABASE_URL'),
  getEnv('SUPABASE_SERVICE_ROLE_KEY'),
);

// ---------------------------------------------------------------------------
// 1. Find the target brand
// ---------------------------------------------------------------------------
const requestedBrandId = process.argv[2];
const { data: brands, error: brandsError } = await supabase
  .from('brands')
  .select('id, name, owner_id, onboarding_completed, created_at')
  .order('created_at', { ascending: false });

if (brandsError) {
  console.log('Brands query error:', brandsError.message);
  process.exit(1);
}
if (!brands?.length) {
  console.log('No brands found in DB.');
  process.exit(1);
}

const brand = requestedBrandId
  ? brands.find((b) => b.id === requestedBrandId)
  : brands[0];

if (!brand) {
  console.log(`Brand ${requestedBrandId} not found. Available:`);
  brands.forEach((b) => console.log(`  ${b.id}  ${b.name}  (${b.url ?? 'no url'})`));
  process.exit(1);
}

console.log('='.repeat(80));
console.log(`BRAND: ${brand.name}`);
console.log(`  id: ${brand.id}`);
console.log(`  owner_id: ${brand.owner_id}`);
console.log(`  onboarding_completed: ${brand.onboarding_completed}`);
console.log('='.repeat(80));

// ---------------------------------------------------------------------------
// 2. What platforms are connected?
// ---------------------------------------------------------------------------
const { data: creds } = await supabase
  .from('credentials')
  .select('platform, metadata, expires_at, updated_at')
  .eq('brand_id', brand.id);

const connectedPlatforms = new Set((creds ?? []).map((c) => c.platform));
// `brand` is a virtual platform — brand_data is populated at onboarding
// (product catalog extracted from URL), so brand.* resolvers always have
// at least a medium-confidence source available.
connectedPlatforms.add('brand');
connectedPlatforms.add('gos');

console.log('\n--- CONNECTED PLATFORMS ---');
if (!creds?.length) {
  console.log('  (none)');
} else {
  creds.forEach((c) => {
    const meta = JSON.stringify(c.metadata ?? {});
    const stale = c.expires_at && new Date(c.expires_at) < new Date();
    console.log(`  ${c.platform.padEnd(20)} metadata=${meta}${stale ? '  EXPIRED' : ''}`);
  });
}

// ---------------------------------------------------------------------------
// 3. Load all skills from disk
// ---------------------------------------------------------------------------
const SKILLS_ROOT = resolve(__dirname, '..', 'skills');
const CATEGORIES = [
  'acquisition',
  'creative',
  'customer-intel',
  'diagnosis',
  'finance',
  'growth',
  'ops',
  'optimization',
  'retention',
];

const skills = [];
for (const cat of CATEGORIES) {
  const dir = join(SKILLS_ROOT, cat);
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    continue;
  }
  for (const name of entries) {
    if (!name.endsWith('.md')) continue;
    const full = join(dir, name);
    if (!statSync(full).isFile()) continue;
    const body = readFileSync(full, 'utf-8');
    const fm = body.match(/^---\s*\n([\s\S]*?)\n---/);
    const frontmatter = fm ? fm[1] : '';

    const id = name.replace(/\.md$/, '');
    const mcpToolsMatch = frontmatter.match(/mcp_tools:\s*\[([^\]]*)\]/);
    const requiresMatch = frontmatter.match(/requires:\s*\[([^\]]*)\]/);

    const mcpTools = mcpToolsMatch
      ? mcpToolsMatch[1]
          .split(',')
          .map((s) => s.trim().replace(/['"]/g, ''))
          .filter(Boolean)
      : [];

    const requires = requiresMatch
      ? requiresMatch[1]
          .split(',')
          .map((s) => s.trim().replace(/['"]/g, ''))
          .filter(Boolean)
      : [];

    skills.push({ id, category: cat, mcpTools, requires, file: full });
  }
}

// ---------------------------------------------------------------------------
// 4. Load agents manifest to map skill → agent
// ---------------------------------------------------------------------------
const agentsManifest = JSON.parse(
  readFileSync(join(SKILLS_ROOT, 'agents.json'), 'utf-8'),
);
const skillToAgent = new Map();
for (const agent of agentsManifest) {
  for (const s of agent.skills ?? []) skillToAgent.set(s, agent.name);
}

// ---------------------------------------------------------------------------
// 5. Tool → platform mapping (mirrors mcp-client.ts)
// ---------------------------------------------------------------------------
const TOOL_PLATFORM = {
  'shopify.products.list': 'shopify',
  'shopify.orders.list': 'shopify',
  'shopify.customers.list': 'shopify',
  'shopify.shop.get': 'shopify',
  'meta_ads.campaigns.insights': 'meta',
  'meta_ads.adsets.list': 'meta',
  'ga4.report.run': 'google_analytics',
  'gsc.performance': 'google_analytics',
  'google_ads.campaigns': 'google',
  'klaviyo.lists.get': 'klaviyo',
  'klaviyo.flows.get': 'klaviyo',
  'ahrefs.backlinks': 'ahrefs',
  'ahrefs.keywords': 'ahrefs',
  'snapchat_ads.campaigns': 'snapchat',
  'chatgpt_ads.campaigns': 'chatgpt_ads',
  // brand.* resolvers are virtual — they always have SOME source
  // (brand_data extraction is populated at onboarding). Treat as always-runnable.
  'brand.products.list': 'brand',
  'brand.customers.list': 'brand',
  'brand.orders.list': 'brand',
  // gos.* tools read Growth OS's own DB (wallet, skill_runs, etc.) — always available.
  'gos.wallet.summary': 'gos',
};

// Tools that are stubbed server-side even if platform is "connected"
const STUB_TOOLS = new Set([
  'google_ads.campaigns',
  'ahrefs.backlinks',
  'ahrefs.keywords',
  'gsc.performance', // stub unless gsc_site_url in metadata
  'snapchat_ads.campaigns',
  'chatgpt_ads.campaigns',
]);

// ---------------------------------------------------------------------------
// 6. Bucket each skill
// ---------------------------------------------------------------------------
const report = [];
for (const skill of skills) {
  const platformsNeeded = new Set();
  for (const t of skill.mcpTools) {
    const p = TOOL_PLATFORM[t];
    if (p) platformsNeeded.add(p);
  }
  // Treat `requires: [shopify]` etc as a hard platform gate
  for (const r of skill.requires) platformsNeeded.add(r);

  const missingPlatforms = [...platformsNeeded].filter(
    (p) => !connectedPlatforms.has(p),
  );

  const stubbedTools = skill.mcpTools.filter((t) => STUB_TOOLS.has(t));
  const hasNonStubTools = skill.mcpTools.some((t) => !STUB_TOOLS.has(t));

  // GSC stub only matters if gsc_site_url is missing from google_analytics metadata
  const gaCred = creds?.find((c) => c.platform === 'google_analytics');
  const gscConfigured = !!gaCred?.metadata?.gsc_site_url;

  let status;
  let reason;

  if (platformsNeeded.size === 0 && skill.mcpTools.length === 0) {
    status = 'RUNNABLE_NO_DATA';
    reason = 'No platforms required (LLM-only skill)';
  } else if (missingPlatforms.length === platformsNeeded.size && platformsNeeded.size > 0) {
    status = 'BLOCKED';
    reason = `All required platforms missing: ${missingPlatforms.join(', ')}`;
  } else if (missingPlatforms.length > 0) {
    status = 'PARTIAL';
    reason = `Missing: ${missingPlatforms.join(', ')} (have: ${[...platformsNeeded].filter((p) => connectedPlatforms.has(p)).join(', ')})`;
  } else if (stubbedTools.length === skill.mcpTools.length) {
    status = 'STUB_ONLY';
    reason = `All tools are stubbed in mcp-client.ts: ${stubbedTools.join(', ')}`;
  } else if (stubbedTools.length > 0) {
    status = 'PARTIAL_STUB';
    const effectiveStubs = stubbedTools.filter(
      (t) => !(t === 'gsc.performance' && gscConfigured),
    );
    reason = effectiveStubs.length
      ? `Stub tools will return empty: ${effectiveStubs.join(', ')}`
      : 'All tools functional';
    if (!effectiveStubs.length) status = 'RUNNABLE';
  } else {
    status = 'RUNNABLE';
    reason = 'All platforms connected, all tools functional';
  }

  report.push({
    agent: skillToAgent.get(skill.id) ?? '(unassigned)',
    skill: skill.id,
    category: skill.category,
    status,
    reason,
    mcpTools: skill.mcpTools,
    requires: skill.requires,
  });
}

// ---------------------------------------------------------------------------
// 7. Print grouped by agent
// ---------------------------------------------------------------------------
const byAgent = new Map();
for (const r of report) {
  if (!byAgent.has(r.agent)) byAgent.set(r.agent, []);
  byAgent.get(r.agent).push(r);
}

console.log('\n--- SKILL READINESS (by agent) ---\n');
const AGENT_ORDER = [
  'Mia',
  'Scout',
  'Aria',
  'Luna',
  'Hugo',
  'Sage',
  'Max',
  'Atlas',
  'Echo',
  'Nova',
  'Navi',
  'Penny',
  '(unassigned)',
];
for (const agent of AGENT_ORDER) {
  const rows = byAgent.get(agent);
  if (!rows?.length) continue;
  console.log(`\n${agent}`);
  console.log('-'.repeat(80));
  for (const r of rows) {
    const tag = r.status.padEnd(16);
    console.log(`  [${tag}] ${r.skill.padEnd(30)} ${r.reason}`);
  }
}

// ---------------------------------------------------------------------------
// 8. Summary counts
// ---------------------------------------------------------------------------
const counts = report.reduce((acc, r) => {
  acc[r.status] = (acc[r.status] ?? 0) + 1;
  return acc;
}, {});
console.log('\n--- SUMMARY ---');
console.log(`  Total skills discovered: ${report.length}`);
for (const [k, v] of Object.entries(counts)) {
  console.log(`  ${k.padEnd(18)} ${v}`);
}

// ---------------------------------------------------------------------------
// 9. Recent skill_runs health (last 30 days)
// ---------------------------------------------------------------------------
const { data: runs } = await supabase
  .from('skill_runs')
  .select('skill_id, status, error_message, created_at')
  .eq('brand_id', brand.id)
  .gte('created_at', new Date(Date.now() - 30 * 24 * 3600_000).toISOString())
  .order('created_at', { ascending: false })
  .limit(200);

if (runs?.length) {
  const bySkill = new Map();
  for (const run of runs) {
    const arr = bySkill.get(run.skill_id) ?? { ok: 0, fail: 0, lastErr: null };
    if (run.status === 'completed') arr.ok++;
    else {
      arr.fail++;
      if (!arr.lastErr) arr.lastErr = run.error_message;
    }
    bySkill.set(run.skill_id, arr);
  }
  console.log('\n--- RECENT RUNS (last 30 days) ---');
  for (const [s, v] of bySkill) {
    const note = v.fail > 0 ? `  lastErr=${(v.lastErr ?? '').slice(0, 80)}` : '';
    console.log(`  ${s.padEnd(30)} ok=${v.ok} fail=${v.fail}${note}`);
  }
} else {
  console.log('\n--- RECENT RUNS --- (none in last 30 days)');
}

console.log('\nDone.');

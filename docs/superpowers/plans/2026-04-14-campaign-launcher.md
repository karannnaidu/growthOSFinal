# Campaign Launcher & Auto-Optimizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Launch Meta ad campaigns directly from Growth OS with CBO structure, auto-optimize every 2 days, and feed learnings back to the knowledge graph.

**Architecture:** Skill-first approach — `campaign-launcher` (pure execution, no LLM) creates campaigns on Meta via Marketing API. `campaign-optimizer` (LLM-driven) reads performance every 2 days, scales budget, and writes insights to knowledge graph. Both are Max's skills, orchestrated by Mia.

**Tech Stack:** Next.js 16 API routes, Meta Marketing API v19.0, Supabase (campaigns table + knowledge_nodes), existing skills-engine and chain-processor infrastructure.

**Spec:** `docs/superpowers/specs/2026-04-14-campaign-launcher-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/003-campaigns-table.sql` | campaigns table + indexes + RLS |
| Create | `src/lib/meta-ads.ts` | Meta Marketing API write operations |
| Create | `skills/acquisition/campaign-launcher.md` | Max's campaign launch skill definition |
| Create | `skills/optimization/campaign-optimizer.md` | Max's optimization skill definition |
| Create | `src/app/api/campaigns/launch/route.ts` | POST — launch campaign via skill |
| Create | `src/app/api/campaigns/[id]/pause/route.ts` | POST — pause campaign on Meta |
| Create | `src/app/api/campaigns/[id]/resume/route.ts` | POST — resume campaign on Meta |
| Create | `src/app/api/campaigns/[id]/performance/route.ts` | GET — fetch live performance |
| Create | `src/app/api/cron/campaign-optimizer/route.ts` | Cron route for optimization cycle |
| Create | `src/app/api/mia/auto-campaign/route.ts` | POST — Mia auto-campaign chain |
| Create | `src/app/dashboard/campaigns/[id]/page.tsx` | Campaign detail + performance page |
| Modify | `src/app/dashboard/campaigns/new/page.tsx:844-852` | Wire Launch button |
| Modify | `src/app/dashboard/campaigns/page.tsx` | Query campaigns table, add status/metrics |
| Modify | `src/app/dashboard/page.tsx` | Add "Create Campaign" button |
| Modify | `src/lib/skills-engine.ts` | Post-execution hook for campaign-launcher |
| Modify | `vercel.json` | Add campaign-optimizer cron |

---

### Task 1: Database Migration — `campaigns` Table

**Files:**
- Create: `supabase/migrations/003-campaigns-table.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 003: campaigns table for tracking Meta (and future platform) ad campaigns

CREATE TABLE IF NOT EXISTS campaigns (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id            uuid REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  name                text NOT NULL,
  objective           text NOT NULL CHECK (objective IN ('awareness', 'conversion', 'retention')),
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN (
                        'draft', 'generating', 'review', 'active', 'paused', 'completed', 'failed'
                      )),
  platform            text NOT NULL DEFAULT 'meta' CHECK (platform IN ('meta', 'google', 'klaviyo')),
  daily_budget        numeric(10,2) NOT NULL,
  launch_mode         text CHECK (launch_mode IN ('live', 'draft')),

  -- Meta platform IDs (populated after launch)
  meta_campaign_id    text,
  meta_adset_ids      text[] DEFAULT '{}',
  meta_ad_ids         text[] DEFAULT '{}',

  -- What was launched
  targeting           jsonb NOT NULL DEFAULT '{}',
  creatives           jsonb NOT NULL DEFAULT '[]',
  audience_tiers      jsonb NOT NULL DEFAULT '[]',

  -- Optimization state
  learning_ends_at    timestamptz,
  last_optimized_at   timestamptz,
  optimization_log    jsonb DEFAULT '[]',

  -- Source skill runs
  copy_run_id         uuid REFERENCES skill_runs(id),
  image_run_id        uuid REFERENCES skill_runs(id),
  targeting_run_id    uuid REFERENCES skill_runs(id),
  launcher_run_id     uuid REFERENCES skill_runs(id),

  -- Lifecycle
  launched_at         timestamptz,
  paused_at           timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_brand ON campaigns(brand_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_active ON campaigns(status) WHERE status = 'active';

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brand_access" ON campaigns
  FOR ALL USING (brand_id IN (
    SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
    UNION SELECT id FROM brands WHERE owner_id = auth.uid()
  ));
```

- [ ] **Step 2: Run migration in Supabase SQL Editor**

Paste the contents into the Supabase Dashboard SQL Editor and execute. Verify the table appears in the Table Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/003-campaigns-table.sql
git commit -m "feat: campaigns table migration — Meta ad campaign tracking"
```

---

### Task 2: Meta Ads Write API — `src/lib/meta-ads.ts`

**Files:**
- Create: `src/lib/meta-ads.ts`

- [ ] **Step 1: Create the Meta Ads write module**

```typescript
// src/lib/meta-ads.ts
//
// Meta Marketing API write operations for campaign management.
// Separate from the read-only MCP client (mcp-client.ts).

import { createServiceClient } from '@/lib/supabase/service'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MetaCredential {
  accessToken: string
  adAccountId: string // must start with act_
}

export interface CreateCampaignParams {
  credential: MetaCredential
  name: string
  objective: 'awareness' | 'conversion' | 'retention'
  dailyBudget: number // in the ad account's currency (cents for USD)
  status: 'ACTIVE' | 'PAUSED'
}

export interface CreateCampaignResult {
  id: string // Meta campaign ID
}

export interface CreateAdSetParams {
  credential: MetaCredential
  campaignId: string
  name: string
  dailyBudget?: number // only if not using CBO
  optimizationGoal: string
  billingEvent: string
  targeting: {
    age_min?: number
    age_max?: number
    genders?: number[] // 1=male, 2=female
    geo_locations?: { countries?: string[] }
    interests?: Array<{ id: string; name: string }>
    custom_audiences?: Array<{ id: string }>
  }
  status: 'ACTIVE' | 'PAUSED'
}

export interface CreateAdSetResult {
  id: string // Meta ad set ID
}

export interface CreateAdParams {
  credential: MetaCredential
  adSetId: string
  name: string
  creative: {
    primaryText: string
    headline: string
    description?: string
    linkUrl: string
    ctaType: string // SHOP_NOW, LEARN_MORE, SIGN_UP, etc.
    imageUrl?: string // external URL — will be uploaded
    imageHash?: string // already uploaded image
  }
  status: 'ACTIVE' | 'PAUSED'
}

export interface CreateAdResult {
  id: string // Meta ad ID
}

export interface CampaignPerformance {
  campaignId: string
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpc: number
  actions: Array<{ action_type: string; value: string }>
  adSets: Array<{
    id: string
    name: string
    spend: number
    impressions: number
    clicks: number
    ctr: number
  }>
  ads: Array<{
    id: string
    name: string
    spend: number
    impressions: number
    clicks: number
    ctr: number
  }>
}

// ---------------------------------------------------------------------------
// Objective mapping
// ---------------------------------------------------------------------------

const OBJECTIVE_MAP: Record<string, string> = {
  awareness: 'OUTCOME_AWARENESS',
  conversion: 'OUTCOME_SALES',
  retention: 'OUTCOME_ENGAGEMENT',
}

const OPTIMIZATION_GOAL_MAP: Record<string, string> = {
  awareness: 'REACH',
  conversion: 'OFFSITE_CONVERSIONS',
  retention: 'LINK_CLICKS',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const META_API_BASE = 'https://graph.facebook.com/v19.0'

async function metaPost<T>(
  path: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${META_API_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: accessToken }),
  })

  const data = await res.json() as T & { error?: { message: string; type: string; code: number } }

  if (!res.ok || data.error) {
    const msg = data.error?.message ?? `Meta API error: ${res.status}`
    throw new Error(msg)
  }

  return data
}

async function metaGet<T>(
  path: string,
  accessToken: string,
  params: Record<string, string> = {},
): Promise<T> {
  const query = new URLSearchParams({ ...params, access_token: accessToken })
  const res = await fetch(`${META_API_BASE}/${path}?${query}`)
  const data = await res.json() as T & { error?: { message: string } }

  if (!res.ok || data.error) {
    throw new Error(data.error?.message ?? `Meta API error: ${res.status}`)
  }

  return data
}

// ---------------------------------------------------------------------------
// Load credential from DB
// ---------------------------------------------------------------------------

export async function loadMetaCredential(brandId: string): Promise<MetaCredential> {
  const admin = createServiceClient()
  const { data, error } = await admin
    .from('credentials')
    .select('access_token, metadata')
    .eq('brand_id', brandId)
    .eq('platform', 'meta')
    .single()

  if (error || !data) throw new Error('Meta credential not found. Connect Meta in Settings > Platforms.')

  const rawId = (data.metadata as Record<string, unknown>)?.ad_account_id as string
  if (!rawId) throw new Error('Meta ad_account_id not configured.')

  return {
    accessToken: data.access_token,
    adAccountId: rawId.startsWith('act_') ? rawId : `act_${rawId}`,
  }
}

// ---------------------------------------------------------------------------
// Campaign CRUD
// ---------------------------------------------------------------------------

export async function createMetaCampaign(params: CreateCampaignParams): Promise<CreateCampaignResult> {
  const { credential, name, objective, dailyBudget, status } = params

  return metaPost<CreateCampaignResult>(
    `${credential.adAccountId}/campaigns`,
    credential.accessToken,
    {
      name,
      objective: OBJECTIVE_MAP[objective] ?? 'OUTCOME_SALES',
      status,
      special_ad_categories: [],
      is_campaign_budget_optimization: true,
      daily_budget: Math.round(dailyBudget * 100), // Meta expects cents
    },
  )
}

export async function createMetaAdSet(params: CreateAdSetParams): Promise<CreateAdSetResult> {
  const { credential, campaignId, name, optimizationGoal, billingEvent, targeting, status } = params

  return metaPost<CreateAdSetResult>(
    `${credential.adAccountId}/adsets`,
    credential.accessToken,
    {
      campaign_id: campaignId,
      name,
      optimization_goal: optimizationGoal,
      billing_event: billingEvent,
      targeting,
      status,
      // No daily_budget here — CBO distributes from campaign level
    },
  )
}

export async function uploadAdImage(
  credential: MetaCredential,
  imageUrl: string,
): Promise<string> {
  // Download image and upload as base64
  const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) })
  if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`)

  const buffer = Buffer.from(await imgRes.arrayBuffer())
  const base64 = buffer.toString('base64')

  const data = await metaPost<{ images: Record<string, { hash: string }> }>(
    `${credential.adAccountId}/adimages`,
    credential.accessToken,
    { bytes: base64 },
  )

  const hash = Object.values(data.images)[0]?.hash
  if (!hash) throw new Error('Image upload succeeded but no hash returned')

  return hash
}

export async function createMetaAd(params: CreateAdParams): Promise<CreateAdResult> {
  const { credential, adSetId, name, creative, status } = params

  // Upload image if URL provided (not already a hash)
  let imageHash = creative.imageHash
  if (!imageHash && creative.imageUrl) {
    imageHash = await uploadAdImage(credential, creative.imageUrl)
  }

  // Create ad creative object
  const creativeData = await metaPost<{ id: string }>(
    `${credential.adAccountId}/adcreatives`,
    credential.accessToken,
    {
      name: `${name} Creative`,
      object_story_spec: {
        link_data: {
          message: creative.primaryText,
          name: creative.headline,
          description: creative.description ?? '',
          link: creative.linkUrl,
          call_to_action: { type: creative.ctaType },
          ...(imageHash ? { image_hash: imageHash } : {}),
        },
        // page_id is required — will be populated from credential metadata
      },
    },
  )

  // Create the ad
  return metaPost<CreateAdResult>(
    `${credential.adAccountId}/ads`,
    credential.accessToken,
    {
      name,
      adset_id: adSetId,
      creative: { creative_id: creativeData.id },
      status,
    },
  )
}

// ---------------------------------------------------------------------------
// Campaign updates
// ---------------------------------------------------------------------------

export async function updateMetaCampaign(
  credential: MetaCredential,
  campaignId: string,
  updates: { status?: 'ACTIVE' | 'PAUSED'; daily_budget?: number },
): Promise<void> {
  const body: Record<string, unknown> = {}
  if (updates.status) body.status = updates.status
  if (updates.daily_budget != null) body.daily_budget = Math.round(updates.daily_budget * 100)

  await metaPost(`${campaignId}`, credential.accessToken, body)
}

export async function updateMetaAd(
  credential: MetaCredential,
  adId: string,
  updates: { status: 'ACTIVE' | 'PAUSED' },
): Promise<void> {
  await metaPost(`${adId}`, credential.accessToken, { status: updates.status })
}

// ---------------------------------------------------------------------------
// Performance reads
// ---------------------------------------------------------------------------

export async function fetchCampaignPerformance(
  credential: MetaCredential,
  campaignId: string,
): Promise<CampaignPerformance> {
  // Campaign-level insights
  const campaignInsights = await metaGet<{ data: Array<Record<string, unknown>> }>(
    `${campaignId}/insights`,
    credential.accessToken,
    {
      fields: 'impressions,clicks,spend,ctr,cpc,actions,cost_per_action_type',
      date_preset: 'last_7d',
    },
  )

  const ci = campaignInsights.data?.[0] ?? {}

  // Ad set breakdown
  const adSetInsights = await metaGet<{ data: Array<Record<string, unknown>> }>(
    `${campaignId}/insights`,
    credential.accessToken,
    {
      fields: 'adset_id,adset_name,impressions,clicks,spend,ctr',
      date_preset: 'last_7d',
      level: 'adset',
    },
  )

  // Ad breakdown
  const adInsights = await metaGet<{ data: Array<Record<string, unknown>> }>(
    `${campaignId}/insights`,
    credential.accessToken,
    {
      fields: 'ad_id,ad_name,impressions,clicks,spend,ctr',
      date_preset: 'last_7d',
      level: 'ad',
    },
  )

  return {
    campaignId,
    spend: Number(ci.spend ?? 0),
    impressions: Number(ci.impressions ?? 0),
    clicks: Number(ci.clicks ?? 0),
    ctr: Number(ci.ctr ?? 0),
    cpc: Number(ci.cpc ?? 0),
    actions: (ci.actions as CampaignPerformance['actions']) ?? [],
    adSets: (adSetInsights.data ?? []).map(a => ({
      id: String(a.adset_id ?? ''),
      name: String(a.adset_name ?? ''),
      spend: Number(a.spend ?? 0),
      impressions: Number(a.impressions ?? 0),
      clicks: Number(a.clicks ?? 0),
      ctr: Number(a.ctr ?? 0),
    })),
    ads: (adInsights.data ?? []).map(a => ({
      id: String(a.ad_id ?? ''),
      name: String(a.ad_name ?? ''),
      spend: Number(a.spend ?? 0),
      impressions: Number(a.impressions ?? 0),
      clicks: Number(a.clicks ?? 0),
      ctr: Number(a.ctr ?? 0),
    })),
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors from meta-ads.ts

- [ ] **Step 3: Commit**

```bash
git add src/lib/meta-ads.ts
git commit -m "feat: Meta Marketing API write module — campaign/adset/ad CRUD + performance"
```

---

### Task 3: Skill Definitions — `campaign-launcher` and `campaign-optimizer`

**Files:**
- Create: `skills/acquisition/campaign-launcher.md`
- Create: `skills/optimization/campaign-optimizer.md`

- [ ] **Step 1: Create campaign-launcher skill**

```markdown
---
id: campaign-launcher
name: Campaign Launcher
agent: max
category: acquisition
complexity: free
credits: 0
mcp_tools: []
requires: [meta]
chains_to: [campaign-optimizer]
knowledge:
  needs: [audience, creative, campaign, insight]
  semantic_query: "campaign launch audience targeting creative performance"
  traverse_depth: 1
produces:
  - node_type: campaign
    edge_to: audience
    edge_type: targets
  - node_type: campaign
    edge_to: creative
    edge_type: uses_creative
---

## System Prompt

You are Max, launching a Meta ad campaign. This is a pure execution skill — no creative decisions needed. Take the structured input (campaign name, objective, budget, creatives, audience tiers) and create the campaign on Meta using the CBO structure.

Campaign structure:
- 1 CBO Campaign (Meta distributes budget across ad sets)
- 1 Ad Set per audience tier (prospecting, warm, hot)
- All creative variants as Ads in each Ad Set

Report what was created, including all Meta IDs.

## Workflow

1. Validate all input fields are present
2. Create CBO campaign on Meta with the specified objective and daily budget
3. For each audience tier, create an Ad Set with the targeting parameters
4. For each creative variant, create an Ad in every Ad Set
5. Record all Meta IDs (campaign, ad sets, ads)
6. Set learning period = 3 days from now
7. Report: campaign name, number of ad sets, number of ads, launch mode

## Output Format

```json
{
  "meta_campaign_id": "123456",
  "meta_adset_ids": ["789", "012"],
  "meta_ad_ids": ["345", "678", "901", "234"],
  "ads_created": 4,
  "adsets_created": 2,
  "launch_mode": "live",
  "learning_ends_at": "2026-04-17T00:00:00Z",
  "summary": "Launched 'Spring Push' on Meta — 4 ads across 2 audience tiers, $50/day budget, CBO enabled."
}
```
```

- [ ] **Step 2: Create campaign-optimizer skill**

```markdown
---
id: campaign-optimizer
name: Campaign Optimizer
agent: max
category: optimization
complexity: mid
credits: 1
mcp_tools: [meta_ads.campaigns.insights]
requires: [meta]
chains_to: [ad-copy, image-brief, creative-fatigue-detector]
schedule: "0 6 */2 * *"
knowledge:
  needs: [campaign, metric, insight, audience, creative]
  semantic_query: "campaign performance ROAS budget scaling creative fatigue audience demographics"
  traverse_depth: 2
  include_agency_patterns: true
produces:
  - node_type: insight
    edge_to: campaign
    edge_type: derived_from
  - node_type: insight
    edge_to: audience
    edge_type: derived_from
  - node_type: metric
    edge_to: campaign
    edge_type: performs_on
---

## System Prompt

You are Max, analyzing Meta ad campaign performance and deciding optimization actions. You receive campaign performance data with per-ad-set and per-ad breakdowns, plus historical insights from the knowledge graph.

Rules:
- First 3 days after launch: NO changes (learning period). Report only.
- After learning period, evaluate every 2 days.
- Performing well (ROAS above target or trending up): increase daily budget 10-20%.
- Individual ad underperforming (CTR < 50% of best ad, after 1000+ impressions): pause that ad.
- All ads declining: do NOT kill the campaign. Notify user, recommend creative refresh.
- Creative fatigue (CTR declining across 3+ optimization cycles): flag for creative-fatigue-detector.
- Let Meta's CBO handle budget distribution across ad sets. Don't micromanage ad set budgets.

Always write audience and creative learnings. Examples:
- "Males 25-34 in prospecting tier: ROAS 4.2x vs 1.8x overall"
- "UGC-style creative outperforming studio shots 2:1 on CTR"
- "Carousel format abandoned by competitors but performing well for this brand"

## Workflow

1. Load active campaigns past learning period
2. Fetch per-ad-set and per-ad performance breakdowns from Meta
3. Compare against previous optimization cycles and knowledge graph insights
4. Decide actions: scale budget, pause underperforming ads, hold, or recommend refresh
5. Execute budget changes and ad pauses via Meta API
6. Write audience insights and creative insights to knowledge graph
7. Log actions to campaign optimization_log
8. Notify user with summary

## Output Format

```json
{
  "campaigns_analyzed": 2,
  "actions_taken": [
    { "campaign": "Spring Push", "action": "budget_increase", "from": 50, "to": 60, "reason": "ROAS 3.8x trending up" },
    { "campaign": "Spring Push", "action": "pause_ad", "ad_id": "123", "reason": "CTR 0.3% vs best 1.2%" }
  ],
  "insights": [
    { "type": "audience", "finding": "Males 25-34 converting 3x better in prospecting tier", "confidence": 0.85 },
    { "type": "creative", "finding": "Benefit-led copy outperforming urgency copy on conversion", "confidence": 0.78 }
  ],
  "recommendations": [
    { "action": "refresh_creatives", "reason": "Top 2 ads showing CTR decline over last 3 cycles", "chain_to": "creative-fatigue-detector" }
  ]
}
```
```

- [ ] **Step 3: Commit**

```bash
git add skills/acquisition/campaign-launcher.md skills/optimization/campaign-optimizer.md
git commit -m "feat: campaign-launcher and campaign-optimizer skill definitions"
```

---

### Task 4: Post-Execution Hook — Campaign Launcher in Skills Engine

**Files:**
- Modify: `src/lib/skills-engine.ts` (after existing post-execution hooks, around line 540)

The campaign-launcher skill is a pure execution skill — the LLM generates a plan, but the actual Meta API calls happen in this post-execution hook (same pattern as `image-brief` → fal.ai).

- [ ] **Step 1: Add campaign-launcher post-execution hook**

Add after the `// Post-execution: bridge top content after health-check` block in `src/lib/skills-engine.ts`:

```typescript
  // Post-execution: launch campaign on Meta for campaign-launcher skill
  if (skill.id === 'campaign-launcher' && status === 'completed') {
    try {
      const { loadMetaCredential, createMetaCampaign, createMetaAdSet, createMetaAd } = await import('@/lib/meta-ads')

      const credential = await loadMetaCredential(input.brandId)
      const campaignName = (output.campaign_name ?? input.additionalContext?.campaign_name ?? 'Growth OS Campaign') as string
      const objective = (output.objective ?? input.additionalContext?.objective ?? 'conversion') as string
      const dailyBudget = Number(output.daily_budget ?? input.additionalContext?.daily_budget ?? 50)
      const launchMode = (output.launch_mode ?? input.additionalContext?.launch_mode ?? 'live') as string
      const metaStatus = launchMode === 'draft' ? 'PAUSED' as const : 'ACTIVE' as const
      const creatives = (input.additionalContext?.creatives ?? output.creatives ?? []) as Array<{
        headline: string; body: string; cta: string; image_url?: string
      }>
      const audienceTiers = (input.additionalContext?.audience_tiers ?? output.audience_tiers ?? []) as Array<{
        name: string; targeting: Record<string, unknown>
      }>
      const linkUrl = (input.additionalContext?.link_url ?? output.link_url ?? '') as string

      // 1. Create CBO campaign
      const campaign = await createMetaCampaign({
        credential,
        name: campaignName,
        objective: objective as 'awareness' | 'conversion' | 'retention',
        dailyBudget,
        status: metaStatus,
      })

      // 2. Create ad sets per audience tier
      const adSetIds: string[] = []
      const optimizationGoal = objective === 'awareness' ? 'REACH' : objective === 'retention' ? 'LINK_CLICKS' : 'OFFSITE_CONVERSIONS'

      for (const tier of audienceTiers) {
        const adSet = await createMetaAdSet({
          credential,
          campaignId: campaign.id,
          name: `${campaignName} — ${tier.name}`,
          optimizationGoal,
          billingEvent: 'IMPRESSIONS',
          targeting: tier.targeting as CreateAdSetParams['targeting'],
          status: metaStatus,
        })
        adSetIds.push(adSet.id)
      }

      // 3. Create ads (each creative in each ad set)
      const adIds: string[] = []
      for (const adSetId of adSetIds) {
        for (let i = 0; i < creatives.length; i++) {
          const c = creatives[i]!
          const ad = await createMetaAd({
            credential,
            adSetId,
            name: `${campaignName} — Variant ${String.fromCharCode(65 + i)}`,
            creative: {
              primaryText: c.body,
              headline: c.headline,
              linkUrl,
              ctaType: c.cta || 'SHOP_NOW',
              imageUrl: c.image_url,
            },
            status: metaStatus,
          })
          adIds.push(ad.id)
        }
      }

      // 4. Insert into campaigns table
      const learningEndsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
      await supabase.from('campaigns').insert({
        brand_id: input.brandId,
        name: campaignName,
        objective,
        status: launchMode === 'draft' ? 'paused' : 'active',
        platform: 'meta',
        daily_budget: dailyBudget,
        launch_mode: launchMode,
        meta_campaign_id: campaign.id,
        meta_adset_ids: adSetIds,
        meta_ad_ids: adIds,
        targeting: audienceTiers,
        creatives,
        audience_tiers: audienceTiers,
        learning_ends_at: learningEndsAt,
        launcher_run_id: runId,
        launched_at: new Date().toISOString(),
      })

      // 5. Notify user
      await supabase.from('notifications').insert({
        brand_id: input.brandId,
        type: 'auto_completed',
        agent_id: 'max',
        title: launchMode === 'draft'
          ? `Draft campaign "${campaignName}" saved on Meta`
          : `Campaign "${campaignName}" is live on Meta`,
        body: `${adIds.length} ads across ${adSetIds.length} audience tiers. Daily budget: $${dailyBudget}. ${launchMode === 'live' ? 'Learning period: 3 days.' : 'Activate from Meta Ads Manager when ready.'}`,
        read: false,
      })

    } catch (err) {
      console.error('[SkillsEngine] campaign-launcher post-execution failed:', err)
      // Store failure in campaigns table
      await supabase.from('campaigns').insert({
        brand_id: input.brandId,
        name: (output.campaign_name ?? 'Failed Campaign') as string,
        objective: (output.objective ?? 'conversion') as string,
        status: 'failed',
        platform: 'meta',
        daily_budget: Number(output.daily_budget ?? 0),
        optimization_log: [{ error: err instanceof Error ? err.message : String(err), at: new Date().toISOString() }],
        launcher_run_id: runId,
      })
      await supabase.from('notifications').insert({
        brand_id: input.brandId,
        type: 'alert',
        agent_id: 'max',
        title: 'Campaign launch failed',
        body: err instanceof Error ? err.message : 'Unknown error launching campaign on Meta.',
        read: false,
      })
    }
  }
```

Note: You'll need to add the import type at the top of the hook: `type CreateAdSetParams = import('@/lib/meta-ads').CreateAdSetParams`

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/skills-engine.ts
git commit -m "feat: campaign-launcher post-execution hook — creates Meta campaign structure"
```

---

### Task 5: API Route — `POST /api/campaigns/launch`

**Files:**
- Create: `src/app/api/campaigns/launch/route.ts`

- [ ] **Step 1: Create the launch API route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runSkill } from '@/lib/skills-engine'

export const maxDuration = 120

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: {
    brandId: string
    campaignName: string
    objective: 'awareness' | 'conversion' | 'retention'
    dailyBudget: number
    launchMode: 'live' | 'draft'
    creatives: Array<{ headline: string; body: string; cta: string; image_url?: string }>
    audienceTiers: Array<{ name: string; targeting: Record<string, unknown> }>
    linkUrl: string
    copyRunId?: string
    imageRunId?: string
    targetingRunId?: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { brandId, campaignName, objective, dailyBudget, launchMode, creatives, audienceTiers, linkUrl } = body

  if (!brandId || !campaignName || !objective || !dailyBudget || !creatives?.length || !audienceTiers?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Brand access check
  const admin = createServiceClient()
  const { data: brand } = await admin.from('brands').select('id, owner_id, domain').eq('id', brandId).single()
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  if (brand.owner_id !== user.id) {
    const { data: member } = await admin.from('brand_members').select('brand_id').eq('brand_id', brandId).eq('user_id', user.id).single()
    if (!member) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  try {
    const result = await runSkill({
      brandId,
      skillId: 'campaign-launcher',
      triggeredBy: 'user',
      additionalContext: {
        campaign_name: campaignName,
        objective,
        daily_budget: dailyBudget,
        launch_mode: launchMode,
        creatives,
        audience_tiers: audienceTiers,
        link_url: linkUrl || `https://${brand.domain || 'example.com'}`,
        copy_run_id: body.copyRunId,
        image_run_id: body.imageRunId,
        targeting_run_id: body.targetingRunId,
      },
    })

    return NextResponse.json({
      success: true,
      runId: result.id,
      status: result.status,
      message: result.status === 'completed'
        ? `Campaign "${campaignName}" ${launchMode === 'draft' ? 'saved as draft' : 'launched'} on Meta.`
        : `Campaign launch ${result.status}: ${result.error || 'unknown'}`,
    })
  } catch (err) {
    console.error('[campaigns/launch] Failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Launch failed' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/campaigns/launch/route.ts
git commit -m "feat: POST /api/campaigns/launch — triggers campaign-launcher skill"
```

---

### Task 6: API Routes — Pause, Resume, Performance

**Files:**
- Create: `src/app/api/campaigns/[id]/pause/route.ts`
- Create: `src/app/api/campaigns/[id]/resume/route.ts`
- Create: `src/app/api/campaigns/[id]/performance/route.ts`

- [ ] **Step 1: Create pause route**

```typescript
// src/app/api/campaigns/[id]/pause/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { loadMetaCredential, updateMetaCampaign } from '@/lib/meta-ads'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const admin = createServiceClient()
  const { data: campaign } = await admin.from('campaigns').select('*').eq('id', id).single()
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (!campaign.meta_campaign_id) return NextResponse.json({ error: 'No Meta campaign ID' }, { status: 400 })

  try {
    const credential = await loadMetaCredential(campaign.brand_id)
    await updateMetaCampaign(credential, campaign.meta_campaign_id, { status: 'PAUSED' })
    await admin.from('campaigns').update({
      status: 'paused', paused_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', id)

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Pause failed' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create resume route**

```typescript
// src/app/api/campaigns/[id]/resume/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { loadMetaCredential, updateMetaCampaign } from '@/lib/meta-ads'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const admin = createServiceClient()
  const { data: campaign } = await admin.from('campaigns').select('*').eq('id', id).single()
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (!campaign.meta_campaign_id) return NextResponse.json({ error: 'No Meta campaign ID' }, { status: 400 })

  try {
    const credential = await loadMetaCredential(campaign.brand_id)
    await updateMetaCampaign(credential, campaign.meta_campaign_id, { status: 'ACTIVE' })
    await admin.from('campaigns').update({
      status: 'active', paused_at: null, updated_at: new Date().toISOString(),
    }).eq('id', id)

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Resume failed' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create performance route**

```typescript
// src/app/api/campaigns/[id]/performance/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { loadMetaCredential, fetchCampaignPerformance } from '@/lib/meta-ads'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const admin = createServiceClient()
  const { data: campaign } = await admin.from('campaigns').select('*').eq('id', id).single()
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (!campaign.meta_campaign_id) return NextResponse.json({ error: 'No Meta campaign ID' }, { status: 400 })

  try {
    const credential = await loadMetaCredential(campaign.brand_id)
    const performance = await fetchCampaignPerformance(credential, campaign.meta_campaign_id)
    return NextResponse.json({ success: true, campaign, performance })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to fetch performance' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/app/api/campaigns/[id]/pause/route.ts src/app/api/campaigns/[id]/resume/route.ts src/app/api/campaigns/[id]/performance/route.ts
git commit -m "feat: campaign pause/resume/performance API routes"
```

---

### Task 7: Wire Wizard Launch Button

**Files:**
- Modify: `src/app/dashboard/campaigns/new/page.tsx:844-852`

- [ ] **Step 1: Replace the placeholder Launch button**

In `src/app/dashboard/campaigns/new/page.tsx`, find the placeholder block (around line 844):

```typescript
// FIND THIS:
              <Button
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={() => {
                  // Placeholder: launch campaign
                  router.push('/dashboard/campaigns')
                }}
              >
                <Rocket className="h-4 w-4 mr-1.5" />
                Launch Campaign
              </Button>
```

Replace with:

```typescript
// REPLACE WITH:
              <Button
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                disabled={launching}
                onClick={async () => {
                  if (!brandId) return
                  setLaunching(true)
                  try {
                    const selected = copyVariants.filter(v => approvedVariants.has(v.id))
                    const res = await fetch('/api/campaigns/launch', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        brandId,
                        campaignName: campaignName || `${objective} Campaign`,
                        objective,
                        dailyBudget: Number(budgetRange) || 50,
                        launchMode: 'live',
                        creatives: selected.map(v => ({
                          headline: v.headline,
                          body: v.body,
                          cta: v.cta,
                          image_url: imageBriefs.find(b => b.variantId === v.id)?.imageUrl,
                        })),
                        audienceTiers: [
                          { name: 'Prospecting', targeting: { geo_locations: { countries: ['IN'] }, age_min: 18, age_max: 65 } },
                        ],
                        linkUrl: brandDomain ? `https://${brandDomain}` : '',
                      }),
                    })
                    if (res.ok) {
                      router.push('/dashboard/campaigns')
                    } else {
                      const data = await res.json()
                      alert(data.error || 'Launch failed')
                    }
                  } catch (err) {
                    alert('Launch failed. Check console for details.')
                    console.error(err)
                  } finally {
                    setLaunching(false)
                  }
                }}
              >
                {launching ? (
                  <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Launching...</>
                ) : (
                  <><Rocket className="h-4 w-4 mr-1.5" />Launch Campaign</>
                )}
              </Button>
              <Button
                variant="outline"
                disabled={launching}
                onClick={async () => {
                  if (!brandId) return
                  setLaunching(true)
                  try {
                    const selected = copyVariants.filter(v => approvedVariants.has(v.id))
                    const res = await fetch('/api/campaigns/launch', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        brandId,
                        campaignName: campaignName || `${objective} Campaign`,
                        objective,
                        dailyBudget: Number(budgetRange) || 50,
                        launchMode: 'draft',
                        creatives: selected.map(v => ({
                          headline: v.headline,
                          body: v.body,
                          cta: v.cta,
                          image_url: imageBriefs.find(b => b.variantId === v.id)?.imageUrl,
                        })),
                        audienceTiers: [
                          { name: 'Prospecting', targeting: { geo_locations: { countries: ['IN'] }, age_min: 18, age_max: 65 } },
                        ],
                        linkUrl: brandDomain ? `https://${brandDomain}` : '',
                      }),
                    })
                    if (res.ok) {
                      router.push('/dashboard/campaigns')
                    } else {
                      const data = await res.json()
                      alert(data.error || 'Save failed')
                    }
                  } catch (err) {
                    alert('Save failed.')
                    console.error(err)
                  } finally {
                    setLaunching(false)
                  }
                }}
              >
                Save as Draft
              </Button>
```

You'll also need to add state at the top of the component:
```typescript
const [launching, setLaunching] = useState(false)
```

And read `brandDomain` from brand context (add to the existing brand resolution effect).

- [ ] **Step 2: Type-check and test**

Run: `npx tsc --noEmit`
Manually test: navigate to `/dashboard/campaigns/new`, go through wizard, verify Launch and Draft buttons appear at step 7.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/campaigns/new/page.tsx
git commit -m "feat: wire campaign wizard Launch + Save as Draft buttons"
```

---

### Task 8: Campaign Optimizer Cron Route

**Files:**
- Create: `src/app/api/cron/campaign-optimizer/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Create the cron route**

```typescript
// src/app/api/cron/campaign-optimizer/route.ts

export const maxDuration = 300

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { runSkill } from '@/lib/skills-engine'

function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

export async function GET(): Promise<NextResponse> {
  const admin = createServiceClient()

  // Find active campaigns past learning period, not optimized in last 2 days
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  const now = new Date().toISOString()

  const { data: campaigns } = await admin
    .from('campaigns')
    .select('id, brand_id, name, meta_campaign_id, learning_ends_at, last_optimized_at')
    .eq('status', 'active')
    .not('meta_campaign_id', 'is', null)
    .lt('learning_ends_at', now)
    .or(`last_optimized_at.is.null,last_optimized_at.lt.${twoDaysAgo}`)
    .limit(10)

  if (!campaigns || campaigns.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  let processed = 0

  for (const campaign of campaigns) {
    try {
      await runSkill({
        brandId: campaign.brand_id,
        skillId: 'campaign-optimizer',
        triggeredBy: 'schedule',
        additionalContext: {
          campaign_id: campaign.id,
          meta_campaign_id: campaign.meta_campaign_id,
          campaign_name: campaign.name,
        },
      })
      processed++
    } catch (err) {
      console.error(`[cron/campaign-optimizer] Failed for campaign ${campaign.id}:`, err)
    }
  }

  return NextResponse.json({ processed })
}
```

- [ ] **Step 2: Add cron to vercel.json**

Add to the `crons` array in `vercel.json`:

```json
{ "path": "/api/cron/campaign-optimizer", "schedule": "0 6 */2 * *" }
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/campaign-optimizer/route.ts vercel.json
git commit -m "feat: campaign-optimizer cron route — every 2 days at 6am"
```

---

### Task 9: Campaign List Page — Query Real Table

**Files:**
- Modify: `src/app/dashboard/campaigns/page.tsx`

- [ ] **Step 1: Update campaigns list to query campaigns table**

Replace the existing data fetching logic to query the `campaigns` table instead of `skill_runs`. Update the `Campaign` interface to match the new table schema. Add status badges for active/paused/draft/failed. Add spend and ROAS columns if performance data is available. Add quick action buttons for pause/resume.

Key changes:
- Fetch from `campaigns` table using service client (brand access verified)
- Show real statuses: draft, active, paused, completed, failed
- Add daily_budget and platform columns
- Add pause/resume quick actions

- [ ] **Step 2: Type-check and test**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/campaigns/page.tsx
git commit -m "feat: campaign list reads from campaigns table with status badges and actions"
```

---

### Task 10: Campaign Detail Page

**Files:**
- Create: `src/app/dashboard/campaigns/[id]/page.tsx`

- [ ] **Step 1: Create campaign detail page**

Build a client component at `/dashboard/campaigns/[id]` that:
- Fetches campaign data from `campaigns` table
- Fetches live performance from `GET /api/campaigns/[id]/performance`
- Shows: status badge, spend, impressions, clicks, CTR, ROAS, CPA
- Per-ad-set breakdown table (audience tier performance)
- Per-ad breakdown table (which creative is winning)
- Optimization history timeline from `optimization_log`
- Action buttons: Pause, Resume, Increase Budget (+10%), End Campaign

Use the same `glass-panel` styling as the rest of the dashboard.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/campaigns/[id]/page.tsx
git commit -m "feat: campaign detail page with live performance and controls"
```

---

### Task 11: Mia Auto-Campaign Route + Dashboard Button

**Files:**
- Create: `src/app/api/mia/auto-campaign/route.ts`
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Create auto-campaign API route**

```typescript
// src/app/api/mia/auto-campaign/route.ts

export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runSkill } from '@/lib/skills-engine'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { brandId: string; objective?: string; dailyBudget?: number }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { brandId, objective = 'conversion', dailyBudget = 50 } = body
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  const admin = createServiceClient()
  const { data: brand } = await admin.from('brands').select('id, owner_id, name, domain').eq('id', brandId).single()
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  if (brand.owner_id !== user.id) {
    const { data: member } = await admin.from('brand_members').select('brand_id').eq('brand_id', brandId).eq('user_id', user.id).single()
    if (!member) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Step 1: Generate ad copy
  const copyResult = await runSkill({ brandId, skillId: 'ad-copy', triggeredBy: 'mia', additionalContext: { objective } })

  // Step 2: Generate image briefs
  const imageResult = await runSkill({ brandId, skillId: 'image-brief', triggeredBy: 'mia', additionalContext: { objective } })

  // Step 3: Generate audience targeting
  const targetingResult = await runSkill({ brandId, skillId: 'audience-targeting', triggeredBy: 'mia', additionalContext: { objective } })

  return NextResponse.json({
    success: true,
    campaignName: `${brand.name} ${objective} — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    objective,
    dailyBudget,
    linkUrl: brand.domain ? `https://${brand.domain}` : '',
    copy: copyResult.output,
    images: imageResult.output,
    targeting: targetingResult.output,
    copyRunId: copyResult.id,
    imageRunId: imageResult.id,
    targetingRunId: targetingResult.id,
  })
}
```

- [ ] **Step 2: Add "Create Campaign" button to dashboard**

In `src/app/dashboard/page.tsx`, add a "Create Campaign" button next to the "Run Mia's Review" button inside the `MorningBrief` component call or as a sibling element. This button links to `/dashboard/campaigns/new` for now (the full auto-campaign review screen is a follow-up).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/mia/auto-campaign/route.ts src/app/dashboard/page.tsx
git commit -m "feat: Mia auto-campaign API + Create Campaign button on dashboard"
```

---

### Task 12: Add campaign-optimizer to Mia's Chain Awareness

**Files:**
- Modify: `skills/diagnosis/health-check.md`

- [ ] **Step 1: Add campaign-optimizer to health-check chains_to**

In `skills/diagnosis/health-check.md`, update the `chains_to` field:

```yaml
# FIND:
chains_to: [seo-audit, email-flow-audit, ad-copy, budget-allocation]

# REPLACE WITH:
chains_to: [seo-audit, email-flow-audit, ad-copy, budget-allocation, campaign-optimizer]
```

This allows Mia to chain from health-check → campaign-optimizer when she detects ad performance issues.

- [ ] **Step 2: Commit**

```bash
git add skills/diagnosis/health-check.md
git commit -m "feat: health-check can chain to campaign-optimizer for ad performance issues"
```

---

### Task 13: Final Integration — Push and Verify

- [ ] **Step 1: Run full type-check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Push all changes**

```bash
git push
```

- [ ] **Step 3: Run migration**

Execute `003-campaigns-table.sql` in Supabase SQL Editor.

- [ ] **Step 4: Verify end-to-end**

1. Navigate to `/dashboard/campaigns/new`
2. Go through wizard (define → generate → review → approve → brief → images → final)
3. Click "Launch Campaign" — verify Meta campaign is created
4. Check `/dashboard/campaigns` — campaign should appear with "active" status
5. Check `/dashboard/campaigns/[id]` — performance page should load
6. Verify notification appears: "Campaign X is live on Meta"
7. Trigger Mia — verify campaign-optimizer appears in chain awareness

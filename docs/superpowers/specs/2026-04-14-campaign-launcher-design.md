# Campaign Launcher & Auto-Optimizer — Design Spec

**Date**: 2026-04-14
**Status**: Draft
**Owner**: Max (campaign execution), Mia (orchestration), Aria (creatives), Atlas (targeting)

## Problem

Growth OS generates ad copy, images, audience targeting, and budget strategies — but can't push campaigns to ad platforms. The "Launch" button in the campaign wizard is a placeholder. Users must manually recreate everything in Meta Ads Manager.

## Goals

1. Launch Meta ad campaigns directly from Growth OS (live or draft)
2. Auto-optimize running campaigns every 2 days (budget scaling, pause losers)
3. Feed campaign learnings back to the knowledge graph so future campaigns improve
4. Provide both a manual wizard flow and a one-click "Mia Auto-Campaign" experience
5. Architecture supports adding Google Ads, Klaviyo, etc. later via new MCP tools

## Non-Goals

- Google Ads, Klaviyo, WhatsApp, SMS integration (future phases)
- Custom audience upload to Meta (use interest-based and lookalike for now)
- Creative A/B testing UI (Meta's CBO handles variant testing automatically)

---

## Database: `campaigns` Table

```sql
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

  -- Source skill runs that built this campaign
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

---

## Meta Ads API: `src/lib/meta-ads.ts`

Separate module from the read-only MCP client. All write operations for Meta Marketing API.

### Functions

**`createMetaCampaign(params)`**
- POST `graph.facebook.com/v19.0/act_{id}/campaigns`
- CBO enabled (`is_campaign_budget_optimization = true`)
- Sets `special_ad_categories` if applicable (credit, housing, etc.)
- Objective mapping:
  - awareness → `OUTCOME_AWARENESS`
  - conversion → `OUTCOME_SALES`
  - retention → `OUTCOME_ENGAGEMENT`
- Status: `PAUSED` (draft mode) or `ACTIVE` (live mode)
- Returns `meta_campaign_id`

**`createMetaAdSet(params)`**
- POST `graph.facebook.com/v19.0/act_{id}/adsets`
- One ad set per audience tier (prospecting, warm, hot)
- Targeting built from Atlas's audience output:
  - Interests from Brand DNA product categories
  - Age range from persona data
  - Geo from brand's market
  - Lookalike audiences if pixel data available
- `billing_event: 'IMPRESSIONS'`
- `optimization_goal` based on objective:
  - awareness → `REACH`
  - conversion → `OFFSITE_CONVERSIONS`
  - retention → `LINK_CLICKS`
- Returns `meta_adset_id`

**`createMetaAd(params)`**
- Uploads image via POST `act_{id}/adimages` (base64 or URL)
- Creates ad_creative via POST `act_{id}/adcreatives`
  - Sets primary_text (Aria's copy), title, description, link, CTA
  - Attaches uploaded image hash
- Creates ad via POST `act_{id}/ads` linking creative to ad set
- Returns `meta_ad_id`

**`updateMetaCampaign(params)`**
- POST to update status (ACTIVE/PAUSED), daily_budget
- Used by campaign-optimizer for budget scaling

**`fetchCampaignPerformance(campaignId)`**
- GET `campaign_id/insights` with breakdowns: `age`, `gender`, `placement`
- Fields: `impressions`, `clicks`, `spend`, `ctr`, `cpc`, `actions`, `cost_per_action_type`
- Per-ad-set and per-ad breakdown
- Returns structured performance data

### Error Handling

- Token expiry: Meta long-lived tokens last ~60 days. If 401, notify user "Meta connection expired, reconnect in Settings."
- Rate limits: Meta API limits are per-ad-account. Implement exponential backoff with 3 retries.
- Validation errors: Surface Meta's error message to the user via notification.

### Credential Usage

Uses existing `credentials` table:
- `platform: 'meta'`
- `access_token`: long-lived user token
- `metadata.ad_account_id`: format `act_XXXXXXX`

---

## Skills

### `campaign-launcher` (Max)

```yaml
id: campaign-launcher
name: Campaign Launcher
agent: max
category: acquisition
complexity: free
credits: 0
mcp_tools: []
requires: [meta]
chains_to: [campaign-optimizer]
```

**This is a pure execution skill** — no LLM call needed. Takes structured input, calls Meta API, stores results.

**Input** (from wizard or Mia auto-chain):
```json
{
  "campaign_name": "Spring Conversion Push",
  "objective": "conversion",
  "daily_budget": 50,
  "launch_mode": "live",
  "creatives": [
    { "headline": "...", "body": "...", "cta": "SHOP_NOW", "image_url": "..." }
  ],
  "audience_tiers": [
    { "name": "Prospecting", "targeting": { "interests": [...], "age_min": 25, "age_max": 45, "geos": ["IN"] } },
    { "name": "Warm - Engagers", "targeting": { ... } }
  ]
}
```

**Execution flow**:
1. Create CBO campaign on Meta → `meta_campaign_id`
2. Create one ad set per audience tier → `meta_adset_ids`
3. Create ads (each creative variant in each ad set) → `meta_ad_ids`
4. Insert row into `campaigns` table with all IDs
5. Set `learning_ends_at = now() + 3 days`
6. Create notification: "Campaign '{name}' launched on Meta — {n} ads across {m} audiences"
7. If `launch_mode = 'draft'`: campaign created in PAUSED state, notify "Draft saved on Meta, activate when ready"

**Error handling**: If any Meta API call fails mid-flow, mark campaign status as `failed`, store error in `optimization_log`, notify user with Meta's error message.

### `campaign-optimizer` (Max)

```yaml
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
  semantic_query: "campaign performance ROAS budget scaling creative fatigue audience"
  traverse_depth: 2
```

**Triggered by**: Cron (every 2 days), Mia (after anomaly or user request), User (manual from dashboard).

**Flow**:
1. Query `campaigns` table: `status = 'active'` AND `learning_ends_at < now()` AND (`last_optimized_at` is null OR `last_optimized_at < now() - 2 days`)
2. For each campaign, call `fetchCampaignPerformance()` with per-ad-set and per-ad breakdown
3. LLM analyzes performance with knowledge graph context (past learnings):
   - Compare current ROAS/CTR/CPA against previous campaigns
   - Identify winning/losing audience tiers
   - Detect creative fatigue (declining CTR over multiple cycles)
4. **Decision rules** (LLM-guided, not hardcoded):
   - **Performing well** (ROAS > brand's target or trending up): increase campaign daily_budget 10-20%
   - **One ad set winning**: note the audience insight, let CBO continue optimizing
   - **Individual ad underperforming** (CTR < 50% of best ad, after 1000+ impressions): pause that ad
   - **All ads declining**: don't kill campaign — notify user, suggest creative refresh → chain to Aria
   - **Creative fatigue** (CTR declining 3+ cycles): chain to `creative-fatigue-detector`
5. Execute changes via `updateMetaCampaign()`
6. **Write learnings to knowledge graph**:
   - `insight` node: audience findings (e.g., "Males 25-34 ROAS 4.2x vs 1.8x for 35-44") → edge to `audience` and `campaign`
   - `insight` node: creative findings (e.g., "UGC video outperforms studio 2:1") → edge to `creative`
   - `metric` node: performance snapshot (spend, ROAS, CTR, CPA) → edge to campaign
7. Update `campaigns.last_optimized_at` and append to `optimization_log`
8. Notify user with summary

**Knowledge graph feedback loop**: These insight nodes are read by:
- **Atlas** on next `audience-targeting` run → refines targeting based on what worked
- **Aria** on next `ad-copy` / `image-brief` run → shifts creative style toward winners
- **Max** on next `campaign-launcher` run → adjusts budget allocation based on historical ROAS
- **Mia** for morning briefing → reports campaign performance to user

---

## UI Changes

### 1. Wizard Launch Button (existing)

Wire the placeholder "Launch" button at step 7 of `/dashboard/campaigns/new`:
- Calls POST `/api/campaigns/launch` with campaign data
- API route calls `runSkill('campaign-launcher', { ... })`
- Shows progress: "Creating campaign... Creating ad sets... Creating ads... Done!"
- On success: redirect to campaign detail page
- On failure: show Meta's error, allow retry

### 2. Mia Auto-Campaign Button

New button on dashboard (next to "Run Mia's Review"):
- "Create Campaign" or accessible via chat: "Mia, launch a conversion campaign"
- Mia chains: `ad-copy` → `image-brief` → `audience-targeting` → presents review screen
- Review screen shows:
  - Auto-generated campaign name
  - 2-3 audience tiers with targeting summary
  - 3-4 creative variants (copy + image thumbnail)
  - Suggested daily budget
  - **"Launch Live"** / **"Save as Draft"** buttons
- One click → `campaign-launcher` executes

### 3. Campaign Detail Page

New page at `/dashboard/campaigns/[id]`:
- Campaign status badge (active/paused/draft)
- Performance metrics: spend, impressions, clicks, CTR, ROAS, CPA
- Per-ad-set breakdown (audience tier performance)
- Per-ad breakdown (which creative is winning)
- Optimization history timeline (Mia's actions)
- Manual controls: Pause, Resume, Increase Budget, End Campaign

### 4. Campaign List Updates

Existing `/dashboard/campaigns` page:
- Show campaigns from new `campaigns` table instead of `skill_runs`
- Add status badges, spend-to-date, ROAS
- Quick actions: pause, resume

---

## API Routes

**`POST /api/campaigns/launch`**
- Auth + brand access check
- Validates input (budget > 0, at least 1 creative, at least 1 audience tier)
- Calls `runSkill('campaign-launcher', { ... })`
- Returns campaign ID

**`POST /api/campaigns/[id]/pause`**
- Calls `updateMetaCampaign(status: 'PAUSED')`
- Updates `campaigns.status = 'paused'`

**`POST /api/campaigns/[id]/resume`**
- Calls `updateMetaCampaign(status: 'ACTIVE')`
- Updates `campaigns.status = 'active'`

**`GET /api/campaigns/[id]/performance`**
- Calls `fetchCampaignPerformance()`
- Returns structured performance data for the detail page

**`POST /api/mia/auto-campaign`**
- Triggers the Mia auto-chain: ad-copy → image-brief → audience-targeting
- Returns generated campaign data for the review screen
- Does NOT launch until user confirms

---

## Cron Integration

Add `campaign-optimizer` to the daily cron system. Two options:

**Option chosen**: Add to `vercel.json` as a dedicated cron:
```json
{ "path": "/api/cron/campaign-optimizer", "schedule": "0 6 */2 * *" }
```

The cron route:
1. Queries active campaigns past learning period
2. For each, calls `runSkill('campaign-optimizer', { campaignId })`
3. Respects existing guardrails (daily credit cap, hourly rate limit)

Mia can also trigger it outside the cron via chain-processor (e.g., after health-check detects ad anomaly).

---

## Meta Campaign Structure (Best Practice)

```
Campaign (CBO enabled — Meta distributes budget)
├── Ad Set: Prospecting (cold audience — interest-based from Brand DNA)
│   ├── Ad: Creative variant 1 (copy A + image 1)
│   ├── Ad: Creative variant 2 (copy B + image 2)
│   └── Ad: Creative variant 3 (copy C + image 1)
├── Ad Set: Warm (engaged visitors — website visitors, social engagers)
│   ├── Ad: Creative variant 1
│   ├── Ad: Creative variant 2
│   └── Ad: Creative variant 3
└── Ad Set: Hot (high-intent — add to cart, past purchasers)
    ├── Ad: Creative variant 1
    ├── Ad: Creative variant 2
    └── Ad: Creative variant 3
```

- CBO handles budget distribution across ad sets (we don't micromanage)
- Meta's algorithm tests creative variants within each ad set
- Our optimizer reads the results and scales/pauses at campaign level
- Audience learnings feed back to Atlas for next campaign

---

## Future Platform Extension

When adding Google Ads or Klaviyo:
1. Add new functions in `src/lib/google-ads.ts` or `src/lib/klaviyo-campaigns.ts`
2. `campaign-launcher` skill reads `platform` from input and calls the right module
3. `campaigns` table already has `platform` column
4. Add platform-specific ID columns (e.g., `google_campaign_id`)
5. `campaign-optimizer` branches on platform for API calls

No architectural changes needed — just new platform adapters.

---

## Implementation Order

1. **Database**: `campaigns` table migration
2. **Meta API**: `src/lib/meta-ads.ts` (create campaign, ad set, ad, update, fetch performance)
3. **campaign-launcher skill**: Max's execution skill (no LLM, pure API calls)
4. **Wizard wiring**: Connect Launch button to campaign-launcher
5. **campaign-optimizer skill**: LLM-driven performance analysis + budget scaling
6. **Knowledge graph feedback**: Write insights after each optimization cycle
7. **Cron route**: `/api/cron/campaign-optimizer`
8. **Campaign detail page**: Performance dashboard with controls
9. **Mia Auto-Campaign**: One-click chain + review screen
10. **Campaign list updates**: Show real campaigns with status and metrics

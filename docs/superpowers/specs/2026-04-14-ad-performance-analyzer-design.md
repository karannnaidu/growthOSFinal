# Ad Performance Analyzer — Design Spec

**Date**: 2026-04-14
**Status**: Draft
**Owner**: Max (analysis), Mia (morning brief integration)

## Problem

Max has three optimization skills (budget-allocation, ad-scaling, channel-expansion-advisor) but no skill that pulls Meta ad data, makes sense of it, and presents a clear "what's working, what's not" report. The user sees "No output available yet" on Max's agent page. There's also no way to track improvement over time — no baseline, no benchmarks, no "AI vs agency" comparison.

## Goals

1. New `ad-performance-analyzer` skill that pulls Meta data, passes it through the LLM for interpretation, and produces a plain-language report with structured data
2. Auto-capture baseline on first run (pre-Growth OS performance) for ongoing comparison
3. Monthly rolling benchmarks that raise the bar as performance improves
4. Separate Growth OS campaigns from external/agency campaigns for direct comparison
5. Account maturity detection with safe ramp-up guidance for cold accounts
6. Surface key metrics in Mia's morning brief (adapts based on campaign state)

## Non-Goals

- Google Ads analysis (future — when connected)
- Automated campaign changes (that's campaign-optimizer's job)
- Custom reporting UI (uses existing agent detail page output rendering)

---

## Skill Definition

```yaml
id: ad-performance-analyzer
name: Ad Performance Analyzer
agent: max
category: optimization
complexity: cheap
credits: 1
mcp_tools: [meta_ads.campaigns.insights, meta_ads.adsets.list]
requires: [meta]
chains_to: [budget-allocation, ad-scaling, creative-fatigue-detector]
schedule: "0 9 * * *"
knowledge:
  needs: [campaign, metric, insight, audience, creative]
  semantic_query: "ad performance ROAS CAC CTR spend campaign metrics trends"
  traverse_depth: 1
produces:
  - node_type: metric
    edge_to: campaign
    edge_type: performs_on
  - node_type: insight
    edge_to: campaign
    edge_type: derived_from
```

---

## Execution Flow

### Step 1: Pull Raw Data from Meta

Via existing MCP tools (`meta_ads.campaigns.insights`, `meta_ads.adsets.list`):
- All campaigns: spend, impressions, clicks, CTR, CPC, ROAS, CPA, conversions
- Per ad set: same metrics (audience tier performance)
- Per ad: same metrics (creative variant performance)
- Date range: last 30 days daily breakdown for trend analysis
- Detect account currency from Meta API response

### Step 2: Detect Account Maturity

From the 30-day historical spend data:
- **Cold** (< $1K lifetime spend): max 20% ramp every 4 days
- **Warm** ($1K-$10K monthly): max 25% ramp every 3 days
- **Established** ($10K+ monthly): max 30% ramp every 3 days

Store as `account_maturity` in `brand_metrics_history`.

### Step 3: Separate Growth OS vs External Campaigns

Query the `campaigns` table for this brand's `meta_campaign_id` values. Any Meta campaign ID NOT in our table = external/agency campaign. Split performance into two buckets:
- **Growth OS campaigns**: created and managed by Max
- **External campaigns**: created by agency or manually

This enables the "AI vs agency" comparison.

### Step 4: Check/Capture Benchmarks

Query `brand_metrics_history` for existing benchmarks:

**First run (no baseline exists):**
- Pull 30 days of historical data from Meta
- Save as baseline: `baseline_roas`, `baseline_cac`, `baseline_ctr`, `baseline_monthly_spend`
- These are never overwritten — they represent pre-Growth OS performance

**Monthly benchmark (first run of a new month):**
- Save previous month's average metrics as `monthly_roas_{MMM_YYYY}`, `monthly_cac_{MMM_YYYY}`, etc.
- These become the rolling comparison targets

**Every run:**
- Save current metrics as `current_roas`, `current_cac`, etc. (overwritten each run)

### Step 5: LLM Analysis

Pass to the LLM:
- Raw performance data (all campaigns, ad sets, ads)
- Baseline and monthly benchmark numbers
- Growth OS vs external campaign split
- Account maturity level
- Brand DNA context (product category, target audience)
- Past insights from knowledge graph

LLM produces:

**Plain-language analysis** — Explains what's happening like a media buyer would:
- "Your Spring Push campaign is your best performer. The UGC variant is outperforming studio shots 2:1."
- "Retarget Q1 has been losing money for 5 days — recommend pausing."

**Benchmark narrative** — Adapts based on phase:
- Baseline capture: "Captured your current ad performance as the baseline."
- Pre-campaign: "Current performance: ROAS 2.5x, CAC $4.80. Launch a campaign to let Max optimize."
- Active: "Since Growth OS started managing ads, ROAS up 52%. Your GOS campaigns: 4.2x ROAS vs external campaigns: 2.1x."

**Recommendations** — Actionable next steps with reasoning.

**Account health** — Maturity level, ramp guidance, spending limits awareness.

### Step 6: Post-Execution

- Write benchmarks to `brand_metrics_history` (baseline on first run, monthly on new month, current every run)
- Store account maturity for campaign-optimizer to read when scaling

---

## Output Format

```json
{
  "phase": "active_optimization",
  "account_maturity": "warm",
  "account_currency": "INR",
  "ramp_guidance": "Max 25% budget increase every 3 days",

  "summary": "ROAS 3.8x (up 52% from baseline). Top campaign: Spring Push. Recommend pausing Retarget Q1.",

  "baseline_comparison": {
    "roas": { "baseline": 2.5, "current": 3.8, "change_pct": 52 },
    "cac": { "baseline": 480, "current": 210, "change_pct": -56.3 },
    "ctr": { "baseline": 0.8, "current": 1.6, "change_pct": 100 },
    "monthly_spend": { "baseline": 15000, "current": 22000, "change_pct": 46.7 }
  },

  "monthly_comparison": {
    "roas": { "last_month": 3.4, "current": 3.8, "change_pct": 11.8 },
    "cac": { "last_month": 250, "current": 210, "change_pct": -16 }
  },

  "gos_vs_external": {
    "growth_os": { "campaigns": 2, "spend": 14000, "roas": 4.2, "cac": 180 },
    "external": { "campaigns": 3, "spend": 8000, "roas": 2.1, "cac": 420 }
  },

  "campaigns": [
    {
      "name": "Spring Push",
      "source": "growth_os",
      "status": "winning",
      "spend": 8500,
      "roas": 4.5,
      "ctr": 1.9,
      "cpa": 165,
      "trend": "improving",
      "analysis": "Strong UGC creative driving 70% of conversions. Males 25-34 converting best."
    },
    {
      "name": "Retarget Q1",
      "source": "external",
      "status": "losing",
      "spend": 4200,
      "roas": 0.9,
      "ctr": 0.3,
      "cpa": 1850,
      "trend": "declining",
      "analysis": "Creative fatigue — same static images running 45+ days. Audience exhausted."
    }
  ],

  "top_ads": [
    { "ad_name": "UGC Testimonial v2", "campaign": "Spring Push", "ctr": 2.4, "roas": 5.1, "why": "Authentic UGC resonates with 25-34 demo" }
  ],

  "worst_ads": [
    { "ad_name": "Static Banner v1", "campaign": "Retarget Q1", "ctr": 0.2, "roas": 0.4, "why": "Running 47 days unchanged, CTR declining weekly" }
  ],

  "recommendations": [
    { "action": "pause", "target": "Retarget Q1", "reason": "ROAS below 1.0 for 5 consecutive days", "chain_to": null },
    { "action": "scale", "target": "Spring Push", "reason": "ROAS stable above 4x for 7 days", "chain_to": "ad-scaling" },
    { "action": "refresh", "target": "Spring Push - Static Banner", "reason": "CTR declining, creative fatigue likely", "chain_to": "creative-fatigue-detector" }
  ],

  "benchmark_narrative": "Since Growth OS started managing your ads 18 days ago, ROAS improved 52% and cost per acquisition dropped from Rs.480 to Rs.210. Your Growth OS campaigns outperform external campaigns by 2x on ROAS."
}
```

---

## Morning Brief Integration

Mia reads ad-performance-analyzer output and adapts:

| Phase | What Mia says |
|-------|--------------|
| `baseline_capture` | "Max analyzed your Meta ads and set a performance baseline: ROAS {x}, CAC {y}." |
| `pre_campaign` | "Current ad performance: ROAS {x}, CAC {y}. Create a campaign to let Max optimize." |
| `active_optimization` | "ROAS {x} (up {n}% from baseline). GOS campaigns: {roas}x vs external: {roas}x. {top recommendation}." |

The `deriveMorningNarrative` function in `dashboard/page.tsx` already parses health-check output. Add a similar block that checks for the latest `ad-performance-analyzer` skill run and extracts `baseline_comparison` and `benchmark_narrative`.

---

## Benchmark Storage in `brand_metrics_history`

Rows written to existing `brand_metrics_history` table:

| metric_name | When written | Overwritten? |
|-------------|-------------|--------------|
| `baseline_roas` | First run only | Never |
| `baseline_cac` | First run only | Never |
| `baseline_ctr` | First run only | Never |
| `baseline_monthly_spend` | First run only | Never |
| `account_maturity` | Every run | Yes |
| `current_roas` | Every run | Yes |
| `current_cac` | Every run | Yes |
| `current_ctr` | Every run | Yes |
| `monthly_roas_apr_2026` | First run of month | Never |
| `monthly_cac_apr_2026` | First run of month | Never |

campaign-optimizer reads `account_maturity` to decide ramp rate when scaling budgets.

---

## Account Maturity & Ramp Rules

| Level | Threshold | Max ramp | Min interval |
|-------|-----------|----------|-------------|
| Cold | < $1K lifetime spend | 20% | 4 days |
| Warm | $1K-$10K monthly | 25% | 3 days |
| Established | $10K+ monthly | 30% | 3 days |

These limits are enforced by `campaign-optimizer` when it decides to scale. `ad-performance-analyzer` detects and reports the level, campaign-optimizer acts on it.

---

## Implementation Order

1. Skill definition: `skills/optimization/ad-performance-analyzer.md`
2. Post-execution hook in `skills-engine.ts`: write benchmarks to `brand_metrics_history`
3. Morning brief integration: parse ad-performance-analyzer output in `deriveMorningNarrative`
4. Add to Mia's daily trigger: include `ad-performance-analyzer` in the daily skill cycle
5. Update `campaign-optimizer` to read `account_maturity` for ramp decisions

---
id: budget-allocation
name: Budget Allocation Optimizer
agent: max
category: optimization
complexity: mid
credits: 2
mcp_tools:
  - meta_ads.campaigns.insights
  - ga4.report.run
requires:
  - meta
chains_to:
  - ad-scaling
schedule: 0 9 * * *
knowledge:
  needs:
    - campaign
    - channel
    - metric
    - audience
    - creative
    - competitor
    - insight
  semantic_query: ad spend ROAS CPA budget allocation channel performance
  traverse_depth: 2
  include_agency_patterns: true
produces:
  - node_type: insight
    edge_to: campaign
    edge_type: derived_from
  - node_type: metric
    edge_to: channel
    edge_type: performs_on
side_effect: none
reversible: true
requires_human_approval: false
description_for_mia: >-
  Input: channel performance + total budget. Output: reallocation scenarios
  (A/B/C) with projected impact. Use when: monthly plan or ROAS drift.
description_for_user: Shows you how to reshuffle your budget across channels for better returns.
---

## System Prompt

You are Max, a budget optimizer. You analyze ad spend across all channels and recommend reallocations that maximize ROAS. You're precise, direct, and data-driven — you never recommend a change without showing the math.

Your philosophy: every dollar should earn more than a dollar. If a channel isn't performing, you move money to one that is. You don't waste budget on "brand awareness" unless the founder explicitly asks for it.

## When to Run

- Daily at 9am (scheduled)
- Mia chains from health-check when ad performance drops
- User manually requests budget review
- After significant ROAS change detected by Scout

## Inputs Required

- Meta Ads: campaign-level spend, ROAS, CPA, CTR (via MCP)
- Google Ads: campaign-level spend, ROAS, CPA, CTR (via MCP if connected)
- GA4: traffic by channel, conversion by channel (via MCP)
- Knowledge graph: campaign nodes with performance snapshots, audience nodes, creative performance, competitor moves
- Budget constraints: total monthly budget (from brand settings)

## Workflow

1. Pull current performance data from all ad platforms via MCP
2. Query knowledge graph for:
   - Historical campaign performance (snapshots over last 30 days)
   - Which creatives are driving which campaigns
   - Which audiences are converting best per channel
   - Competitor spending changes (from Echo's intel)
   - Agency patterns (cross-brand channel benchmarks)
3. Calculate per-channel:
   - Current spend, ROAS, CPA, CPC, CTR
   - 7-day trend (improving/declining/stable)
   - Efficiency score (ROAS relative to CAC target)
4. Model reallocation scenarios:
   - Scenario A: Shift underperformers to top channel
   - Scenario B: Even distribution with performance floor
   - Scenario C: Aggressive — all budget to top 2 channels
5. Recommend with projected impact

## Output Format

```json
{
  "analysis_date": "2026-04-08",
  "total_monthly_budget": 5000,
  "current_allocation": {
    "meta": { "spend": 2400, "pct": 0.48, "roas": 2.1, "cpa": 21, "trend": "declining" },
    "google_shopping": { "spend": 1800, "pct": 0.36, "roas": 4.8, "cpa": 9, "trend": "stable" },
    "google_search": { "spend": 500, "pct": 0.10, "roas": 1.4, "cpa": 32, "trend": "declining" },
    "tiktok": { "spend": 300, "pct": 0.06, "roas": 3.2, "cpa": 14, "trend": "improving" }
  },
  "recommendation": {
    "action": "Shift 20% of Meta budget to Google Shopping + TikTok",
    "new_allocation": {
      "meta": { "spend": 1920, "pct": 0.384, "projected_roas": 2.3 },
      "google_shopping": { "spend": 2200, "pct": 0.44, "projected_roas": 4.6 },
      "google_search": { "spend": 280, "pct": 0.056, "projected_roas": 1.6 },
      "tiktok": { "spend": 600, "pct": 0.12, "projected_roas": 3.0 }
    },
    "projected_impact": {
      "additional_monthly_revenue": 2400,
      "blended_roas_change": "2.8x → 3.4x",
      "confidence": "medium"
    },
    "reasoning": "Google Shopping ROAS is 2.3x higher than Meta. Diminishing returns unlikely at this spend level. TikTok is trending up with 3.2x ROAS — worth scaling. Google Search is underwater at 1.4x — reduce to brand-only terms."
  },
  "alerts": [
    {
      "severity": "warning",
      "channel": "meta",
      "message": "Meta ROAS has declined 35% over 14 days. Likely cause: creative fatigue (top ad set running 21 days). Aria should refresh creative.",
      "suggested_action": { "agent": "aria", "skill": "ad-copy" }
    }
  ],
  "competitor_context": "Echo reports GlowRival increased Meta spend ~20% this week with new UGC campaign. This may be contributing to higher CPAs in our Meta campaigns."
}
```

## Auto-Chain

- If major reallocation recommended → Mia presents to user for approval
- If creative fatigue detected → chain to Aria's `creative-fatigue-detector` or `ad-copy`
- If channel performing well enough to scale → chain to `ad-scaling`

---
id: weekly-report
name: Weekly Report
agent: mia
category: ops
complexity: cheap
credits: 1
mcp_tools: []
chains_to: []
schedule: "0 8 * * 1"
knowledge:
  needs: [metric, campaign, insight, creative, experiment, persona]
  semantic_query: "weekly performance summary revenue growth key wins issues"
  traverse_depth: 2
  include_agency_patterns: false
produces:
  - node_type: insight
---

## System Prompt

You are Mia, the marketing manager. You compile a weekly narrative report that tells the founder exactly what happened, what the team did, and what to focus on next week.

This is NOT a data dump. It's a story. Lead with the headline, explain the context, highlight agent contributions, and close with 3 priorities for the coming week.

Write in your voice: calm, confident, conversational. Use numbers to support your narrative, not as the narrative itself. The founder should be able to read this in 2 minutes over coffee and feel informed.

## When to Run

- Weekly Monday 8am (scheduled)
- User manually requests weekly summary

## Inputs Required

- All skill_runs from the past 7 days (from skill_runs table)
- Knowledge graph: metric nodes with snapshots (7-day trends)
- Campaign performance changes
- Agent actions taken (auto-completed items)
- Items pending user review
- Credit usage for the week

## Workflow

1. Query skill_runs for last 7 days — group by agent
2. Query knowledge_snapshots for key metrics (revenue, orders, ROAS, traffic, CVR)
3. Calculate week-over-week changes for each metric
4. Identify:
   - Biggest win this week
   - Biggest concern
   - What each active agent accomplished
   - Pending items that need attention
5. Compile into narrative format
6. Add 3 priorities for next week based on current trajectory

## Output Format

```json
{
  "week": "2026-03-31 to 2026-04-06",
  "headline": "Revenue up 18% — Luna's new email flows drove 22% of total revenue",
  "summary": "Strong week. Revenue hit $6,240 (+18% WoW) driven primarily by Luna's new abandoned cart recovery sequence, which recovered $1,380 in its first full week. ROAS improved slightly to 3.4x after Max shifted budget from Meta to Google Shopping. One concern: organic traffic dropped 6%, which Hugo is investigating — could be a Google algorithm update.",
  "metrics": {
    "revenue": { "value": 6240, "change": 0.18, "period": "wow" },
    "orders": { "value": 142, "change": 0.15 },
    "aov": { "value": 43.94, "change": 0.02 },
    "roas": { "value": 3.4, "change": 0.06 },
    "traffic": { "value": 8420, "change": -0.03 },
    "cvr": { "value": 0.024, "change": -0.002 },
    "email_revenue_pct": { "value": 0.22, "change": 0.14 }
  },
  "agent_contributions": [
    {
      "agent": "luna",
      "highlight": "Launched 3-email abandoned cart sequence. Recovered $1,380 in first week (32% open rate, 8.2% conversion).",
      "skills_run": 3,
      "credits_used": 4
    },
    {
      "agent": "max",
      "highlight": "Shifted 20% of Meta budget to Google Shopping. ROAS improved from 3.2x to 3.4x.",
      "skills_run": 7,
      "credits_used": 0
    },
    {
      "agent": "aria",
      "highlight": "Generated 5 new ad variants for Sunrise Serum. Variant 3 (UGC-style) approved after persona review scored 8.2/10.",
      "skills_run": 4,
      "credits_used": 8
    },
    {
      "agent": "scout",
      "highlight": "Flagged organic traffic decline (-6%). Investigating correlation with Google March update.",
      "skills_run": 7,
      "credits_used": 0
    }
  ],
  "pending_review": [
    "Hugo's keyword strategy (3 new content opportunities) — awaiting your approval",
    "Atlas found 2 new micro-influencers — review their profiles"
  ],
  "credit_usage": {
    "total_runs": 47,
    "credits_spent": 28,
    "ai_cost": 4.80,
    "by_tier": { "free": 28, "cheap": 11, "mid": 5, "premium": 3 }
  },
  "next_week_priorities": [
    "1. Review and approve Hugo's keyword strategy — 3 quick-win pages could add ~800 organic visitors/mo",
    "2. Monitor new Aria creative (Variant 3) performance — if CTR > 3% after 3 days, scale budget",
    "3. Connect Google Ads — currently missing 40% of your ad performance visibility"
  ]
}
```

## Notes

- This skill reads from other agents' outputs — it never runs skills itself
- Uses cheap tier because it's summarization, not creative work
- The narrative format is key: founders share this with co-founders/investors
- WhatsApp version: condensed to 5 bullet points via `whatsapp-briefing` skill

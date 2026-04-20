---
id: whatsapp-briefing
name: WhatsApp Morning Briefing
agent: mia
category: ops
complexity: free
credits: 0
mcp_tools: []
chains_to: []
schedule: 0 7 * * *
knowledge:
  needs:
    - metric
    - insight
    - anomaly
    - campaign
  semantic_query: daily briefing summary key metrics alerts
  traverse_depth: 1
  include_agency_patterns: false
produces:
  - node_type: insight
side_effect: send
reversible: false
requires_human_approval: true
description_for_mia: >-
  Input: brand + digest content + recipient. Output: WhatsApp message sent to
  user. Use when: user has opted in to WhatsApp briefings and it is the
  scheduled time.
description_for_user: Sends you a WhatsApp briefing with the day's highlights.
---

## System Prompt

You are Mia, delivering a crisp daily briefing that the founder reads over their morning coffee — on WhatsApp. This is NOT the weekly report. It's 5 bullet points maximum, covering: yesterday's headline number, any overnight alerts, what the agents are working on today, and one thing that needs the founder's attention.

Write for a phone screen. Short sentences. No fluff. Lead with the most important number. Use plain language, not marketing jargon. The founder should read this in 30 seconds and know exactly where their business stands.

If nothing important happened, say so: "Quiet day. Revenue on track. No alerts. Agents running scheduled tasks." That's a perfectly good briefing.

## When to Run

- Daily at 7am (scheduled)
- On-demand when user requests a quick status update

## Inputs Required

- Yesterday's key metrics: revenue, orders, ROAS, notable changes
- Overnight anomaly alerts (from Scout's anomaly-detection)
- Agent activity queue (what's scheduled or pending today)
- Pending items needing founder attention (approvals, decisions)
- Credit usage (if notable)

## Workflow

1. Pull yesterday's headline metrics from knowledge graph snapshots
2. Check for overnight anomaly alerts from Scout's anomaly-detection
3. Review today's agent schedule (what skills are queued to run)
4. Check pending approval queue (creative variants, test designs, budget changes waiting for founder input)
5. Compose 3-5 bullet points, prioritized by importance:
   - Lead with yesterday's revenue (the number that matters most)
   - Any alerts or anomalies (things that need attention)
   - Agent activity (what's happening today without founder action)
   - Pending approvals (what's blocked on the founder)
   - Credit/cost note (only if notable)
6. Format for WhatsApp delivery:
   - Plain text, no markdown
   - Each bullet on its own line
   - Quick-reply options for actionable items
   - Total message under 500 characters

## Output Format

```json
{
  "date": "2026-04-08",
  "delivery_channel": "whatsapp",
  "briefing": {
    "headline": "$847 revenue yesterday (+12% vs Monday avg)",
    "bullets": [
      "Revenue: $847 from 19 orders. AOV $44.58. On track for $6.2K this week.",
      "Alert: Checkout completion dropped 15% overnight. Scout is investigating — could be a payment gateway hiccup. Will update by noon.",
      "Aria finished 5 new ad variants for Sunrise Serum. Waiting for your review in the dashboard.",
      "Hugo's SEO audit runs today — expect keyword recommendations by end of day.",
      "Credits used yesterday: 4 (budget: on track for the month)"
    ],
    "needs_attention": "Review Aria's ad variants — they've been pending 2 days and Max is waiting to launch them.",
    "mood": "mostly_positive"
  },
  "whatsapp_formatted": "Good morning! Here's your daily briefing:\n\n$847 revenue yesterday (+12% vs Monday avg)\n\n- 19 orders, AOV $44.58. On track for $6.2K this week\n- Checkout completion dropped 15% overnight — Scout investigating, update by noon\n- 5 new ad variants ready for your review (pending 2 days)\n- Hugo's SEO audit runs today\n- Credits: 4 used yesterday, on track for month\n\nNeeds your attention: Review ad variants so Max can launch them",
  "quick_replies": [
    { "label": "Review creative", "action": "open_dashboard", "url": "/dashboard/pending" },
    { "label": "More details", "action": "open_dashboard", "url": "/dashboard" },
    { "label": "Pause all ads", "action": "pause_ads" }
  ]
}
```

## Auto-Chain

- No auto-chain — this is a terminal output skill
- If founder replies with a question, Mia routes to the appropriate agent
- If founder approves something mentioned in the briefing, Mia triggers the downstream skill

---
id: competitor-status-monitor
name: Competitor Status Monitor
agent: echo
category: diagnosis
complexity: cheap
credits: 0.5
mcp_tools: [competitor.status]
chains_to: []
schedule: "0 7 * * *"
knowledge:
  needs: [competitor]
  semantic_query: "competitor status active shutdown acquired closing"
  traverse_depth: 0
  include_agency_patterns: false
produces:
  - node_type: insight
    edge_to: competitor
    edge_type: derived_from
---

## System Prompt

You are Echo, performing a daily health check on all tracked competitors. You check if their websites are still online, search for recent news about shutdowns/acquisitions/layoffs, and flag any significant changes.

This is a lightweight monitoring skill. Only create alerts for genuine signals — a brief server outage is not a shutdown. Look for patterns: site down + no social posts + negative news = real signal.

Be concise. Most days, the output should be "all clear."

## When to Run

- Daily at 7am (scheduled)
- Never chained from other skills — this is a standalone monitor

## Inputs Required

- Competitor domains (from competitor knowledge nodes)
- HTTP health check results (via competitor.status MCP tool)
- Recent news articles (via competitor.status MCP tool — includes NewsAPI search)
- Last social media post dates (from competitor node properties, if tracked)

## Workflow

1. For each tracked competitor:
   a. Check HTTP status (is site responding?)
   b. Check NewsAPI for shutdown/acquisition/layoff news
   c. Check if last known social post is > 30 days old
   d. Determine overall status: active, degraded, inactive, or shutdown

2. Only flag competitors with status != active
3. If shutdown or acquisition detected, generate high-priority alert

## Output Format

Return valid JSON:
```json
{
  "check_date": "2026-04-10",
  "competitors_checked": 5,
  "all_clear": true,
  "alerts": [],
  "statuses": [
    {
      "name": "CompetitorX",
      "domain": "competitorx.com",
      "status": "active",
      "http_status": 200,
      "response_time_ms": 245,
      "recent_news": [],
      "last_social_activity": "2026-04-08"
    }
  ]
}
```

When alerts exist:
```json
{
  "check_date": "2026-04-10",
  "competitors_checked": 5,
  "all_clear": false,
  "alerts": [
    {
      "competitor": "FailingBrand",
      "domain": "failingbrand.com",
      "alert_type": "potential_shutdown",
      "signals": [
        "Website returning 503 for 3 consecutive days",
        "No social media posts in 45 days",
        "News article: 'FailingBrand lays off 80% of staff'"
      ],
      "confidence": "high",
      "recommended_action": "Monitor closely. If confirmed, this opens market share opportunity in their customer base."
    }
  ]
}
```

## Auto-Chain

- No auto-chaining. Alerts are surfaced via Mia's daily briefing.
- High-confidence shutdown alerts create a notification (type: needs_review, agent: echo).

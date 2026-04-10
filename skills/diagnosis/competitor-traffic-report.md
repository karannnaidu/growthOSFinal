---
id: competitor-traffic-report
name: Competitor Traffic & SEO Report
agent: echo
category: diagnosis
complexity: mid
credits: 2
mcp_tools: [competitor.traffic, competitor.seo]
chains_to: [keyword-strategy]
schedule: "0 8 1 * *"
knowledge:
  needs: [competitor, keyword, insight]
  semantic_query: "competitor traffic SEO rankings keywords organic growth"
  traverse_depth: 1
  include_agency_patterns: true
produces:
  - node_type: insight
    edge_to: competitor
    edge_type: derived_from
  - node_type: keyword
    edge_to: competitor
    edge_type: belongs_to
---

## System Prompt

You are Echo, generating a monthly competitive traffic and SEO intelligence report. You analyze traffic trends, keyword rankings, and SEO metrics for all tracked competitors to identify opportunities and threats.

Compare month-over-month data when available (from knowledge_snapshots). Focus on actionable insights: keyword gaps the brand can exploit, traffic source shifts that signal strategy changes, and SEO wins/losses that reveal competitive moves.

Be data-driven. Use numbers. Flag trends, not noise — one month of data isn't a trend.

## When to Run

- Monthly on the 1st at 8am (scheduled)
- User manually requests competitive SEO report
- Hugo chains from keyword-strategy when competitor data is needed

## Inputs Required

- Competitor domains (from competitor knowledge nodes)
- DataForSEO traffic data (via competitor.traffic MCP tool)
- DataForSEO SEO metrics + keyword rankings (via competitor.seo MCP tool)
- Previous traffic/SEO snapshots (from knowledge graph — for trend detection)
- Brand's own keyword rankings (if available from Hugo's keyword-strategy runs)

## Workflow

1. For each tracked competitor:
   a. Pull current traffic estimate and traffic source breakdown
   b. Pull SEO metrics: domain rank, backlinks, referring domains
   c. Pull top keyword rankings (top 20 by search volume)
   d. Compare to last month's snapshot (if available in knowledge_snapshots)
   e. Calculate month-over-month changes

2. Cross-competitor analysis:
   a. Identify keywords where competitors rank but the brand doesn't (keyword gaps)
   b. Identify traffic source shifts (e.g., competitor moving from paid to organic)
   c. Identify SEO wins/losses (big rank changes, new backlinks)

3. Store updated snapshots for trend tracking next month
4. Generate actionable recommendations for Hugo (SEO) and Max (budget)

## Output Format

Return valid JSON:
```json
{
  "report_date": "2026-04-01",
  "competitors_analyzed": 5,
  "competitor_reports": [
    {
      "name": "CompetitorX",
      "domain": "competitorx.com",
      "traffic": {
        "monthly_visits": 150000,
        "mom_change": "+12%",
        "traffic_sources": {
          "organic": 45,
          "paid": 30,
          "social": 15,
          "direct": 10
        },
        "source_shifts": "Organic up 8%, paid down 5% — shifting to SEO"
      },
      "seo": {
        "domain_rank": 42,
        "backlinks": 12500,
        "mom_backlink_change": "+350",
        "referring_domains": 890,
        "top_keywords": [
          {
            "keyword": "calming supplements",
            "position": 3,
            "volume": 8100,
            "position_change": -1
          }
        ]
      }
    }
  ],
  "keyword_gaps": [
    {
      "keyword": "natural sleep aid",
      "volume": 12000,
      "competitors_ranking": ["CompetitorX (pos 4)", "CompetitorY (pos 7)"],
      "brand_position": null,
      "opportunity_score": "high"
    }
  ],
  "trend_summary": "Competitors are collectively shifting toward organic traffic. CompetitorX gained 350 backlinks this month through guest posting. The 'natural sleep aid' keyword cluster has no brand presence despite 3 competitors ranking in top 10.",
  "recommended_actions": [
    {
      "action": "Target 'natural sleep aid' keyword cluster — zero brand presence, 3 competitors ranking",
      "agent": "hugo",
      "skill": "keyword-strategy",
      "priority": "high"
    },
    {
      "action": "CompetitorX's organic growth suggests content marketing ROI — consider increasing blog output",
      "agent": "hugo",
      "skill": "programmatic-seo",
      "priority": "medium"
    }
  ]
}
```

## Auto-Chain

- Keyword gaps identified → chain to Hugo's `keyword-strategy` with gap data
- Traffic insights → included in Mia's weekly report
- SEO metric snapshots stored for next month's comparison

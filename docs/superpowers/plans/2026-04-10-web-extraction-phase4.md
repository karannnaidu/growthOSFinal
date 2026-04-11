# Phase 4: New Echo Skills — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create two new Echo skills — a monthly competitor traffic/SEO report and a daily competitor status monitor — that use the infrastructure built in Phase 3.

**Architecture:** Standard Growth OS skill markdown files with frontmatter declaring MCP tools, knowledge needs, and scheduling. The skills engine (`skills-engine.ts`) already handles loading, LLM dispatch, entity extraction, and auto-chaining. No new application code needed — just skill definitions.

**Tech Stack:** Markdown skill definitions, existing skills engine, existing competitor-intel MCP tools from Phase 3.

**PRD Reference:** `docs/web-extraction-prd-onboarding.md` — Sections 7.4, 7.5

**Depends on:** Phase 3 complete

---

### Task 1: Create Competitor Traffic Report Skill

**Files:**
- Create: `skills/diagnosis/competitor-traffic-report.md`

- [ ] **Step 1: Create the skill file**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add skills/diagnosis/competitor-traffic-report.md
git commit -m "feat: add competitor-traffic-report skill for Echo"
```

---

### Task 2: Create Competitor Status Monitor Skill

**Files:**
- Create: `skills/diagnosis/competitor-status-monitor.md`

- [ ] **Step 1: Create the skill file**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add skills/diagnosis/competitor-status-monitor.md
git commit -m "feat: add competitor-status-monitor daily skill for Echo"
```

---

### Task 3: Register New Skills in Skill Loader

**Files:**
- Check: `src/lib/skill-loader.ts`

- [ ] **Step 1: Verify skill loader auto-discovers from skills/ directory**

The skill loader in `src/lib/skill-loader.ts` should already discover skills from the `skills/` directory by reading markdown files. Verify that it uses a glob or directory scan pattern. If it uses a hardcoded list, add the two new skill IDs:

- `competitor-traffic-report`
- `competitor-status-monitor`

- [ ] **Step 2: Verify by checking the skill loader**

Read `src/lib/skill-loader.ts` and confirm the `loadSkill(skillId)` function constructs the path from the skill ID. The naming convention maps `competitor-traffic-report` to a file search in `skills/` subdirectories. Since the files are in `skills/diagnosis/`, they should be found automatically.

- [ ] **Step 3: Commit (only if changes were needed)**

```bash
git add src/lib/skill-loader.ts
git commit -m "fix: ensure skill loader discovers new Echo skills"
```

---

### Task 4: Add New Skills to Echo's Agent Config

**Files:**
- Modify: `skills/agents.json`

- [ ] **Step 1: Add new skill IDs to Echo's skills array**

In `skills/agents.json`, find the Echo agent entry (`"id": "echo"`) and add the new skills:

Change:
```json
"skills": ["competitor-scan", "competitor-creative-library"]
```

To:
```json
"skills": ["competitor-scan", "competitor-creative-library", "competitor-traffic-report", "competitor-status-monitor"]
```

- [ ] **Step 2: Commit**

```bash
git add skills/agents.json
git commit -m "feat: register new Echo skills in agents.json"
```

---

## Phase 4 Complete Checklist

- [ ] `skills/diagnosis/competitor-traffic-report.md` created — monthly SEO + traffic report
- [ ] `skills/diagnosis/competitor-status-monitor.md` created — daily health check + news monitor
- [ ] Skill loader verified to auto-discover new skills
- [ ] Echo's agent config in `agents.json` updated with new skill IDs
- [ ] New skills reference Phase 3's MCP tools (`competitor.traffic`, `competitor.seo`, `competitor.status`)
- [ ] Schedules set: traffic report monthly 1st at 8am, status monitor daily at 7am

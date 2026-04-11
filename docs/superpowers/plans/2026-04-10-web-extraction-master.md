# Web Extraction & Brand Intelligence — Master Execution Plan

> **For agentic workers:** Execute phases sequentially. Each phase has its own plan document with task-by-task instructions.

**Goal:** Transform Growth OS onboarding from a dead-end form into a Holo.ai-class brand intelligence extraction system — crawl any ecommerce URL, extract full Brand DNA, discover competitors, and power Echo's ongoing competitive monitoring.

**PRD:** `docs/web-extraction-prd-onboarding.md`

---

## Phase Overview

| Phase | Plan File | Tasks | What It Builds |
|-------|-----------|-------|----------------|
| **1** | `2026-04-10-web-extraction-phase1.md` | 9 tasks | Firecrawl client, brand extractor pipeline, SSE API route, extraction + review onboarding pages, flow rewiring |
| **2** | `2026-04-10-web-extraction-phase2.md` | 2 tasks | Competitor discovery during extraction, competitor cards on review page, competitor knowledge nodes |
| **3** | `2026-04-10-web-extraction-phase3.md` | 4 tasks | competitor-intel.ts (Meta Ads, DataForSEO, best sellers, social, funding, news), MCP tool registration, skill definition updates |
| **4** | `2026-04-10-web-extraction-phase4.md` | 4 tasks | New Echo skills: competitor-traffic-report (monthly), competitor-status-monitor (daily), agent config updates |

**Total: 19 tasks across 4 phases**

---

## Dependencies

```
Phase 1 (Brand Extraction)
    |
    v
Phase 2 (Competitor Discovery)  ← depends on Phase 1's firecrawl-client.ts + brand-extractor.ts
    |
    v
Phase 3 (Echo Infrastructure)   ← depends on Phase 1's firecrawl-client.ts
    |
    v
Phase 4 (New Echo Skills)       ← depends on Phase 3's MCP tools
```

Phases 1 and 2 can be merged into a single execution session.
Phase 3 and 4 can be merged into a single execution session.

---

## New Files Created (All Phases)

| File | Phase | Purpose |
|------|-------|---------|
| `src/lib/firecrawl-client.ts` | 1 | Firecrawl + Jina Reader + cheerio wrapper |
| `src/lib/brand-extractor.ts` | 1+2 | Brand DNA extraction + competitor discovery pipeline |
| `src/lib/competitor-intel.ts` | 3 | All competitor data source integrations |
| `src/app/api/onboarding/extract-brand/route.ts` | 1 | SSE endpoint for live extraction |
| `src/app/onboarding/extraction/page.tsx` | 1 | Live extraction progress UI |
| `src/app/onboarding/review/page.tsx` | 1+2 | Brand DNA + competitor review page |
| `skills/diagnosis/competitor-traffic-report.md` | 4 | Monthly SEO + traffic skill |
| `skills/diagnosis/competitor-status-monitor.md` | 4 | Daily health check skill |

## Files Modified (All Phases)

| File | Phase | Change |
|------|-------|--------|
| `package.json` | 1 | Add `@mendable/firecrawl-js` |
| `.env.local.example` | 1 | Add all new env vars |
| `src/app/onboarding/layout.tsx` | 1 | Update STEPS array (5 steps) |
| `src/app/onboarding/connect-store/page.tsx` | 1 | Redirect to extraction, store domain in sessionStorage |
| `src/app/onboarding/focus/page.tsx` | 1 | Step badge: "Step 4 of 5" |
| `src/app/onboarding/platforms/page.tsx` | 1 | Step badge: "Step 5 of 5" |
| `src/proxy.ts` | 1 | Remove debug logging |
| `src/lib/mcp-client.ts` | 3 | Add competitor.* MCP tool handlers |
| `skills/diagnosis/competitor-scan.md` | 3 | Update mcp_tools in frontmatter |
| `skills/diagnosis/competitor-creative-library.md` | 3 | Update mcp_tools in frontmatter |
| `skills/agents.json` | 4 | Add new skills to Echo |

## New Environment Variables

| Variable | Phase | Required |
|----------|-------|----------|
| `FIRECRAWL_API_KEY` | 1 | Yes (for primary crawling) |
| `DATAFORSEO_LOGIN` | 3 | Optional (for traffic/SEO data) |
| `DATAFORSEO_PASSWORD` | 3 | Optional (for traffic/SEO data) |
| `NEWSAPI_KEY` | 4 | Optional (for shutdown monitoring) |

# Mia — Daily Review
**Date:** 2026-04-11
**Trigger:** Daily cycle

---

## Situation Snapshot

| Platform | Status |
|---|---|
| Meta Ads | Connected |
| Shopify | Not connected |
| GA4 | Not connected |
| Klaviyo | Not connected |
| Brand DNA | Complete (4 products, 6 competitors, positioning, audience) |

Brand DNA is rich — AYUSH-licensed Ayurvedic cannabis wellness, four named SKUs, six named competitors, audience 25–45 wellness-focused. That's enough to run the full Tier 1 team and partially power Tier 2 (Meta is live, which is the most valuable Tier 2 connection for an ads-first D2C brand).

---

## Dispatch Decisions

```json
{
  "decisions": [
    {
      "agent": "scout",
      "skill": "health-check",
      "priority": "high",
      "reasoning": "Daily cycle always starts with Scout. With Meta Ads connected, Scout can score ads performance, creative health, and brand coherence from DNA. GA4 and Shopify are missing, so revenue, traffic, and inventory categories will return limited scores — Scout will flag these gaps explicitly so we know what the baseline looks like today.",
      "data_available": "Brand DNA (products, positioning, audience, competitors) + Meta Ads",
      "data_missing": "GA4 — traffic and conversion scores will be low-confidence. Shopify — revenue, order, and inventory signals unavailable."
    },
    {
      "agent": "echo",
      "skill": "competitor-scan",
      "priority": "high",
      "reasoning": "Six competitors named in Brand DNA: Boheco, Hempstrol, Cannazo India, Trost, Charlotte's Web, Lazarus Naturals. Daily scan checks their Meta Ad Library activity and website changes. Cannabis wellness is a fast-moving category — Charlotte's Web and Lazarus Naturals are international brands worth watching for creative direction. Echo runs independently, no platform connection needed.",
      "data_available": "Competitor names + ScrapeCreators API (Meta Ad Library) + Firecrawl",
      "data_missing": "Nothing blocking — Echo is fully self-sufficient."
    },
    {
      "agent": "aria",
      "skill": "creative-fatigue-detector",
      "priority": "high",
      "reasoning": "Meta Ads is connected. Creative fatigue is the #1 silent killer for wellness brands running awareness-focused campaigns. With Peace Mantra, Sleep Mantra, Dog Mantra, and Green Mantra each likely needing distinct creative angles, Aria should scan active ads for frequency and engagement decay. If fatigue is detected on any SKU, I'll immediately queue ad-copy and image-brief.",
      "data_available": "Brand DNA (product lineup, voice, positioning) + Meta Ads performance data",
      "data_missing": "Nothing blocking — Meta is live."
    },
    {
      "agent": "aria",
      "skill": "ad-copy",
      "priority": "medium",
      "reasoning": "Even without confirmed fatigue, the brand has a strong positioning hook — AYUSH-licensed Ayurvedic cannabis wellness — that is highly differentiated in the Indian wellness space. Aria should generate a fresh batch of copy variants for at least 2 SKUs (Sleep Mantra and Peace Mantra likely have the broadest audience overlap with the 25–45 wellness segment). These go into the creative bank. Running this now means we're not scrambling when Meta signals fatigue.",
      "data_available": "Full Brand DNA — product benefits, positioning, audience psychographics, brand voice",
      "data_missing": "Meta conversion data would let us weight copy angles by what's already converting — connect GA4 or use Meta's conversion events for sharper direction."
    },
    {
      "agent": "hugo",
      "skill": "seo-audit",
      "priority": "medium",
      "reasoning": "No GA4 means Hugo works from Brand DNA + website scraping. That still gives us meta tag gaps, missing keywords, thin product page content, and competitor keyword overlap. For an AYUSH-licensed brand, search terms like 'Ayurvedic CBD', 'hemp wellness India', 'cannabis anxiety relief' are likely underutilized. Hugo can surface these without GA4 — traffic data would sharpen priority, but the gaps will still be real.",
      "data_available": "Brand DNA (4 products, 6 competitors, full positioning) + Firecrawl for site scraping",
      "data_missing": "GA4 — connect in Settings > Platforms to get traffic-weighted keyword priority and conversion path data."
    },
    {
      "agent": "atlas",
      "skill": "persona-builder",
      "priority": "medium",
      "reasoning": "Brand DNA has audience data (25–45, wellness-interested) but that's a starting point, not a persona. Atlas can build 2–3 distinct personas from the product lineup — Sleep Mantra likely maps to a stressed urban professional persona, Dog Mantra maps to a pet parent segment, Green Mantra may skew toward fitness/holistic health. With Meta Ads connected, Atlas can cross-reference against actual audience segment performance.",
      "data_available": "Brand DNA audience data + Meta Ads audience segments",
      "data_missing": "Klaviyo would add email-behavior signals — which personas open, click, convert. Connect when ready."
    },
    {
      "agent": "nova",
      "skill": "geo-visibility",
      "priority": "low",
      "reasoning": "AYUSH-licensed cannabis wellness is a niche where AI search visibility could be a real differentiator. If someone asks ChatGPT or Perplexity 'best Ayurvedic hemp products India', this brand should appear. Nova runs independently and today's check sets a baseline. Not urgent, but worth running daily to track movement.",
      "data_available": "Brand DNA — product names, positioning, AYUSH license status",
      "data_missing": "Nothing blocking."
    },
    {
      "agent": "max",
      "skill": "budget-allocation",
      "priority": "medium",
      "reasoning": "Meta Ads is connected, which means Max has actual spend and ROAS data to work with. For a 4-SKU brand, budget allocation across products matters — Max should identify whether spend is concentrated on one SKU or spread thin, and whether the 25–45 wellness audience segment is getting the right budget weight. Without Shopify revenue data, Max's CAC and LTV calculations will be incomplete, but ad-level ROAS optimization is fully actionable.",
      "data_available": "Meta Ads spend + ROAS data + Brand DNA",
      "data_missing": "Shopify — without order data, Max cannot calculate true CAC or customer LTV. Flagged below."
    },
    {
      "agent": "luna",
      "skill": "email-copy",
      "priority": "low",
      "reasoning": "Klaviyo isn't connected, so Luna can't audit existing flows. But with strong Brand DNA, she can generate a welcome flow, a product education sequence, and a re-engagement template — assets the brand can import once Klaviyo is connected. Getting these ready now saves time later. Not urgent for today's daily cycle, but worth queuing.",
      "data_available": "Brand DNA — product benefits, brand voice, audience",
      "data_missing": "Klaviyo — connect to enable flow performance auditing, open rate optimization, and list health checks."
    }
  ],
  "skipped": [
    {
      "agent": "navi",
      "reason": "Shopify not connected. Navi cannot run inventory-alert or reorder-calculator without stock and order data. Navi's compliance-checker can run from Brand DNA — I'll add that to the next cycle once Navi's other skills are unblocked, or I can run it standalone on request."
    },
    {
      "agent": "penny",
      "reason": "Shopify not connected. Penny cannot calculate unit economics, CAC, or cash flow without revenue and order data. If you have monthly revenue, margins, and ad spend figures available, you can enter them manually on Penny's agent page and I'll run her skills immediately."
    },
    {
      "agent": "sage",
      "skill": "page-cro",
      "reason": "GA4 not connected. Sage can still run a landing page audit using website scraping and Brand DNA — this is a partial run, not a skip. I'll queue this for the next cycle. If you want it today, say the word and I'll run it with what's available."
    }
  ],
  "flags": [
    {
      "type": "missing_platform",
      "platform": "Shopify",
      "impact": "HIGH",
      "message": "Without Shopify, Navi and Penny are offline. You're missing inventory alerts, reorder signals, unit economics, and cash flow forecasting. This is the single highest-value connection to make. Connect in Settings > Platforms."
    },
    {
      "type": "missing_platform",
      "platform": "GA4",
      "impact": "MEDIUM",
      "message": "Without GA4, Hugo's SEO audit is less precise, Sage's CRO audit loses conversion funnel data, and Scout's traffic scoring is limited. Hugo will still surface real issues — just without traffic-weighted priority. Connect in Settings > Platforms."
    },
    {
      "type": "missing_platform",
      "platform": "Klaviyo",
      "impact": "MEDIUM",
      "message": "Without Klaviyo, Luna can create email assets but can't audit performance. If email is a current focus, connect Klaviyo to unlock flow auditing and list health checks."
    }
  ],
  "message_to_user": "Good morning. Daily review is running. Meta Ads is live so I have real data to work with — that's the most important connection for an ads-driven brand right now.\n\nHere's what I'm doing today: Scout runs first to baseline everything. Echo is scanning your six competitors' Meta ads and websites — Charlotte's Web and Lazarus Naturals are worth watching since they're international benchmarks. Aria is checking creative fatigue on your active Meta campaigns, and generating fresh copy variants for Sleep Mantra and Peace Mantra. Hugo is auditing your site's SEO gaps using your brand positioning. Atlas is building out your personas properly — right now 'wellness-interested 25-45' is too broad to build campaigns against. Max is reviewing your Meta budget allocation across SKUs. Nova is checking your AI search visibility — for an AYUSH-licensed brand, this is an underutilized channel.\n\nWhat I'm not running today: Navi and Penny need Shopify — that's your biggest gap. No Shopify means no inventory alerts and no financial metrics. Sage's CRO audit and Luna's email audit are also parked until GA4 and Klaviyo are connected, though I can run partial versions on request.\n\nOne question worth thinking about: which of your four SKUs is currently running Meta ads? Knowing that helps me direct Aria and Max to the right products first."
}
```

---

## Priority Order for Today

| Priority | Agent | Skill | Blocker |
|---|---|---|---|
| 1 | Scout | health-check | None |
| 2 | Echo | competitor-scan | None |
| 3 | Aria | creative-fatigue-detector | None (Meta live) |
| 4 | Aria | ad-copy | None |
| 5 | Hugo | seo-audit | GA4 missing (partial run) |
| 6 | Atlas | persona-builder | None (Meta live) |
| 7 | Max | budget-allocation | Shopify missing (partial run) |
| 8 | Nova | geo-visibility | None |
| 9 | Luna | email-copy | Klaviyo missing (templates only) |
| — | Navi | inventory-alert | BLOCKED — Shopify required |
| — | Penny | unit-economics | BLOCKED — Shopify required |
| — | Sage | page-cro | Deferred — GA4 recommended |

---

## What Would Change With Each Connection

**Connect Shopify:**
- Navi comes online: inventory alerts, reorder points
- Penny comes online: unit economics, CAC, cash flow
- Max gets full ROAS-to-revenue picture

**Connect GA4:**
- Hugo's audit becomes traffic-weighted (higher ROI fixes first)
- Sage's CRO audit gets real funnel drop-off data
- Scout's health-check gets traffic and conversion scoring

**Connect Klaviyo:**
- Luna's email-flow-audit activates
- Open rate optimization, list health, flow performance
- Atlas gets email behavioral signals for persona refinement

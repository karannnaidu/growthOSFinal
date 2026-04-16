---
id: email-flow-audit
name: Email Flow Audit
agent: luna
category: retention
complexity: cheap
credits: 1
mcp_tools: [brand.orders.list]
chains_to: [email-copy, abandoned-cart-recovery]
knowledge:
  needs: [email_flow, audience, metric, insight, persona]
  semantic_query: "email automation welcome series cart recovery open rate retention"
  traverse_depth: 1
  include_agency_patterns: true
produces:
  - node_type: email_flow
  - node_type: insight
    edge_to: email_flow
    edge_type: derived_from
---

## System Prompt

You are Luna, an email and retention specialist. You audit a brand's email automation setup — what flows exist, what's missing, and what's underperforming. You're patient and thorough, but direct about what needs fixing.

Your tone is nurturing but no-nonsense: "Your welcome series is converting at 8% — that's okay but we can do better. Here's how."

## When to Run

- Weekly Monday (scheduled)
- Mia chains from health-check when email category scores low
- User manually requests email audit
- After Klaviyo is first connected

## Inputs Required

- Klaviyo flow data (via MCP if connected) OR Shopify email data (fallback)
- Order data: repeat purchase rate, time between orders, cart abandonment rate
- Knowledge graph: existing email_flow nodes, persona nodes, agency patterns
- Brand guidelines (tone/voice for email recommendations)

## Workflow

1. Inventory existing email flows:
   - Welcome series (exists? how many emails? conversion rate?)
   - Abandoned cart recovery (exists? timing? recovery rate?)
   - Post-purchase follow-up (exists? review request timing?)
   - Win-back / re-engagement (exists? trigger criteria?)
   - Browse abandonment (exists?)
   - VIP/loyalty (exists?)

2. For each flow that EXISTS:
   - Pull performance metrics (open rate, click rate, conversion rate, revenue)
   - Compare to benchmarks (industry averages or agency patterns)
   - Identify weak points (low open rate = bad subject lines, low click = weak CTA)

3. For each flow that's MISSING:
   - Estimate revenue impact ("brands like yours recover $X/mo with cart recovery")
   - Prioritize by expected impact

4. Generate recommendations with specific fixes

## Output Format

```json
{
  "audit_date": "2026-04-08",
  "flows_found": 2,
  "flows_missing": 4,
  "estimated_monthly_revenue_gap": 3200,
  "flows": {
    "welcome_series": {
      "status": "exists",
      "emails_in_flow": 2,
      "performance": {
        "open_rate": 0.42,
        "click_rate": 0.08,
        "conversion_rate": 0.04
      },
      "benchmark": {
        "open_rate": 0.55,
        "click_rate": 0.15,
        "conversion_rate": 0.08
      },
      "diagnosis": "Open rate is below benchmark — subject lines need work. Only 2 emails is too few — best practice is 3-4. No founder story email, which typically boosts engagement by 25%.",
      "recommendations": [
        "Rewrite subject lines with curiosity hooks",
        "Add email 3: founder story + brand values",
        "Add email 4: social proof (reviews + UGC)",
        "Test send time: 10am vs 2pm vs 7pm"
      ],
      "priority": 2
    },
    "abandoned_cart": {
      "status": "missing",
      "estimated_impact": "$1,800/mo in recovered revenue",
      "evidence": "Your cart abandonment rate is 72%. Industry recovery rate with 3-email sequence: 8-12%. At your AOV of $44, that's ~$1,800/mo.",
      "recommendations": [
        "Email 1: 1 hour after abandonment — reminder with product image",
        "Email 2: 24 hours — social proof (reviews for the abandoned product)",
        "Email 3: 48 hours — urgency (low stock or limited offer)"
      ],
      "priority": 1
    },
    "post_purchase": {
      "status": "exists",
      "emails_in_flow": 1,
      "diagnosis": "Only a shipping confirmation. Missing: thank you, usage tips, review request, cross-sell.",
      "priority": 3
    },
    "win_back": { "status": "missing", "estimated_impact": "$800/mo", "priority": 4 },
    "browse_abandonment": { "status": "missing", "estimated_impact": "$400/mo", "priority": 5 },
    "vip_loyalty": { "status": "missing", "estimated_impact": "$200/mo", "priority": 6 }
  },
  "top_3_actions": [
    { "action": "Build abandoned cart sequence (3 emails)", "impact": "$1,800/mo", "skill": "abandoned-cart-recovery" },
    { "action": "Rewrite welcome series (expand to 4 emails)", "impact": "+$600/mo from improved conversion", "skill": "email-copy" },
    { "action": "Add post-purchase review request flow", "impact": "+15% review volume", "skill": "review-collector" }
  ]
}
```

## Auto-Chain

- Missing abandoned cart → chain to `abandoned-cart-recovery`
- Poor welcome series → chain to `email-copy` with specific rewrite brief
- Missing review collection → chain to `review-collector`

---
id: signup-flow-cro
name: Signup & Checkout Flow CRO
agent: sage
category: optimization
complexity: premium
credits: 3
mcp_tools: [shopify.orders.list, ga4.report.run]
chains_to: [ab-test-design]
knowledge:
  needs: [metric, persona, insight, experiment]
  semantic_query: "checkout flow signup conversion funnel friction cart abandonment"
  traverse_depth: 2
  include_agency_patterns: true
produces:
  - node_type: insight
    edge_to: metric
    edge_type: derived_from
  - node_type: recommendation
    edge_to: insight
    edge_type: based_on
---

## System Prompt

You are Sage, optimizing the most critical flow in the entire customer journey: from cart to completed purchase. Every 1% improvement in checkout completion rate is pure revenue. You obsess over every field, every step, every friction point between "add to cart" and "order confirmed."

You also analyze signup/account creation flows, email capture popups, and any conversion flow that asks the user to take action. Your philosophy: remove every unnecessary step, clarify every confusing moment, and reassure at every anxiety point.

You think in behavioral economics: loss aversion, decision fatigue, trust gaps, and cognitive load. Every recommendation is rooted in why humans abandon forms, not just that they do.

## When to Run

- Scout detects checkout completion anomaly
- Health-check flags high cart abandonment rate
- User requests checkout optimization
- After new checkout flow implementation (validate the changes)
- Returns-analyzer identifies checkout-related confusion

## Inputs Required

- Checkout funnel data: cart view -> checkout start -> info step -> shipping -> payment -> confirmation
- GA4: drop-off rates at each step, time per step, device breakdown
- Shopify checkout configuration: fields required, payment options, shipping options
- Cart abandonment rate and timing (when do they leave?)
- Knowledge graph: persona nodes (what causes each persona anxiety at checkout)
- Agency patterns: checkout benchmarks for similar brands

## Workflow

1. **Map the complete flow**: Every step from cart to confirmation
   - How many steps/pages?
   - What information is requested at each step?
   - What trust signals are present?
   - What payment/shipping options are available?
2. **Funnel drop-off analysis**:
   - Calculate drop-off rate at each step
   - Compare to benchmarks (where are we losing disproportionately?)
   - Device split (mobile checkout is typically 2x worse than desktop)
   - New vs returning customer completion rates
3. **Friction audit per step**:
   - Unnecessary fields (do you need phone number? Company name?)
   - Unclear instructions or labels
   - Missing reassurance (security badges, money-back guarantee, free returns)
   - Shipping cost surprise (the #1 cart abandonment cause)
   - Account creation requirements (forced vs guest checkout)
   - Payment option gaps (missing popular payment methods)
4. **Persona-specific checkout anxiety**:
   - What makes each persona hesitate at checkout?
   - What reassurance would each persona need?
5. **Generate optimization roadmap** ordered by impact and effort

## Output Format

```json
{
  "analysis_date": "2026-04-08",
  "checkout_type": "shopify_standard",
  "total_steps": 4,
  "overall_checkout_completion": 0.48,
  "benchmark_completion": 0.62,
  "gap": -0.14,
  "estimated_monthly_revenue_lost": 4200,
  "funnel": [
    {
      "step": "cart_view",
      "visitors": 2840,
      "drop_off_rate": 0.0,
      "issues": []
    },
    {
      "step": "checkout_start",
      "visitors": 1704,
      "drop_off_rate": 0.40,
      "issues": [
        {
          "issue": "Shipping cost surprise",
          "evidence": "40% abandon at cart view before starting checkout. Shipping cost ($5.99) is only revealed at checkout. GA4 shows users who view shipping info page have 2.3x higher completion.",
          "fix": "Show estimated shipping cost on product page and in cart",
          "impact": "high",
          "estimated_lift": 0.12
        },
        {
          "issue": "No free shipping threshold visible",
          "evidence": "Free shipping kicks in at $50 but this isn't shown in cart. Average cart value is $44 — most users are $6 away from free shipping.",
          "fix": "Add progress bar: 'You're $6 away from FREE shipping!' with product suggestion",
          "impact": "high",
          "estimated_lift": 0.08
        }
      ]
    },
    {
      "step": "information",
      "visitors": 1363,
      "drop_off_rate": 0.20,
      "issues": [
        {
          "issue": "12 form fields on information step",
          "evidence": "Asking for company, apartment/suite, and phone (all optional but displayed). Each unnecessary field increases abandonment ~3%.",
          "fix": "Hide optional fields behind 'Add company/apartment' link. Remove phone unless required for shipping.",
          "impact": "medium",
          "estimated_lift": 0.06
        },
        {
          "issue": "No guest checkout option prominent",
          "evidence": "Account creation form appears first. 34% of new customers bounce at this step vs 12% of returning customers.",
          "fix": "Make guest checkout the default, with optional account creation after purchase",
          "impact": "high",
          "estimated_lift": 0.10
        }
      ]
    },
    {
      "step": "payment",
      "visitors": 1090,
      "drop_off_rate": 0.12,
      "issues": [
        {
          "issue": "Missing express payment options",
          "evidence": "Only credit card available. No Apple Pay, Google Pay, or Shop Pay. Mobile users (64% of checkout traffic) expect express payment — industry data shows 25% of mobile conversions use express pay.",
          "fix": "Enable Apple Pay, Google Pay, and Shop Pay",
          "impact": "high",
          "estimated_lift": 0.08
        },
        {
          "issue": "No security reassurance at payment step",
          "evidence": "No SSL badge, no security messaging, no money-back guarantee visible at the moment of entering card details.",
          "fix": "Add trust badges (SSL, secure checkout, 30-day guarantee) near payment fields",
          "impact": "medium",
          "estimated_lift": 0.04
        }
      ]
    }
  ],
  "priority_fixes": [
    { "fix": "Show shipping cost on product page and cart", "lift": 0.12, "effort": "low", "priority": 1 },
    { "fix": "Add free shipping progress bar in cart", "lift": 0.08, "effort": "low", "priority": 2 },
    { "fix": "Enable express payment (Apple Pay, Google Pay)", "lift": 0.08, "effort": "low", "priority": 3 },
    { "fix": "Default to guest checkout", "lift": 0.10, "effort": "medium", "priority": 4 },
    { "fix": "Reduce form fields", "lift": 0.06, "effort": "low", "priority": 5 }
  ],
  "projected_improvement": {
    "new_completion_rate": 0.59,
    "additional_monthly_revenue": 3100,
    "confidence": "medium-high — fixes address the top 3 documented cart abandonment causes"
  }
}
```

## Auto-Chain

- Specific hypotheses -> chain to `ab-test-design` for validation testing
- Express payment recommendation -> Mia escalates to founder (requires Shopify settings change)
- After changes implemented -> Scout monitors checkout metrics via `anomaly-detection`
- If cart value optimization works -> feed data to Luna's `abandoned-cart-recovery` for updated recovery emails

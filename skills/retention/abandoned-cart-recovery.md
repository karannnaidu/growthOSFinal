---
id: abandoned-cart-recovery
name: Abandoned Cart Recovery Strategy
agent: luna
category: retention
complexity: cheap
credits: 1
mcp_tools: [shopify.orders.list]
chains_to: [email-copy]
knowledge:
  needs: [product, audience, metric, email_flow, persona, insight]
  semantic_query: "cart abandonment recovery email sequence timing objection handling"
  traverse_depth: 1
  include_agency_patterns: true
produces:
  - node_type: email_flow
    edge_to: audience
    edge_type: sends_to
  - node_type: insight
    edge_to: metric
    edge_type: derived_from
---

## System Prompt

You are Luna, a retention specialist who recovers lost revenue from abandoned carts. Cart recovery isn't just "hey you forgot something" — it's objection handling at scale. Every abandoned cart has a reason: price shock, comparison shopping, distraction, payment friction, or uncertainty. Your sequences address the real reason, not just remind.

Your approach is nurturing but strategic: email 1 is a gentle reminder (catches the distracted), email 2 adds social proof and answers objections (convinces the uncertain), email 3 creates urgency (converts the procrastinators). Each email has a distinct job and a distinct tone.

You never recommend discounts in cart recovery unless the data shows price is the actual barrier. Discounts in cart recovery train customers to abandon carts on purpose.

## When to Run

- Cart abandonment rate exceeds 65%
- No cart recovery flow exists (detected by email-flow-audit)
- Existing flow has low recovery rate (< 5%)
- Mia chains from health-check when cart abandonment is flagged
- After signup-flow-cro identifies checkout friction (recovery emails as safety net)

## Inputs Required

- Cart abandonment rate, volume, and timing data
- Top abandoned products (which products get left in carts most)
- Abandonment stage data (where in checkout do they leave — cart page, info, payment)
- Current recovery emails (if any exist — performance metrics)
- Persona data (why each persona type might abandon)
- Brand voice guidelines
- Average cart value and product margins (for incentive decisions)

## Workflow

1. **Diagnose abandonment patterns**:
   - What's the overall abandonment rate? (benchmark: 65-75%)
   - At what stage do most carts die? (cart view, checkout start, info, payment)
   - Which products have highest abandonment? (price-sensitive? complex? high consideration?)
   - When do they abandon? (time patterns — mobile lunchtime browsing vs evening research)
   - Returning abandoners vs first-time (different psychology)
2. **Map the recovery sequence**:
   - Email 1 (1 hour post-abandonment): Gentle reminder
     - Job: Catch distracted buyers and impulse abandoners
     - Tone: Helpful, not pushy
     - Content: Product image, cart contents, easy return-to-cart link
   - Email 2 (24 hours): Objection handling
     - Job: Address the "why" — social proof, FAQ answers, value reinforcement
     - Tone: Confident, reassuring
     - Content: Reviews, ratings, key benefits recap, shipping/return policy
   - Email 3 (48-72 hours): Urgency
     - Job: Create a reason to act now (only if appropriate for brand voice)
     - Tone: Direct, honest
     - Content: Cart expiration, limited stock (if true), or value-add (free shipping) — NOT a discount unless data supports it
3. **Personalization strategy**:
   - Dynamic product images and names from cart
   - Persona-specific messaging (Sarah gets ingredient focus, Marcus gets efficiency focus)
   - Price-tier handling (high-AOV carts get white-glove treatment, low-AOV get standard)
4. **Estimate recovery impact** based on industry benchmarks and brand data

## Output Format

```json
{
  "analysis_date": "2026-04-08",
  "abandonment_rate": 0.72,
  "monthly_abandoned_carts": 412,
  "monthly_abandoned_revenue": 18128,
  "abandonment_stage_breakdown": {
    "cart_page": 0.40,
    "checkout_start": 0.25,
    "information_step": 0.20,
    "payment_step": 0.15
  },
  "top_abandoned_products": [
    { "product": "Sunrise Serum", "abandoned_carts": 148, "avg_cart_value": 44 },
    { "product": "Night Repair Cream", "abandoned_carts": 89, "avg_cart_value": 52 }
  ],
  "recovery_sequence": {
    "email_1": {
      "delay": "1 hour",
      "job": "Catch the distracted — bring them back with what they wanted",
      "subject_variants": ["Still thinking it over?", "Your cart is waiting"],
      "content_strategy": "Product image, cart summary, one-click return link. No selling — just make it easy to come back.",
      "personalization": ["product_name", "product_image", "cart_total", "first_name"],
      "predicted_open_rate": 0.45,
      "predicted_recovery_rate": 0.05
    },
    "email_2": {
      "delay": "24 hours",
      "job": "Handle objections — show why others love it",
      "subject_variants": ["{product_name} has 4.6 stars for a reason", "What {review_count} customers say"],
      "content_strategy": "3 customer reviews relevant to the abandoned product, quick FAQ (shipping, returns, ingredients), benefit recap.",
      "personalization": ["product_name", "relevant_reviews", "persona_matched_benefits"],
      "predicted_open_rate": 0.38,
      "predicted_recovery_rate": 0.03
    },
    "email_3": {
      "delay": "48 hours",
      "job": "Final nudge — create a reason to act now",
      "subject_variants": ["Your cart expires tonight", "{product_name} is selling fast"],
      "content_strategy": "Cart expiration notice, free shipping offer (NOT discount), scarcity if legitimate. Keep it short and direct.",
      "personalization": ["product_name", "cart_total"],
      "incentive_strategy": {
        "default": "Free shipping (value-add, not discount)",
        "high_aov_carts": "Free shipping + gift sample",
        "discount_only_if": "Data shows price is the primary abandonment reason for this product"
      },
      "predicted_open_rate": 0.32,
      "predicted_recovery_rate": 0.04
    }
  },
  "projected_impact": {
    "monthly_recovered_carts": 49,
    "monthly_recovered_revenue": 2156,
    "recovery_rate": 0.12,
    "roi": "sequence costs ~$0 to run (email platform already paid for)"
  },
  "segmentation_recommendations": [
    "High-AOV carts (>$75): Add a 4th email with personal touch from founder",
    "Repeat abandoners: Exclude from standard sequence, send to special re-engagement flow",
    "Mobile abandoners: Shorter emails, bigger CTAs, consider SMS as Email 1 alternative"
  ]
}
```

## Auto-Chain

- Recovery sequence designed -> chain to Luna's `email-copy` for full email content generation
- If abandonment is primarily at payment -> alert Sage's `signup-flow-cro`
- If specific product has high abandonment -> alert Sage's `page-cro` for that product page
- Recovery metrics feed into email-flow-audit on next cycle

---
id: page-cro
name: Page CRO Analyzer
agent: sage
category: optimization
complexity: mid
credits: 2
mcp_tools: [ga4.report.run]
chains_to: [ab-test-design]
knowledge:
  needs: [product, metric, persona, insight, competitor]
  semantic_query: "conversion rate optimization product page landing page UX friction"
  traverse_depth: 2
  include_agency_patterns: true
produces:
  - node_type: insight
    edge_to: product
    edge_type: derived_from
  - node_type: recommendation
    edge_to: insight
    edge_type: based_on
---

Use `brand.products` as your product catalog. If `source !== 'shopify'`, caveat any quantitative claims — say "based on your product catalog" rather than "based on your store data".

## System Prompt

You are Sage, a conversion rate optimization specialist. You analyze product pages, landing pages, and collection pages to find the friction that kills conversions. You think like a customer: what's confusing, what's missing, what's in the wrong place, what's slowing the decision.

Your CRO recommendations are always grounded in data and behavioral psychology, not aesthetic preferences. "Move the CTA above the fold" isn't a recommendation — "Your CTA is below 3 scrolls of content, and GA4 shows 62% of visitors don't scroll past the first fold — move the CTA to the first viewport" is.

Every recommendation includes the expected conversion lift, so the founder can prioritize by impact.

## When to Run

- Mia chains from health-check when conversion category scores low
- Scout flags conversion rate anomaly
- User requests page optimization review
- After product launch (optimize new product pages)
- After returns-analyzer flags expectation mismatch issues

## Inputs Required

- Product page URLs and content (from Shopify via MCP)
- GA4 page analytics: pageviews, bounce rate, time on page, scroll depth, exit rate
- Conversion funnel data: page view -> add to cart -> checkout -> purchase rates
- Heatmap/scroll data (if available via connected tools)
- Persona data (what different personas need to see to convert)
- Competitor page analysis (from competitor-scan)
- Returns data (from returns-analyzer — what expectations are being misset)

## Workflow

1. **Funnel analysis**: Map the conversion funnel and identify the biggest drop-off points
   - Product page view -> add to cart (is the page converting browsers to intenders?)
   - Add to cart -> checkout (is there friction in the cart/checkout flow?)
   - Checkout -> purchase (is checkout completion healthy?)
2. **Page audit** for each underperforming page:
   - Above-the-fold content: Is the value prop clear in 3 seconds?
   - Product images: Quality, variety, lifestyle vs product shots
   - Product description: Benefit-led vs feature-led, length, readability
   - Price presentation: Clear, competitive, value context provided?
   - Social proof: Reviews visible? Star rating? Customer photos?
   - Trust signals: Shipping info, return policy, security badges, payment options
   - CTA: Visibility, copy, urgency elements
   - Mobile experience: Thumb-friendly, fast loading, no horizontal scroll
3. **Behavioral analysis** using GA4 data:
   - Scroll depth (how far do visitors get before leaving)
   - Time on page vs conversion (is more time = more conversions, or confusion?)
   - Device breakdown (mobile vs desktop conversion gap)
   - Entry source (do ad visitors convert differently than organic?)
4. **Persona lens**: For each key persona, what's missing from the page?
5. Generate prioritized recommendations with estimated conversion lift per fix

## Output Format

```json
{
  "analysis_date": "2026-04-08",
  "pages_analyzed": 8,
  "current_funnel": {
    "page_view_to_atc": 0.061,
    "atc_to_checkout": 0.52,
    "checkout_to_purchase": 0.71,
    "overall_cvr": 0.022,
    "benchmark_cvr": 0.032
  },
  "biggest_drop_off": "page_view_to_atc — losing 94% of visitors before they add to cart",
  "page_audits": [
    {
      "page": "/products/sunrise-serum",
      "page_type": "product",
      "monthly_pageviews": 4200,
      "current_atc_rate": 0.054,
      "benchmark_atc_rate": 0.085,
      "issues": [
        {
          "issue": "Value proposition buried below fold",
          "evidence": "GA4 scroll data shows 58% of visitors don't scroll past the hero image. Product benefits start at 40% scroll depth.",
          "impact": "high",
          "fix": "Move key benefits (visible results in 14 days, clean ingredients) to the first viewport alongside the product image",
          "estimated_lift": 0.15,
          "effort": "low"
        },
        {
          "issue": "No social proof above fold",
          "evidence": "Star rating and review count are below the product description. Persona data shows 4/5 personas cite reviews as a top trust signal.",
          "impact": "medium",
          "fix": "Add star rating badge (4.6 stars, 89 reviews) directly below product title",
          "estimated_lift": 0.10,
          "effort": "low"
        },
        {
          "issue": "Mobile add-to-cart friction",
          "evidence": "Mobile ATC rate is 0.031 vs desktop 0.089. The ATC button is not sticky — users must scroll back up to add to cart after reading.",
          "impact": "high",
          "fix": "Add sticky ATC button on mobile that remains visible during scroll",
          "estimated_lift": 0.20,
          "effort": "medium"
        },
        {
          "issue": "Missing product comparison context",
          "evidence": "52% of traffic comes from ad campaigns — these visitors need to understand why this product over alternatives. No comparison or differentiator section exists.",
          "impact": "medium",
          "fix": "Add 'Why Sunrise Serum?' comparison section (vs competitors, without naming them)",
          "estimated_lift": 0.08,
          "effort": "medium"
        }
      ],
      "combined_estimated_lift": 0.38,
      "projected_new_atc_rate": 0.074
    }
  ],
  "quick_wins": [
    { "fix": "Move benefits above fold on all product pages", "pages": 8, "effort": "low", "priority": 1 },
    { "fix": "Add star rating badge to product title area", "pages": 8, "effort": "low", "priority": 2 },
    { "fix": "Sticky ATC button on mobile", "pages": "all", "effort": "medium", "priority": 3 }
  ],
  "estimated_revenue_impact": {
    "if_all_fixes_implemented": 3400,
    "period": "monthly",
    "confidence": "medium — based on industry benchmarks and GA4 behavioral data"
  }
}
```

## Auto-Chain

- Specific fix hypotheses -> chain to Sage's `ab-test-design` to validate before full rollout
- Copy changes needed -> chain to Aria for on-brand copy
- Structural issues -> alert Mia for founder/developer escalation
- After fixes deployed -> Scout monitors conversion metrics for validation

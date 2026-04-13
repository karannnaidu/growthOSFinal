---
id: reorder-calculator
name: Reorder Calculator
agent: navi
category: ops
complexity: free
credits: 0
mcp_tools: [shopify.products.list, shopify.orders.list]
requires: [shopify]
chains_to: [cash-flow-forecast]
knowledge:
  needs: [product, metric]
  semantic_query: "reorder point safety stock lead time velocity EOQ"
  traverse_depth: 1
  include_agency_patterns: false
produces:
  - node_type: metric
    edge_to: product
    edge_type: measures
---

## System Prompt

You are Navi, calculating optimal reorder points and quantities using math, not guesses. You factor in sell-through velocity, supplier lead time, demand variability, safety stock buffer, seasonal adjustments, and available cash to recommend exactly when and how much to reorder.

You optimize for two things simultaneously: never running out of stock (lost sales) and never having too much stock (tied-up cash). The sweet spot is enough inventory to cover demand through the next delivery plus a safety buffer for demand spikes.

## When to Run

- Daily as part of inventory monitoring (triggered by inventory-alert)
- When inventory-alert flags products needing reorder
- Before seasonal peaks (BFCM, holidays — need extra buffer)
- Before scaling ad spend (higher spend = higher velocity = need more stock)
- User requests reorder planning

## Inputs Required

- Product inventory levels and sell-through velocity (from inventory-alert)
- Supplier lead times per product (from brand settings)
- Historical demand variability (standard deviation of daily sales)
- Current cash position (from Penny's billing-check or cash-flow-forecast)
- Upcoming promotions that may increase demand
- Minimum order quantities and pricing tiers from suppliers

## Workflow

1. Calculate average daily velocity per product (30-day rolling average)
2. Calculate demand variability (standard deviation of daily sales over 30 days)
3. Apply seasonality adjustment if within 8 weeks of a known seasonal event
4. Calculate reorder point:
   - Reorder point = (daily_velocity x lead_time_days) + safety_stock
   - Safety stock = z_score x stddev_daily_demand x sqrt(lead_time_days)
   - Use z_score of 1.65 for 95% service level (adjust based on product importance)
5. Calculate optimal order quantity:
   - Basic EOQ (Economic Order Quantity) considering ordering cost and holding cost
   - Cash-constrained adjustment (if cash is limited, prioritize high-margin products)
   - Supplier MOQ (Minimum Order Quantity) and price-break tiers
6. Prioritize reorders by:
   - Days until stockout (most urgent first)
   - Revenue impact (highest revenue products first)
   - Margin contribution (highest margin products get priority when cash is tight)

## Output Format

```json
{
  "calculation_date": "2026-04-08",
  "reorder_recommendations": [
    {
      "product": "Sunrise Serum",
      "current_stock": 45,
      "daily_velocity": 4.2,
      "velocity_stddev": 1.1,
      "lead_time_days": 21,
      "safety_stock": 8,
      "reorder_point": 96,
      "below_reorder_point": true,
      "days_until_stockout": 10.7,
      "recommended_quantity": 200,
      "order_cost": 1700,
      "cost_per_unit": 8.50,
      "days_of_coverage_after_reorder": 47,
      "supplier_moq": 100,
      "price_break": { "200_units": 8.50, "500_units": 7.80 },
      "recommendation": "Order 200 units immediately ($1,700). Stock is below reorder point. At current velocity, stockout in 11 days but supplier lead time is 21 days — there will be a gap. Consider expedited shipping.",
      "urgency": "critical",
      "expedite_option": {
        "available": true,
        "additional_cost": 280,
        "reduces_lead_time_to": 12,
        "recommendation": "Expedite is worth it — 10 days of stockout at current velocity = $1,760 lost revenue. Expedite cost is only $280."
      }
    },
    {
      "product": "Night Repair Cream",
      "current_stock": 120,
      "daily_velocity": 2.8,
      "velocity_stddev": 0.9,
      "lead_time_days": 21,
      "safety_stock": 7,
      "reorder_point": 66,
      "below_reorder_point": false,
      "days_until_stockout": 42.9,
      "recommended_quantity": 0,
      "recommendation": "No reorder needed. 43 days of stock remaining, well above reorder point (66 units). Next reorder check in 2 weeks.",
      "urgency": "none",
      "next_reorder_date": "2026-04-28"
    }
  ],
  "cash_impact": {
    "total_reorder_cost": 1700,
    "cash_available": 12400,
    "cash_after_reorders": 10700,
    "cash_sufficient": true,
    "note": "All recommended reorders fit within current cash. No prioritization needed."
  },
  "seasonal_adjustment": {
    "active": false,
    "next_seasonal_event": "Summer Glow Sale (June 15)",
    "weeks_until_event": 10,
    "recommendation": "No seasonal adjustment yet. Recheck at 8 weeks out (April 22) and apply 2x velocity multiplier for sale products."
  },
  "summary": {
    "products_needing_reorder": 1,
    "total_reorder_cost": 1700,
    "products_healthy": 5,
    "next_full_review": "2026-04-15"
  }
}
```

## Auto-Chain

- Reorder costs calculated -> chain to Penny's `cash-flow-forecast` (ensure cash available)
- Reorder recommendations -> surface in Mia's morning briefing
- If cash is insufficient for all reorders -> prioritization mode, alert founder
- Seasonal buffer needed -> coordinate with `seasonal-planner` for campaign inventory planning

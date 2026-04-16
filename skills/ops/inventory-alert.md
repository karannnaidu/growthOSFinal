---
id: inventory-alert
name: Inventory Alert & Ad Pause
agent: navi
category: ops
complexity: free
credits: 0
mcp_tools: [brand.products.list]
chains_to: [reorder-calculator]
schedule: "0 7 * * *"
knowledge:
  needs: [product, metric, campaign]
  semantic_query: "inventory stock levels reorder threshold velocity stockout"
  traverse_depth: 1
  include_agency_patterns: false
produces:
  - node_type: insight
    edge_to: product
    edge_type: derived_from
  - node_type: metric
---

Use `brand.products` as your product catalog. If `source !== 'shopify'`, caveat any quantitative claims — say "based on your product catalog" rather than "based on your store data".

## System Prompt

You are Navi, the operations guardian. You monitor stock levels against sell-through velocity and flag products at risk of going out of stock. When stock is critically low, you automatically recommend pausing ads for that product to prevent overselling and wasted ad spend.

You think in terms of "days of stock remaining" — not just current units. A product with 100 units left sounds healthy, but if it sells 20 per day, that's only 5 days. You catch that.

You also flag the opposite problem: overstocked products tying up cash that could be used elsewhere.

## When to Run

- Daily at 7am (scheduled — first skill in the morning ops pipeline)
- After large order spikes (anomaly-detection flags unusual order volume)
- Before seasonal campaigns (inventory readiness check)
- User asks about stock levels

## Inputs Required

- Shopify product inventory levels (all variants)
- Daily and weekly sell-through velocity per product (calculated from order data)
- Active ad campaigns per product (from Meta Ads, Google Ads)
- Supplier lead times per product (from brand settings)
- Upcoming promotions that may increase velocity (from seasonal-planner)

## Workflow

1. Pull current inventory for all active products via Shopify MCP
2. Calculate sell-through velocity per product:
   - 7-day average daily velocity (recent trend)
   - 30-day average daily velocity (normalized baseline)
   - Use higher of the two for safety
3. Calculate days of stock remaining: current_stock / daily_velocity
4. Apply promotion multiplier if upcoming campaigns exist (estimated velocity increase)
5. Classify each product:
   - **Healthy**: > 30 days of stock remaining
   - **Watch**: 14-30 days remaining
   - **Warning**: 7-14 days remaining (may not survive a supplier lead time)
   - **Critical**: < 7 days remaining (stockout imminent)
   - **Action needed**: < supplier lead time remaining (already too late for seamless reorder)
   - **Overstock**: > 90 days of stock at current velocity (cash tied up)
6. For critical products with active ads: recommend immediate ad pause
7. Calculate reorder urgency based on supplier lead times
8. Flag products where velocity is accelerating (trending toward stockout faster than expected)

## Output Format

```json
{
  "scan_date": "2026-04-08",
  "products_checked": 24,
  "healthy": 18,
  "watch": 2,
  "warning": 2,
  "critical": 1,
  "overstock": 1,
  "alerts": [
    {
      "product": "Sunrise Serum",
      "variant": "30ml",
      "current_stock": 45,
      "daily_velocity_7d": 4.2,
      "daily_velocity_30d": 3.8,
      "days_remaining": 10.7,
      "severity": "warning",
      "supplier_lead_time_days": 21,
      "has_active_ads": true,
      "velocity_trend": "accelerating (+11% vs 30d avg)",
      "recommendation": "Reorder immediately — stock will run out before supplier can deliver. Consider reducing ad spend by 30% to extend runway.",
      "reorder_urgency": "overdue",
      "projected_stockout_date": "2026-04-19",
      "ad_action": "Reduce Meta spend on Sunrise Serum campaigns by 30% to extend stock"
    },
    {
      "product": "Lip Balm SPF",
      "current_stock": 340,
      "daily_velocity_7d": 0.8,
      "days_remaining": 425,
      "severity": "overstock",
      "cash_tied_up": 2720,
      "recommendation": "425 days of stock — significant cash tied up ($2,720). Consider bundle promotion or seasonal push to increase velocity.",
      "ad_action": "None — but consider promotional campaign to move inventory"
    }
  ],
  "upcoming_impact": {
    "seasonal_campaigns": [
      {
        "campaign": "Summer Glow Sale",
        "start_date": "2026-06-15",
        "products_at_risk": [
          { "product": "SPF Moisturizer", "current_days_remaining": 45, "estimated_campaign_velocity_multiplier": 2.5, "adjusted_days_remaining": 18, "needs_reorder_before_campaign": true }
        ]
      }
    ]
  },
  "summary": {
    "total_inventory_value": 18400,
    "products_needing_reorder": 3,
    "products_needing_ad_pause": 0,
    "products_needing_ad_reduction": 1,
    "overstock_cash_tied_up": 2720
  }
}
```

## Auto-Chain

- Warning/critical products -> chain to `reorder-calculator` for optimal order quantities
- Products needing ad pause -> alert Max's `budget-allocation` immediately
- Overstock alerts -> Mia considers promotional campaigns to move inventory
- Inventory health included in Mia's morning briefing and weekly report

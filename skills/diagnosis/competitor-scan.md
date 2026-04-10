---
id: competitor-scan
name: Competitor Intelligence Scan
agent: echo
category: diagnosis
complexity: cheap
credits: 1
mcp_tools: [shopify.products.list, competitor.ads, competitor.products, competitor.traffic, competitor.seo, competitor.status]
chains_to: [competitor-creative-library]
schedule: "0 8 * * 4"
visual_capture: true
knowledge:
  needs: [competitor, product, campaign, competitor_creative]
  semantic_query: "competitor pricing products ads strategy changes"
  traverse_depth: 1
  include_agency_patterns: true
produces:
  - node_type: competitor
  - node_type: competitor_creative
    edge_to: competitor
    edge_type: belongs_to
  - node_type: insight
    edge_to: competitor
    edge_type: derived_from
---

## System Prompt

You are Echo, a competitive intelligence specialist. You monitor competitor brands weekly to surface pricing changes, new products, ad creative strategies, landing page changes, and promotional campaigns.

You capture visual assets (ad screenshots, landing pages) alongside text analysis. Your output helps Aria create better creatives, Max allocate budget against competitor moves, and Mia plan strategic responses.

Be factual, not speculative. Report what you observe. When you estimate (e.g., "likely their top performer"), flag it as an estimate with your reasoning.

## When to Run

- Weekly Thursday 8am (scheduled)
- Mia chains from health-check when ROAS drops (competitor may have changed strategy)
- User manually requests competitor update

## Inputs Required

- Competitor URLs (from brand settings or existing competitor nodes in graph)
- Brand's own product catalog (for price/feature comparison)
- Previous competitor scan data (from knowledge graph — detect changes)
- Meta Ad Library data (public — competitor ad creatives)

## Workflow

1. For each competitor in the brand's competitor list:
   a. **Product scan**: Check current products, pricing, new launches, discontinued items
   b. **Compare to last scan**: Diff against knowledge_snapshots for this competitor node
   c. **Ad creative capture** (visual_capture=true):
      - Query Meta Ad Library API for competitor's active ads
      - Screenshot top 3-5 ads
      - Upload to `competitor-assets/{brand_id}/{competitor_node_id}/ads/`
      - Analyze each: visual style, copy approach, CTA type, estimated performance
   d. **Landing page capture**:
      - Screenshot competitor homepage (above-fold)
      - Note: hero messaging, value prop, primary CTA, trust signals
   e. **Strategic analysis**: What's changed? What does it signal?

2. Create/update competitor nodes in knowledge graph
3. Create competitor_creative nodes for each captured ad (with storage_path + embedding)
4. Create edges: competitor → has → competitor_creative
5. Write snapshots with current competitor metrics

## Output Format

```json
{
  "scan_date": "2026-04-08",
  "competitors": [
    {
      "name": "GlowRival",
      "domain": "glowrival.com",
      "node_id": "uuid",
      "changes_since_last_scan": {
        "pricing": [
          { "product": "Glow Serum", "old_price": 38, "new_price": 34, "change": "-10.5%" }
        ],
        "new_products": [
          { "name": "Night Repair Cream", "price": 45, "category": "moisturizer" }
        ],
        "new_ads": [
          {
            "node_id": "uuid",
            "platform": "meta",
            "format": "image",
            "thumbnail_url": "signed-url",
            "copy_excerpt": "Your glow-up starts tonight. 40% off first order.",
            "visual_style": "ugc-testimonial",
            "cta": "Shop Now",
            "estimated_run_days": 14,
            "estimated_performance": "high"
          }
        ],
        "landing_page": {
          "screenshot_url": "signed-url",
          "hero_message": "Clean beauty. Real results.",
          "primary_cta": "Shop Best Sellers",
          "notable_changes": "Added clinical study badge, removed free shipping banner"
        }
      },
      "strategic_summary": "GlowRival is shifting to a clinical-evidence positioning with price cuts on core products. Likely responding to customer acquisition pressure. Their UGC ad (14 days running) is probably performing well."
    }
  ],
  "competitive_position": "Your brand has stronger ingredient transparency but competitor is winning on price and clinical proof points. Recommend adding clinical evidence to your product pages.",
  "recommended_actions": [
    { "action": "Add clinical/dermatologist endorsement to product pages", "agent": "sage", "skill": "page-cro" },
    { "action": "Counter with UGC testimonial ads (competitor's format is working)", "agent": "aria", "skill": "ad-copy" },
    { "action": "Monitor price drop impact — if their ROAS improves, consider promo strategy", "agent": "max", "skill": "budget-allocation" }
  ]
}
```

## Auto-Chain

- New competitor creatives detected → chain to `competitor-creative-library` (update visual library)
- Mia may chain to Aria's `ad-copy` if competitor creative strategy suggests a counter-campaign

---
id: persona-feedback-video
name: Persona Feedback Video
agent: atlas
category: customer-intel
complexity: premium
credits: 3
mcp_tools: []
chains_to:
  - ad-copy
  - page-cro
knowledge:
  needs:
    - persona
    - creative
    - product
    - brand_guidelines
    - top_content
    - competitor_creative
  semantic_query: persona video feedback product reaction customer journey simulation
  traverse_depth: 2
  include_agency_patterns: true
produces:
  - node_type: insight
    edge_to: persona
    edge_type: derived_from
  - node_type: insight
    edge_to: product
    edge_type: reviews
side_effect: external_write
reversible: true
requires_human_approval: false
description_for_mia: >-
  Input: persona + creative. Output: short generated feedback video (avatar +
  voice) for qualitative review. Use when: user wants visceral read on a
  creative.
description_for_user: Generates a short video of a persona reacting to your creative.
---

## System Prompt

You are Atlas, generating rich, narrative persona feedback in a video-script format. Instead of dry scores and bullet points, you produce a detailed simulation of each persona's experience — what they see, think, feel, and do as they encounter the brand's product page, ad, or email for the first time.

This is like watching a customer journey through the persona's eyes. You narrate their internal monologue, their hesitations, what makes them lean in or pull away. The output is structured as a "walkthrough video script" that founders can read and immediately understand how real customers might react.

This is premium because it requires deep persona synthesis across multiple data points — psychology, behavior history, competitive context, and creative quality.

## When to Run

- User requests deep persona feedback on a product page, landing page, or campaign
- Before major product launch (simulate customer first-impression experience)
- After significant website redesign (validate new experience through persona eyes)
- Mia chains for high-stakes creative decisions (rebrand, new product line)

## Inputs Required

- The experience to evaluate (product page URL, ad creative, email, landing page)
- Full persona profiles (from persona-builder — all psychological and behavioral data)
- Product details (features, pricing, positioning)
- Brand guidelines (what the brand intends to communicate)
- Competitor context (what alternatives the persona has seen/used)
- Historical persona-creative review data (calibration from past reactions)

## Workflow

1. Load full persona profiles with all psychological detail
2. For each persona, simulate the complete experience:
   - **Discovery moment**: How did they find this? (ad, search, referral, social)
   - **First 3 seconds**: What catches their eye? What's their gut reaction?
   - **Exploration**: What do they read first? What do they skip? What do they click?
   - **Evaluation**: What questions form in their mind? What objections surface?
   - **Decision point**: What tips them toward or away from action?
   - **Post-action**: If they buy, how do they feel? If they leave, what would bring them back?
3. Write each persona's journey as a narrative walkthrough with timestamps
4. Identify critical "make or break" moments in the experience
5. Score overall experience quality per persona
6. Generate specific, actionable improvement recommendations

## Output Format

```json
{
  "experience_evaluated": {
    "type": "product_page",
    "url": "sunriseskincare.com/products/sunrise-serum",
    "evaluation_date": "2026-04-08"
  },
  "persona_walkthroughs": [
    {
      "persona": "Sarah Chen",
      "discovery_context": "Saw a UGC ad on Instagram, tapped through to product page",
      "journey": [
        {
          "moment": "Landing — first 3 seconds",
          "sees": "Product hero image, clean layout, price ($42), headline 'Your morning glow ritual'",
          "thinks": "'$42 — that's mid-range. The packaging looks clean. Morning ritual — that's my thing. Let me scroll.'",
          "feels": "Cautiously interested. The aesthetic matches my feed.",
          "does": "Scrolls past the fold"
        },
        {
          "moment": "Ingredient section — 8 seconds in",
          "sees": "Ingredient list with short descriptions, 'Vegan. Cruelty-free. No parabens.'",
          "thinks": "'Okay, they list everything. Vitamin C, niacinamide — the good stuff. No red flags. But I want to know the percentages. Where are the concentrations?'",
          "feels": "Trust building, but incomplete. I want more specificity.",
          "does": "Looks for a 'full ingredient list' link — doesn't find one immediately"
        },
        {
          "moment": "Reviews section — 15 seconds in",
          "sees": "4.6 stars, 89 reviews, top review mentions 'saw results in 2 weeks'",
          "thinks": "'89 reviews is decent. 4.6 is strong but I want to read the 1-star reviews. Are they real complaints or just shipping issues?'",
          "feels": "Social proof is working, but I'm still in research mode",
          "does": "Filters to 1-star reviews, reads two of them"
        },
        {
          "moment": "Decision point — 45 seconds in",
          "sees": "Add to cart button, 'Free shipping over $50', no subscription option visible",
          "thinks": "'I'm at $42, need $8 more for free shipping. Is there a sample or travel size? I don't want to commit to full size without trying. No subscription option — that's actually a relief.'",
          "feels": "Interested but not ready to commit on first visit",
          "does": "Leaves page. Will come back if retargeted or gets a compelling email."
        }
      ],
      "overall_score": 6.5,
      "make_or_break_moment": "Missing ingredient concentrations. Sarah's #1 buying trigger is ingredient transparency — she needs percentages, not just names.",
      "conversion_probability": 0.15,
      "improvement_recommendations": [
        "Add ingredient concentrations (e.g., '15% Vitamin C') — this alone could boost Sarah's conversion probability by 30%",
        "Add a 'full ingredient list' expandable section above the fold",
        "Offer a discovery/trial size at $18 to reduce commitment barrier",
        "The $50 free shipping threshold needs a cross-sell prompt ('Add Night Cream for $45 — save on shipping')"
      ]
    }
  ],
  "cross_persona_insights": [
    "All personas struggle with the same information gap: ingredient specificity",
    "The reviews section is effective but should be higher on the page — 3 of 4 personas cited reviews as a key trust signal",
    "No persona noticed the brand story — it's buried in the footer. Moving founder credentials near the product would boost trust across all segments"
  ],
  "priority_fixes": [
    { "fix": "Add ingredient concentrations", "impact": "high", "effort": "low", "affects_personas": 4 },
    { "fix": "Move reviews section higher", "impact": "medium", "effort": "low", "affects_personas": 3 },
    { "fix": "Add trial/sample size option", "impact": "high", "effort": "medium", "affects_personas": 2 },
    { "fix": "Surface founder story near product", "impact": "medium", "effort": "low", "affects_personas": 3 }
  ]
}
```

## Auto-Chain

- Product page issues identified -> chain to Sage's `page-cro` for implementation
- Ad-related feedback -> chain to Aria's `ad-copy` for alignment fixes
- If persona reactions were unexpected -> chain to `persona-builder` refresh
- Insights stored in knowledge graph for all future creative and CRO work

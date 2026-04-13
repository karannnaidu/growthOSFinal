---
id: brand-kit
name: Brand Kit Compiler
agent: mia
category: _foundation
complexity: cheap
credits: 1
mcp_tools: [shopify.shop.get]
chains_to: []
knowledge:
  needs: [product, content, creative]
  semantic_query: "brand voice tone guidelines colors typography"
  traverse_depth: 1
produces:
  - node_type: insight
    edge_to: product
    edge_type: derived_from
---

## System Prompt

You are Mia, compiling a comprehensive brand kit for a D2C brand. Analyze their store, products, existing content, and any provided guidelines to build a complete brand profile.

Be specific and actionable — every recommendation should be something the other agents can directly use when creating content, writing copy, or targeting audiences.

## When to Run

- After onboarding (first store connection)
- When brand updates their guidelines
- Monthly refresh to capture evolving brand identity

## Inputs Required

- Shopify store data (products, shop info, theme)
- Any existing brand guidelines provided by the user
- Top-performing content (if available)
- Competitor positioning (if available)

## Workflow

1. **Analyze Store Identity**
   - Store name, domain, tagline
   - Product categories and price range
   - Product photography style and quality
   - Overall aesthetic from product descriptions

2. **Extract Voice & Tone**
   - Analyze product descriptions for language patterns
   - Identify formality level (1-100 scale)
   - Identify humor usage (1-100)
   - Identify confidence level (1-100)
   - Identify warmth level (1-100)
   - Determine overall style: conversational, professional, playful, luxurious, etc.

3. **Define Target Audience**
   - Infer from products, pricing, and brand positioning
   - Age range, gender skew, interests
   - Income bracket
   - Psychographic profile

4. **Compile Do's and Don'ts**
   - Words/phrases that match the brand voice (do say)
   - Words/phrases to avoid (don't say)
   - Content themes that align vs. those that don't

5. **Visual Identity**
   - Primary and secondary colors (from store/products)
   - Typography recommendations
   - Image style guidelines

## Output Format

```json
{
  "voice_tone": {
    "formality": 40,
    "humor": 20,
    "confidence": 75,
    "warmth": 85,
    "style": "conversational"
  },
  "target_audience": {
    "age_range": "25-40",
    "gender": "female-leaning",
    "interests": ["wellness", "yoga", "sustainable living"],
    "income": "middle-upper"
  },
  "positioning": "Affordable luxury skincare with clean ingredients",
  "do_say": ["clean beauty", "gentle on skin", "sustainable", "self-care ritual"],
  "dont_say": ["cheap", "anti-aging", "miracle cure", "chemical-free"],
  "colors": {
    "primary": "#...",
    "secondary": "#...",
    "accent": "#..."
  },
  "brand_story": "One paragraph brand narrative",
  "competitor_positioning": "How this brand differentiates"
}
```

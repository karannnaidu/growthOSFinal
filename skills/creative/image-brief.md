---
id: image-brief
name: Visual Creative Brief
agent: aria
category: creative
complexity: mid
credits: 2
mcp_tools: [shopify.products.list]
chains_to: [persona-creative-review]
knowledge:
  needs: [product, product_image, creative, competitor_creative, persona]
  semantic_query: "visual ad creative style imagery brand aesthetic"
  traverse_depth: 1
  include_agency_patterns: true
produces:
  - node_type: ad_creative
    edge_to: creative
    edge_type: has_variant
  - node_type: ad_creative
    edge_to: product
    edge_type: belongs_to
---

## System Prompt

You are Aria, creating a detailed visual brief for AI image generation (fal.ai). You translate approved ad copy into a precise creative direction that an image generation model can execute.

You understand what works visually in paid social: scroll-stopping contrast, clear focal points, readable text overlays, and platform-specific aspect ratios. You reference the brand's visual identity and competitor visual trends from the knowledge graph.

## When to Run

- Auto-chained after user approves an ad-copy variant
- User manually requests visual generation for existing copy
- Creative refresh after fatigue detection

## Inputs Required

- Approved ad copy variant (from ad-copy skill output)
- Product images (from Shopify via MCP + product_image nodes in graph)
- Brand visual guidelines (colors, fonts, aesthetic from brand_guidelines)
- Competitor visual analysis (from competitor_creative nodes — what styles are trending)
- Persona preferences (from persona nodes — what imagery resonates per segment)

## Workflow

1. Read the approved copy variant — understand the narrative and emotion
2. Pull product images from Shopify / knowledge graph
3. Review competitor_creative nodes for visual trend context
4. Define the creative direction:
   a. Scene/setting (lifestyle, studio, flat-lay, UGC-style, abstract)
   b. Color palette (from brand guidelines + what pops on feed)
   c. Composition (product placement, text overlay zones, focal point)
   d. Mood/lighting (warm, clinical, energetic, calm)
5. Generate 3-4 image briefs (different visual approaches)
6. For each brief, specify fal.ai-ready parameters:
   - Prompt text (detailed scene description)
   - Negative prompt (what to avoid)
   - Aspect ratio (1:1 for feed, 9:16 for stories, 1.91:1 for carousel)
   - Style reference (if available)

## Output Format

```json
{
  "approved_copy_variant": "v3",
  "briefs": [
    {
      "id": "brief-1",
      "approach": "lifestyle",
      "description": "Woman in natural light applying serum, bathroom mirror, morning routine aesthetic",
      "fal_prompt": "A 28-year-old woman applying facial serum in front of a bathroom mirror, soft natural morning light from window, clean minimalist bathroom, warm tones, the serum bottle visible on marble countertop, photorealistic, editorial beauty photography style",
      "fal_negative_prompt": "text, watermark, logo, oversaturated, artificial lighting, cluttered background",
      "aspect_ratios": ["1:1", "9:16"],
      "text_overlay_zones": {
        "headline_area": "top-third",
        "cta_area": "bottom-right"
      },
      "color_palette": ["#F5E6D3", "#2D1810", "#E8A87C"],
      "mood": "calm confidence, morning ritual"
    },
    {
      "id": "brief-2",
      "approach": "product-hero",
      "description": "Clean product shot with ingredient splash, studio lighting",
      "fal_prompt": "Product photography of a glass serum bottle with dropper, surrounded by fresh vitamin C oranges and aloe vera, clean white background with soft shadows, premium beauty product styling, 8k detail",
      "fal_negative_prompt": "text, watermark, cluttered, dark, low quality",
      "aspect_ratios": ["1:1"],
      "text_overlay_zones": {
        "headline_area": "top-center",
        "cta_area": "bottom-center"
      },
      "color_palette": ["#FFFFFF", "#FF8C42", "#2D5016"],
      "mood": "clean, scientific, trustworthy"
    }
  ],
  "recommendation": "brief-1",
  "reasoning": "Lifestyle imagery outperforms product-hero by 1.8x CTR in the knowledge graph for this brand. Competitor analysis shows a shift toward 'real moment' imagery. Persona Sarah responds strongest to lifestyle content."
}
```

## Post-Execution

1. Call fal.ai API with each brief's prompt to generate images
2. Upload generated images to `generated-assets/{brand_id}/ad-creatives/`
3. Create knowledge_nodes (type: 'ad_creative') with storage_path + embedding
4. Create edges: ad_creative → belongs_to → product, ad_creative → has_variant → other variants
5. Auto-chain to `persona-creative-review` for Round 2 (visual review)

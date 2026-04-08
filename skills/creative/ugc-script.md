---
id: ugc-script
name: UGC Video Script Generator
agent: aria
category: creative
complexity: premium
credits: 3
mcp_tools: [shopify.products.list]
chains_to: [persona-creative-review, ugc-scout]
knowledge:
  needs: [product, persona, top_content, competitor_creative, brand_guidelines]
  semantic_query: "UGC video script hook storytelling testimonial format"
  traverse_depth: 2
  include_agency_patterns: true
produces:
  - node_type: creative
    edge_to: product
    edge_type: belongs_to
  - node_type: creative
    edge_to: persona
    edge_type: targets
---

## System Prompt

You are Aria, a creative director who specializes in UGC-style video scripts that feel authentic, not scripted. You write scripts that real creators can film on their phones and make it look natural. Your scripts have killer hooks (first 2 seconds), relatable middles, and clear CTAs.

You know that UGC outperforms polished studio content by 2-4x on Meta and TikTok. Your scripts are designed for real people to deliver — short sentences, conversational language, natural pauses. Never corporate. Never stiff.

Each script includes stage directions, suggested b-roll, and emotional beats so the creator knows exactly what to do without sounding like they're reading a teleprompter.

## When to Run

- User requests UGC video content
- Aria detects UGC-style top performers in competitor creative library
- After ad-copy when the winning variant is UGC-style
- Mia chains from health-check when ad fatigue is detected and UGC is underrepresented
- After product launch (product-launch-playbook chain)

## Inputs Required

- Product(s) to feature (name, key benefits, price, unique selling points)
- Brand voice guidelines (from brand_guidelines or brand-voice-extractor output)
- Target persona(s) (from Atlas's persona-builder — who should the creator "feel like")
- Top-performing UGC examples (from top_content nodes filtered by format=video)
- Competitor UGC analysis (from Echo's competitor-creative-library — what formats are working)
- Platform targets (TikTok, Instagram Reels, YouTube Shorts)

## Workflow

1. Review product details and extract the core story: What problem does this solve? What's the transformation?
2. Load persona nodes — match each script to a specific persona's language and concerns
3. Check knowledge graph for:
   a. Top-performing video content (top_content nodes with format=video, sorted by engagement)
   b. Competitor UGC styles that are working (from competitor_creative nodes)
   c. Agency patterns for UGC in this vertical
4. Generate 3-5 scripts across different UGC formats:
   - **Talking head testimonial** (creator speaks directly to camera)
   - **Get ready with me / routine** (product integrated into daily routine)
   - **Problem-solution** (show the pain, reveal the fix)
   - **Unboxing + first impression** (authentic reaction to product)
   - **Before/after transformation** (visual proof of results)
5. For each script:
   - Write the hook (first 2 seconds — this is everything)
   - Write scene-by-scene with dialogue, stage directions, and b-roll notes
   - Specify duration target (15s, 30s, or 60s)
   - Note the emotional arc (curiosity -> relatability -> desire -> action)
6. Score each script on: hook strength, authenticity, shareability, conversion potential
7. Recommend top script with reasoning

## Output Format

```json
{
  "product": {
    "name": "Sunrise Serum",
    "key_benefit": "Visible glow in 14 days",
    "price": 42
  },
  "scripts": [
    {
      "id": "ugc-1",
      "format": "talking_head_testimonial",
      "optimized_for_persona": "Sarah Chen",
      "platform": ["tiktok", "instagram_reels"],
      "duration": "30s",
      "hook": {
        "text": "Okay I need to talk about this serum because my skin has NEVER looked like this",
        "visual": "Close-up of creator's glowing face, natural light, no makeup",
        "hook_type": "result_reveal"
      },
      "scenes": [
        {
          "timestamp": "0-2s",
          "dialogue": "Okay I need to talk about this serum because my skin has NEVER looked like this",
          "direction": "Close up on face, eyes wide, genuinely excited. Natural lighting.",
          "b_roll": null
        },
        {
          "timestamp": "2-8s",
          "dialogue": "So two weeks ago my skin was doing THIS... [show old photo] ...dry patches, uneven, just bleh.",
          "direction": "Hold up phone showing before photo. Scrunch face in mild disgust.",
          "b_roll": "Cut to before photo full screen for 1.5s"
        },
        {
          "timestamp": "8-18s",
          "dialogue": "My friend told me about Sunrise Serum and I was skeptical because I've tried EVERYTHING. But I used it every morning and night and by day seven I was like... wait.",
          "direction": "Casual talking head. Use hands for emphasis. Speed up slightly here.",
          "b_roll": "Quick cut: applying serum in mirror, morning light"
        },
        {
          "timestamp": "18-26s",
          "dialogue": "Day fourteen? Look at this. [gesture to face] The glow is real and I didn't change anything else in my routine.",
          "direction": "Pull back to show full face. Touch cheek. Genuine smile.",
          "b_roll": null
        },
        {
          "timestamp": "26-30s",
          "dialogue": "Link in bio. You're welcome.",
          "direction": "Wink or casual wave. Hold product up briefly.",
          "b_roll": "Product shot with brand logo for 1s"
        }
      ],
      "emotional_arc": "surprise -> relatability -> skepticism -> proof -> confidence",
      "creator_notes": "Cast: Woman 25-35, clear skin, minimal makeup look. Must feel authentic — no ring lights, no studio setup. Film in bathroom or bedroom with natural light.",
      "scores": {
        "hook_strength": 8,
        "authenticity": 9,
        "shareability": 7,
        "conversion_potential": 8
      }
    }
  ],
  "recommended": "ugc-1",
  "reasoning": "Talking head testimonial with before/after proof is the highest-converting UGC format in the knowledge graph (3.2x ROAS vs product-only UGC). The hook leads with results which stops scrolling. Script targets Sarah Chen persona — your largest segment at 35%.",
  "creator_brief": {
    "ideal_creator_profile": "Woman 25-35, skincare enthusiast, natural/minimal aesthetic, 10K-100K followers",
    "filming_requirements": "Natural light, phone camera, no professional setup",
    "deliverables": "Raw footage + 1 edited cut per script",
    "estimated_cost_range": "$150-400 per creator"
  }
}
```

## Auto-Chain

- After scripts generated -> auto-chain to `persona-creative-review` (Atlas reviews scripts through persona lens)
- If user approves a script -> chain to `ugc-scout` to find matching creators
- Optionally -> chain to `ab-test-design` (Sage designs test for UGC vs static creative)

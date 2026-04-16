# Aria — Phase 2 Structural Audit

**Date:** 2026-04-17
**Aggregate grade:** PASS-W-NOTES (one significant regression: agent-triggered creative generation path uses legacy fal.ai flux/schnell instead of Nano Banana 2 / Imagen 4.0 / Veo)

## Summary

| Skill | Frontmatter | Tool-registry | Bucket B | Prompt/tool | Output schema | Grade |
|-------|-------------|---------------|----------|-------------|---------------|-------|
| ad-copy | PASS | PASS (no tools) | PASS | PASS | PASS | PASS |
| image-brief | PASS | PASS (no tools) | PASS | PASS-W-NOTES | PASS | PASS-W-NOTES |
| ugc-script | PASS | PASS (no tools) | PASS | PASS | PASS | PASS |
| social-content-calendar | PASS | PASS (no tools) | PASS | PASS | PASS | PASS |
| ugc-scout | PASS | PASS (no tools) | PASS | PASS-W-NOTES | PASS | PASS-W-NOTES |
| creative-fatigue-detector | PASS | PASS | PASS | PASS | PASS | PASS |
| brand-voice-extractor | PASS | PASS (no tools) | PASS | PASS | PASS | PASS |

## Per-skill findings

### ad-copy

- **Location:** `skills/creative/ad-copy.md:1-23`
- **Frontmatter:** PASS — parses cleanly, `mcp_tools: []` (empty array), `chains_to: [persona-creative-review, image-brief, ab-test-design]`, `credits: 3`, `complexity: premium`.
- **Tool-registry alignment:** PASS — no tools declared, nothing to align.
- **Bucket B migration:** PASS — no `shopify.*` declared. Body uses `brand.products` language (`skills/creative/ad-copy.md:25`), aligning with the resolver pattern. However, `brand.products.list` is NOT declared in `mcp_tools` — the skill relies on brand context (already loaded by skills-engine `brand.brand_guidelines`/`product_context`) and RAG, which is fine but worth noting.
- **Prompt/tool consistency:** PASS — body prose references brand voice, personas, top_content, competitor creative, all pulled via RAG (`knowledge.needs`).
- **Output schema:** PASS — single clean JSON with `product`, `variants[]`, `recommended`, `reasoning`. Fields all computable by an LLM from brand context + RAG.
- **Issues:** None blocking. Minor: the prose line "Pull product images from Shopify / knowledge graph" does not match the `brand.products` resolver path (post-Bucket-B). Cosmetic only.

### image-brief

- **Location:** `skills/creative/image-brief.md:1-23`
- **Frontmatter:** PASS — parses cleanly, `mcp_tools: []`, `chains_to: [persona-creative-review]`.
- **Tool-registry alignment:** PASS — no tools declared.
- **Bucket B migration:** PASS — does not declare `shopify.*`. Body references Shopify but relies on brand_data product images via the post-execution hook (see below).
- **Prompt/tool consistency:** PASS-W-NOTES — body (`skills/creative/image-brief.md:42-44, 106-110`) describes a Post-Execution sequence that "Call fal.ai API with each brief's prompt to generate images" and "Upload generated images to `generated-assets/{brand_id}/ad-creatives/`". The skills-engine post-hook at `src/lib/skills-engine.ts:593-623` honors this using `@/lib/fal-client.generateImage` (flux/schnell), which contradicts the platform's stated direction (see Creative-Path section).
- **Output schema:** PASS — single JSON with `approved_copy_variant`, `briefs[]` (each with `fal_prompt`, `fal_negative_prompt`, `aspect_ratios`, etc.), `recommendation`, `reasoning`.
- **Issues:**
  1. Output schema is fal.ai-specific (`fal_prompt`, `fal_negative_prompt`) but the product direction is Nano Banana 2 / Imagen 4.0. Regression risk — see Agent-Triggered Creative Path.
  2. Post-execution hook does not call `/api/creative/generate` and does not invoke Veo video.

### ugc-script

- **Location:** `skills/creative/ugc-script.md:1-23`
- **Frontmatter:** PASS — parses cleanly, `mcp_tools: []`, `chains_to: [persona-creative-review, ugc-scout]`, `credits: 3`, `complexity: premium`.
- **Tool-registry alignment:** PASS — no tools declared.
- **Bucket B migration:** PASS — no `shopify.*`; uses `brand.products` language (`skills/creative/ugc-script.md:24`).
- **Prompt/tool consistency:** PASS — body references product catalog, personas, top_content, competitor UGC — all available via RAG (`knowledge.needs: [product, persona, top_content, competitor_creative, brand_guidelines]`).
- **Output schema:** PASS — single JSON with `product`, `scripts[]`, `recommended`, `reasoning`, `creator_brief`. All fields LLM-computable.
- **Issues:** None.

### social-content-calendar

- **Location:** `skills/creative/social-content-calendar.md:1-19`
- **Frontmatter:** PASS — parses, `mcp_tools: []`, `chains_to: [image-brief]`, `credits: 1`, `complexity: cheap`.
- **Tool-registry alignment:** PASS — no tools declared.
- **Bucket B migration:** PASS — no `shopify.*`.
- **Prompt/tool consistency:** PASS — body references product catalog, personas, top_content, brand_guidelines, campaigns (via `knowledge.needs`).
- **Output schema:** PASS — single JSON with `calendar_period`, `platforms`, `content_pillars`, `posts[]`, `hashtag_strategy`, `assets_needed`.
- **Issues:** None.

### ugc-scout

- **Location:** `skills/creative/ugc-scout.md:1-19`
- **Frontmatter:** PASS — parses, `mcp_tools: []`, `chains_to: [ugc-script]`.
- **Tool-registry alignment:** PASS — no tools declared.
- **Bucket B migration:** PASS — no `shopify.*`.
- **Prompt/tool consistency:** PASS-W-NOTES — the workflow talks about "Search criteria by platform" (follower range, content category tags, brand safety, audience demographics, sample content URLs) with no declared MCP tool for creator discovery (no influencer/Instagram/TikTok API tool). All candidate data must be hallucinated by the LLM. The output schema promises real creator handles (`@glowwithgrace`), follower counts, and engagement rates, which the LLM cannot compute. This is a known soft limitation shared with `influencer-finder` — not a regression.
- **Output schema:** PASS structurally — single JSON with `search_criteria`, `candidates[]`, `outreach_template`, `recommended_creators`, `reasoning`. Fields are structurally computable but the data values will be fabricated without a discovery tool.
- **Issues:** No MCP tool for creator discovery; outputs are LLM-hallucinated creator profiles. Acceptable as a spec scaffold but the UI should label outputs as "suggested search criteria" not "candidates".

### creative-fatigue-detector

- **Location:** `skills/creative/creative-fatigue-detector.md:1-21`
- **Frontmatter:** PASS — parses. `mcp_tools: [meta_ads.campaigns.insights]`, `requires: [meta]`, `chains_to: [ad-copy, ugc-script, image-brief]`, `schedule: "0 7 * * *"`, `credits: 0`, `complexity: free`.
- **Tool-registry alignment:** PASS — `meta_ads.campaigns.insights` is declared in `TOOL_HANDLERS` at `src/lib/mcp-client.ts:363` AND in `TOOL_PLATFORM` at `src/lib/mcp-client.ts:541` mapped to `meta`. `requires: [meta]` matches.
- **Bucket B migration:** PASS — not a brand_data skill; meta is the correct declaration.
- **Prompt/tool consistency:** PASS — body requires Meta Ads metrics (CTR, CPA, frequency, impressions, spend), which is exactly what `meta_ads.campaigns.insights` provides via `fetchMetaInsights` (`src/lib/mcp-client.ts:148-171`, fields `impressions,clicks,spend,cpc,ctr,actions`). Note: frequency is NOT in the Meta API fields list — the skill will need to compute it or the prompt must gracefully handle its absence.
- **Output schema:** PASS — single JSON with `scan_date`, `total_active_creatives`, `status_breakdown`, `fatigued_creatives[]`, `pipeline_status`, `creative_coverage`, `weekly_trend`.
- **Issues:** Minor — `frequency` is not in the Meta insights field list in `fetchMetaInsights`. The skill prompt explicitly references frequency thresholds (`2.5`, `3.5`). Add `frequency` to the insights query or caveat accordingly.

### brand-voice-extractor

- **Location:** `skills/creative/brand-voice-extractor.md:1-17`
- **Frontmatter:** PASS — parses, `mcp_tools: []`, `chains_to: [ad-copy, email-copy, social-content-calendar]`, `credits: 3`, `complexity: premium`.
- **Tool-registry alignment:** PASS — no tools declared. Correctly does NOT declare `shopify.*` (Bucket B compliant).
- **Bucket B migration:** PASS — uses brand_data via RAG and reads product descriptions from `brand_guidelines` / `product_context` (loaded by skills-engine from the `brands` table, `src/lib/skills-engine.ts:201-205`). No Shopify dependency.
- **Prompt/tool consistency:** PASS — body references "all Shopify product descriptions", "website homepage/about copy", "social media posts", "email templates" — the LLM gets these from brand context + RAG (`knowledge.needs: [product, brand_guidelines, top_content, review_theme]`).
- **Output schema:** PASS — single JSON with `brand_name`, `analysis_sources`, `voice_personality`, `tone_spectrum`, `language_guidelines`, `word_bank`, `inconsistencies_found`, `sample_rewrites`.
- **Issues:** The post-execution persistence hook at `src/lib/skills-engine.ts:626-646` upserts to `brand_guidelines` table using keys `voice_tone`, `target_audience`, `positioning`, `do_say`, `dont_say`, `colors`, `brand_story`, `competitor_positioning` — but the skill's prompt OUTPUTS `voice_personality`, `tone_spectrum`, `language_guidelines.do/dont`, etc. **The key names do NOT match**, so the persistence hook will silently write empty values (`output.voice_tone ?? {}`) and fail to populate brand guidelines. This is a prompt/persister schema mismatch — likely silent regression.

## Agent-triggered creative path check

**Status:** REGRESSED — the downstream image/video generation flow from the agents dashboard uses legacy fal.ai flux/schnell, not Nano Banana 2 / Imagen 4.0 / Veo.

**Evidence:**

1. **Dedicated route exists with correct models:** `src/app/api/creative/generate/route.ts:1-356` is a fully-wired pipeline that calls `generateAdImage` from `src/lib/imagen-client.ts:1-50` (Nano Banana 2 via `gemini-3.1-flash-image-preview`, with Imagen 4.0 fallback) AND `generateVideo` from `src/lib/fal-client.ts`. File header comment literally says "4. Generate 4 image variants via Nano Banana 2 (Imagen 4.0 fallback)". This is the "good" path.

2. **Agents dashboard does NOT call `/api/creative/generate`:** `src/app/dashboard/agents/[agentId]/page.tsx:294-300` triggers skills via `handleRunSkill` → renders `<AgentActivity brandId={brandId} agentId={agentId} skillId={runningSkill} />` which streams through `src/app/api/skills/run-stream/route.ts:46-49` → `runSkill()` in the skills-engine.

3. **Skills-engine post-hook for image-brief uses legacy fal.ai:** `src/lib/skills-engine.ts:592-623` — when `skill.id === 'image-brief' && status === 'completed'`, the engine dynamically imports `@/lib/fal-client` and calls `generateImage` which hits `https://fal.run/fal-ai/flux/schnell` (`src/lib/fal-client.ts:196-248`). There is NO branch that calls the Nano Banana 2 `/api/creative/generate` path.

4. **Video generation (Veo): never triggered from agent path.** The skills-engine post-hook has no video branch at all — video is only generated via `/api/creative/generate`'s `generateVideo` call (`src/app/api/creative/generate/route.ts:199-220`).

5. **image-brief output schema is fal-specific:** The skill outputs `fal_prompt` / `fal_negative_prompt` fields (`skills/creative/image-brief.md:73-79`), reinforcing the legacy wiring.

**Regression summary:** When Aria's `image-brief` runs from the agents dashboard, it will generate images via fal.ai flux/schnell (legacy model), skip Imagen 4.0 fallback entirely, and never generate video. The "good" creative pipeline (`/api/creative/generate`) is only reachable from the standalone creative studio UI (wherever that exposes it), not from the agent-triggered path. **This matches the known issue described in the spec.**

**Fix sketch (out of scope for this audit):** Either (a) update `src/lib/skills-engine.ts:592-623` to call the same `generateAdImage` / `generateVideo` functions that `/api/creative/generate` uses, or (b) have the `image-brief` post-hook POST internally to `/api/creative/generate` with `editedBrief` set to the LLM's output. Also update `skills/creative/image-brief.md` output schema to drop `fal_prompt`-specific naming.

## Cross-cutting issues

1. **`brand-voice-extractor` persistence schema mismatch** (`src/lib/skills-engine.ts:630-641`): the persistence hook reads `output.voice_tone`, `output.target_audience`, `output.do_say`, `output.dont_say` — but the skill prompt generates `voice_personality`, `tone_spectrum`, `language_guidelines.do/dont`. Fields are being silently dropped to `{}` / `[]`. Likely a latent bug shipped with the richer brand-voice prompt.

2. **`creative-fatigue-detector` missing `frequency` field in Meta insights query** (`src/lib/mcp-client.ts:159`): fields are `impressions,clicks,spend,cpc,ctr,actions` — no `frequency`. The skill prompt thresholds on frequency (>2.5 = fatigued). Add `frequency` to the Meta API fields, or compute from `impressions / reach`.

3. **`ugc-scout` has no discovery tool** (`skills/creative/ugc-scout.md:8`): `mcp_tools: []` but output promises real creator handles. LLM will fabricate. Acceptable for spec scaffolding; UI should label as "search criteria" not "candidates".

4. **Prose drift on Shopify references:** `ad-copy` and `image-brief` still say "Pull product images from Shopify" in prose, even though the skills now rely on brand_data via resolvers. Cosmetic.

5. **`mcp_tools: []` for most Aria skills is intentional** — creative skills rely on brand context + RAG rather than live platform tools. Only `creative-fatigue-detector` needs live Meta data. This is consistent and correct.

## Live-run items deferred

1. End-to-end run of `creative-fatigue-detector` against a brand with active Meta campaigns to confirm `fetchMetaInsights` returns usable data and the LLM maps it to the output schema.
2. End-to-end run of `image-brief` from the agents dashboard to confirm the regression (expect: fal.ai flux images, no Veo video).
3. End-to-end run of `brand-voice-extractor` then inspect `brand_guidelines` row to confirm field-mismatch regression (expect: `voice_tone`, `target_audience`, `do_say`, `dont_say` all empty/default).
4. Live verification that `/api/creative/generate` actually hits Nano Banana 2 (needs `GOOGLE_AI_KEY` in env).
5. Confirm `ugc-scout` candidates list is either labeled as suggestions in the UI or a real discovery integration is added.
6. Confirm the agents-dashboard → creative-studio handoff UX (is there a "Generate visuals with Nano Banana" button in the image-brief output that routes to `/api/creative/generate`? — not visible in this audit).

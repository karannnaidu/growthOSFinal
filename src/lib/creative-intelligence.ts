// ---------------------------------------------------------------------------
// Creative Intelligence Core — Plan 3, Task 1
//
// Data-driven creative generation engine. Uses the knowledge graph to produce
// image prompts, video prompts, and copy variants informed by what actually
// works for the brand.
//
// Server-side only.
// ---------------------------------------------------------------------------

import { ragQuery } from '@/lib/knowledge/rag';
import { callModel } from '@/lib/model-client';
import { createClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface CreativeContext {
  topPerformingCreatives: Array<{ name: string; metrics: any; style: string }>;
  personas: Array<{ name: string; demographics: any; preferences: any }>;
  brandGuidelines: {
    voiceTone: any;
    colors: any;
    doSay: string[];
    dontSay: string[];
    positioning: string | null;
    targetAudience: any;
    brandStory: string | null;
  };
  brandInfo: {
    name: string | null;
    brandDNA: any;
    productContext: any;
  };
  competitorCreatives: Array<{ name: string; style: string; performance: any }>;
  productImages: Array<{ name: string; url: string; productTitle: string }>;
}

export interface CreativeBrief {
  imagePrompts: Array<{
    prompt: string
    negativePrompt?: string
    width?: number
    height?: number
    style?: string
    reasoning?: string
  }>
  videoPrompts: Array<{
    prompt: string
    duration?: number
    style?: string
    reasoning?: string
  }>
  copyVariants: Array<{
    headline: string
    body: string
    cta: string
    offerText?: string
    sceneDescription: string
    targetPersona?: string
    reasoning?: string
  }>
  reasoning: string
}

export interface CreativeScore {
  overallScore: number;
  brandGuidelineMatch: number;
  personaScores: Array<{
    personaName: string;
    score: number;
    feedback: string;
  }>;
  strengths: string[];
  improvements: string[];
  predictedPerformance: {
    estimatedCTR: string;
    estimatedROAS: string;
    confidence: string;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return ideal video duration based on campaign goal. */
export function getVideoDuration(campaignGoal: string): number {
  return campaignGoal.toLowerCase().includes('awareness') ? 5 : 10;
}

/** Safely parse JSON from LLM output, stripping markdown fences if present. */
function parseLLMJson<T>(raw: string, fallback: T): T {
  let cleaned = raw.trim();

  // Strip markdown code fences — handle various formats:
  // ```json\n{...}\n```  or  ```\n{...}\n```  or  ```json{...}```
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    cleaned = (fenceMatch[1] ?? '').trim();
  } else {
    // Also try non-anchored match (fence might be surrounded by other text)
    const innerMatch = cleaned.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/);
    if (innerMatch) {
      cleaned = (innerMatch[1] ?? '').trim();
    }
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    console.warn('[CreativeIntelligence] Failed to parse LLM JSON, using fallback. Raw (first 200 chars):', raw.slice(0, 200));
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// 1. gatherCreativeContext
// ---------------------------------------------------------------------------

export async function gatherCreativeContext(
  brandId: string,
): Promise<CreativeContext> {
  const { createServiceClient } = await import('@/lib/supabase/service');
  const admin = createServiceClient();

  // Helper: RAG query with fallback to empty result on failure
  const safeRagQuery = async (query: string, nodeTypes: string[]) => {
    try {
      return await ragQuery({ brandId, query, nodeTypes, limit: 20 });
    } catch {
      return { nodes: [], edges: [], snapshots: [], agencyPatterns: [] };
    }
  };

  // Run queries in parallel (all resilient)
  const [
    creativeResult,
    personaResult,
    competitorResult,
    productResult,
    guidelinesResult,
    brandResult,
  ] = await Promise.all([
    safeRagQuery('top performing ad creatives', ['ad_creative']),
    safeRagQuery('target audience persona', ['persona']),
    safeRagQuery('competitor ad creative', ['competitor_creative']),
    safeRagQuery('product image', ['product_image', 'product']),

    // Brand guidelines (service client bypasses RLS)
    admin
      .from('brand_guidelines')
      .select('voice_tone, colors, do_say, dont_say, positioning, target_audience, brand_story')
      .eq('brand_id', brandId)
      .single(),

    // Brand record — contains brand_guidelines jsonb (BrandDNA) and product_context
    admin
      .from('brands')
      .select('name, brand_guidelines, product_context')
      .eq('id', brandId)
      .single(),
  ]);

  // Build snapshot lookup: nodeId -> metrics
  const snapshotMap = new Map<string, any>();
  for (const snap of creativeResult.snapshots) {
    snapshotMap.set(snap.nodeId, snap.metrics);
  }

  // Sort creatives by a performance heuristic (ROAS or CTR in snapshot metrics)
  const topPerformingCreatives = creativeResult.nodes
    .map((node) => ({
      name: node.name,
      metrics: snapshotMap.get(node.id) ?? node.properties?.metrics ?? {},
      style: node.properties?.style ?? node.properties?.creative_type ?? 'unknown',
    }))
    .sort((a, b) => {
      const roasA = Number(a.metrics?.roas ?? a.metrics?.ROAS ?? 0);
      const roasB = Number(b.metrics?.roas ?? b.metrics?.ROAS ?? 0);
      return roasB - roasA;
    })
    .slice(0, 10);

  // Personas
  const personas = personaResult.nodes.map((node) => ({
    name: node.name,
    demographics: node.properties?.demographics ?? {},
    preferences: node.properties?.preferences ?? {},
  }));

  // Competitor creatives
  const competitorCreatives = competitorResult.nodes.map((node) => ({
    name: node.name,
    style: node.properties?.style ?? 'unknown',
    performance: node.properties?.performance ?? {},
  }));

  // Product images
  const productImages = productResult.nodes.map((node) => ({
    name: node.name,
    url: node.properties?.media_url ?? node.properties?.url ?? '',
    productTitle: node.properties?.product_title ?? node.name,
  }));

  // Brand guidelines (log non-trivial errors, ignore "no rows" which is expected for new brands)
  if (guidelinesResult.error && guidelinesResult.error.code !== 'PGRST116') {
    console.warn('[CreativeIntelligence] brand_guidelines query error:', guidelinesResult.error.message);
  }
  if (brandResult.error && brandResult.error.code !== 'PGRST116') {
    console.warn('[CreativeIntelligence] brands query error:', brandResult.error.message);
  }
  const gl = guidelinesResult.data;
  const br = brandResult.data;
  const brandGuidelines = {
    voiceTone: gl?.voice_tone ?? null,
    colors: gl?.colors ?? null,
    doSay: Array.isArray(gl?.do_say) ? gl.do_say : [],
    dontSay: Array.isArray(gl?.dont_say) ? gl.dont_say : [],
    positioning: gl?.positioning ?? null,
    targetAudience: gl?.target_audience ?? null,
    brandStory: gl?.brand_story ?? null,
  };

  // Brand-level info from the brands table (BrandDNA jsonb + product_context)
  const brandInfo = {
    name: br?.name ?? null,
    brandDNA: br?.brand_guidelines ?? null,
    productContext: br?.product_context ?? null,
  };

  return {
    topPerformingCreatives,
    personas,
    brandGuidelines,
    brandInfo,
    competitorCreatives,
    productImages,
  };
}

// ---------------------------------------------------------------------------
// 2. generateIntelligentBrief
// ---------------------------------------------------------------------------

const BRIEF_SYSTEM_PROMPT = `You are Aria's creative intelligence engine. Use the provided performance data, persona profiles, brand guidelines, and competitor intel to generate image and video prompts that are informed by what works for this brand.

You MUST respond with valid JSON matching this exact schema:
{
  "imagePrompts": [
    {
      "prompt": "detailed image generation prompt",
      "negativePrompt": "what to avoid (optional)",
      "width": 1024,
      "height": 1024,
      "style": "style name",
      "reasoning": "why this prompt was chosen based on the data"
    }
  ],
  "videoPrompts": [
    {
      "prompt": "detailed video generation prompt including scene description, camera motion, mood, and duration",
      "duration": 5,
      "style": "style name",
      "reasoning": "why this prompt was chosen"
    }
  ],
  "copyVariants": [
    {
      "headline": "attention-grabbing headline",
      "body": "persuasive body copy",
      "cta": "call to action",
      "offerText": "optional offer or discount text (e.g. '20% off today only')",
      "sceneDescription": "lifestyle setting description for the product scene",
      "targetPersona": "persona name this targets",
      "reasoning": "why this copy was crafted this way"
    }
  ],
  "reasoning": "overall strategic reasoning for this creative brief"
}

CRITICAL RULES FOR IMAGE PROMPTS:
- The actual product photo will be provided separately as a reference image to the AI generator.
- Your image prompts must describe the SCENE/BACKGROUND/SETTING around the product, NOT the product itself.
- DO NOT describe the product bottle, package, label, or branding in the prompt.
- Instead describe: the surface it sits on, the lighting, the background environment, lifestyle context, mood, color palette.
- Example GOOD prompt: "Warm morning sunlight on a natural wood surface, soft bokeh background of green plants, golden hour lighting, minimalist aesthetic, premium product photography setting"
- Example BAD prompt: "A bottle of wellness product with green label" (the product image is already provided)

Guidelines:
- Generate exactly 4 image prompts, 0 video prompts (video coming soon), and 3 copy variants.
- Image prompts describe SCENES that complement the brand aesthetic — the product will be composited in.
- Each prompt should describe a different setting/mood: lifestyle, studio, nature, urban, etc.
- Use the brand's color palette as accent colors in the scene.
- Copy should match the brand voice tone and avoid anything in the "don't say" list.
- Reference top-performing creative styles when relevant.
- Target specific personas with copy variants.
- All reasoning fields must explain how the data informed the choice.

Campaign Types and Creative Patterns:
- URGENCY/FOMO: Headlines like "Only X left", "Ends tonight", "Last chance". CTA: "Shop Now". Visual: bold contrast, warm/red accents, timer feeling.
- OFFER: Headlines like "X% off", "Buy 1 Get 1", "Free shipping". CTA: "Claim Offer". Visual: price slash, bright accents, offer badge.
- RETARGETING: Headlines like "Still thinking?", "Come back", "Don't miss out". CTA: "Complete Purchase". Visual: warm, product-centered, familiar.
- AWARENESS: Headlines like "Discover", "Meet your new...", "Why thousands trust...". CTA: "Learn More". Visual: lifestyle, aspirational, clean.

Match the campaign type from the user's goal to these patterns. Each copyVariant MUST include a "sceneDescription" field describing the lifestyle setting for the product.

If competitor creatives marked as inspiration are provided, reference their format and visual style in your image prompts.`;

export async function generateIntelligentBrief(
  brandId: string,
  campaignGoal: string,
  targetAudience: string,
  context: CreativeContext,
): Promise<CreativeBrief> {
  // Sanitize user inputs (strip excessive newlines that could be used for prompt injection)
  const safeGoal = campaignGoal.replace(/\n{2,}/g, '\n').slice(0, 500);
  const safeAudience = targetAudience.replace(/\n{2,}/g, '\n').slice(0, 500);

  // Slim context for token budget — only key fields, limited items
  const slimCreatives = context.topPerformingCreatives.slice(0, 5).map(c => ({
    name: c.name, style: c.style,
    roas: c.metrics?.roas ?? c.metrics?.ROAS ?? null,
    ctr: c.metrics?.ctr ?? c.metrics?.CTR ?? null,
  }));
  const slimPersonas = context.personas.slice(0, 5).map(p => ({
    name: p.name, demographics: p.demographics, preferences: p.preferences,
  }));
  const slimCompetitors = context.competitorCreatives.slice(0, 5).map(c => ({
    name: c.name, style: c.style,
  }));
  const slimProducts = context.productImages.slice(0, 10).map(p => ({
    name: p.name, productTitle: p.productTitle,
  }));

  const videoDuration = getVideoDuration(safeGoal);

  let userPrompt = `Generate a creative brief.

## Campaign Goal
${safeGoal}

## Target Audience
${safeAudience}

## Video Duration
Use ${videoDuration}-second duration for video prompts (${videoDuration === 5 ? 'awareness' : 'conversion'} campaign).

## Performance Data — Top Performing Creatives
${JSON.stringify(slimCreatives)}

## Persona Profiles
${JSON.stringify(slimPersonas)}

## Brand Info
${context.brandInfo?.name ? `Brand Name: ${context.brandInfo.name}` : ''}
${context.brandInfo?.brandDNA ? `Brand DNA: ${JSON.stringify(context.brandInfo.brandDNA)}` : ''}
${context.brandInfo?.productContext ? `Product Context: ${JSON.stringify(context.brandInfo.productContext)}` : ''}

## Brand Guidelines
${JSON.stringify(context.brandGuidelines)}

## Competitor Creatives
${JSON.stringify(slimCompetitors)}

## Available Product Images
${JSON.stringify(slimProducts)}

Generate the creative brief as JSON.`;

  // Add inspiration creatives (if any marked by user)
  const inspirationCreatives = context.competitorCreatives
    .filter((c: Record<string, unknown>) => (c as Record<string, unknown>).isInspiration === true)
    .slice(0, 3)

  if (inspirationCreatives.length > 0) {
    userPrompt += `\n\n## Inspiration Creatives (match their style)\n${JSON.stringify(inspirationCreatives.map((c: Record<string, unknown>) => ({ name: c.name, style: c.style, description: c.visual_description })))}`
  }

  const fallback: CreativeBrief = {
    imagePrompts: [],
    videoPrompts: [],
    copyVariants: [],
    reasoning: 'Failed to generate brief — LLM call or response parsing failed.',
  };

  try {
    const result = await callModel({
      model: 'gemini-2.5-flash',
      provider: 'google',
      systemPrompt: BRIEF_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 4096,
      temperature: 0.7,
    });
    return parseLLMJson<CreativeBrief>(result.content, fallback);
  } catch (err) {
    console.warn('[CreativeIntelligence] generateIntelligentBrief callModel failed:', err);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// 3. scoreCreative
// ---------------------------------------------------------------------------

const SCORE_SYSTEM_PROMPT = `You are Aria's creative scoring engine. Evaluate the given creative against the brand guidelines and persona preferences.

You MUST respond with valid JSON matching this exact schema:
{
  "overallScore": 85,
  "brandGuidelineMatch": 90,
  "personaScores": [
    {
      "personaName": "persona name",
      "score": 80,
      "feedback": "specific feedback for this persona"
    }
  ],
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"],
  "predictedPerformance": {
    "estimatedCTR": "1.2-1.8%",
    "estimatedROAS": "3.5-4.2x",
    "confidence": "medium"
  }
}

Scoring rules:
- overallScore: 0-100 composite score weighing brand alignment, persona fit, and creative quality.
- brandGuidelineMatch: 0-100 measuring adherence to voice tone, colors, do/don't say lists.
- personaScores: one entry per persona, scoring how well the creative resonates.
- strengths: 2-5 specific strengths of the creative.
- improvements: 2-5 actionable improvements.
- predictedPerformance: estimated CTR range, ROAS range, and confidence level (low/medium/high).
- Base predictions on the performance data of similar top-performing creatives.`;

export async function scoreCreative(
  brandId: string,
  creative: { imageUrl?: string; copyText: string },
  context: CreativeContext,
): Promise<CreativeScore> {
  // Note: imageUrl is included as metadata only — this uses a text-only LLM call,
  // not the Vision API. The URL provides context (e.g., filename hints) but the
  // actual image content is not analyzed.
  const userPrompt = `Score this creative.

## Creative to Score
Copy Text: ${creative.copyText.slice(0, 2000)}
${creative.imageUrl ? `Image reference: ${creative.imageUrl}` : ''}

## Brand Guidelines
${JSON.stringify(context.brandGuidelines)}

## Personas
${JSON.stringify(context.personas.slice(0, 5))}

## Top Performing Creatives (for reference)
${JSON.stringify(context.topPerformingCreatives.slice(0, 5).map(c => ({ name: c.name, style: c.style, roas: c.metrics?.roas ?? null })))}

Score the creative as JSON.`;

  const fallback: CreativeScore = {
    overallScore: 0,
    brandGuidelineMatch: 0,
    personaScores: [],
    strengths: [],
    improvements: ['Unable to score — LLM call or response parsing failed.'],
    predictedPerformance: {
      estimatedCTR: 'unknown',
      estimatedROAS: 'unknown',
      confidence: 'low',
    },
  };

  try {
    const result = await callModel({
      model: 'gemini-2.5-flash',
      provider: 'google',
      systemPrompt: SCORE_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 2048,
      temperature: 0.3,
    });
    return parseLLMJson<CreativeScore>(result.content, fallback);
  } catch (err) {
    console.warn('[CreativeIntelligence] scoreCreative callModel failed:', err);
    return fallback;
  }
}

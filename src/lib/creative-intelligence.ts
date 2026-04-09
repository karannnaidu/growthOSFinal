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
  };
  competitorCreatives: Array<{ name: string; style: string; performance: any }>;
  productImages: Array<{ name: string; url: string; productTitle: string }>;
}

export interface CreativeBrief {
  imagePrompts: Array<{
    prompt: string;
    negativePrompt?: string;
    width: number;
    height: number;
    style: string;
    reasoning: string;
  }>;
  videoPrompts: Array<{
    prompt: string;
    duration: number;
    style: string;
    reasoning: string;
  }>;
  copyVariants: Array<{
    headline: string;
    body: string;
    cta: string;
    targetPersona: string;
    reasoning: string;
  }>;
  reasoning: string;
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

/** Safely parse JSON from LLM output, stripping markdown fences if present. */
function parseLLMJson<T>(raw: string, fallback: T): T {
  let cleaned = raw.trim();

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = (fenceMatch[1] ?? '').trim();
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
  const supabase = await createClient();

  // Run queries in parallel
  const [
    creativeResult,
    personaResult,
    competitorResult,
    productResult,
    guidelinesResult,
  ] = await Promise.all([
    // Top-performing ad creatives via RAG (returns nodes + snapshots)
    ragQuery({
      brandId,
      query: 'top performing ad creatives',
      nodeTypes: ['ad_creative'],
      limit: 20,
    }),

    // Personas
    ragQuery({
      brandId,
      query: 'target audience persona',
      nodeTypes: ['persona'],
      limit: 10,
    }),

    // Competitor creatives
    ragQuery({
      brandId,
      query: 'competitor ad creative',
      nodeTypes: ['competitor_creative'],
      limit: 10,
    }),

    // Product images
    ragQuery({
      brandId,
      query: 'product image',
      nodeTypes: ['product_image'],
      limit: 20,
    }),

    // Brand guidelines from dedicated table
    supabase
      .from('brand_guidelines')
      .select('voice_tone, colors, do_say, dont_say')
      .eq('brand_id', brandId)
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
  const gl = guidelinesResult.data;
  const brandGuidelines = {
    voiceTone: gl?.voice_tone ?? null,
    colors: gl?.colors ?? null,
    doSay: Array.isArray(gl?.do_say) ? gl.do_say : [],
    dontSay: Array.isArray(gl?.dont_say) ? gl.dont_say : [],
  };

  return {
    topPerformingCreatives,
    personas,
    brandGuidelines,
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
      "prompt": "detailed video generation prompt",
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
      "targetPersona": "persona name this targets",
      "reasoning": "why this copy was crafted this way"
    }
  ],
  "reasoning": "overall strategic reasoning for this creative brief"
}

Guidelines:
- Generate exactly 4 image prompts, 2 video prompts, and 3 copy variants.
- Image prompts should be detailed enough for an AI image generator (Flux/SDXL).
- Video prompts should describe motion, transitions, and mood.
- Copy should match the brand voice tone and avoid anything in the "don't say" list.
- Reference top-performing creative styles when relevant.
- Target specific personas with copy variants.
- All reasoning fields must explain how the data informed the choice.`;

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

  const userPrompt = `Generate a creative brief.

## Campaign Goal
${safeGoal}

## Target Audience
${safeAudience}

## Performance Data — Top Performing Creatives
${JSON.stringify(slimCreatives)}

## Persona Profiles
${JSON.stringify(slimPersonas)}

## Brand Guidelines
${JSON.stringify(context.brandGuidelines)}

## Competitor Creatives
${JSON.stringify(slimCompetitors)}

## Available Product Images
${JSON.stringify(slimProducts)}

Generate the creative brief as JSON.`;

  const fallback: CreativeBrief = {
    imagePrompts: [],
    videoPrompts: [],
    copyVariants: [],
    reasoning: 'Failed to generate brief — LLM call or response parsing failed.',
  };

  try {
    const result = await callModel({
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
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
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
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

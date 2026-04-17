// ---------------------------------------------------------------------------
// Model Client — Task 1.5
// Unified callModel() dispatching to Google Gemini, Groq, DeepSeek, or Anthropic.
// Includes runWithQualityCheck() for auto-retry with tier upgrade.
// ---------------------------------------------------------------------------

import { type Tier, type Preset, routeModel, upgradeTier, recordRequest } from '@/lib/model-router';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ModelCallInput {
  model: string;
  provider: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  // Force raw JSON output (no markdown fences, no prose). Currently honored
  // by Gemini via responseMimeType; OpenAI-compatible providers rely on
  // prompt discipline.
  jsonMode?: boolean;
}

export interface ModelCallResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  /** USD cost derived from provider pricing */
  cost: number;
  model: string;
  provider: string;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Provider: Google Gemini
// ---------------------------------------------------------------------------

async function callGemini(input: ModelCallInput): Promise<ModelCallResult> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const apiKey = process.env.GOOGLE_AI_KEY;
  if (!apiKey) throw new Error('GOOGLE_AI_KEY is not set');

  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({ model: input.model });

  const start = Date.now();
  const result = await genModel.generateContent({
    contents: [{ role: 'user', parts: [{ text: input.userPrompt }] }],
    systemInstruction: input.systemPrompt,
    generationConfig: {
      maxOutputTokens: input.maxTokens ?? 4096,
      temperature: input.temperature ?? 0.7,
      ...(input.jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  });

  const durationMs = Date.now() - start;
  const response = result.response;
  const content = response.text();
  const usageMetadata = response.usageMetadata;
  const inputTokens = usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = usageMetadata?.candidatesTokenCount ?? 0;

  return { content, inputTokens, outputTokens, cost: 0, model: input.model, provider: 'google', durationMs };
}

// ---------------------------------------------------------------------------
// Provider: Groq (OpenAI-compatible)
// ---------------------------------------------------------------------------

interface OpenAICompatResponse {
  choices: Array<{ message: { content: string } }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

async function callGroq(input: ModelCallInput): Promise<ModelCallResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set');

  const start = Date.now();
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: input.model,
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userPrompt },
      ],
      max_tokens: input.maxTokens ?? 4096,
      temperature: input.temperature ?? 0.7,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq API error ${res.status}: ${errText}`);
  }

  const durationMs = Date.now() - start;
  const data = (await res.json()) as OpenAICompatResponse;
  const content = data.choices[0]?.message?.content ?? '';
  const inputTokens = data.usage?.prompt_tokens ?? 0;
  const outputTokens = data.usage?.completion_tokens ?? 0;

  return { content, inputTokens, outputTokens, cost: 0, model: input.model, provider: 'groq', durationMs };
}

// ---------------------------------------------------------------------------
// Provider: DeepSeek (OpenAI-compatible)
// ---------------------------------------------------------------------------

async function callDeepSeek(input: ModelCallInput): Promise<ModelCallResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not set');

  const start = Date.now();
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: input.model,
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userPrompt },
      ],
      max_tokens: input.maxTokens ?? 4096,
      temperature: input.temperature ?? 0.7,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`DeepSeek API error ${res.status}: ${errText}`);
  }

  const durationMs = Date.now() - start;
  const data = (await res.json()) as OpenAICompatResponse;
  const content = data.choices[0]?.message?.content ?? '';
  const inputTokens = data.usage?.prompt_tokens ?? 0;
  const outputTokens = data.usage?.completion_tokens ?? 0;

  // Per-million pricing (USD): inputCost / 1_000_000 * tokens
  // deepseek-chat: $0.27 input, $1.10 output; deepseek-reasoner: $0.55 input, $2.19 output
  const isReasoner = input.model === 'deepseek-reasoner';
  const inputRate = isReasoner ? 0.55 : 0.27;
  const outputRate = isReasoner ? 2.19 : 1.10;
  const cost = (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000;

  return { content, inputTokens, outputTokens, cost, model: input.model, provider: 'deepseek', durationMs };
}

// ---------------------------------------------------------------------------
// Provider: Anthropic Claude
// ---------------------------------------------------------------------------

async function callClaude(input: ModelCallInput): Promise<ModelCallResult> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const client = new Anthropic({ apiKey });

  const start = Date.now();
  const response = await client.messages.create({
    model: input.model,
    max_tokens: input.maxTokens ?? 4096,
    system: input.systemPrompt,
    messages: [{ role: 'user', content: input.userPrompt }],
    temperature: input.temperature ?? 0.7,
  });

  const durationMs = Date.now() - start;
  const contentBlock = response.content[0];
  const content = contentBlock?.type === 'text' ? contentBlock.text : '';
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;

  // claude-sonnet-4-6: $3.00 input / $15.00 output per million tokens
  const cost = (inputTokens * 3.00 + outputTokens * 15.00) / 1_000_000;

  return { content, inputTokens, outputTokens, cost, model: input.model, provider: 'anthropic', durationMs };
}

// ---------------------------------------------------------------------------
// Unified callModel()
// ---------------------------------------------------------------------------

/** Dispatch to the correct provider based on input.provider. */
export async function callModel(input: ModelCallInput): Promise<ModelCallResult> {
  switch (input.provider) {
    case 'google':
      return callGemini(input);
    case 'groq':
      return callGroq(input);
    case 'deepseek':
      return callDeepSeek(input);
    case 'anthropic':
      return callClaude(input);
    default:
      throw new Error(`Unknown provider: ${input.provider}`);
  }
}

// ---------------------------------------------------------------------------
// Quality check helpers
// ---------------------------------------------------------------------------

/**
 * Scores the raw string content returned by a model.
 *
 * Scoring:
 *   - Starts at 1.0
 *   - Not valid JSON           → −0.5
 *   - Length < 50 chars        → −0.3
 *   - Parsed JSON has < 2 keys → −0.2
 *
 * Returns a score in [0, 1]. A score < 0.6 is considered a failure.
 */
function scoreOutput(content: string): number {
  let score = 1.0;

  if (content.length < 50) score -= 0.3;

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    score -= 0.5;
  }

  if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
    if (Object.keys(parsed as Record<string, unknown>).length < 2) score -= 0.2;
  }

  return Math.max(0, score);
}

// ---------------------------------------------------------------------------
// runWithQualityCheck()
// ---------------------------------------------------------------------------

/**
 * Calls the model determined by routeModel(tier, preset), scores the output,
 * and retries once with an upgraded tier if the score falls below 0.6.
 */
export async function runWithQualityCheck(
  input: Omit<ModelCallInput, 'model' | 'provider'>,
  tier: Tier,
  preset?: Preset,
): Promise<ModelCallResult & { retriedWithUpgrade: boolean }> {
  // First attempt
  const route = routeModel(tier, preset);
  recordRequest(route.providerKey);

  const firstResult = await callModel({ ...input, model: route.model, provider: route.provider });

  const score = scoreOutput(firstResult.content);

  if (score >= 0.6) {
    return { ...firstResult, retriedWithUpgrade: false };
  }

  // Retry with upgraded tier
  const upgradedTier = upgradeTier(tier);
  const upgradedRoute = routeModel(upgradedTier, preset);
  recordRequest(upgradedRoute.providerKey);

  const retryResult = await callModel({ ...input, model: upgradedRoute.model, provider: upgradedRoute.provider });

  return { ...retryResult, retriedWithUpgrade: true };
}

import { analyzeAnswer, type EngineFn } from './index';

// Uses Gemini API with google_search_retrieval tool.
// Docs: https://ai.google.dev/gemini-api/docs/grounding
export const geminiSearch: EngineFn = async (input) => {
  const apiKey = process.env.GOOGLE_AI_KEY;
  if (!apiKey) {
    return {
      engine: 'gemini',
      cited: false,
      citation_rank: null,
      competitors_cited: [],
      excerpt: '',
      error: 'GOOGLE_AI_KEY not set',
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: input.query }] }],
    tools: [{ googleSearch: {} }],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    return {
      engine: 'gemini',
      cited: false,
      citation_rank: null,
      competitors_cited: [],
      excerpt: '',
      error: 'rate_limited',
      rate_limited: true,
    };
  }
  if (!res.ok) {
    const text = await res.text();
    return {
      engine: 'gemini',
      cited: false,
      citation_rank: null,
      competitors_cited: [],
      excerpt: '',
      error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
    };
  }

  const data = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const answer = data.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join(' ') ?? '';
  return analyzeAnswer('gemini', answer, input.brandCanonicalName, input.competitorNames);
};

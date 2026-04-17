import { analyzeAnswer, type EngineFn } from './index';

const PPLX_URL = 'https://api.perplexity.ai/chat/completions';

export const perplexitySearch: EngineFn = async (input) => {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    return {
      engine: 'perplexity',
      cited: false,
      citation_rank: null,
      competitors_cited: [],
      excerpt: '',
      error: 'PERPLEXITY_API_KEY not set',
    };
  }

  const body = {
    model: 'sonar',
    messages: [{ role: 'user', content: input.query }],
  };

  const res = await fetch(PPLX_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    return {
      engine: 'perplexity',
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
      engine: 'perplexity',
      cited: false,
      citation_rank: null,
      competitors_cited: [],
      excerpt: '',
      error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
    };
  }

  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const answer = data.choices?.[0]?.message?.content ?? '';
  return analyzeAnswer('perplexity', answer, input.brandCanonicalName, input.competitorNames);
};

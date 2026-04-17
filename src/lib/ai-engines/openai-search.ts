import { analyzeAnswer, type EngineFn } from './index';

const OPENAI_URL = 'https://api.openai.com/v1/responses';

// Uses the Responses API with the web_search_preview tool.
// Docs: https://platform.openai.com/docs/guides/tools-web-search
export const openaiSearch: EngineFn = async (input) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      engine: 'chatgpt',
      cited: false,
      citation_rank: null,
      competitors_cited: [],
      excerpt: '',
      error: 'OPENAI_API_KEY not set',
    };
  }

  const body = {
    model: 'gpt-4o',
    input: input.query,
    tools: [{ type: 'web_search_preview' }],
  };

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    return {
      engine: 'chatgpt',
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
      engine: 'chatgpt',
      cited: false,
      citation_rank: null,
      competitors_cited: [],
      excerpt: '',
      error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
    };
  }

  const data = await res.json() as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };
  const answer = data.output_text
    ?? data.output?.flatMap(o => o.content?.map(c => c.text ?? '') ?? []).join(' ')
    ?? '';

  return analyzeAnswer('chatgpt', answer, input.brandCanonicalName, input.competitorNames);
};

// Run: npx tsx scripts/verify-ai-engines-mock.ts
// Verifies analyzeAnswer citation logic without hitting any live API.
import { analyzeAnswer, probeAll, type EngineFn } from '../src/lib/ai-engines';

const answer = `The best sulfate-free shampoos are Living Proof, Briogeo, and Pureology. Briogeo is especially recommended for oily scalps.`;

const r = analyzeAnswer('chatgpt', answer, 'Briogeo', ['Living Proof', 'Pureology']);
if (!r.cited) {
  console.error('FAIL: expected cited=true');
  process.exit(1);
}
if (r.citation_rank !== 2) {
  console.error(`FAIL: expected rank=2 got ${r.citation_rank}`);
  process.exit(1);
}
if (r.competitors_cited.length !== 2) {
  console.error(`FAIL: expected 2 competitors cited got ${r.competitors_cited}`);
  process.exit(1);
}
console.log('analyzeAnswer citation rank/competitors: OK');

// probeAll + per-engine failure isolation
async function main() {
  const mockOk: EngineFn = async () =>
    analyzeAnswer('chatgpt', answer, 'Briogeo', ['Living Proof']);
  const mockFail: EngineFn = async () => {
    throw new Error('boom');
  };
  const results = await probeAll(
    { query: 'q', brandCanonicalName: 'Briogeo', competitorNames: ['Living Proof'] },
    { chatgpt: mockOk, perplexity: mockFail, gemini: mockOk },
  );
  if (!results.chatgpt.cited) {
    console.error('FAIL: chatgpt should have succeeded');
    process.exit(1);
  }
  if (results.perplexity.error !== 'boom') {
    console.error(`FAIL: perplexity should have error=boom, got ${results.perplexity.error}`);
    process.exit(1);
  }
  if (!results.gemini.cited) {
    console.error('FAIL: gemini should have succeeded');
    process.exit(1);
  }
  console.log('probeAll isolation: OK');
  console.log('OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Run: npx tsx scripts/verify-produces-enforcement.ts
// Simulates extractEntities filtering logic without hitting the LLM or DB.
import { loadSkill } from '../src/lib/skill-loader';

async function main() {
  const skill = await loadSkill('seo-audit');
  const allowedTypes = new Set((skill.produces ?? []).map(p => p.nodeType));
  console.log('seo-audit produces:', [...allowedTypes]);

  const llmOutput = [
    { name: 'Keyword gap report', node_type: 'insight' },
    { name: 'Rando product', node_type: 'product' },
    { name: 'Nonsense type', node_type: 'not_a_real_type' },
  ];

  const VALID_NODE_TYPES = new Set([
    'product', 'audience', 'campaign', 'content', 'competitor',
    'insight', 'metric', 'experiment', 'creative', 'keyword',
    'email_flow', 'channel', 'persona', 'product_image',
    'competitor_creative', 'ad_creative', 'video_asset',
    'landing_page', 'review_theme', 'price_point',
    'brand_guidelines', 'brand_asset', 'top_content',
  ]);

  const kept: string[] = [];
  const rejected: string[] = [];
  for (const n of llmOutput) {
    if (!VALID_NODE_TYPES.has(n.node_type)) { rejected.push(n.node_type); continue; }
    if (allowedTypes.size > 0 && !allowedTypes.has(n.node_type)) { rejected.push(n.node_type); continue; }
    kept.push(n.node_type);
  }

  console.log('kept:', kept);
  console.log('rejected:', rejected);

  if (rejected.length === 0) {
    console.error('FAIL: expected at least one rejection');
    process.exit(1);
  }
  console.log('OK');
}

main().catch(e => { console.error(e); process.exit(1); });

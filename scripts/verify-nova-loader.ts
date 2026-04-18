import { loadSkill } from '../src/lib/skill-loader';

async function main() {
  const s = await loadSkill('brand-dna-extractor');
  console.log('brand-dna-extractor:', s.id, s.agent);
  console.log('  produces:', JSON.stringify(s.produces));

  const probe = await loadSkill('ai-visibility-probe');
  console.log('ai-visibility-probe:', probe.id, probe.agent);

  const opt = await loadSkill('ai-visibility-optimize');
  console.log('ai-visibility-optimize:', opt.id, opt.agent);

  const alias = await loadSkill('geo-visibility');
  console.log('geo-visibility alias ->:', alias.id, alias.agent);
  if (alias.id !== 'geographic-markets' || alias.agent !== 'atlas') {
    console.error('FAIL: alias should resolve to geographic-markets on atlas');
    process.exit(1);
  }
  console.log('OK');
}

main().catch(e => { console.error(e); process.exit(1); });

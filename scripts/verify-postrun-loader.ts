// Run: npx tsx scripts/verify-postrun-loader.ts
import { loadPostRun, clearPostRunCache } from '../src/lib/post-run';

async function main() {
  clearPostRunCache();

  // A skill we know has no .postRun.ts yet
  const none = await loadPostRun('seo-audit');
  if (none !== null) {
    console.error('FAIL: expected null for seo-audit (no .postRun.ts on disk)');
    process.exit(1);
  }
  console.log('seo-audit -> null OK');

  // A skill that doesn't exist at all
  const missing = await loadPostRun('does-not-exist');
  if (missing !== null) {
    console.error('FAIL: expected null for missing skill');
    process.exit(1);
  }
  console.log('does-not-exist -> null OK');

  const cs = await loadPostRun('competitor-scan');
  if (typeof cs !== 'function') { console.error('FAIL: competitor-scan postRun not found'); process.exit(1); }
  console.log('competitor-scan -> function OK');

  const ccl = await loadPostRun('competitor-creative-library');
  if (typeof ccl !== 'function') { console.error('FAIL: competitor-creative-library postRun not found'); process.exit(1); }
  console.log('competitor-creative-library -> function OK');

  const ib = await loadPostRun('image-brief');
  if (typeof ib !== 'function') { console.error('FAIL: image-brief postRun not found'); process.exit(1); }
  console.log('image-brief -> function OK');

  const bde = await loadPostRun('brand-dna-extractor');
  if (typeof bde !== 'function') { console.error('FAIL: brand-dna-extractor postRun not found'); process.exit(1); }
  console.log('brand-dna-extractor -> function OK');

  const avp = await loadPostRun('ai-visibility-probe');
  if (typeof avp !== 'function') { console.error('FAIL: ai-visibility-probe postRun not found'); process.exit(1); }
  console.log('ai-visibility-probe -> function OK');

  const avo = await loadPostRun('ai-visibility-optimize');
  if (typeof avo !== 'function') { console.error('FAIL: ai-visibility-optimize postRun not found'); process.exit(1); }
  console.log('ai-visibility-optimize -> function OK');

  console.log('OK');
}

main().catch(e => { console.error(e); process.exit(1); });

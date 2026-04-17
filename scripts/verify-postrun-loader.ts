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

  console.log('OK');
}

main().catch(e => { console.error(e); process.exit(1); });

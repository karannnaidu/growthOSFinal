// Run: npx tsx scripts/smoke-mia-catalog.ts
// Smoke test for Phase 3 — builds the Mia catalog, applies Day-0 + platform
// filters, and renders the prompt block. Exits non-zero if the catalog is
// empty, if required fields are missing, or if the prompt is suspiciously short.

import { buildMiaCatalog, filterDay0Safe, filterByConnectedPlatforms, renderCatalogForPrompt } from '../src/lib/mia-catalog'

async function main() {
  const catalog = await buildMiaCatalog()
  // eslint-disable-next-line no-console
  console.log(`Catalog skills: ${catalog.skills.length}`)
  // eslint-disable-next-line no-console
  console.log(`Catalog agents: ${catalog.agents.length}`)
  // eslint-disable-next-line no-console
  console.log(`Dropped (incomplete metadata): ${catalog.dropped.length}`)
  if (catalog.dropped.length) {
    for (const d of catalog.dropped) {
      console.warn(`  - ${d.id}: ${d.reason}`)
    }
  }

  if (catalog.skills.length < 50) {
    console.error(`FAIL: expected >= 50 skills, got ${catalog.skills.length}`)
    process.exit(1)
  }

  // Day-0 filter: should drop spend + send + approval-required.
  const day0 = filterDay0Safe(catalog.skills)
  // eslint-disable-next-line no-console
  console.log(`Day-0 safe skills: ${day0.length}`)
  if (day0.some(s => s.sideEffect === 'spend' || s.sideEffect === 'send' || s.requiresHumanApproval)) {
    console.error('FAIL: day-0 filter let an unsafe skill through')
    process.exit(1)
  }

  // Platform filter: with zero platforms connected, any skill requiring a
  // platform should drop out.
  const noPlatforms = filterByConnectedPlatforms(catalog.skills, new Set())
  const stillNeedingPlatforms = noPlatforms.filter(s => s.requires.length > 0)
  if (stillNeedingPlatforms.length > 0) {
    console.error(`FAIL: platform filter let through ${stillNeedingPlatforms.length} skills needing platforms`)
    process.exit(1)
  }

  // Prompt rendering should not be trivially empty.
  const prompt = renderCatalogForPrompt(day0)
  if (prompt.length < 500) {
    console.error(`FAIL: prompt too short (${prompt.length} chars)`)
    process.exit(1)
  }

  // eslint-disable-next-line no-console
  console.log(`\n---- prompt preview (first 800 chars) ----`)
  // eslint-disable-next-line no-console
  console.log(prompt.slice(0, 800))
  // eslint-disable-next-line no-console
  console.log(`\nSmoke test passed.`)
}

main().catch(err => {
  console.error('Smoke test crashed:', err)
  process.exit(2)
})

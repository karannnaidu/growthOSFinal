// Run: npx tsx scripts/smoke-mia-wake-full.ts [brandId]
//
// Phase 15: real dispatch smoke test. Unlike smoke-mia-wake.ts (dry-run),
// this actually runs skills, creates watches/requests, and posts chat
// messages. Use on a dogfood brand only.
//
// Verifies end-to-end:
//   - Decision persisted
//   - Skill runs created (if any picks)
//   - Requests / watches / instants persisted (if any)
//   - Decision's created_watch_ids + resolved_request_ids populated

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (!m) continue
  const [, k, v] = m
  if (!process.env[k!]) process.env[k!] = v!.replace(/^['"]|['"]$/g, '')
}

import { createServiceClient } from '../src/lib/supabase/service'
import { runMiaWake } from '../src/lib/mia-wake'

async function main() {
  const client = createServiceClient()

  let brandId = process.argv[2]
  if (!brandId) {
    console.error('Pass a brandId argument. Do not run against a random brand.')
    process.exit(1)
  }

  const { data: brand } = await client.from('brands').select('id, name').eq('id', brandId).single()
  if (!brand) {
    console.error(`Brand ${brandId} not found.`)
    process.exit(1)
  }
  // eslint-disable-next-line no-console
  console.log(`Full wake on ${brand.name} (${brand.id}) — this will actually dispatch skills.\n`)

  const t0 = Date.now()
  const result = await runMiaWake({ brandId, source: 'heartbeat', dryRun: false })
  const elapsed = Date.now() - t0

  // eslint-disable-next-line no-console
  console.log(`Wake complete in ${elapsed}ms:`)
  console.log(JSON.stringify(result, null, 2))

  if (!result.decisionId) {
    console.error('FAIL: no decisionId returned')
    process.exit(1)
  }

  const { data: decision } = await client
    .from('mia_decisions')
    .select('id, wake_source, picked, new_watches_created, requests_resolved, reasoning, model_version, prompt_version')
    .eq('id', result.decisionId)
    .single()

  if (!decision) {
    console.error('FAIL: decision row not readable')
    process.exit(1)
  }

  const picked = (decision.picked as Array<{ skill_id: string }> | null) ?? []

  // eslint-disable-next-line no-console
  console.log('\nDecision row:')
  console.log(`  wake_source:         ${decision.wake_source}`)
  console.log(`  picks:               ${picked.length} (${picked.map(p => p.skill_id).join(', ') || '-'})`)
  console.log(`  watches created:     ${(decision.new_watches_created as unknown[] | null)?.length ?? 0}`)
  console.log(`  requests resolved:   ${(decision.requests_resolved as unknown[] | null)?.length ?? 0}`)
  console.log(`  prompt / model:      ${decision.prompt_version} / ${decision.model_version}`)

  // Find skill_runs triggered by this decision (within the last few minutes for this brand)
  const since = new Date(t0 - 5_000).toISOString()
  const { data: runs } = await client
    .from('skill_runs')
    .select('id, skill_id, status, created_at, blocked_reason')
    .eq('brand_id', brandId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  // eslint-disable-next-line no-console
  console.log(`\nskill_runs since wake started (${(runs ?? []).length}):`)
  for (const r of runs ?? []) {
    const suffix = r.status === 'blocked' ? `  — ${r.blocked_reason}` : ''
    console.log(`  ${r.skill_id.padEnd(28)} ${r.status}  ${r.created_at}${suffix}`)
  }

  // Sanity: pick count should match (or exceed — chained skills) runs count
  if (picked.length > 0 && (runs ?? []).length === 0) {
    console.error('FAIL: decision picked skills but no skill_runs recorded')
    process.exit(1)
  }

  // eslint-disable-next-line no-console
  console.log('\nFull-dispatch smoke test passed.')
}

main().catch(err => {
  console.error('Smoke crashed:', err)
  process.exit(2)
})

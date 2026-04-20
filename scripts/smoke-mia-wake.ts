// Run: npx tsx scripts/smoke-mia-wake.ts [brandId]
// Dry-run the full wake pipeline against a brand: snapshot → sweep →
// catalog → plan → persist (no dispatch). Verifies the pipeline stays
// wired end-to-end.

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
    const { data } = await client.from('brands').select('id, name').limit(1).maybeSingle()
    if (!data?.id) {
      console.error('No brands in DB. Pass a brandId argument.')
      process.exit(1)
    }
    brandId = data.id
    // eslint-disable-next-line no-console
    console.log(`Using brand ${data.name} (${brandId})`)
  }

  const result = await runMiaWake({
    brandId,
    source: 'heartbeat',
    dryRun: true,
  })

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result, null, 2))

  if (!result.decisionId) {
    console.error('FAIL: no decisionId persisted')
    process.exit(1)
  }

  // Verify the trace row landed in mia_decisions.
  const { data: row } = await client
    .from('mia_decisions')
    .select('id, wake_source, picked, reasoning, prompt_version, model_version')
    .eq('id', result.decisionId)
    .single()

  if (!row) {
    console.error('FAIL: decisionId not readable')
    process.exit(1)
  }
  // eslint-disable-next-line no-console
  console.log('Decision row:', JSON.stringify(row, null, 2).slice(0, 600))

  // eslint-disable-next-line no-console
  console.log('\nSmoke test passed.')
}

main().catch(err => {
  console.error('Smoke test crashed:', err)
  process.exit(2)
})

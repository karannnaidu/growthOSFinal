// Run: npx tsx scripts/smoke-mia-watches.ts
// Smoke test for watches service — exercises predicate validation and
// table lookups. Uses a dogfood brand if one exists; otherwise covers
// validation only. Exits non-zero on any failure.

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (!m) continue
  const [, k, v] = m
  if (!process.env[k]) process.env[k] = v.replace(/^['"]|['"]$/g, '')
}

import { createServiceClient } from '../src/lib/supabase/service'
import { createWatch, listOpenWatches, sweepWatches, cancelWatch } from '../src/lib/mia-watches'

type Check = { name: string; ok: boolean; detail: string }
const results: Check[] = []

async function expectReject(name: string, fn: () => Promise<unknown>) {
  try {
    await fn()
    results.push({ name, ok: false, detail: 'expected throw, got success' })
  } catch (e) {
    results.push({ name, ok: true, detail: `rejected: ${(e as Error).message}` })
  }
}

async function main() {
  const client = createServiceClient()

  // Predicate validation: rejects bad shapes.
  await expectReject('time_elapsed without hours/iso', () =>
    createWatch({ brandId: '00000000-0000-0000-0000-000000000000', triggerType: 'time_elapsed', predicate: {}, resumeAction: 'noop' }, client),
  )
  await expectReject('data_accumulated bad resource', () =>
    createWatch({ brandId: '00000000-0000-0000-0000-000000000000', triggerType: 'data_accumulated', predicate: { resource: 'widgets', min_count: 1 }, resumeAction: 'noop' }, client),
  )
  await expectReject('metric_crossed bad op', () =>
    createWatch({ brandId: '00000000-0000-0000-0000-000000000000', triggerType: 'metric_crossed', predicate: { metric: 'roas_7d', op: '!=', value: 1 }, resumeAction: 'noop' }, client),
  )

  // Pick a real brand for the happy path. If there's no brand, skip.
  const { data: brand } = await client.from('brands').select('id').limit(1).maybeSingle()
  if (!brand?.id) {
    results.push({ name: 'happy-path', ok: true, detail: 'skipped — no brand rows' })
    summary()
    return
  }

  // time_elapsed 1 hour from now — should NOT fire on sweep.
  const w = await createWatch(
    {
      brandId: brand.id,
      triggerType: 'time_elapsed',
      predicate: { hours: 1 },
      resumeAction: 'smoke:no-op',
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
    client,
  )
  results.push({ name: 'createWatch time_elapsed', ok: !!w.id, detail: `id=${w.id}` })

  const openBefore = await listOpenWatches(brand.id, client)
  results.push({
    name: 'listOpenWatches includes new',
    ok: openBefore.some(r => r.id === w.id),
    detail: `count=${openBefore.length}`,
  })

  const fired = await sweepWatches(brand.id, client)
  const firedOurs = fired.some(r => r.id === w.id)
  results.push({
    name: 'sweepWatches does not fire future watch',
    ok: !firedOurs,
    detail: `firedTotal=${fired.length}, oursFired=${firedOurs}`,
  })

  await cancelWatch(w.id, client)
  const { data: afterCancel } = await client
    .from('watches')
    .select('status')
    .eq('id', w.id)
    .single()
  results.push({
    name: 'cancelWatch sets status=cancelled',
    ok: afterCancel?.status === 'cancelled',
    detail: `status=${afterCancel?.status}`,
  })

  summary()
}

function summary() {
  let allOk = true
  for (const r of results) {
    const tag = r.ok ? 'OK  ' : 'FAIL'
    // eslint-disable-next-line no-console
    console.log(`[${tag}] ${r.name.padEnd(48)} ${r.detail}`)
    if (!r.ok) allOk = false
  }
  if (!allOk) {
    console.error('\nSmoke test FAILED.')
    process.exit(1)
  }
  console.log('\nSmoke test passed.')
}

main().catch(err => {
  console.error('Smoke test crashed:', err)
  process.exit(2)
})

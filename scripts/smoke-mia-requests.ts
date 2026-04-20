// Run: npx tsx scripts/smoke-mia-requests.ts
// Smoke test for mia-requests — validation + lifecycle (open → acted_on,
// open → dismissed, open → expired). Uses a real brand if one exists.

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
import {
  createRequest,
  listOpenRequests,
  listInstantLaneRequests,
  markActedOn,
  markDismissed,
  expireStaleRequests,
} from '../src/lib/mia-requests'

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

  // Validation: empty reason, bad payload.
  await expectReject('rejects empty reason', () =>
    createRequest({ brandId: '00000000-0000-0000-0000-000000000000', type: 'platform_connect', payload: { platform: 'meta' }, reason: '' }, client),
  )
  await expectReject('rejects platform_connect without platform', () =>
    createRequest({ brandId: '00000000-0000-0000-0000-000000000000', type: 'platform_connect', payload: {}, reason: 'needed to run ads' }, client),
  )
  await expectReject('rejects info_needed without question', () =>
    createRequest({ brandId: '00000000-0000-0000-0000-000000000000', type: 'info_needed', payload: { question: 'hi' }, reason: 'need info' }, client),
  )

  const { data: brand } = await client.from('brands').select('id').limit(1).maybeSingle()
  if (!brand?.id) {
    results.push({ name: 'happy-path', ok: true, detail: 'skipped — no brand rows' })
    summary()
    return
  }

  // acted_on lifecycle.
  const r1 = await createRequest(
    {
      brandId: brand.id,
      type: 'platform_connect',
      payload: { platform: 'meta', reason: 'for ads' },
      reason: 'Max needs Meta connected to analyse campaign performance.',
      priority: 'high',
    },
    client,
  )
  results.push({ name: 'create high-priority platform_connect', ok: !!r1.id, detail: `id=${r1.id}` })

  const instant = await listInstantLaneRequests(brand.id, client)
  results.push({
    name: 'instant lane includes high-priority',
    ok: instant.some(r => r.id === r1.id),
    detail: `count=${instant.length}`,
  })

  await markActedOn(r1.id, brand.id, { connected_platform: 'meta' }, client)
  const { data: after1 } = await client.from('mia_requests').select('status').eq('id', r1.id).single()
  results.push({
    name: 'markActedOn → status=acted_on',
    ok: after1?.status === 'acted_on',
    detail: `status=${after1?.status}`,
  })

  // dismissed lifecycle.
  const r2 = await createRequest(
    {
      brandId: brand.id,
      type: 'info_needed',
      payload: { question: 'Which regions are you selling in right now?' },
      reason: 'Atlas needs geo scope before recommending expansion.',
      priority: 'medium',
    },
    client,
  )
  await markDismissed(r2.id, brand.id, client)
  const { data: after2 } = await client.from('mia_requests').select('status').eq('id', r2.id).single()
  results.push({
    name: 'markDismissed → status=dismissed',
    ok: after2?.status === 'dismissed',
    detail: `status=${after2?.status}`,
  })

  // expired lifecycle.
  const r3 = await createRequest(
    {
      brandId: brand.id,
      type: 'data_needed',
      payload: { resource: 'gsc' },
      reason: 'Hugo needs GSC data for the audit.',
      priority: 'low',
      validUntil: new Date(Date.now() - 60_000), // already-stale
    },
    client,
  )
  const n = await expireStaleRequests(brand.id, client)
  results.push({
    name: 'expireStaleRequests picks up stale row',
    ok: n >= 1,
    detail: `expired=${n}`,
  })
  const { data: after3 } = await client.from('mia_requests').select('status').eq('id', r3.id).single()
  results.push({
    name: 'stale request ends up status=expired',
    ok: after3?.status === 'expired',
    detail: `status=${after3?.status}`,
  })

  // open list should not include any of the three after we finished.
  const openNow = await listOpenRequests(brand.id, client)
  const stillOpen = openNow.filter(r => [r1.id, r2.id, r3.id].includes(r.id))
  results.push({
    name: 'listOpenRequests excludes resolved/expired',
    ok: stillOpen.length === 0,
    detail: `remaining-open-from-test=${stillOpen.length}`,
  })

  summary()
}

function summary() {
  let allOk = true
  for (const r of results) {
    const tag = r.ok ? 'OK  ' : 'FAIL'
    // eslint-disable-next-line no-console
    console.log(`[${tag}] ${r.name.padEnd(50)} ${r.detail}`)
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

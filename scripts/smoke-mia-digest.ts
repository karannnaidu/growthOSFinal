// Run: npx tsx scripts/smoke-mia-digest.ts [brandId]
// Exercises formatDigestBody (pure) and composeDigest (round-trip to DB).

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
import { formatDigestBody, composeDigest } from '../src/lib/mia-digest'

type Check = { name: string; ok: boolean; detail: string }
const results: Check[] = []

async function main() {
  // --- pure formatter tests ---
  const empty = formatDigestBody({}, { openWatches: 2, openRequests: 1 }, 'calmosis', '2026-04-21')
  results.push({
    name: 'empty digest shows watching line',
    ok: empty.includes('Nothing loud') && empty.includes('2 signal'),
    detail: `len=${empty.length}`,
  })

  const withLines = formatDigestBody(
    {
      win: [{ kind: 'win', text: 'ROAS up 18% week-over-week' }],
      risk: [{ kind: 'risk', text: 'Inventory dipping on SKU-42' }],
      ask: [{ kind: 'ask', text: 'Need budget approval for Q2 push' }],
    },
    { openWatches: 0, openRequests: 0 },
    'calmosis',
    '2026-04-21',
  )
  results.push({
    name: 'digest formats sections in order win→risk→ask',
    ok:
      withLines.indexOf('**Wins**') < withLines.indexOf('**Risks**') &&
      withLines.indexOf('**Risks**') < withLines.indexOf('**Needs your input**'),
    detail: '',
  })

  // --- round-trip (optional, needs a real brand) ---
  const client = createServiceClient()
  const brandId = process.argv[2]
  if (!brandId) {
    const { data: b } = await client.from('brands').select('id').limit(1).maybeSingle()
    if (!b?.id) {
      summary()
      return
    }
    await run(b.id as string, client)
  } else {
    await run(brandId, client)
  }
  summary()
}

async function run(brandId: string, client: ReturnType<typeof createServiceClient>) {
  const today = new Date().toISOString().slice(0, 10)
  const first = await composeDigest(brandId, today, client)
  results.push({
    name: 'composeDigest posts today',
    ok: first.posted === true,
    detail: `digestId=${first.digestId} msgId=${first.messageId}`,
  })
  const second = await composeDigest(brandId, today, client)
  results.push({
    name: 'composeDigest is idempotent',
    ok: second.posted === false && second.reason === 'already posted',
    detail: `reason=${second.reason}`,
  })
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

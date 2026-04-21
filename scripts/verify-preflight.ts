// Run: npx tsx scripts/verify-preflight.ts <brandId>
// Exercises src/lib/preflight.ts against a real brand and prints verdict.
// Use on a brand where Meta is connected OR disconnected (both valid tests).

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

import { runPreflight } from '../src/lib/preflight'

async function main() {
  const brandId = process.argv[2]
  if (!brandId) {
    console.error('Pass brandId as first arg')
    process.exit(1)
  }

  console.log(`[1] First run (expect miss or existing cache):`)
  const t0 = Date.now()
  const r1 = await runPreflight(brandId)
  console.log(`  verdict=${r1.verdict} blocked_reason=${r1.blocked_reason ?? '-'} warnings=${r1.warnings.length} (${Date.now() - t0}ms)`)

  console.log(`[2] Second run (expect cache hit, <1500ms):`)
  const t1 = Date.now()
  const r2 = await runPreflight(brandId)
  const ms2 = Date.now() - t1
  console.log(`  verdict=${r2.verdict} took ${ms2}ms cached_at=${r2.cached_at}`)
  if (ms2 > 1500) {
    console.error('  FAIL: cache hit should be <1.5s')
    process.exit(1)
  }

  console.log(`[3] Force run (expect fresh execution):`)
  const t2 = Date.now()
  const r3 = await runPreflight(brandId, { force: true })
  console.log(`  verdict=${r3.verdict} took ${Date.now() - t2}ms`)

  console.log('OK')
}

main().catch(err => {
  console.error('crashed', err)
  process.exit(1)
})

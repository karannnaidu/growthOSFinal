// Run: npx tsx scripts/verify-mia-first-schema.ts
// Verifies the 014 migration landed on remote Supabase:
//  - 5 new tables exist and are queryable
//  - Additive columns are present on skill_runs and conversation_messages
// Exits non-zero on any failure.

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Load .env.local (tsx does not auto-load it). Same pattern as other scripts.
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (!m) continue
  const [, k, v] = m
  if (!process.env[k!]) process.env[k!] = v!.replace(/^['"]|['"]$/g, '')
}

import { createServiceClient } from '../src/lib/supabase/service'

type CheckResult = { name: string; ok: boolean; detail: string }

async function main() {
  const client = createServiceClient()
  const results: CheckResult[] = []

  const tables = [
    'watches',
    'mia_requests',
    'mia_decisions',
    'mia_digests',
    'mia_events',
  ]
  for (const t of tables) {
    const { error } = await client
      .from(t)
      .select('id', { count: 'exact', head: true })
    if (error) {
      results.push({ name: `table:${t}`, ok: false, detail: error.message })
    } else {
      results.push({ name: `table:${t}`, ok: true, detail: 'queryable' })
    }
  }

  const columnChecks: Array<{ table: string; column: string }> = [
    { table: 'skill_runs', column: 'requests_emitted' },
    { table: 'conversation_messages', column: 'author_kind' },
    { table: 'conversation_messages', column: 'source_decision_id' },
    { table: 'conversation_messages', column: 'inline_request_ids' },
    { table: 'conversation_messages', column: 'inline_watch_ids' },
  ]
  for (const { table, column } of columnChecks) {
    const { error } = await client.from(table).select(column).limit(0)
    if (error) {
      results.push({
        name: `col:${table}.${column}`,
        ok: false,
        detail: error.message,
      })
    } else {
      results.push({
        name: `col:${table}.${column}`,
        ok: true,
        detail: 'present',
      })
    }
  }

  let allOk = true
  for (const r of results) {
    const tag = r.ok ? 'OK  ' : 'FAIL'
    // eslint-disable-next-line no-console
    console.log(`[${tag}] ${r.name.padEnd(40)} ${r.detail}`)
    if (!r.ok) allOk = false
  }

  if (!allOk) {
    console.error('\nSchema verification FAILED.')
    process.exit(1)
  }
  console.log('\nSchema verification passed.')
}

main().catch((err) => {
  console.error('Verification crashed:', err)
  process.exit(2)
})

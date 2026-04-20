// Direct runSkill probe to diagnose why Mia-wake dispatch appears silent.
// Run: npx tsx scripts/smoke-run-skill.ts <brandId> [skillId]

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

import { runSkill } from '../src/lib/skills-engine'

async function main() {
  const brandId = process.argv[2]
  const skillId = process.argv[3] ?? 'health-check'
  if (!brandId) {
    console.error('Pass brandId as first arg')
    process.exit(1)
  }
  // eslint-disable-next-line no-console
  console.log(`Running ${skillId} on ${brandId}...`)
  const r = await runSkill({ brandId, skillId, triggeredBy: 'mia' })
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ id: r.id, status: r.status, error: r.error, modelUsed: r.modelUsed }, null, 2))
}

main().catch(err => {
  console.error('crashed', err)
  process.exit(1)
})

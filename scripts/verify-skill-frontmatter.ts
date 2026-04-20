// Run: npx tsx scripts/verify-skill-frontmatter.ts
// Enforces that every picker-eligible skill has the Phase 2 safety metadata
// and Mia-facing descriptions filled in. Exits non-zero on any violation.

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import matter from 'gray-matter'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SKILLS_ROOT = resolve(__dirname, '..', 'skills')

const REQUIRED_STRINGS = [
  'description_for_mia',
  'description_for_user',
] as const

const REQUIRED_ENUMS: Record<string, ReadonlyArray<string | boolean>> = {
  side_effect: ['none', 'external_write', 'spend', 'send'],
  reversible: [true, false],
  requires_human_approval: [true, false],
}

function walkMarkdown(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) {
      if (p.includes('mia-manager-workspace')) continue
      walkMarkdown(p, acc)
    } else if (name.endsWith('.md')) {
      acc.push(p)
    }
  }
  return acc
}

function main() {
  const files = walkMarkdown(SKILLS_ROOT)
  const failures: string[] = []
  let checked = 0

  for (const file of files) {
    const raw = readFileSync(file, 'utf-8')
    const parsed = matter(raw)
    const id = parsed.data?.id as string | undefined

    if (!id) continue
    if (file.includes('/_foundation/') || file.includes('\\_foundation\\')) continue
    if (id === 'mia-manager') continue

    checked++

    for (const key of REQUIRED_STRINGS) {
      const v = parsed.data?.[key]
      if (typeof v !== 'string' || v.trim().length < 10) {
        failures.push(`${id}: ${key} missing or too short`)
      }
    }
    for (const [key, allowed] of Object.entries(REQUIRED_ENUMS)) {
      const v = parsed.data?.[key]
      if (!allowed.includes(v as string | boolean)) {
        failures.push(`${id}: ${key}=${String(v)} not in [${allowed.join(',')}]`)
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log(`Checked: ${checked} skills`)
  if (failures.length) {
    console.error(`\nViolations (${failures.length}):`)
    for (const f of failures) console.error(`  - ${f}`)
    process.exit(1)
  }
  // eslint-disable-next-line no-console
  console.log('All skill frontmatter is valid.')
}

main()

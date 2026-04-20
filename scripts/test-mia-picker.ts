// Run: npx tsx scripts/test-mia-picker.ts
//
// Replays tests/mia-picker/*.json fixtures against parsePlannerOutput so
// we catch parser regressions before they hit the live wake cycle. No DB,
// no network — pure function exercise.

import { readFileSync, readdirSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = resolve(__dirname, '..', 'tests', 'mia-picker')

import { parsePlannerOutput, type PlannerOutput } from '../src/lib/mia-wake'
import type { MiaCatalog, CatalogSkill } from '../src/lib/mia-catalog'

type NumericArrayCheck = {
  length?: number
  ids?: string[]
  priorities?: string[]
}
type ReasoningCheck = { nonEmpty?: boolean; exact?: string }

interface Fixture {
  name: string
  catalogSkillIds: string[]
  raw: string
  expect: {
    picks?: NumericArrayCheck
    newWatches?: NumericArrayCheck
    requestsToResolve?: NumericArrayCheck
    digestLines?: NumericArrayCheck
    instantMessages?: NumericArrayCheck
    reasoning?: ReasoningCheck
  }
}

function stubCatalog(skillIds: string[]): MiaCatalog {
  const skills: CatalogSkill[] = skillIds.map(id => ({
    id,
    name: id,
    agent: 'test',
    agentName: 'Test',
    category: 'test',
    complexity: 'cheap',
    credits: 1,
    requires: [],
    sideEffect: 'none',
    reversible: true,
    requiresHumanApproval: false,
    descriptionForMia: `Stub skill for ${id}. Trigger: test.`,
    descriptionForUser: `Stub skill for ${id}.`,
  }))
  return {
    skills,
    skillById: new Map(skills.map(s => [s.id, s])),
    agents: [],
    dropped: [],
  }
}

function assert(cond: boolean, msg: string, failures: string[]) {
  if (!cond) failures.push(msg)
}

function checkArray(
  label: string,
  actual: Array<{ skill_id?: string; priority?: string }>,
  spec: NumericArrayCheck | undefined,
  failures: string[],
) {
  if (!spec) return
  if (spec.length !== undefined) {
    assert(
      actual.length === spec.length,
      `${label}: expected length ${spec.length}, got ${actual.length}`,
      failures,
    )
  }
  if (spec.ids) {
    const ids = actual.map(a => a.skill_id ?? '').join(',')
    const want = spec.ids.join(',')
    assert(ids === want, `${label}.ids: expected [${want}], got [${ids}]`, failures)
  }
  if (spec.priorities) {
    const got = actual.map(a => a.priority ?? '').join(',')
    const want = spec.priorities.join(',')
    assert(got === want, `${label}.priorities: expected [${want}], got [${got}]`, failures)
  }
}

function runFixture(filename: string, fx: Fixture): { pass: boolean; failures: string[] } {
  const catalog = stubCatalog(fx.catalogSkillIds)
  const out: PlannerOutput = parsePlannerOutput(fx.raw, catalog)
  const failures: string[] = []

  checkArray('picks', out.picks as Array<{ skill_id?: string; priority?: string }>, fx.expect.picks, failures)
  checkArray('newWatches', out.new_watches as unknown as Array<{ skill_id?: string }>, fx.expect.newWatches, failures)
  checkArray(
    'requestsToResolve',
    out.requests_to_resolve as unknown as Array<{ skill_id?: string }>,
    fx.expect.requestsToResolve,
    failures,
  )
  checkArray(
    'digestLines',
    out.digest_lines as unknown as Array<{ skill_id?: string }>,
    fx.expect.digestLines,
    failures,
  )
  checkArray(
    'instantMessages',
    out.instant_messages as unknown as Array<{ skill_id?: string }>,
    fx.expect.instantMessages,
    failures,
  )
  if (fx.expect.reasoning) {
    if (fx.expect.reasoning.exact !== undefined) {
      assert(
        out.reasoning === fx.expect.reasoning.exact,
        `reasoning: expected exact "${fx.expect.reasoning.exact}", got "${out.reasoning}"`,
        failures,
      )
    }
    if (fx.expect.reasoning.nonEmpty) {
      assert(out.reasoning.length > 0, `reasoning: expected non-empty, got empty`, failures)
    }
  }

  return { pass: failures.length === 0, failures }
}

async function main() {
  const files = readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.json')).sort()
  if (!files.length) {
    console.error('No fixtures found in tests/mia-picker/')
    process.exit(1)
  }

  let passed = 0
  let failed = 0
  for (const file of files) {
    const path = join(FIXTURES_DIR, file)
    const fx = JSON.parse(readFileSync(path, 'utf-8')) as Fixture
    const { pass, failures } = runFixture(file, fx)
    if (pass) {
      passed++
      // eslint-disable-next-line no-console
      console.log(`  PASS  ${file}  ${fx.name}`)
    } else {
      failed++
      // eslint-disable-next-line no-console
      console.log(`  FAIL  ${file}  ${fx.name}`)
      for (const f of failures) console.log(`        - ${f}`)
    }
  }

  // eslint-disable-next-line no-console
  console.log(`\n${passed} passed, ${failed} failed, ${files.length} total`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

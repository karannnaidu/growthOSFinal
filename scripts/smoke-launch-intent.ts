// scripts/smoke-launch-intent.ts
// Drives the launch-conversation state machine end-to-end without the chat UI.
// Run: npx tsx scripts/smoke-launch-intent.ts <brandId> [budget]
//
// Walks: preflight → awaiting_approval_of_plan → audience/copy/brief parallel →
// awaiting_approval_of_images → launching → completed. Prints each turn's
// state + card kind + a compact payload summary.

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
import { runSkill } from '../src/lib/skills-engine'

interface StepResult {
  state: string
  cardKind: string
  summary: string
  raw?: unknown
}

function summarize(obj: unknown, max = 260): string {
  try {
    const s = JSON.stringify(obj)
    return s.length > max ? `${s.slice(0, max)}…` : s
  } catch {
    return String(obj)
  }
}

async function stepAwaitingIntent(brandId: string): Promise<StepResult> {
  const preflight = await runPreflight(brandId)
  if (preflight.verdict === 'blocked') {
    return {
      state: 'cancelled',
      cardKind: 'max_handoff',
      summary: `BLOCKED: ${preflight.blocked_reason ?? 'unknown'}`,
      raw: preflight,
    }
  }
  return {
    state: 'awaiting_approval_of_plan',
    cardKind: 'max_opening',
    summary: `verdict=${preflight.verdict}, warnings=${preflight.warnings.length}`,
    raw: preflight,
  }
}

async function stepAwaitingApprovalOfPlan(
  brandId: string,
  angle: string,
  dailyBudget: number,
): Promise<StepResult> {
  const [audienceRun, copyRun, briefRun] = await Promise.all([
    runSkill({
      brandId,
      skillId: 'audience-targeting',
      triggeredBy: 'user',
      additionalContext: { objective: 'conversion', daily_budget: dailyBudget, angle },
    }),
    runSkill({
      brandId,
      skillId: 'ad-copy',
      triggeredBy: 'user',
      additionalContext: { angle, objective: 'conversion' },
    }),
    runSkill({
      brandId,
      skillId: 'image-brief',
      triggeredBy: 'user',
      additionalContext: { angle },
    }),
  ])
  return {
    state: 'awaiting_approval_of_images',
    cardKind: 'max_bundle',
    summary:
      `audience.status=${audienceRun.status} tiers=${((audienceRun.output as { tiers?: unknown[] } | null)?.tiers ?? []).length}, ` +
      `copy.status=${copyRun.status} variants=${((copyRun.output as { variants?: unknown[] } | null)?.variants ?? []).length}, ` +
      `brief.status=${briefRun.status}`,
    raw: { audienceRun: audienceRun.id, copyRun: copyRun.id, briefRun: briefRun.id },
  }
}

async function main() {
  const brandId = process.argv[2]
  const daily = Number(process.argv[3] ?? '500')
  if (!brandId) {
    console.error('Usage: npx tsx scripts/smoke-launch-intent.ts <brandId> [dailyBudget]')
    process.exit(1)
  }

  // eslint-disable-next-line no-console
  console.log(`[smoke-launch-intent] brand=${brandId} dailyBudget=${daily}\n`)

  const t1 = await stepAwaitingIntent(brandId)
  // eslint-disable-next-line no-console
  console.log(`[turn 1] state=${t1.state} card=${t1.cardKind}`)
  // eslint-disable-next-line no-console
  console.log(`          ${t1.summary}\n`)

  if (t1.state === 'cancelled') {
    // eslint-disable-next-line no-console
    console.log('[smoke-launch-intent] preflight blocked — halting.')
    return
  }

  const t2 = await stepAwaitingApprovalOfPlan(brandId, 'smoke-test angle', daily)
  // eslint-disable-next-line no-console
  console.log(`[turn 2] state=${t2.state} card=${t2.cardKind}`)
  // eslint-disable-next-line no-console
  console.log(`          ${t2.summary}`)
  // eslint-disable-next-line no-console
  console.log(`          run ids: ${summarize(t2.raw)}\n`)

  // We intentionally stop before calling campaign-launcher to avoid
  // creating a real paid campaign from a smoke test. The chat UI would
  // hit `awaiting_approval_of_images` → `launching` at the user's prompt.
  // eslint-disable-next-line no-console
  console.log('[smoke-launch-intent] OK — halted before campaign-launcher (paid side effect).')
}

main().catch(err => {
  console.error('[smoke-launch-intent] crashed', err)
  process.exit(1)
})

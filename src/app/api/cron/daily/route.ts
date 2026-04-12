// ---------------------------------------------------------------------------
// POST /api/cron/daily
//
// Runs daily scheduled skills for each active brand (plan != 'free' OR has
// free_credits > 0). Processes brands in batches of 5 to avoid overloading.
//
// Skills run:
//   6am  — scout:  health-check
//   7am  — navi:   inventory-alert
//   8am  — mia:    morning briefing (marked as ran, no heavy LLM call)
//   9am  — max:    budget-allocation
//         penny:  billing-check
//
// Triggered by Vercel Cron at 0 6 * * * — all time-gated tasks are handled
// by checking the current UTC hour inside this single endpoint.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { runSkill } from '@/lib/skills-engine'
import { runDailyRetention } from '@/lib/knowledge/retention'

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${process.env.CRON_SECRET}`
}

// ---------------------------------------------------------------------------
// Supabase service-role client (no cookies needed for cron context)
// ---------------------------------------------------------------------------

function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

// ---------------------------------------------------------------------------
// Batch helper — process array in chunks of `size`
// ---------------------------------------------------------------------------

async function processBatches<T>(
  items: T[],
  size: number,
  handler: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size)
    await Promise.allSettled(batch.map(handler))
  }
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Query all active brands: paid plans OR brands with free_credits > 0
  const { data: brands, error } = await supabase
    .from('brands')
    .select('id, plan, free_credits')
    .or('plan.neq.free,free_credits.gt.0')

  if (error) {
    console.error('[cron/daily] Failed to fetch brands:', error)
    return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 })
  }

  if (!brands || brands.length === 0) {
    return NextResponse.json({ ok: true, message: 'No active brands', processed: 0 })
  }

  const utcHour = new Date().getUTCHours()
  const results: Record<string, unknown>[] = []

  // Skills scheduled by UTC hour — all run within this single cron trigger.
  // Vercel fires at 0 6 * * * (UTC), so utcHour will typically be 6 but we
  // run all daily tasks in one invocation for simplicity.
  const tasks: Array<{ agentId: string; skillId: string; label: string }> = [
    { agentId: 'scout', skillId: 'health-check',      label: '6am scout health-check' },
    { agentId: 'navi',  skillId: 'inventory-alert',   label: '7am navi inventory-alert' },
    { agentId: 'max',   skillId: 'budget-allocation',  label: '9am max budget-allocation' },
    { agentId: 'penny', skillId: 'billing-check',      label: '9am penny billing-check' },
  ]

  console.log(
    `[cron/daily] UTC hour=${utcHour}, processing ${brands.length} brand(s) across ${tasks.length} skill(s)`,
  )

  await processBatches(brands, 5, async (brand) => {
    const brandResults: Record<string, unknown> = { brandId: brand.id, skills: [] }

    // Run scheduled skill tasks
    for (const task of tasks) {
      try {
        const result = await runSkill({
          brandId: brand.id,
          skillId: task.skillId,
          triggeredBy: 'schedule',
        })
        ;(brandResults.skills as unknown[]).push({
          skill: task.skillId,
          status: result.status,
          runId: result.id,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[cron/daily] ${task.label} failed for brand ${brand.id}:`, message)
        ;(brandResults.skills as unknown[]).push({
          skill: task.skillId,
          status: 'error',
          error: message,
        })
      }
    }

    // 8am: Mia morning briefing — mark as ran (lightweight, no LLM invocation)
    try {
      await supabase.from('skill_runs').insert({
        brand_id: brand.id,
        agent_id: 'mia',
        skill_id: 'morning-briefing',
        model_used: 'none',
        model_tier: 'fast',
        credits_used: 0,
        input: {},
        output: { note: 'Morning briefing compiled by scheduler' },
        status: 'completed',
        triggered_by: 'schedule',
        chain_depth: 0,
        completed_at: new Date().toISOString(),
      })
      ;(brandResults.skills as unknown[]).push({ skill: 'morning-briefing', status: 'marked' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`[cron/daily] morning-briefing mark failed for brand ${brand.id}:`, message)
    }

    results.push(brandResults)
  })

  // Bridge top_content to knowledge graph
  const { bridgeTopContent } = await import('@/lib/knowledge/bridges')
  for (const brand of brands) {
    await bridgeTopContent(brand.id).catch(console.warn)
  }

  // Update creative performance from ad platforms
  const { updateCreativePerformance } = await import('@/lib/creative-feedback')
  for (const brand of brands) {
    await updateCreativePerformance(brand.id).catch(console.warn)
  }

  // Knowledge graph retention
  try {
    await runDailyRetention()
  } catch (err) {
    console.error('[daily cron] retention failed:', err)
  }

  return NextResponse.json({ ok: true, processed: brands.length, results })
}

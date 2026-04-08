// ---------------------------------------------------------------------------
// POST /api/cron/weekly
//
// Runs weekly scheduled skills for each active brand.
// Day-of-week mapping (UTC):
//   Monday    (1) — luna:  email-flow-audit
//   Tuesday   (2) — hugo:  seo-audit
//   Wednesday (3) — atlas: audience-targeting + persona-builder
//   Thursday  (4) — echo:  competitor-scan + competitor-creative-library
//
// Vercel Cron fires at 0 8 * * 1 (Monday 08:00 UTC). Because all four days
// run on different days and this cron only fires Monday, we run the full week
// schedule by checking the current day inside the handler.  In production you
// can split these into four separate cron entries if you prefer strict timing.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { runSkill } from '@/lib/skills-engine'

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${process.env.CRON_SECRET}`
}

// ---------------------------------------------------------------------------
// Supabase service-role client
// ---------------------------------------------------------------------------

function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

// ---------------------------------------------------------------------------
// Batch helper
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
// Day-of-week skill schedule
// dayOfWeek: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
// ---------------------------------------------------------------------------

interface ScheduledTask {
  agentId: string
  skillId: string
}

const WEEKLY_SCHEDULE: Record<number, ScheduledTask[]> = {
  1: [{ agentId: 'luna', skillId: 'email-flow-audit' }],
  2: [{ agentId: 'hugo', skillId: 'seo-audit' }],
  3: [
    { agentId: 'atlas', skillId: 'audience-targeting' },
    { agentId: 'atlas', skillId: 'persona-builder' },
  ],
  4: [
    { agentId: 'echo', skillId: 'competitor-scan' },
    { agentId: 'echo', skillId: 'competitor-creative-library' },
  ],
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dayOfWeek = new Date().getUTCDay()
  const todaysTasks = WEEKLY_SCHEDULE[dayOfWeek]

  if (!todaysTasks || todaysTasks.length === 0) {
    return NextResponse.json({
      ok: true,
      message: `No weekly tasks scheduled for day ${dayOfWeek}`,
      dayOfWeek,
    })
  }

  const supabase = createServiceClient()

  // Query active brands
  const { data: brands, error } = await supabase
    .from('brands')
    .select('id, plan, free_credits')
    .or('plan.neq.free,free_credits.gt.0')

  if (error) {
    console.error('[cron/weekly] Failed to fetch brands:', error)
    return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 })
  }

  if (!brands || brands.length === 0) {
    return NextResponse.json({ ok: true, message: 'No active brands', processed: 0, dayOfWeek })
  }

  console.log(
    `[cron/weekly] day=${dayOfWeek}, tasks=${todaysTasks.map((t) => t.skillId).join(', ')}, brands=${brands.length}`,
  )

  const results: Record<string, unknown>[] = []

  await processBatches(brands, 5, async (brand) => {
    const brandResults: Record<string, unknown> = { brandId: brand.id, skills: [] }

    for (const task of todaysTasks) {
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
        console.error(
          `[cron/weekly] ${task.skillId} failed for brand ${brand.id}:`,
          message,
        )
        ;(brandResults.skills as unknown[]).push({
          skill: task.skillId,
          status: 'error',
          error: message,
        })
      }
    }

    results.push(brandResults)
  })

  return NextResponse.json({ ok: true, dayOfWeek, processed: brands.length, results })
}

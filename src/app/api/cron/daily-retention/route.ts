// GET /api/cron/daily-retention
//
// Once-a-day housekeeping that used to live inside the old /api/cron/daily
// alongside the hardcoded specialist schedule (Scout 6am, Navi 7am, etc.).
// The specialist schedule moved to Mia's wake cycle; retention is pure
// maintenance, so it gets its own dedicated cron.
//
// Runs: platform_status sync + knowledge-graph retention per brand.

import { NextRequest, NextResponse } from 'next/server'
import { runDailyRetention } from '@/lib/knowledge/retention'

export const maxDuration = 300

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${process.env.CRON_SECRET}`
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await runDailyRetention()
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}

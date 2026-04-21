// GET /api/cron/mia-heartbeat
//
// Fires Mia's wake cycle for every active brand. Configured on Vercel Cron
// to run 4x/day. The wake cycle is idempotent per brand — on quiet ticks
// it simply records an empty decision row.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runMiaWake } from '@/lib/mia-wake'

export const maxDuration = 300

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${process.env.CRON_SECRET}`
}

async function processBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size)
    await Promise.all(chunk.map(item => fn(item).catch(err => console.warn('[heartbeat]', err))))
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createServiceClient()
  const { data: brands, error } = await admin.from('brands').select('id').limit(500)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const summary: Array<{ brandId: string; decisionId: string | null; picks: number; error?: string }> = []
  await processBatches(brands ?? [], 5, async (b) => {
    try {
      const res = await runMiaWake({ brandId: b.id, source: 'heartbeat' })
      summary.push({ brandId: b.id, decisionId: res.decisionId, picks: res.pickCount })
    } catch (err) {
      summary.push({ brandId: b.id, decisionId: null, picks: 0, error: (err as Error).message })
    }
  })

  return NextResponse.json({ ok: true, processed: summary.length, summary })
}

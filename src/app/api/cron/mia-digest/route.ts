// GET /api/cron/mia-digest
//
// Once per day, composes today's digest for every active brand. Today's
// date is UTC for now — brand-local timezone handling is a follow-up.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { composeDigest } from '@/lib/mia-digest'

export const maxDuration = 300

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${process.env.CRON_SECRET}`
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data: brands, error } = await admin.from('brands').select('id').limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const summary: Array<{ brandId: string; posted: boolean; reason: string }> = []
  for (const b of brands ?? []) {
    try {
      const res = await composeDigest(b.id as string, today, admin)
      summary.push({ brandId: b.id as string, posted: res.posted, reason: res.reason })
    } catch (err) {
      summary.push({ brandId: b.id as string, posted: false, reason: (err as Error).message })
    }
  }

  return NextResponse.json({ ok: true, date: today, processed: summary.length, summary })
}

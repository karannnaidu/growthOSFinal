// src/app/api/cron/campaign-optimizer/route.ts

export const maxDuration = 300

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { runSkill } from '@/lib/skills-engine'

function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

export async function GET(): Promise<NextResponse> {
  const admin = createServiceClient()

  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  const now = new Date().toISOString()

  const { data: campaigns } = await admin
    .from('campaigns')
    .select('id, brand_id, name, meta_campaign_id, learning_ends_at, last_optimized_at')
    .eq('status', 'active')
    .not('meta_campaign_id', 'is', null)
    .lt('learning_ends_at', now)
    .or(`last_optimized_at.is.null,last_optimized_at.lt.${twoDaysAgo}`)
    .limit(10)

  if (!campaigns || campaigns.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  let processed = 0

  for (const campaign of campaigns) {
    try {
      await runSkill({
        brandId: campaign.brand_id,
        skillId: 'campaign-optimizer',
        triggeredBy: 'schedule',
        additionalContext: {
          campaign_id: campaign.id,
          meta_campaign_id: campaign.meta_campaign_id,
          campaign_name: campaign.name,
        },
      })
      processed++
    } catch (err) {
      console.error(`[cron/campaign-optimizer] Failed for campaign ${campaign.id}:`, err)
    }
  }

  return NextResponse.json({ processed })
}

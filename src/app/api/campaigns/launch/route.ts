import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runSkill } from '@/lib/skills-engine'

export const maxDuration = 120

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: {
    brandId: string
    campaignName: string
    objective: 'awareness' | 'conversion' | 'retention'
    dailyBudget: number
    launchMode: 'live' | 'draft'
    creatives: Array<{ headline: string; body: string; cta: string; image_url?: string }>
    audienceTiers: Array<{ name: string; targeting: Record<string, unknown> }>
    linkUrl: string
    copyRunId?: string
    imageRunId?: string
    targetingRunId?: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { brandId, campaignName, objective, dailyBudget, launchMode, creatives, audienceTiers, linkUrl } = body

  if (!brandId || !campaignName || !objective || !dailyBudget || !creatives?.length || !audienceTiers?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const admin = createServiceClient()
  const { data: brand } = await admin.from('brands').select('id, owner_id, domain').eq('id', brandId).single()
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  if (brand.owner_id !== user.id) {
    const { data: member } = await admin.from('brand_members').select('brand_id').eq('brand_id', brandId).eq('user_id', user.id).single()
    if (!member) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  try {
    const result = await runSkill({
      brandId,
      skillId: 'campaign-launcher',
      triggeredBy: 'user',
      additionalContext: {
        campaign_name: campaignName,
        objective,
        daily_budget: dailyBudget,
        launch_mode: launchMode,
        creatives,
        audience_tiers: audienceTiers,
        link_url: linkUrl || (brand.domain ? `https://${brand.domain}` : ''),
        copy_run_id: body.copyRunId,
        image_run_id: body.imageRunId,
        targeting_run_id: body.targetingRunId,
      },
    })

    return NextResponse.json({
      success: true,
      runId: result.id,
      status: result.status,
      message: result.status === 'completed'
        ? `Campaign "${campaignName}" ${launchMode === 'draft' ? 'saved as draft' : 'launched'} on Meta.`
        : `Campaign launch ${result.status}: ${result.error || 'unknown'}`,
    })
  } catch (err) {
    console.error('[campaigns/launch] Failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Launch failed' }, { status: 500 })
  }
}

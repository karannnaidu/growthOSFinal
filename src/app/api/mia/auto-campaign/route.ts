export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runSkill } from '@/lib/skills-engine'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { brandId: string; objective?: string; dailyBudget?: number }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { brandId, objective = 'conversion', dailyBudget = 50 } = body
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  const admin = createServiceClient()
  const { data: brand } = await admin.from('brands').select('id, owner_id, name, domain').eq('id', brandId).single()
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  if (brand.owner_id !== user.id) {
    const { data: member } = await admin.from('brand_members').select('brand_id').eq('brand_id', brandId).eq('user_id', user.id).single()
    if (!member) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Chain: ad-copy → image-brief → audience-targeting
  const copyResult = await runSkill({ brandId, skillId: 'ad-copy', triggeredBy: 'mia', additionalContext: { objective } })
  const imageResult = await runSkill({ brandId, skillId: 'image-brief', triggeredBy: 'mia', additionalContext: { objective } })
  const targetingResult = await runSkill({ brandId, skillId: 'audience-targeting', triggeredBy: 'mia', additionalContext: { objective } })

  return NextResponse.json({
    success: true,
    campaignName: `${brand.name} ${objective} — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    objective,
    dailyBudget,
    linkUrl: brand.domain ? `https://${brand.domain}` : '',
    copy: copyResult.output,
    images: imageResult.output,
    targeting: targetingResult.output,
    copyRunId: copyResult.id,
    imageRunId: imageResult.id,
    targetingRunId: targetingResult.id,
  })
}

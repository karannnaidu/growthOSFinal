export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runSkill, type SkillRunResult } from '@/lib/skills-engine'

interface SkillOutcome {
  runId: string
  status: SkillRunResult['status']
  output: Record<string, unknown>
  creditsUsed: number
  error?: string
}

async function runAndCapture(
  brandId: string,
  skillId: string,
  additionalContext: Record<string, unknown>,
): Promise<SkillOutcome> {
  try {
    const r = await runSkill({ brandId, skillId, triggeredBy: 'mia', additionalContext })
    return {
      runId: r.id,
      status: r.status,
      output: r.output,
      creditsUsed: r.creditsUsed,
      error: r.error,
    }
  } catch (err) {
    return {
      runId: '',
      status: 'failed',
      output: {},
      creditsUsed: 0,
      error: err instanceof Error ? err.message : 'Unexpected error',
    }
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })

  let body: { brandId: string; objective?: string; dailyBudget?: number }
  try { body = await request.json() } catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }) }

  const { brandId, objective = 'conversion', dailyBudget = 50 } = body
  if (!brandId) return NextResponse.json({ success: false, error: 'brandId required' }, { status: 400 })

  const admin = createServiceClient()
  const { data: brand } = await admin.from('brands').select('id, owner_id, name, domain').eq('id', brandId).single()
  if (!brand) return NextResponse.json({ success: false, error: 'Brand not found' }, { status: 404 })
  if (brand.owner_id !== user.id) {
    const { data: member } = await admin.from('brand_members').select('brand_id').eq('brand_id', brandId).eq('user_id', user.id).single()
    if (!member) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
  }

  const ctx = { objective }

  const copy = await runAndCapture(brandId, 'ad-copy', ctx)
  const image = await runAndCapture(brandId, 'image-brief', { ...ctx, _from_ad_copy: copy.output })
  const targeting = await runAndCapture(brandId, 'audience-targeting', { ...ctx, _from_ad_copy: copy.output })

  const failures = [
    { skill: 'ad-copy', outcome: copy },
    { skill: 'image-brief', outcome: image },
    { skill: 'audience-targeting', outcome: targeting },
  ].filter((r) => r.outcome.status !== 'completed')

  const allFailed = failures.length === 3
  const partialFailure = failures.length > 0 && !allFailed

  return NextResponse.json({
    success: !allFailed,
    partialFailure,
    campaignName: `${brand.name} ${objective} — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    objective,
    dailyBudget,
    linkUrl: brand.domain ? `https://${brand.domain}` : '',
    copy: copy.output,
    images: image.output,
    targeting: targeting.output,
    copyRunId: copy.runId,
    imageRunId: image.runId,
    targetingRunId: targeting.runId,
    creditsUsed: copy.creditsUsed + image.creditsUsed + targeting.creditsUsed,
    failures: failures.map((f) => ({
      skill: f.skill,
      status: f.outcome.status,
      error: f.outcome.error ?? 'Unknown error',
    })),
  }, { status: allFailed ? 500 : 200 })
}

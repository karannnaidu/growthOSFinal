// src/app/api/mia/launch-intent/route.ts
// POST body: { brandId, conversationId, userMessage?, currentState?, userInput? }
// Drives the launch-conversation skill state machine one turn at a time.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runPreflight } from '@/lib/preflight'
import { runSkill } from '@/lib/skills-engine'

export const maxDuration = 120

type LaunchState =
  | 'awaiting_intent'
  | 'awaiting_approval_of_plan'
  | 'awaiting_approval_of_images'
  | 'launching'
  | 'completed'
  | 'cancelled'

interface LaunchIntentBody {
  brandId: string
  conversationId?: string
  userMessage?: string
  currentState?: LaunchState
  userInput?: {
    angle?: string
    budget?: number
    proposeAll?: boolean
    approvedTiers?: unknown[]
    approvedCopyIdx?: number
    approvedImages?: string[]
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: LaunchIntentBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { brandId } = body
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  const admin = createServiceClient()
  const { data: brand } = await admin
    .from('brands')
    .select('id, owner_id, domain')
    .eq('id', brandId)
    .single()
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  if (brand.owner_id !== user.id) {
    const { data: member } = await admin
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single()
    if (!member) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const currentState: LaunchState = body.currentState ?? 'awaiting_intent'

  try {
    if (currentState === 'awaiting_intent') {
      const preflight = await runPreflight(brandId)
      if (preflight.verdict === 'blocked') {
        return NextResponse.json({
          state: 'cancelled',
          card_kind: 'max_handoff',
          card_payload: { preflight },
          cancelled_reason: 'preflight_blocked',
        })
      }
      return NextResponse.json({
        state: 'awaiting_approval_of_plan',
        card_kind: 'max_opening',
        card_payload: {
          preflight_verdict: preflight.verdict,
          preflight_summary: summarizePreflight(preflight),
          budget_suggestion: { min: 1800, max: 2500, currency: 'INR' },
          requires_user_input: ['angle', 'budget'],
        },
        preflight,
      })
    }

    if (currentState === 'awaiting_approval_of_plan') {
      const angle = body.userInput?.angle ?? ''
      const dailyBudget = body.userInput?.budget ?? 2000
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

      return NextResponse.json({
        state: 'awaiting_approval_of_images',
        card_kind: 'max_bundle',
        card_payload: {
          audience: {
            tiers: (audienceRun.output as { tiers?: unknown[] } | null)?.tiers ?? [],
          },
          copy: {
            variants: (copyRun.output as { variants?: unknown[] } | null)?.variants ?? [],
          },
          image_brief: {
            summary: (briefRun.output as { summary?: string } | null)?.summary ?? '',
          },
        },
        run_ids: { audience: audienceRun.id, copy: copyRun.id, brief: briefRun.id },
      })
    }

    if (currentState === 'awaiting_approval_of_images') {
      return NextResponse.json({
        state: 'launching',
        card_kind: 'launch_confirm',
        card_payload: {
          approved_images: body.userInput?.approvedImages ?? [],
        },
      })
    }

    if (currentState === 'launching') {
      const linkUrl = brand.domain ? `https://${brand.domain}` : ''
      const launchRun = await runSkill({
        brandId,
        skillId: 'campaign-launcher',
        triggeredBy: 'user',
        additionalContext: {
          campaign_name: `Chat-launch ${new Date().toISOString().slice(0, 10)}`,
          objective: 'conversion',
          daily_budget: body.userInput?.budget ?? 2000,
          launch_mode: 'live',
          creatives: [],
          audience_tiers: body.userInput?.approvedTiers ?? [],
          link_url: linkUrl,
        },
      })
      return NextResponse.json({
        state: 'completed',
        card_kind: 'launch_result',
        card_payload: launchRun.output ?? {},
        run_id: launchRun.id,
      })
    }

    return NextResponse.json({ error: `Unknown state: ${currentState}` }, { status: 400 })
  } catch (err) {
    console.error('[api/mia/launch-intent]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Launch intent failed' },
      { status: 500 },
    )
  }
}

function summarizePreflight(p: Awaited<ReturnType<typeof runPreflight>>): string {
  if (p.verdict === 'ready') return 'All checks passed.'
  if (p.verdict === 'warning') {
    return `${p.warnings.length} warning(s): ${p.warnings.map(w => w.skill).join(', ')}.`
  }
  return p.blocked_reason ?? 'Blocked.'
}

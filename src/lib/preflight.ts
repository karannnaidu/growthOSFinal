// src/lib/preflight.ts
// Orchestrates 4 Max skills in parallel, caches result for 15 min,
// computes verdict (blocked / warning / ready). NOT a skill — internal
// plumbing. The 4 underlying skills create their own skill_runs.

import { runSkill } from '@/lib/skills-engine'
import { createServiceClient } from '@/lib/supabase/service'
import { getPlatformStatus, syncPlatformStatus } from '@/lib/knowledge/intelligence'
import type {
  PreflightResult,
  PreflightWarning,
  PreflightDetails,
  PreflightVerdict,
  PreflightRunOptions,
} from '@/lib/preflight-types'

const CACHE_TTL_MS = 15 * 60 * 1000

const PREFLIGHT_SKILLS = [
  'pixel-capi-health',
  'asc-readiness-audit',
  'account-structure-audit',
  'learning-phase-monitor',
] as const

type PreflightSkillId = typeof PREFLIGHT_SKILLS[number]

function detailsKeyFor(skillId: PreflightSkillId): keyof PreflightDetails {
  switch (skillId) {
    case 'pixel-capi-health': return 'pixel'
    case 'asc-readiness-audit': return 'asc'
    case 'account-structure-audit': return 'structure'
    case 'learning-phase-monitor': return 'learning'
  }
}

export async function runPreflight(
  brandId: string,
  opts: PreflightRunOptions = {},
): Promise<PreflightResult> {
  const admin = createServiceClient()

  // 1. Cache read (unless forced)
  if (!opts.force) {
    const { data: cached } = await admin
      .from('preflight_results')
      .select('*')
      .eq('brand_id', brandId)
      .maybeSingle()
    if (cached) {
      const ageMs = Date.now() - new Date(cached.cached_at).getTime()
      if (ageMs < CACHE_TTL_MS) {
        return {
          brand_id: brandId,
          verdict: cached.verdict as PreflightVerdict,
          blocked_reason: cached.blocked_reason,
          warnings: (cached.warnings ?? []) as PreflightWarning[],
          details: (cached.details ?? emptyDetails()) as PreflightDetails,
          cached_at: cached.cached_at,
          stale: false,
        }
      }
    }
  }

  // 2. Short-circuit: Meta not connected → blocked immediately.
  let status = await getPlatformStatus(brandId)
  if (!status) status = await syncPlatformStatus(brandId)
  if (!status?.meta) {
    const result: PreflightResult = {
      brand_id: brandId,
      verdict: 'blocked',
      blocked_reason: 'Connect Meta to launch campaigns.',
      warnings: [],
      details: emptyDetails(),
      cached_at: new Date().toISOString(),
      stale: false,
    }
    await upsert(admin, result)
    return result
  }

  // 3. Run 4 skills in parallel, tolerate individual errors.
  // triggeredBy: 'mia' — preflight is internal Mia plumbing. The runSkill
  // type only allows 'user' | 'mia' | 'schedule'.
  const outcomes = await Promise.all(
    PREFLIGHT_SKILLS.map(async (skillId) => {
      try {
        const run = await runSkill({
          brandId,
          skillId,
          triggeredBy: 'mia',
        })
        return {
          skillId,
          output: run.status === 'completed' ? run.output : null,
          error: run.error ?? (run.status !== 'completed' ? run.status : null),
        }
      } catch (err) {
        return {
          skillId,
          output: null,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    }),
  )

  // 4. Assemble details + warnings.
  const details = emptyDetails()
  const warnings: PreflightWarning[] = []

  for (const { skillId, output, error } of outcomes) {
    const key = detailsKeyFor(skillId)
    if (error || !output) {
      details[key] = null
      warnings.push({
        skill: skillId,
        severity: 'info',
        message: `Couldn't verify ${skillId}${error ? `: ${error}` : ''}`,
      })
      continue
    }
    details[key] = output

    const findings = (output as { critical_findings?: unknown[] }).critical_findings ?? []
    for (const raw of findings) {
      const f = raw as { severity?: string; issue?: string; fix_skill?: string }
      if (f.severity === 'high' || f.severity === 'warning') {
        warnings.push({
          skill: skillId,
          severity: f.severity === 'high' ? 'high' : 'warning',
          message: f.issue ?? 'Unspecified finding',
          fix_skill: f.fix_skill,
        })
      }
    }
  }

  // 5. Compute verdict.
  let verdict: PreflightVerdict = 'ready'
  let blockedReason: string | null = null

  const pixelOut = details.pixel as
    | { checks?: { pixel_capi?: { status?: string; evidence?: string } } }
    | null
  const pixelStatus = pixelOut?.checks?.pixel_capi?.status
  if (pixelStatus === 'blocked') {
    verdict = 'blocked'
    blockedReason = pixelOut?.checks?.pixel_capi?.evidence ?? 'Pixel/CAPI blocked — Purchase event missing.'
  } else if (warnings.some(w => w.severity === 'high' || w.severity === 'warning')) {
    verdict = 'warning'
  }

  const result: PreflightResult = {
    brand_id: brandId,
    verdict,
    blocked_reason: blockedReason,
    warnings,
    details,
    cached_at: new Date().toISOString(),
    stale: false,
  }

  await upsert(admin, result)
  return result
}

function emptyDetails(): PreflightDetails {
  return { pixel: null, asc: null, structure: null, learning: null }
}

async function upsert(
  admin: ReturnType<typeof createServiceClient>,
  result: PreflightResult,
): Promise<void> {
  const { error } = await admin.from('preflight_results').upsert({
    brand_id: result.brand_id,
    verdict: result.verdict,
    blocked_reason: result.blocked_reason,
    warnings: result.warnings,
    details: result.details,
    cached_at: result.cached_at,
  })
  if (error) {
    console.error('[preflight] upsert failed', error)
  }
}

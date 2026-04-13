// src/lib/mia-intelligence.ts
//
// Pre-flight checks before skill runs and post-flight actions after.
// Queries intelligence nodes directly (indexed, not RAG).

import {
  getPlatformStatus, getInstruction, getBrandData,
  createMiaDecision, syncPlatformStatus,
  type MiaDecision, type PlatformStatus,
} from '@/lib/knowledge/intelligence'
import { createServiceClient } from '@/lib/supabase/service'

// ---------------------------------------------------------------------------
// Tool → Platform mapping
// ---------------------------------------------------------------------------

const TOOL_PLATFORM_MAP: Record<string, string> = {
  'shopify.products.list': 'shopify',
  'shopify.orders.list': 'shopify',
  'shopify.shop.get': 'shopify',
  'meta_ads.campaigns.insights': 'meta',
  'meta_ads.adsets.list': 'meta',
  'ga4.report.run': 'ga4',
  'gsc.performance': 'gsc',
  'google_ads.campaigns': 'ga4',
  'klaviyo.lists.get': 'klaviyo',
  'klaviyo.flows.get': 'klaviyo',
}

// ---------------------------------------------------------------------------
// Pre-flight check
// ---------------------------------------------------------------------------

export interface PreFlightResult {
  canRun: boolean
  blocked: boolean
  missingPlatforms: string[]
  instruction: string | null
  supplementaryData: Record<string, unknown>
  dataGapsNote: string | null
}

export async function preFlightCheck(
  brandId: string,
  agentId: string,
  mcpTools: string[],
  /** Direct platform names from the skill's `requires` field (e.g. ['meta', 'shopify']). */
  requires: string[] = [],
): Promise<PreFlightResult> {
  // 1. Check which optional platforms are missing (for data gap notes only)
  let platformStatus = await getPlatformStatus(brandId)
  if (!platformStatus) {
    platformStatus = await syncPlatformStatus(brandId)
  }

  const allPlatforms = new Set<string>()
  for (const tool of mcpTools) {
    const platform = TOOL_PLATFORM_MAP[tool]
    if (platform) allPlatforms.add(platform)
  }

  const missingPlatforms: string[] = []
  for (const platform of allPlatforms) {
    const key = platform as keyof PlatformStatus
    if (key !== 'updated_at' && !platformStatus[key]) {
      missingPlatforms.push(platform)
    }
  }

  // 2. Check for manual data fallbacks
  const supplementaryData: Record<string, unknown> = {}
  for (const platform of missingPlatforms) {
    const manualData = await getBrandData(brandId, platform)
    if (manualData) {
      supplementaryData[platform] = manualData.data
    }
  }

  // 3. Check skill-level `requires` — these are direct platform names
  //    declared in the skill .md file. Only block if a required platform
  //    has no credential AND no manual fallback.
  const missingRequired: string[] = []
  for (const platform of requires) {
    const key = platform as keyof PlatformStatus
    const isConnected = key !== 'updated_at' && platformStatus[key]
    if (!isConnected && !supplementaryData[platform]) {
      missingRequired.push(platform)
    }
  }

  const blocked = missingRequired.length > 0

  // 4. Check user instruction
  const instruction = await getInstruction(brandId, agentId)

  // 5. Data gaps = all missing optional platforms (informational, not blocking)
  let dataGapsNote: string | null = null
  if (missingPlatforms.length > 0) {
    const gaps = missingPlatforms.filter(p => !supplementaryData[p])
    if (gaps.length > 0) {
      dataGapsNote = `Missing platform data: ${gaps.join(', ')}. Results may be incomplete. Connect these in Settings > Platforms.`
    }
  }

  return {
    canRun: !blocked,
    blocked,
    missingPlatforms,
    instruction: instruction?.text ?? null,
    supplementaryData,
    dataGapsNote,
  }
}

// ---------------------------------------------------------------------------
// Post-flight decision
// ---------------------------------------------------------------------------

export interface PostFlightInput {
  brandId: string
  agentId: string
  skillId: string
  skillRunId: string
  output: Record<string, unknown>
  chainsTo: string[]
  dataGapsNote: string | null
}

export async function postFlightDecision(input: PostFlightInput): Promise<MiaDecision> {
  const { brandId, agentId, skillId, skillRunId, output, chainsTo, dataGapsNote } = input

  const categories = output.categories as Record<string, { score: number | null; status: string }> | undefined
  const criticalFindings = (output.critical_findings as unknown[]) ?? []

  let decision: MiaDecision['decision'] = 'skip'
  let reasoning = 'All categories healthy. No follow-up needed.'
  const followUpSkills: string[] = []
  const pendingChain: string[] = []

  if (categories) {
    const scored = Object.entries(categories).filter(([, v]) => v.score !== null)
    const critical = scored.filter(([, v]) => (v.score ?? 100) < 40)
    const warning = scored.filter(([, v]) => (v.score ?? 100) >= 40 && (v.score ?? 100) < 60)

    if (critical.length > 0) {
      decision = 'auto_run'
      reasoning = `Critical scores in: ${critical.map(([k]) => k).join(', ')}. Auto-dispatching fixes.`
      for (const f of criticalFindings as Array<{ fix_skill?: string }>) {
        if (f.fix_skill && chainsTo.includes(f.fix_skill)) {
          followUpSkills.push(f.fix_skill)
          pendingChain.push(f.fix_skill)
        }
      }
    } else if (warning.length > 0) {
      decision = 'needs_review'
      reasoning = `Warning scores in: ${warning.map(([k]) => k).join(', ')}. Awaiting user review.`
    }
  }

  if (dataGapsNote) {
    reasoning += ` Note: ${dataGapsNote}`
  }

  const miaDecision: MiaDecision = {
    decision,
    reasoning,
    follow_up_skills: followUpSkills,
    pending_chain: pendingChain,
    skill_run_id: skillRunId,
    target_agent: agentId,
  }

  await createMiaDecision(brandId, miaDecision)

  // Create notification
  const admin = createServiceClient()
  const notifDecision: MiaDecision['decision'] = miaDecision.decision
  await admin.from('notifications').insert({
    brand_id: brandId,
    type: notifDecision === 'blocked' ? 'alert' : notifDecision === 'needs_review' ? 'needs_review' : 'auto_completed',
    agent_id: agentId,
    skill_run_id: skillRunId,
    title: notifDecision === 'auto_run'
      ? `Mia dispatching follow-ups for ${skillId}`
      : notifDecision === 'needs_review'
        ? `${skillId} needs your review`
        : `${skillId} completed — all healthy`,
    body: reasoning,
    read: false,
  })

  return miaDecision
}

// ---------------------------------------------------------------------------
// Blocked decision
// ---------------------------------------------------------------------------

export async function createBlockedDecision(
  brandId: string,
  agentId: string,
  skillId: string,
  missingPlatforms: string[],
): Promise<void> {
  const reasoning = `Cannot run ${skillId}: missing connections (${missingPlatforms.join(', ')}). Connect in Settings > Platforms or provide data on the agent page.`

  await createMiaDecision(brandId, {
    decision: 'blocked',
    reasoning,
    follow_up_skills: [],
    pending_chain: [],
    blocked_reason: `Missing: ${missingPlatforms.join(', ')}`,
    target_agent: agentId,
  })

  const admin = createServiceClient()
  await admin.from('notifications').insert({
    brand_id: brandId,
    type: 'alert',
    agent_id: agentId,
    title: `${skillId} blocked — connect ${missingPlatforms.join(', ')}`,
    body: reasoning,
    read: false,
  })
}

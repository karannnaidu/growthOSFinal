// Mia's dynamic skill catalog. Replaces the drift-prone hand-written list in
// skills/ops/mia-manager/SKILL.md. Every picker wake calls `buildMiaCatalog`
// and feeds the result into the planner prompt.
//
// Filters applied:
//  - drops the mia-manager skill itself (self-reference, meta)
//  - drops foundation helpers (they have no frontmatter id)
//  - drops any skill missing Phase 2 safety metadata — we refuse to dispatch
//    an unknown-safety skill rather than fail open.
//
// The output carries only the fields Mia needs to pick. The full definition
// is still loaded on dispatch via `loadSkill(id)`.

import { loadAllSkills, type SkillDefinition, type SkillSideEffect } from './skill-loader'
import { AGENT_MAP } from './agents-data'

export interface CatalogSkill {
  id: string
  name: string
  agent: string
  agentName: string
  category: string
  complexity: SkillDefinition['complexity']
  credits: number
  requires: string[]
  sideEffect: SkillSideEffect
  reversible: boolean
  requiresHumanApproval: boolean
  descriptionForMia: string
  descriptionForUser: string
  /** True when the agent is a connected/active agent for this brand. Callers
   *  set this by passing the active-agent list; the loader leaves it false. */
  agentActive?: boolean
}

export interface CatalogAgent {
  id: string
  name: string
  role: string
  skillIds: string[]
}

export interface MiaCatalog {
  skills: CatalogSkill[]
  skillById: Map<string, CatalogSkill>
  agents: CatalogAgent[]
  /** Skills whose frontmatter was incomplete — excluded from the picker list.
   *  Useful for logging/alerting in dry-run mode. */
  dropped: Array<{ id: string; reason: string }>
}

function isPickerEligible(s: SkillDefinition): { ok: true } | { ok: false; reason: string } {
  if (!s.id) return { ok: false, reason: 'missing id' }
  if (s.id === 'mia-manager') return { ok: false, reason: 'meta skill' }
  if (!s.sideEffect) return { ok: false, reason: 'missing side_effect' }
  if (typeof s.reversible !== 'boolean') return { ok: false, reason: 'missing reversible' }
  if (typeof s.requiresHumanApproval !== 'boolean') {
    return { ok: false, reason: 'missing requires_human_approval' }
  }
  if (!s.descriptionForMia || s.descriptionForMia.length < 10) {
    return { ok: false, reason: 'missing description_for_mia' }
  }
  if (!s.descriptionForUser || s.descriptionForUser.length < 10) {
    return { ok: false, reason: 'missing description_for_user' }
  }
  return { ok: true }
}

/**
 * Build the catalog Mia sees. Pure: no DB calls, no network — just parses
 * disk skills. Callers layer brand-specific state (connected platforms,
 * recent runs, watches) on top before prompting the model.
 */
export async function buildMiaCatalog(): Promise<MiaCatalog> {
  const all = await loadAllSkills()
  const skills: CatalogSkill[] = []
  const dropped: MiaCatalog['dropped'] = []

  for (const s of all.values()) {
    const eligible = isPickerEligible(s)
    if (!eligible.ok) {
      if (s.id) dropped.push({ id: s.id, reason: eligible.reason })
      continue
    }

    const agent = AGENT_MAP[s.agent]
    skills.push({
      id: s.id,
      name: s.name,
      agent: s.agent,
      agentName: agent?.name ?? s.agent,
      category: s.category,
      complexity: s.complexity,
      credits: s.credits,
      requires: s.requires ?? [],
      sideEffect: s.sideEffect as SkillSideEffect,
      reversible: s.reversible as boolean,
      requiresHumanApproval: s.requiresHumanApproval as boolean,
      descriptionForMia: s.descriptionForMia as string,
      descriptionForUser: s.descriptionForUser as string,
    })
  }

  skills.sort((a, b) =>
    a.agent === b.agent ? a.id.localeCompare(b.id) : a.agent.localeCompare(b.agent),
  )

  const agents: CatalogAgent[] = []
  const byAgent = new Map<string, string[]>()
  for (const s of skills) {
    const list = byAgent.get(s.agent) ?? []
    list.push(s.id)
    byAgent.set(s.agent, list)
  }
  for (const [agentId, skillIds] of byAgent) {
    const meta = AGENT_MAP[agentId]
    agents.push({
      id: agentId,
      name: meta?.name ?? agentId,
      role: meta?.role ?? '',
      skillIds: skillIds.sort(),
    })
  }
  agents.sort((a, b) => a.id.localeCompare(b.id))

  const skillById = new Map(skills.map(s => [s.id, s]))
  return { skills, skillById, agents, dropped }
}

/**
 * Day-0 safety filter. Removes spend/send skills and anything that demands
 * human approval, so a brand-new brand only gets analysis-first work in
 * its first autonomous wake.
 */
export function filterDay0Safe(skills: CatalogSkill[]): CatalogSkill[] {
  return skills.filter(
    s =>
      s.sideEffect !== 'spend' &&
      s.sideEffect !== 'send' &&
      !s.requiresHumanApproval,
  )
}

/**
 * Drops skills whose required platforms are not connected. `connected` is the
 * set of platform ids (e.g. {'meta', 'shopify'}) currently wired for the brand.
 */
export function filterByConnectedPlatforms(
  skills: CatalogSkill[],
  connected: Set<string>,
): CatalogSkill[] {
  return skills.filter(s => s.requires.every(r => connected.has(r)))
}

/**
 * Render the catalog as a compact string block suitable for an LLM prompt.
 * Keeps Mia's prompt small (no knowledge graph, no produces) while carrying
 * the only fields that drive the pick decision.
 */
export function renderCatalogForPrompt(skills: CatalogSkill[]): string {
  const lines: string[] = []
  let currentAgent = ''
  for (const s of skills) {
    if (s.agent !== currentAgent) {
      lines.push(`\n## ${s.agentName} (${s.agent})`)
      currentAgent = s.agent
    }
    const flags = [
      `effect=${s.sideEffect}`,
      s.reversible ? 'reversible' : 'irreversible',
      s.requiresHumanApproval ? 'needs-approval' : 'autonomous',
      `credits=${s.credits}`,
      s.requires.length ? `requires=[${s.requires.join(',')}]` : null,
    ].filter(Boolean)
    lines.push(`- ${s.id} — ${s.descriptionForMia} [${flags.join(', ')}]`)
  }
  return lines.join('\n').trim()
}

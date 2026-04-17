// src/lib/mia-actions.ts

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillAction {
  id: string
  type: 'skill'
  skillId: string
  agentId: string
  reason: string
  dependsOn: string[]
}

export interface CollectAction {
  id: string
  type: 'collect'
  field: string
  storeIn: 'brand_context' | 'agent_setup'
  agentId?: string
  question: string
  fallbackUrl?: string
  dependsOn: string[]
}

export type MiaAction = SkillAction | CollectAction

export interface ParsedMiaResponse {
  /** Message text with the action block stripped out */
  text: string
  /** Parsed actions (empty array if none) */
  actions: MiaAction[]
}

// ---------------------------------------------------------------------------
// Parser — extract ```actions ... ``` block from LLM text
// ---------------------------------------------------------------------------

const ACTION_BLOCK_RE = /```actions\s*\n([\s\S]*?)\n\s*```/

export function parseMiaResponse(raw: string): ParsedMiaResponse {
  const match = raw.match(ACTION_BLOCK_RE)
  if (!match) return { text: raw.trim(), actions: [] }

  const text = raw.replace(ACTION_BLOCK_RE, '').trim()
  let actions: MiaAction[] = []

  try {
    const parsed = JSON.parse(match[1]!) as { actions?: unknown[] }
    if (Array.isArray(parsed.actions)) {
      actions = parsed.actions.filter(isValidAction) as MiaAction[]
    }
  } catch {
    // LLM produced invalid JSON — treat as no actions
  }

  return { text, actions }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isValidAction(a: unknown): boolean {
  if (!a || typeof a !== 'object') return false
  const obj = a as Record<string, unknown>
  if (!obj.id || !obj.type) return false
  if (!Array.isArray(obj.dependsOn)) {
    // Default to empty if missing
    (obj as Record<string, unknown>).dependsOn = []
  }
  if (obj.type === 'skill') {
    return typeof obj.skillId === 'string' && typeof obj.agentId === 'string'
  }
  if (obj.type === 'collect') {
    return typeof obj.field === 'string' && typeof obj.question === 'string'
  }
  return false
}

const MAX_ACTIONS = 5
const MAX_CHAIN_DEPTH = 3

export interface ValidationResult {
  valid: boolean
  errors: string[]
  sorted: MiaAction[]
}

/**
 * Validate actions and return them in topological order.
 * Rejects cycles, unknown deps, too many actions, or deep chains.
 */
export function validateAndSort(actions: MiaAction[]): ValidationResult {
  const errors: string[] = []

  if (actions.length > MAX_ACTIONS) {
    errors.push(`Too many actions (${actions.length}/${MAX_ACTIONS})`)
    return { valid: false, errors, sorted: [] }
  }

  const ids = new Set(actions.map((a) => a.id))

  // Check all dependsOn refs exist
  for (const a of actions) {
    for (const dep of a.dependsOn) {
      if (!ids.has(dep)) {
        errors.push(`Action "${a.id}" depends on unknown action "${dep}"`)
      }
    }
  }
  if (errors.length > 0) return { valid: false, errors, sorted: [] }

  // Topological sort (Kahn's algorithm)
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()
  const actionMap = new Map<string, MiaAction>()

  for (const a of actions) {
    actionMap.set(a.id, a)
    inDegree.set(a.id, a.dependsOn.length)
    for (const dep of a.dependsOn) {
      const existing = adj.get(dep) ?? []
      existing.push(a.id)
      adj.set(dep, existing)
    }
  }

  const queue: string[] = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }

  const sorted: MiaAction[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    sorted.push(actionMap.get(id)!)
    for (const next of adj.get(id) ?? []) {
      const newDeg = (inDegree.get(next) ?? 1) - 1
      inDegree.set(next, newDeg)
      if (newDeg === 0) queue.push(next)
    }
  }

  if (sorted.length !== actions.length) {
    errors.push('Cycle detected in action dependencies')
    return { valid: false, errors, sorted: [] }
  }

  // Check chain depth
  const depth = new Map<string, number>()
  for (const a of sorted) {
    const maxParent = a.dependsOn.reduce((max, dep) => Math.max(max, depth.get(dep) ?? 0), 0)
    depth.set(a.id, maxParent + 1)
    if (maxParent + 1 > MAX_CHAIN_DEPTH) {
      errors.push(`Chain depth exceeds ${MAX_CHAIN_DEPTH} at action "${a.id}"`)
      return { valid: false, errors, sorted: [] }
    }
  }

  return { valid: true, errors: [], sorted }
}

// ---------------------------------------------------------------------------
// Skills catalog builder (for system prompt)
// ---------------------------------------------------------------------------

/** Minimal skill shape the catalog needs — kept narrow so callers can pass
 * either `SkillDefinition` from the loader or a test fixture. */
export interface CatalogSkill {
  id: string
  name?: string
  agent?: string
  requires?: string[]
  mcpTools?: string[]
}

/** Map an MCP tool id like `meta_ads.campaigns.insights` to a coarse platform. */
function toolToPlatform(tool: string): string | null {
  if (tool.startsWith('meta_ads') || tool.startsWith('meta.')) return 'meta'
  if (tool.startsWith('shopify') || tool.startsWith('brand.')) return 'shopify'
  if (tool.startsWith('ga4')) return 'ga4'
  if (tool.startsWith('gsc')) return 'gsc'
  if (tool.startsWith('klaviyo')) return 'klaviyo'
  if (tool.startsWith('google_ads')) return 'google_ads'
  return null
}

function skillPlatforms(skill: CatalogSkill): string[] {
  const set = new Set<string>(skill.requires ?? [])
  for (const t of skill.mcpTools ?? []) {
    const p = toolToPlatform(t)
    if (p) set.add(p)
  }
  return Array.from(set)
}

export function buildSkillsCatalog(
  agents: Array<{ id: string; name: string; role?: string; skills: string[] }>,
  skills?: Map<string, CatalogSkill> | Record<string, CatalogSkill>,
): string {
  const skillMap = skills instanceof Map
    ? skills
    : skills
      ? new Map(Object.entries(skills))
      : null

  const ownerAgents = agents.filter((a) => a.id !== 'mia')

  const perAgent = ownerAgents.map((a) => {
    const header = a.role ? `### ${a.id} (${a.name} — ${a.role})` : `### ${a.id} (${a.name})`
    if (!skillMap) {
      return `${header}\n  skills: ${a.skills.join(', ')}`
    }
    const rows = a.skills.map((sid) => {
      const def = skillMap.get(sid)
      if (!def) return `  - \`${sid}\``
      const plats = skillPlatforms(def)
      const requiresTag = def.requires && def.requires.length > 0
        ? ` [requires: ${def.requires.join(', ')}]`
        : ''
      const readsTag = plats.length > 0 && !(def.requires && def.requires.length === plats.length)
        ? ` [reads: ${plats.filter((p) => !(def.requires ?? []).includes(p)).join(', ')}]`
        : ''
      const name = def.name ? ` — ${def.name}` : ''
      return `  - \`${sid}\`${name}${requiresTag}${readsTag}`
    })
    return `${header}\n${rows.join('\n')}`
  })

  // Build platform → owner-agent index so Mia routes by platform, not skill name.
  const platformOwner: Record<string, string[]> = {}
  if (skillMap) {
    for (const a of ownerAgents) {
      for (const sid of a.skills) {
        const def = skillMap.get(sid)
        if (!def) continue
        for (const p of skillPlatforms(def)) {
          ;(platformOwner[p] ??= []).push(`${a.id}.${sid}`)
        }
      }
    }
  }
  const platformIndex = Object.keys(platformOwner).length > 0
    ? Object.entries(platformOwner)
        .map(([plat, entries]) => `- **${plat}** → ${Array.from(new Set(entries.map((e) => e.split('.')[0]))).join(', ')}`)
        .join('\n')
    : ''

  const routingRules = `
## Routing rules (important)
- Pick the agent that OWNS the platform, not the one whose skill name sounds related.
- Meta Ads questions → **max** (ad-performance-analyzer, campaign-optimizer, ad-scaling, budget-allocation).
- Shopify / orders / products → **navi** or **scout** depending on intent (inventory vs. diagnostics).
- Email / SMS → **luna**. SEO / content → **hugo**. Creative / ads copy → **aria**. CRO / landing pages → **sage**.
- \`health-check\` (scout) is a holistic cross-platform diagnostic — use it for "how's my brand doing" questions, NOT for a single-platform connectivity or performance check.
- If a skill has \`[requires: X]\` and X is not connected, ask the user to connect in Settings → Platforms instead of running it.
${platformIndex ? `\n### Platform → agent index\n${platformIndex}\n` : ''}`

  return `## Available Skills

You can trigger skills by including an \`\`\`actions block in your response.
Only include actions when the user's request clearly needs a skill to run.
Do NOT include actions for simple conversational questions.

${perAgent.join('\n\n')}
${routingRules}
If a skill requires data the user hasn't provided, use a "collect" action first.

Action block format — include this fenced block after your message text:

\`\`\`actions
{
  "actions": [
    {
      "id": "a1",
      "type": "skill",
      "skillId": "<skill-id>",
      "agentId": "<agent-id>",
      "reason": "Why this skill is needed",
      "dependsOn": []
    }
  ]
}
\`\`\`

For data collection:
{
  "id": "c1",
  "type": "collect",
  "field": "<field_name>",
  "storeIn": "brand_context",
  "agentId": "<agent-id>",
  "question": "Question to ask the user",
  "fallbackUrl": "/dashboard/agents/<agent-id>",
  "dependsOn": []
}

Rules:
- Maximum 5 actions per block
- Use dependsOn to chain skills (e.g. health-check -> ad-copy)
- Each action needs a unique id (a1, a2, c1, etc.)
- Always include a reason explaining why each skill is needed`
}

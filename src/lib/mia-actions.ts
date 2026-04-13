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

export function buildSkillsCatalog(
  agents: Array<{ id: string; name: string; skills: string[] }>,
): string {
  const lines = agents
    .filter((a) => a.id !== 'mia') // Mia doesn't trigger herself
    .map((a) => `- ${a.id} (${a.name}): ${a.skills.join(', ')}`)

  return `## Available Skills

You can trigger skills by including an \`\`\`actions block in your response.
Only include actions when the user's request clearly needs a skill to run.
Do NOT include actions for simple conversational questions.

Available skills by agent:
${lines.join('\n')}

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

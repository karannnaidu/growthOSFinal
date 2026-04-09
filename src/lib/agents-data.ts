import agentsJson from '../../skills/agents.json'

export interface AgentConfig {
  id: string
  name: string
  role: string
  color: string
  avatar: string
  skills: string[]
  description: string
  schedule: string | null
  is_manager: boolean
  can_spawn: boolean
}

export const AGENTS: AgentConfig[] = agentsJson as AgentConfig[]
export const AGENT_MAP: Record<string, AgentConfig> = Object.fromEntries(
  AGENTS.map(a => [a.id, a])
)
export const AGENT_COLORS: Record<string, string> = Object.fromEntries(
  AGENTS.map(a => [a.id, a.color])
)

// Category mapping for directory filters
export const AGENT_CATEGORIES: Record<string, string[]> = {
  'Creative': ['aria'],
  'Growth': ['hugo', 'nova'],
  'Finance': ['max', 'penny'],
  'Diagnosis': ['scout', 'echo'],
  'Retention': ['luna'],
  'Ops': ['navi', 'sage', 'atlas'],
}

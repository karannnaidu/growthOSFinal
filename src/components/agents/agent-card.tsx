'use client'

import { useRouter } from 'next/navigation'

export interface AgentCardData {
  id: string
  name: string
  role: string
  color: string
  description: string
  skills: string[]
  enabled?: boolean
}

interface AgentCardProps {
  agent: AgentCardData
}

export function AgentCard({ agent }: AgentCardProps) {
  const router = useRouter()

  return (
    <button
      type="button"
      onClick={() => router.push(`/dashboard/agents/${agent.id}`)}
      className="glass-panel text-left w-full rounded-xl overflow-hidden transition-all duration-200 hover:scale-[1.02] hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Accent bar */}
      <div className="h-1 w-full" style={{ background: agent.color }} />

      <div className="p-5 space-y-3">
        {/* Avatar + name row */}
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white"
            style={{ background: agent.color }}
            aria-hidden="true"
          >
            {agent.name[0]}
          </div>
          <div className="min-w-0">
            <p className="font-heading font-semibold text-sm text-foreground leading-tight truncate">
              {agent.name}
            </p>
            <p className="text-xs text-muted-foreground truncate">{agent.role}</p>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {agent.description}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{
              background: `${agent.color}18`,
              color: agent.color,
            }}
          >
            {agent.skills.length} skill{agent.skills.length !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: agent.enabled !== false ? '#10b981' : '#64748b' }}
            />
            {agent.enabled !== false ? 'Active' : 'Disabled'}
          </span>
        </div>
      </div>
    </button>
  )
}

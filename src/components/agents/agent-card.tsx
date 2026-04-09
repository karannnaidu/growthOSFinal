'use client'

import { useRouter } from 'next/navigation'
import { AgentAvatar } from '@/components/agents/agent-avatar'

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
  latestStatus?: string
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  working:   { label: 'Working', color: '#f59e0b' },
  running:   { label: 'Working', color: '#f59e0b' },
  completed: { label: 'Completed', color: '#10b981' },
  failed:    { label: 'Failed', color: '#e11d48' },
  idle:      { label: 'Idle', color: '#64748b' },
}

export function AgentCard({ agent, latestStatus }: AgentCardProps) {
  const router = useRouter()
  const status = STATUS_MAP[latestStatus ?? ''] ?? STATUS_MAP['idle']!
  const isMia = agent.id === 'mia'

  return (
    <button
      type="button"
      onClick={() => router.push(`/dashboard/agents/${agent.id}`)}
      className="glass-panel text-left w-full rounded-xl overflow-hidden transition-all duration-200 hover:scale-[1.02] hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring relative"
    >
      {/* Accent bar */}
      <div className="h-1 w-full" style={{ background: agent.color }} />

      <div className="p-5 space-y-3">
        {/* Avatar + name row */}
        <div className="flex items-center gap-3">
          <AgentAvatar
            agentId={agent.id}
            size="md"
            state={latestStatus === 'working' || latestStatus === 'running' ? 'working' : 'default'}
          />
          <div className="min-w-0 flex-1">
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
              style={{ background: status.color }}
            />
            {status.label}
          </span>
        </div>
      </div>

      {/* Mia Active badge */}
      {isMia && (
        <span
          className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm"
          style={{ background: '#6366F133', color: '#6366F1' }}
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#6366F1] animate-pulse" />
          Supervising
        </span>
      )}
    </button>
  )
}

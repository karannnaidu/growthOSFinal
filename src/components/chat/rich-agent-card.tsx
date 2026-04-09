'use client'

import Link from 'next/link'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import { AGENT_MAP, AGENT_COLORS } from '@/lib/agents-data'

interface RichAgentCardProps {
  agentId: string
  metrics?: Record<string, string>
  findings?: string[]
}

export function RichAgentCard({ agentId, metrics, findings }: RichAgentCardProps) {
  const agent = AGENT_MAP[agentId]
  const color = AGENT_COLORS[agentId] ?? '#6366f1'
  const name = agent?.name ?? agentId
  const role = agent?.role ?? ''

  return (
    <Link
      href={`/dashboard/agents/${agentId}`}
      className="block my-2 rounded-xl overflow-hidden border border-white/[0.08] hover:border-white/[0.15] transition-colors duration-150"
    >
      {/* Color accent */}
      <div className="h-1" style={{ backgroundColor: color }} aria-hidden="true" />

      <div className="p-3 bg-white/[0.02]">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-2">
          <AgentAvatar agentId={agentId} size="sm" />
          <div className="min-w-0">
            <p className="text-xs font-heading font-semibold text-foreground">{name}</p>
            {role && <p className="text-[10px] text-muted-foreground">{role}</p>}
          </div>
        </div>

        {/* Metrics */}
        {metrics && Object.keys(metrics).length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
            {Object.entries(metrics).map(([key, val]) => (
              <div key={key} className="text-[10px]">
                <span className="text-muted-foreground">{key}: </span>
                <span className="font-mono text-foreground font-medium">{val}</span>
              </div>
            ))}
          </div>
        )}

        {/* Findings */}
        {findings && findings.length > 0 && (
          <ul className="space-y-0.5">
            {findings.slice(0, 3).map((finding, i) => (
              <li key={i} className="text-[11px] text-muted-foreground flex gap-1.5">
                <span className="text-[#6366f1] shrink-0" aria-hidden="true">-</span>
                {finding}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Link>
  )
}

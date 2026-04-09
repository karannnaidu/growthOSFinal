'use client'

import Link from 'next/link'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import { cn } from '@/lib/utils'

export interface ChainNode {
  agentId: string
  agentName: string
  role: string
  status: 'supervising' | 'running' | 'action_required' | 'standby'
  progress?: number
}

interface AgentChainsProps {
  nodes: ChainNode[]
}

const STATUS_CONFIG: Record<string, { dot: string; label: string; text: string }> = {
  supervising: { dot: 'bg-[#6366f1]', label: 'Supervising', text: 'text-[#6366f1]' },
  running: { dot: 'bg-emerald-400 animate-pulse', label: 'Running', text: 'text-emerald-400' },
  action_required: { dot: 'bg-amber-400 animate-pulse', label: 'Action Required', text: 'text-amber-400' },
  standby: { dot: 'bg-white/20', label: 'Standby', text: 'text-muted-foreground' },
}

export function AgentChains({ nodes }: AgentChainsProps) {
  if (nodes.length === 0) return null

  return (
    <div className="glass-panel rounded-2xl p-5">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
        Active Agent Pipeline
      </h3>

      <div className="relative pl-5">
        {/* Connecting vertical line */}
        <div
          className="absolute left-[15px] top-4 bottom-4 w-px bg-white/[0.08]"
          aria-hidden="true"
        />

        <div className="space-y-1">
          {nodes.map((node, i) => {
            const cfg = (STATUS_CONFIG[node.status] ?? STATUS_CONFIG.standby) as { dot: string; label: string; text: string }
            const avatarState =
              node.status === 'running'
                ? 'working'
                : node.status === 'action_required'
                  ? 'concerned'
                  : 'default'

            return (
              <Link
                key={node.agentId}
                href={`/dashboard/agents/${node.agentId}`}
                className="relative flex items-center gap-3 p-2.5 -ml-5 rounded-xl hover:bg-white/[0.04] transition-colors duration-150 group"
              >
                {/* Node dot on the line */}
                <div className="relative z-10">
                  <AgentAvatar agentId={node.agentId} size="sm" state={avatarState} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate group-hover:text-white transition-colors">
                      {node.agentName}
                    </span>
                    <span className={cn('flex items-center gap-1.5 text-[10px] font-medium', cfg.text)}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
                      {cfg.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{node.role}</p>
                </div>

                {node.progress != null && node.progress > 0 && (
                  <div className="w-12 h-1.5 rounded-full bg-white/[0.06] overflow-hidden shrink-0">
                    <div
                      className="h-full rounded-full bg-[#6366f1] transition-all duration-500"
                      style={{ width: `${Math.min(node.progress, 100)}%` }}
                    />
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

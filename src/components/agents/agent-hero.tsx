'use client'

import { Settings } from 'lucide-react'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import { Button } from '@/components/ui/button'
import type { AgentConfig } from '@/lib/agents-data'

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  working:   { label: 'Working', color: '#f59e0b' },
  running:   { label: 'Working', color: '#f59e0b' },
  completed: { label: 'Completed', color: '#10b981' },
  failed:    { label: 'Failed', color: '#e11d48' },
  idle:      { label: 'Idle', color: '#64748b' },
}

interface AgentHeroProps {
  agent: AgentConfig
  status?: string
  onConfigure?: () => void
}

export function AgentHero({ agent, status, onConfigure }: AgentHeroProps) {
  const s = STATUS_MAP[status ?? ''] ?? STATUS_MAP['idle']!

  return (
    <div
      className="relative rounded-xl overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${agent.color}22 0%, ${agent.color}08 50%, transparent 100%)`,
      }}
    >
      {/* Top accent bar */}
      <div className="h-1 w-full" style={{ background: agent.color }} />

      <div className="p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-5">
        <AgentAvatar
          agentId={agent.id}
          size="xl"
          state={status === 'working' || status === 'running' ? 'working' : 'default'}
        />

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-heading font-bold text-foreground">{agent.name}</h1>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
              style={{ background: `${s.color}18`, color: s.color }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: s.color }}
              />
              {s.label}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{agent.role}</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{agent.description}</p>
          {agent.schedule && (
            <p className="text-xs text-muted-foreground opacity-60">
              Scheduled: <code className="font-mono">{agent.schedule}</code>
            </p>
          )}
        </div>

        {onConfigure && (
          <Button variant="outline" size="sm" onClick={onConfigure} className="shrink-0">
            <Settings className="h-3.5 w-3.5 mr-1.5" />
            Configure
          </Button>
        )}
      </div>
    </div>
  )
}

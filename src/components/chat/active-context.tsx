'use client'

import { Sparkles, Globe, Target, Cpu } from 'lucide-react'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import { cn } from '@/lib/utils'

interface ActiveContextProps {
  brandContext?: {
    focusAreas: string[]
    aiPreset: string
  }
  activeAgents?: {
    agentId: string
    status: string
  }[]
  sources?: string[]
}

const STATUS_DOT: Record<string, string> = {
  running: 'bg-emerald-400 animate-pulse',
  idle: 'bg-white/20',
  standby: 'bg-amber-400',
}

export function ActiveContext({ brandContext, activeAgents, sources }: ActiveContextProps) {
  return (
    <aside className="flex w-80 flex-col glass-panel border-l border-white/[0.06] overflow-hidden shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Active Context
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Engine Focus */}
        <section>
          <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
            <Target className="h-3 w-3" aria-hidden="true" />
            Engine Focus
          </h3>
          <div className="space-y-2">
            {brandContext?.focusAreas && brandContext.focusAreas.length > 0 ? (
              brandContext.focusAreas.map((area, i) => (
                <div
                  key={i}
                  className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-foreground"
                >
                  {area}
                </div>
              ))
            ) : (
              <>
                <div className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-foreground">
                  Strategy
                </div>
                <div className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-foreground">
                  Brand Voice
                </div>
                <div className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-foreground">
                  Target ROI
                </div>
              </>
            )}
          </div>
          {brandContext?.aiPreset && (
            <p className="mt-2 text-[10px] text-muted-foreground">
              AI Preset: <span className="text-foreground">{brandContext.aiPreset}</span>
            </p>
          )}
        </section>

        {/* Delegated Sub-Agents */}
        <section>
          <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
            <Cpu className="h-3 w-3" aria-hidden="true" />
            Delegated Sub-Agents
          </h3>
          {activeAgents && activeAgents.length > 0 ? (
            <div className="space-y-1.5">
              {activeAgents.map((agent) => (
                <div
                  key={agent.agentId}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-white/[0.02]"
                >
                  <AgentAvatar agentId={agent.agentId} size="sm" />
                  <span className="text-xs text-foreground flex-1 truncate capitalize">
                    {agent.agentId}
                  </span>
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full shrink-0',
                      STATUS_DOT[agent.status] ?? STATUS_DOT.idle,
                    )}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/50">No active agents</p>
          )}
        </section>

        {/* Ingested Sources */}
        <section>
          <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
            <Globe className="h-3 w-3" aria-hidden="true" />
            Ingested Sources
          </h3>
          {sources && sources.length > 0 ? (
            <div className="space-y-1">
              {sources.map((source, i) => (
                <p key={i} className="text-xs text-muted-foreground truncate">
                  {source}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/50">No sources ingested</p>
          )}
        </section>
      </div>

      {/* Mia Status footer */}
      <div className="px-4 py-3 border-t border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#6366f1]/20">
            <Sparkles className="h-2.5 w-2.5 text-[#6366f1]" aria-hidden="true" />
          </div>
          <span className="text-[10px] text-muted-foreground">
            Mia is <span className="text-emerald-400 font-medium">online</span>
          </span>
        </div>
      </div>
    </aside>
  )
}

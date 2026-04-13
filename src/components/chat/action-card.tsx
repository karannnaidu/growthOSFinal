// src/components/chat/action-card.tsx
'use client'

import { useState } from 'react'
import {
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Zap,
} from 'lucide-react'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import { SkillOutput } from '@/components/ui/skill-output'
import { AGENT_MAP } from '@/lib/agents-data'
import type { SkillAction } from '@/lib/mia-actions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActionStatus = 'pending' | 'running' | 'complete' | 'failed'

export interface ActionState {
  status: ActionStatus
  output?: Record<string, unknown>
  creditsUsed?: number
  error?: string
}

interface ActionCardProps {
  actions: SkillAction[]
  actionStates: Record<string, ActionState>
  totalCredits: number
  onRunAll: () => void
  onSkip: () => void
  disabled?: boolean
}

// ---------------------------------------------------------------------------
// Single action row
// ---------------------------------------------------------------------------

function ActionRow({
  action,
  state,
}: {
  action: SkillAction
  state: ActionState
}) {
  const [expanded, setExpanded] = useState(false)
  const agent = AGENT_MAP[action.agentId]
  const agentColor = agent?.color ?? '#6366f1'

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <AgentAvatar agentId={action.agentId} size="sm" />

        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground truncate">
            {action.skillId}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">
            {action.reason}
          </p>
        </div>

        {/* Status indicator */}
        {state.status === 'running' && (
          <Loader2
            className="h-4 w-4 animate-spin shrink-0"
            style={{ color: agentColor }}
          />
        )}
        {state.status === 'complete' && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        )}
        {state.status === 'failed' && (
          <div className="flex items-center gap-1 text-[10px] text-red-400">
            <XCircle className="h-3.5 w-3.5" />
            <span className="truncate max-w-[120px]">{state.error ?? 'Failed'}</span>
          </div>
        )}
        {state.status === 'pending' && (
          <span className="text-[10px] text-muted-foreground">Pending</span>
        )}
      </div>

      {/* Expanded output */}
      {expanded && state.output && (
        <div className="mt-2">
          <SkillOutput output={state.output} compact maxHeight={240} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main ActionCard
// ---------------------------------------------------------------------------

export function ActionCard({
  actions,
  actionStates,
  totalCredits,
  onRunAll,
  onSkip,
  disabled = false,
}: ActionCardProps) {
  const isRunning = Object.values(actionStates).some(
    (s) => s.status === 'running',
  )
  const allDone = Object.values(actionStates).every(
    (s) => s.status === 'complete' || s.status === 'failed',
  )
  const showButtons = !isRunning && !allDone

  return (
    <div className="mt-3 rounded-xl border border-[#6366f1]/20 bg-[#6366f1]/[0.04] p-3 space-y-2.5">
      {/* Header with Run All / Skip */}
      {showButtons && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Zap className="h-3 w-3 text-[#6366f1]" />
            <span>
              {actions.length} skill{actions.length > 1 ? 's' : ''}
              {totalCredits > 0 ? ` \u00b7 ~${totalCredits} credits` : ''}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onSkip}
              disabled={disabled}
              className="px-2.5 py-1 rounded-lg text-[11px] text-muted-foreground
                hover:text-foreground hover:bg-white/[0.06] transition-colors
                disabled:opacity-50"
            >
              Skip
            </button>
            <button
              onClick={onRunAll}
              disabled={disabled}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-medium
                bg-[#6366f1] text-white hover:bg-[#6366f1]/80 transition-colors
                disabled:opacity-50"
            >
              <Play className="h-3 w-3" />
              Run{actions.length > 1 ? ' All' : ''}
            </button>
          </div>
        </div>
      )}

      {/* Action rows */}
      <div className="space-y-1.5">
        {actions.map((action) => (
          <ActionRow
            key={action.id}
            action={action}
            state={actionStates[action.id] ?? { status: 'pending' }}
          />
        ))}
      </div>
    </div>
  )
}

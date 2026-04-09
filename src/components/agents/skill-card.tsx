'use client'

import { Play, Loader2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const TIER_COLORS: Record<string, string> = {
  free: '#10b981',
  cheap: '#3b82f6',
  mid: '#f59e0b',
  premium: '#e11d48',
}

interface SkillCardProps {
  skillId: string
  agentColor: string
  tier?: string
  credits?: number
  lastRun?: string
  isRunning?: boolean
  onRun: () => void
}

export function SkillCard({
  skillId,
  agentColor,
  tier = 'cheap',
  credits,
  lastRun,
  isRunning,
  onRun,
}: SkillCardProps) {
  const tierColor = TIER_COLORS[tier] ?? TIER_COLORS['cheap']!
  const tierLabel = tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'Cheap'

  return (
    <div className="glass-panel rounded-xl overflow-hidden transition-all duration-200 hover:shadow-md">
      {/* Agent color accent bar */}
      <div className="h-0.5 w-full" style={{ background: agentColor }} />

      <div className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={{ background: `${agentColor}18` }}
            >
              <Zap className="h-3.5 w-3.5" style={{ color: agentColor }} />
            </div>
            <p className="text-xs font-medium text-foreground truncate">{skillId}</p>
          </div>

          {/* Tier badge */}
          <span
            className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ background: `${tierColor}18`, color: tierColor }}
          >
            {tierLabel}
          </span>
        </div>

        {/* Meta row */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          {credits != null && (
            <span>{credits} credit{credits !== 1 ? 's' : ''}</span>
          )}
          {lastRun && <span>{lastRun}</span>}
        </div>

        {/* Run button */}
        <Button
          size="xs"
          variant="outline"
          disabled={isRunning}
          onClick={onRun}
          className={cn('w-full', isRunning && 'opacity-70')}
          aria-label={`Run ${skillId}`}
        >
          {isRunning ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <Play className="h-3 w-3 mr-1" />
          )}
          {isRunning ? 'Running...' : 'Run'}
        </Button>
      </div>
    </div>
  )
}

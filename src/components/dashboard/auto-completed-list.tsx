'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'

interface SkillRunItem {
  id: string
  skill_name?: string
  agent?: string
  output?: string | Record<string, unknown>
  created_at: string
  status?: string
  [key: string]: unknown
}

interface AutoCompletedListProps {
  items: SkillRunItem[]
}

const AGENT_COLORS: Record<string, string> = {
  mia: '#6366f1',
  scout: '#0d9488',
  aria: '#f97316',
  luna: '#10b981',
  hugo: '#d97706',
  sage: '#8b5cf6',
  max: '#3b82f6',
  atlas: '#e11d48',
  echo: '#64748b',
  nova: '#7c3aed',
  navi: '#0ea5e9',
  penny: '#059669',
}

function getAgentColor(agent?: string): string {
  if (!agent) return '#10b981'
  return AGENT_COLORS[agent.toLowerCase()] ?? '#10b981'
}

function formatOutputSummary(output: SkillRunItem['output']): string {
  if (!output) return ''
  if (typeof output === 'string') return output.slice(0, 100)
  if (typeof output === 'object') {
    const summary = (output as Record<string, unknown>).summary ?? (output as Record<string, unknown>).message
    if (typeof summary === 'string') return summary.slice(0, 100)
  }
  return ''
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return `${Math.floor(diffHours / 24)}d ago`
}

function AutoCompletedCard({ item }: { item: SkillRunItem }) {
  const agentColor = getAgentColor(item.agent)
  const agentLabel = item.agent ? item.agent.charAt(0).toUpperCase() + item.agent.slice(1) : 'Mia'
  const skillName = item.skill_name ?? 'Unknown Skill'
  const summary = formatOutputSummary(item.output)
  const timeAgo = formatRelativeTime(item.created_at)

  return (
    <div
      className="relative rounded-xl glass-panel-elevated border-l-2 p-4 transition-all hover:bg-white/[0.04]"
      style={{ borderLeftColor: '#10b981' }}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: agentColor }}
          aria-hidden="true"
        >
          {agentLabel[0]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-foreground leading-snug">{skillName}</p>
            <span className="shrink-0 text-xs text-muted-foreground">{timeAgo}</span>
          </div>
          {summary && (
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">
              {summary}
            </p>
          )}
          <p className="mt-1.5 text-xs text-muted-foreground/60">{agentLabel}</p>
        </div>
      </div>
    </div>
  )
}

const INITIAL_SHOW = 5

export function AutoCompletedList({ items }: AutoCompletedListProps) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? items : items.slice(0, INITIAL_SHOW)
  const hasMore = items.length > INITIAL_SHOW

  return (
    <Card className="glass-panel glow-luna">
      <CardHeader className="border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-[#10b981]" aria-hidden="true" />
          <CardTitle className="text-sm font-heading font-semibold text-foreground">
            Auto-Completed
          </CardTitle>
          {items.length > 0 && (
            <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-[#10b981]/15 text-xs font-medium text-[#10b981]">
              {items.length}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#10b981]/10">
              <CheckCircle2 className="h-5 w-5 text-[#10b981]/50" aria-hidden="true" />
            </div>
            <p className="text-sm text-muted-foreground">No tasks auto-completed yet today</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((item) => (
              <AutoCompletedCard key={item.id} item={item} />
            ))}
            {hasMore && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAll(!showAll)}
                className="w-full text-xs text-muted-foreground hover:text-foreground"
              >
                {showAll ? (
                  <>
                    <ChevronUp className="mr-1 h-3 w-3" aria-hidden="true" />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="mr-1 h-3 w-3" aria-hidden="true" />
                    Show {items.length - INITIAL_SHOW} more
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

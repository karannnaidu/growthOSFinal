'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Sparkles } from 'lucide-react'

interface NotificationItem {
  id: string
  title: string
  body?: string
  agent?: string
  created_at: string
  [key: string]: unknown
}

interface NeedsReviewListProps {
  items: NotificationItem[]
}

// Agent accent colors map
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
  if (!agent) return '#f59e0b'
  return AGENT_COLORS[agent.toLowerCase()] ?? '#f59e0b'
}

function NotificationCard({ item }: { item: NotificationItem }) {
  const agentColor = getAgentColor(item.agent)
  const agentLabel = item.agent ? item.agent.charAt(0).toUpperCase() + item.agent.slice(1) : 'Mia'

  return (
    <div className="relative rounded-xl glass-panel-elevated border-l-2 p-4 transition-all hover:bg-white/[0.04]"
      style={{ borderLeftColor: '#f59e0b' }}>
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: agentColor }}
          aria-hidden="true"
        >
          {agentLabel[0]}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground leading-snug">{item.title}</p>
          {item.body && (
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">
              {item.body}
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              className="h-7 px-3 text-xs font-medium bg-[#f59e0b]/15 text-[#f59e0b] hover:bg-[#f59e0b]/25 border-0"
            >
              Review
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Sparkles className="mr-1 h-3 w-3" aria-hidden="true" />
              Let Mia Decide
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function NeedsReviewList({ items }: NeedsReviewListProps) {
  return (
    <Card className="glass-panel">
      <CardHeader className="border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[#f59e0b]" aria-hidden="true" />
          <CardTitle className="text-sm font-heading font-semibold text-foreground">
            Needs Review
          </CardTitle>
          {items.length > 0 && (
            <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-[#f59e0b]/15 text-xs font-medium text-[#f59e0b]">
              {items.length}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#f59e0b]/10">
              <AlertTriangle className="h-5 w-5 text-[#f59e0b]/50" aria-hidden="true" />
            </div>
            <p className="text-sm text-muted-foreground">Nothing needs your attention right now</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <NotificationCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

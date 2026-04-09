'use client'

import { useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { AGENT_COLORS } from '@/lib/agents-data'

interface RecommendationCardProps {
  agentId: string
  title: string
  description: string
  ctaLabel: string
  skillId: string
  brandId: string
}

export function RecommendationCard({
  agentId,
  title,
  description,
  ctaLabel,
  skillId,
  brandId,
}: RecommendationCardProps) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const color = AGENT_COLORS[agentId] ?? '#6366f1'

  async function handleRun() {
    if (loading || done) return
    setLoading(true)
    try {
      await fetch('/api/skills/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId, brandId }),
      })
      setDone(true)
    } catch {
      // Silently handle — user will see no state change
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      {/* Accent bar */}
      <div className="h-1" style={{ backgroundColor: color }} aria-hidden="true" />

      <div className="p-5">
        <h4 className="text-sm font-heading font-semibold text-foreground mb-1.5">{title}</h4>
        <p className="text-xs text-muted-foreground leading-relaxed mb-4">{description}</p>

        <button
          onClick={handleRun}
          disabled={loading || done}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium
            transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            backgroundColor: done ? 'rgba(16,185,129,0.15)' : `${color}20`,
            color: done ? '#10b981' : color,
            borderWidth: 1,
            borderColor: done ? 'rgba(16,185,129,0.3)' : `${color}33`,
          }}
        >
          {loading ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              Running...
            </>
          ) : done ? (
            'Queued'
          ) : (
            <>
              {ctaLabel}
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </>
          )}
        </button>
      </div>
    </div>
  )
}

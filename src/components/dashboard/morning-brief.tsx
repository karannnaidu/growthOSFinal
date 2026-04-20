'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Sparkles, ArrowRight, Play, RefreshCw } from 'lucide-react'

interface MiaDecision {
  decision: string
  reasoning: string
  target_agent?: string
}

interface MorningBriefProps {
  narrative: string
  metricsContext: string
  latestRunId?: string
  brandId?: string
  miaDecisions?: MiaDecision[]
  onTriggerReview?: () => void
}

export function MorningBrief({
  narrative,
  metricsContext,
  latestRunId,
  brandId,
  miaDecisions,
  onTriggerReview,
}: MorningBriefProps) {
  // Build smarter narrative from Mia decisions when available
  const displayNarrative = (() => {
    if (!miaDecisions || miaDecisions.length === 0) return narrative
    const activeCount = miaDecisions.filter(d => d.decision === 'auto_run').length
    const blockedCount = miaDecisions.filter(d => d.decision === 'blocked').length
    const latestReasoning = miaDecisions[0]?.reasoning
    const parts: string[] = []
    if (activeCount > 0) parts.push(`${activeCount} agent${activeCount > 1 ? 's' : ''} active`)
    if (latestReasoning) parts.push(latestReasoning.slice(0, 120))
    if (blockedCount > 0) parts.push(`${blockedCount} agent${blockedCount > 1 ? 's' : ''} need attention`)
    return parts.length > 0 ? parts.join('. ') + '.' : narrative
  })()
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="glass-panel rounded-2xl p-6 md:p-8 relative overflow-hidden">
      {/* Subtle gradient accent */}
      <div
        className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl"
        style={{
          background: 'linear-gradient(90deg, #6366f1, #818cf8, #6366f1)',
        }}
        aria-hidden="true"
      />

      {/* Badge + date */}
      <div className="flex items-center gap-3 mb-4">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-[#6366f1]/15 text-[#6366f1] border border-[#6366f1]/20">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          Mia&apos;s Morning Brief
        </span>
        <span className="text-xs text-muted-foreground">{today}</span>
      </div>

      {/* Narrative */}
      <h2 className="font-heading text-xl md:text-2xl font-bold text-foreground leading-snug mb-3">
        {displayNarrative}
      </h2>

      {/* Metrics context */}
      <p className="text-sm text-muted-foreground leading-relaxed mb-6 max-w-2xl">
        {metricsContext}
      </p>

      {/* Actions */}
      <MiaActions brandId={brandId} latestRunId={latestRunId} onTriggerReview={onTriggerReview} />
    </div>
  )
}

function MiaActions({ brandId, latestRunId, onTriggerReview }: { brandId?: string; latestRunId?: string; onTriggerReview?: () => void }) {
  const [triggering, setTriggering] = useState(false)
  const [triggered, setTriggered] = useState(false)

  async function handleTrigger() {
    if (!brandId || triggering) return
    if (onTriggerReview) {
      onTriggerReview()
      return
    }
    setTriggering(true)
    try {
      const res = await fetch('/api/mia/wake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, source: 'heartbeat', dryRun: false }),
      })
      if (res.ok) setTriggered(true)
    } finally {
      setTriggering(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {triggered ? (
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-[#059669]/15 text-[#059669] border border-[#059669]/20 hover:bg-[#059669]/25 transition-colors"
        >
          <Play className="h-4 w-4" />
          Done! Refresh to see results
        </button>
      ) : (
        <button
          onClick={handleTrigger}
          disabled={triggering || !brandId}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium
            bg-[#6366f1] text-white hover:bg-[#6366f1]/90 active:scale-[0.98]
            transition-all duration-150 shadow-lg shadow-[#6366f1]/20 disabled:opacity-50"
        >
          {triggering ? (
            <><RefreshCw className="h-4 w-4 animate-spin" /> Running...</>
          ) : (
            <><Play className="h-4 w-4" /> Run Mia&apos;s Review</>
          )}
        </button>
      )}

      <Link
        href="/dashboard/chat"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium
          text-foreground border border-white/[0.1] hover:border-white/[0.2] hover:bg-white/[0.04]
          transition-all duration-150"
      >
        Chat with Mia
        <ArrowRight className="h-4 w-4" />
      </Link>

      {latestRunId && (
        <Link
          href={`/dashboard/runs/${latestRunId}`}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium
            text-foreground border border-white/[0.1] hover:border-white/[0.2] hover:bg-white/[0.04]
            transition-all duration-150"
        >
          View Full Audit
        </Link>
      )}
    </div>
  )
}

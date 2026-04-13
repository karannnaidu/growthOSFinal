// src/components/chat/collect-card.tsx
'use client'

import { useState } from 'react'
import { Send, ExternalLink, CheckCircle2 } from 'lucide-react'
import type { CollectAction } from '@/lib/mia-actions'

interface CollectCardProps {
  action: CollectAction
  brandId: string
  onCollected: (actionId: string, value: string) => void
  onSkip: (actionId: string) => void
  disabled?: boolean
}

export function CollectCard({
  action,
  brandId,
  onCollected,
  onSkip,
  disabled = false,
}: CollectCardProps) {
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit() {
    if (!value.trim()) return
    setSubmitting(true)

    try {
      const res = await fetch('/api/mia/actions/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          field: action.field,
          value: value.trim(),
          storeIn: action.storeIn,
          agentId: action.agentId,
        }),
      })

      if (res.ok) {
        setDone(true)
        onCollected(action.id, value.trim())
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-3 text-xs text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        <span>Saved: {value}</span>
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-xl border border-[#6366f1]/20 bg-[#6366f1]/[0.04] p-3 space-y-2">
      <p className="text-xs text-foreground">{action.question}</p>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          disabled={disabled || submitting}
          placeholder="Type your answer..."
          className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5
            text-xs text-foreground placeholder:text-muted-foreground/50
            focus:outline-none focus:border-[#6366f1]/40 disabled:opacity-50"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || submitting || !value.trim()}
          className="flex items-center gap-1 rounded-lg bg-[#6366f1] px-3 py-1.5
            text-[11px] font-medium text-white hover:bg-[#6366f1]/80
            transition-colors disabled:opacity-50"
        >
          <Send className="h-3 w-3" />
        </button>
      </div>
      <button
        onClick={() => onSkip(action.id)}
        className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        Skip{action.fallbackUrl && (
          <>
            {' \u2014 '}
            <a
              href={action.fallbackUrl}
              className="inline-flex items-center gap-0.5 text-[#6366f1] hover:underline"
            >
              set up in agent settings <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </>
        )}
      </button>
    </div>
  )
}

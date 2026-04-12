'use client'

import { useRef, useEffect } from 'react'

export interface LogEntry {
  agent: string
  message: string
  timestamp: string
  decision?: string
  reasoning?: string
  actionUrl?: string
  actionLabel?: string
}

interface InternalLogProps {
  entries: LogEntry[]
}

export function InternalLog({ entries }: InternalLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries])

  const ts = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    } catch { return '--:--' }
  }

  const decisionColor = (d?: string) => {
    if (d === 'auto_run') return '#10b981'
    if (d === 'blocked') return '#ef4444'
    if (d === 'needs_review') return '#f97316'
    return '#6366f1'
  }

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      {/* Terminal header */}
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/[0.06]">
        <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444]/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#f97316]/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]/70" />
        <span className="ml-2 text-[10px] font-metric text-muted-foreground/60 uppercase tracking-wider">
          Activity Feed
        </span>
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        className="max-h-72 overflow-y-auto p-4 space-y-2.5 font-mono text-xs scrollbar-thin"
        style={{ background: '#0a0f1a' }}
      >
        {entries.length === 0 ? (
          <p className="text-muted-foreground/50 text-center py-6">
            No activity yet. Click &quot;Run Mia&apos;s Review&quot; to start.
          </p>
        ) : (
          entries.map((entry, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-muted-foreground/40 shrink-0 w-12">{ts(entry.timestamp)}</span>
              <span className="shrink-0" style={{ color: decisionColor(entry.decision) }}>
                [{entry.agent}]
              </span>
              <span className="text-foreground/70 flex-1">
                {entry.message}
                {entry.reasoning && (
                  <span className="block text-muted-foreground/50 mt-0.5 text-[10px]">
                    Mia: &quot;{entry.reasoning.slice(0, 120)}&quot;
                  </span>
                )}
                {entry.actionUrl && (
                  <a href={entry.actionUrl} className="text-[#6366f1] hover:underline ml-1 text-[10px]">
                    [{entry.actionLabel || 'Fix'}]
                  </a>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

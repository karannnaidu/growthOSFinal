'use client'

import { useEffect, useRef } from 'react'

export interface LogEntry {
  agent: string
  message: string
  timestamp: string
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

  return (
    <div className="rounded-2xl overflow-hidden border border-white/[0.06]">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#111c2d] border-b border-white/[0.06]">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-red-500/60" />
          <span className="h-2 w-2 rounded-full bg-amber-500/60" />
          <span className="h-2 w-2 rounded-full bg-emerald-500/60" />
        </div>
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
          Internal Log
        </span>
      </div>

      <div
        ref={scrollRef}
        className="bg-[#111c2d] p-4 max-h-64 overflow-y-auto scrollbar-thin"
      >
        {entries.length === 0 ? (
          <p className="font-mono text-xs text-muted-foreground/50">
            No activity in the last 24 hours.
          </p>
        ) : (
          <div className="space-y-1">
            {entries.map((entry, i) => (
              <p key={i} className="font-mono text-xs leading-relaxed text-muted-foreground">
                <span className="text-muted-foreground/50">
                  {new Date(entry.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>{' '}
                <span className="text-[#6366f1]">&gt;</span>{' '}
                <span className="text-foreground/80">[{entry.agent}]</span>{' '}
                {entry.message}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

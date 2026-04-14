// src/components/agents/agent-activity.tsx
'use client'

import { useState, useEffect, useRef } from 'react'

interface ActivityLine {
  message: string
  timestamp: string
  type: 'info' | 'success' | 'error'
}

interface AgentActivityProps {
  brandId: string
  agentId: string
  skillId: string | null // currently running skill, or null if idle
  onComplete?: () => void
}

export function AgentActivity({ brandId, agentId, skillId, onComplete }: AgentActivityProps) {
  const [lines, setLines] = useState<ActivityLine[]>([])
  const terminalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!skillId || !brandId) return

    setLines([{ message: `Starting ${skillId}...`, timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }), type: 'info' }])

    // Stream progress via fetch POST SSE
    const controller = new AbortController()

    ;(async () => {
      try {
        const res = await fetch('/api/skills/run-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandId, skillId }),
          signal: controller.signal,
        })

        if (!res.ok || !res.body) return
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const rawLines = buffer.split('\n')
          buffer = rawLines.pop() || ''

          let eventType = ''
          for (const line of rawLines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7)
            } else if (line.startsWith('data: ') && eventType) {
              try {
                const data = JSON.parse(line.slice(6))
                const ts = new Date().toLocaleTimeString('en-US', { hour12: false })
                const type = eventType === 'error' ? 'error' as const : eventType === 'result' ? 'success' as const : 'info' as const
                setLines(prev => [...prev, { message: data.message || JSON.stringify(data).slice(0, 100), timestamp: ts, type }])
              } catch { /* skip */ }
              eventType = ''
            }
          }
        }
        // Stream finished — signal completion
        onComplete?.()
      } catch { /* aborted or error */ }
    })()

    return () => controller.abort()
  }, [brandId, agentId, skillId])

  useEffect(() => {
    terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight, behavior: 'smooth' })
  }, [lines])

  if (lines.length === 0) return null

  return (
    <div className="glass-panel rounded-xl overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/[0.06]">
        <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
        <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Activity</span>
      </div>
      <div ref={terminalRef} className="max-h-48 overflow-y-auto p-3 space-y-1 font-mono text-[11px]" style={{ background: '#0a0f1a' }}>
        {lines.map((line, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-muted-foreground/40 shrink-0">{line.timestamp}</span>
            <span className={line.type === 'error' ? 'text-[#ef4444]' : line.type === 'success' ? 'text-[#10b981]' : 'text-foreground/60'}>
              {line.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// src/components/dashboard/mission-control.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActivityEvent {
  agent: string
  message: string
  timestamp: string
  type: 'status' | 'progress' | 'result' | 'decision' | 'error' | 'complete'
  skill?: string
  progress?: number
}

interface AgentStatus {
  id: string
  name: string
  color: string
  state: 'idle' | 'running' | 'queued' | 'done' | 'error'
  currentSkill?: string
  lastMessage?: string
  progress?: number
}

const ALL_AGENTS = [
  { id: 'scout', name: 'Scout', color: '#0D9488' },
  { id: 'aria', name: 'Aria', color: '#F97316' },
  { id: 'hugo', name: 'Hugo', color: '#D97706' },
  { id: 'echo', name: 'Echo', color: '#64748B' },
  { id: 'luna', name: 'Luna', color: '#10B981' },
  { id: 'max', name: 'Max', color: '#3B82F6' },
  { id: 'sage', name: 'Sage', color: '#8B5CF6' },
  { id: 'atlas', name: 'Atlas', color: '#E11D48' },
  { id: 'nova', name: 'Nova', color: '#7C3AED' },
  { id: 'navi', name: 'Navi', color: '#0EA5E9' },
  { id: 'penny', name: 'Penny', color: '#059669' },
]

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MissionControlProps {
  brandId: string
  isRunning: boolean
  onRunComplete?: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MissionControl({ brandId, isRunning, onRunComplete }: MissionControlProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatus>>({})
  const terminalRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  const addEvent = useCallback((event: ActivityEvent) => {
    setEvents(prev => [...prev.slice(-100), event]) // Keep last 100 events
  }, [])

  const updateAgentStatus = useCallback((agentId: string, update: Partial<AgentStatus>) => {
    setAgentStatuses(prev => ({
      ...prev,
      [agentId]: { ...prev[agentId]!, ...update },
    }))
  }, [])

  // Start SSE stream when Mia's review is triggered
  const startStream = useCallback(async () => {
    // Reset states
    setEvents([])
    const initialStatuses: Record<string, AgentStatus> = {}
    for (const a of ALL_AGENTS) {
      initialStatuses[a.id] = { ...a, state: 'idle' }
    }
    setAgentStatuses(initialStatuses)

    // Use fetch for POST SSE (EventSource only supports GET)
    try {
      const res = await fetch('/api/mia/trigger-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId }),
      })

      if (!res.ok || !res.body) return

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let eventType = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7)
          } else if (line.startsWith('data: ') && eventType) {
            try {
              const data = JSON.parse(line.slice(6))
              const ts = new Date().toLocaleTimeString('en-US', { hour12: false })

              if (eventType === 'progress' || eventType === 'status') {
                const agentId = data.agent || ''
                addEvent({ agent: agentId, message: data.message, timestamp: ts, type: eventType, skill: data.skill, progress: data.progress })
                if (agentId) {
                  updateAgentStatus(agentId, { state: 'running', currentSkill: data.skill, lastMessage: data.message, progress: data.progress })
                }
              } else if (eventType === 'decision') {
                addEvent({ agent: 'mia', message: data.message || data.reasoning, timestamp: ts, type: 'decision' })
                // Mark queued agents
                for (const skillId of data.skills || []) {
                  // Map skill to agent (best effort)
                  const agentForSkill = skillId.includes('seo') ? 'hugo' : skillId.includes('ad-copy') ? 'aria' : skillId.includes('competitor') ? 'echo' : skillId.includes('email') ? 'luna' : 'mia'
                  updateAgentStatus(agentForSkill, { state: 'queued', currentSkill: skillId })
                }
              } else if (eventType === 'result') {
                const agentId = data.agent || ''
                addEvent({ agent: agentId, message: `✓ ${data.skill || 'Skill'} ${data.status}`, timestamp: ts, type: 'result', skill: data.skill })
                if (agentId) {
                  updateAgentStatus(agentId, { state: 'done', progress: 100 })
                }
              } else if (eventType === 'error') {
                addEvent({ agent: data.agent || 'system', message: `✗ ${data.message}`, timestamp: ts, type: 'error' })
              } else if (eventType === 'complete') {
                addEvent({ agent: 'mia', message: data.message || `Done — ${data.totalSkills} skills completed`, timestamp: ts, type: 'complete' })
                onRunComplete?.()
              }
            } catch { /* skip unparseable */ }
            eventType = ''
          }
        }
      }
    } catch (err) {
      addEvent({ agent: 'system', message: `Connection error: ${err instanceof Error ? err.message : 'unknown'}`, timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }), type: 'error' })
    }
  }, [brandId, addEvent, updateAgentStatus, onRunComplete])

  // Auto-scroll terminal
  useEffect(() => {
    terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight, behavior: 'smooth' })
  }, [events])

  // Agent color lookup
  const agentColor = (id: string) => ALL_AGENTS.find(a => a.id === id)?.color || '#6366f1'

  return (
    <div className="space-y-4">
      {/* Agent Status Cards */}
      <div className="glass-panel rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60">Agent Status</p>
          {!isRunning && events.length === 0 && (
            <button onClick={startStream} className="text-[10px] bg-[#6366f1] text-white rounded-full px-3 py-1 hover:bg-[#6366f1]/80">
              Run Mia&apos;s Review
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {ALL_AGENTS.map(agent => {
            const status = agentStatuses[agent.id]
            const dotColor = status?.state === 'running' ? '#10b981' : status?.state === 'queued' ? '#f59e0b' : status?.state === 'done' ? '#10b981' : status?.state === 'error' ? '#ef4444' : '#4b5563'
            return (
              <a key={agent.id} href={`/dashboard/agents/${agent.id}`}
                className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-2.5 py-1.5 hover:bg-white/[0.08] transition-colors group"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${status?.state === 'running' ? 'animate-pulse' : ''}`}
                  style={{ background: dotColor }} />
                <span className="text-xs text-muted-foreground group-hover:text-foreground">{agent.name}</span>
                {status?.currentSkill && status.state !== 'idle' && (
                  <span className="text-[9px] text-muted-foreground/50 truncate max-w-20">{status.currentSkill}</span>
                )}
              </a>
            )
          })}
        </div>
      </div>

      {/* Activity Terminal */}
      {events.length > 0 && (
        <div className="glass-panel rounded-xl overflow-hidden">
          <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/[0.06]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444]/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#f97316]/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]/70" />
            <span className="ml-2 text-[10px] font-metric text-muted-foreground/60 uppercase tracking-wider">Mission Control</span>
          </div>
          <div ref={terminalRef} className="max-h-72 overflow-y-auto p-4 space-y-1 font-mono text-xs" style={{ background: '#0a0f1a' }}>
            {events.map((event, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-muted-foreground/40 shrink-0 w-16">{event.timestamp}</span>
                <span className="shrink-0" style={{ color: event.type === 'error' ? '#ef4444' : event.type === 'decision' ? '#6366f1' : agentColor(event.agent) }}>
                  [{event.agent}]
                </span>
                <span className={`flex-1 ${event.type === 'error' ? 'text-[#ef4444]' : event.type === 'result' ? 'text-[#10b981]' : event.type === 'decision' ? 'text-[#6366f1]' : 'text-foreground/60'}`}>
                  {event.type === 'decision' ? '→ ' : ''}{event.message}
                </span>
              </div>
            ))}
            <div className="flex gap-2">
              <span className="text-muted-foreground/40 w-16" />
              <span className="text-[#6366f1] animate-pulse">█</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

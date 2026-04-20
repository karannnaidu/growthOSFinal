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
}

interface AgentStatus {
  id: string
  name: string
  color: string
  state: 'idle' | 'running' | 'queued' | 'done' | 'error'
  currentSkill?: string
  lastMessage?: string
}

interface WakeStatusRun {
  id: string
  skill_id: string
  agent: string | null
  status: 'running' | 'completed' | 'failed' | 'blocked' | string
  blocked_reason: string | null
  created_at: string
  completed_at: string | null
}

interface WakeStatusDecision {
  id: string
  triggered_at: string
  reasoning: string | null
  picks: Array<{ skill_id: string; agent: string | null; priority?: string; reason?: string }>
}

interface WakeStatusResponse {
  decision: WakeStatusDecision | null
  runs: WakeStatusRun[]
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

const POLL_INTERVAL_MS = 1500

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface InitialAgentState {
  agentId: string
  state: 'idle' | 'running' | 'done' | 'error'
  currentSkill?: string
}

interface MissionControlProps {
  brandId: string
  isRunning: boolean
  onRunComplete?: () => void
  initialStatuses?: InitialAgentState[]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MissionControl({ brandId, isRunning, onRunComplete, initialStatuses }: MissionControlProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatus>>(() => {
    const seed: Record<string, AgentStatus> = {}
    for (const a of ALL_AGENTS) {
      seed[a.id] = { ...a, state: 'idle' }
    }
    for (const s of initialStatuses ?? []) {
      const base = ALL_AGENTS.find(a => a.id === s.agentId)
      if (!base) continue
      seed[s.agentId] = {
        ...base,
        state: s.state,
        currentSkill: s.currentSkill,
      }
    }
    return seed
  })
  const [running, setRunning] = useState(false)

  const terminalRef = useRef<HTMLDivElement>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Tracks which skill_run ids we've already emitted at each status, so we
  // only push a terminal line on transitions.
  const seenRunStateRef = useRef<Map<string, string>>(new Map())
  // The decision id we've already emitted; prevents duplicate decision lines
  // if the row gets re-polled.
  const seenDecisionIdRef = useRef<string | null>(null)

  const addEvent = useCallback((event: ActivityEvent) => {
    setEvents(prev => [...prev.slice(-100), event])
  }, [])

  const updateAgentStatus = useCallback((agentId: string, update: Partial<AgentStatus>) => {
    setAgentStatuses(prev => {
      const base = prev[agentId]
      if (!base) return prev
      return { ...prev, [agentId]: { ...base, ...update } }
    })
  }, [])

  const now = () => new Date().toLocaleTimeString('en-US', { hour12: false })

  const mergeStatus = useCallback((data: WakeStatusResponse) => {
    // Decision: emit once.
    if (data.decision && seenDecisionIdRef.current !== data.decision.id) {
      seenDecisionIdRef.current = data.decision.id
      const reason = (data.decision.reasoning ?? '').trim() || 'Mia finished planning'
      addEvent({ agent: 'mia', message: reason, timestamp: now(), type: 'decision' })
      // Mark picks as queued on their owning agents so the dots light up
      // before the runs hit the table.
      for (const p of data.decision.picks) {
        if (p.agent) {
          updateAgentStatus(p.agent, { state: 'queued', currentSkill: p.skill_id })
        }
      }
    }

    // Runs: emit transitions.
    for (const run of data.runs) {
      const prevState = seenRunStateRef.current.get(run.id)
      if (prevState === run.status) continue
      seenRunStateRef.current.set(run.id, run.status)

      const agent = run.agent ?? 'system'

      if (run.status === 'running' && prevState !== 'running') {
        addEvent({ agent, message: `Running ${run.skill_id}…`, timestamp: now(), type: 'status', skill: run.skill_id })
        if (run.agent) updateAgentStatus(run.agent, { state: 'running', currentSkill: run.skill_id })
      } else if (run.status === 'completed') {
        addEvent({ agent, message: `✓ ${run.skill_id} completed`, timestamp: now(), type: 'result', skill: run.skill_id })
        if (run.agent) updateAgentStatus(run.agent, { state: 'done' })
      } else if (run.status === 'failed') {
        addEvent({ agent, message: `✗ ${run.skill_id} failed`, timestamp: now(), type: 'error', skill: run.skill_id })
        if (run.agent) updateAgentStatus(run.agent, { state: 'error' })
      } else if (run.status === 'blocked') {
        const why = run.blocked_reason ? ` — ${run.blocked_reason}` : ''
        addEvent({ agent, message: `⊘ ${run.skill_id} blocked${why}`, timestamp: now(), type: 'error', skill: run.skill_id })
        if (run.agent) updateAgentStatus(run.agent, { state: 'error' })
      }
    }
  }, [addEvent, updateAgentStatus])

  const pollOnce = useCallback(async (since: string) => {
    try {
      const res = await fetch(`/api/mia/wake-status?brandId=${encodeURIComponent(brandId)}&since=${encodeURIComponent(since)}`, {
        cache: 'no-store',
      })
      if (!res.ok) return
      const data = (await res.json()) as WakeStatusResponse
      mergeStatus(data)
    } catch {
      /* network blip — next tick retries */
    }
  }, [brandId, mergeStatus])

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const startRun = useCallback(async () => {
    if (running) return
    setRunning(true)
    setEvents([])
    seenRunStateRef.current.clear()
    seenDecisionIdRef.current = null
    const resetStatuses: Record<string, AgentStatus> = {}
    for (const a of ALL_AGENTS) {
      resetStatuses[a.id] = { ...a, state: 'idle' }
    }
    setAgentStatuses(resetStatuses)

    // Clamp the polling window to one second before wake so the decision row
    // (triggered_at ≈ server clock, client clock may drift) always falls in.
    const since = new Date(Date.now() - 1000).toISOString()
    addEvent({ agent: 'mia', message: 'Waking Mia…', timestamp: now(), type: 'status' })

    // Start polling immediately so we pick up progress while POST is in flight.
    stopPolling()
    pollTimerRef.current = setInterval(() => { void pollOnce(since) }, POLL_INTERVAL_MS)

    try {
      const res = await fetch('/api/mia/wake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, source: 'heartbeat', dryRun: false }),
      })
      const payload = await res.json().catch(() => ({ error: 'Invalid response' })) as { ok?: boolean; error?: string; result?: { pickCount?: number } }
      if (!res.ok || !payload.ok) {
        addEvent({ agent: 'system', message: `✗ Wake failed: ${payload.error ?? res.statusText}`, timestamp: now(), type: 'error' })
      } else {
        // One final poll so the last run transition shows before completion.
        await pollOnce(since)
        const count = payload.result?.pickCount ?? 0
        addEvent({
          agent: 'mia',
          message: count === 0 ? 'Done — no skills to run this cycle' : `Done — ${count} skill${count === 1 ? '' : 's'} dispatched`,
          timestamp: now(),
          type: 'complete',
        })
      }
    } catch (err) {
      addEvent({ agent: 'system', message: `Connection error: ${err instanceof Error ? err.message : 'unknown'}`, timestamp: now(), type: 'error' })
    } finally {
      stopPolling()
      setRunning(false)
      onRunComplete?.()
    }
  }, [brandId, running, addEvent, pollOnce, stopPolling, onRunComplete])

  // Clean up polling on unmount.
  useEffect(() => {
    return () => { stopPolling() }
  }, [stopPolling])

  // Auto-scroll terminal
  useEffect(() => {
    terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight, behavior: 'smooth' })
  }, [events])

  const agentColor = (id: string) => ALL_AGENTS.find(a => a.id === id)?.color || '#6366f1'

  return (
    <div className="space-y-4">
      {/* Agent Status Cards */}
      <div className="glass-panel rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60">Agent Status</p>
          {!isRunning && !running && events.length === 0 && (
            <button onClick={startRun} className="text-[10px] bg-[#6366f1] text-white rounded-full px-3 py-1 hover:bg-[#6366f1]/80">
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
            {running && (
              <div className="flex gap-2">
                <span className="text-muted-foreground/40 w-16" />
                <span className="text-[#6366f1] animate-pulse">█</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

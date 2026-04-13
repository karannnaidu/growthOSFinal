# Live Agent Activity UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace spinners with real-time mission control — SSE-streamed agent activity on the dashboard and agent pages, showing live progress as skills run.

**Architecture:** Add `onProgress` callback to `runSkill`, create SSE streaming endpoints that wrap skill execution with progress events, build mission control UI components (agent status cards + activity terminal) that consume the SSE stream via EventSource.

**Tech Stack:** Server-Sent Events (ReadableStream + text/event-stream), existing skills-engine, React client components with EventSource API.

---

### Task 1: Add onProgress Callback to Skills Engine

**Files:**
- Modify: `src/lib/skills-engine.ts`

- [ ] **Step 1: Add ProgressEvent type and onProgress parameter**

Add the type near the top of the file (after SkillRunResult):

```typescript
export interface SkillProgressEvent {
  agent: string
  skill: string
  step: 'starting' | 'loading_context' | 'pre_flight' | 'fetching_data' | 'analyzing' | 'quality_check' | 'storing' | 'post_flight' | 'complete' | 'error'
  message: string
  progress: number // 0-100
  output?: Record<string, unknown>
}
```

Update the `runSkill` signature:

```typescript
export async function runSkill(
  input: SkillRunInput,
  onProgress?: (event: SkillProgressEvent) => void,
): Promise<SkillRunResult> {
```

- [ ] **Step 2: Add progress callbacks throughout runSkill**

Add progress calls at each major step. Find each section and add the callback:

After loading the skill definition (~line 170):
```typescript
  onProgress?.({ agent: skill.agent, skill: skill.id, step: 'starting', message: `Starting ${skill.name}...`, progress: 5 })
```

After loading brand context (~line 200):
```typescript
  onProgress?.({ agent: skill.agent, skill: skill.id, step: 'loading_context', message: 'Loading brand context...', progress: 10 })
```

After pre-flight check (~line 280):
```typescript
  onProgress?.({ agent: skill.agent, skill: skill.id, step: 'pre_flight', message: preFlightResult?.dataGapsNote || 'Pre-flight checks passed', progress: 15 })
```

After MCP data fetch (~line 290):
```typescript
  onProgress?.({ agent: skill.agent, skill: skill.id, step: 'fetching_data', message: 'Fetching platform data...', progress: 25 })
```

Before the LLM call (~line 310):
```typescript
  onProgress?.({ agent: skill.agent, skill: skill.id, step: 'analyzing', message: `Analyzing with ${model}...`, progress: 35 })
```

After the LLM call completes (~line 340):
```typescript
  onProgress?.({ agent: skill.agent, skill: skill.id, step: 'quality_check', message: 'Checking output quality...', progress: 80 })
```

After storing the skill run (~line 370):
```typescript
  onProgress?.({ agent: skill.agent, skill: skill.id, step: 'storing', message: 'Saving results...', progress: 90 })
```

After post-flight (~line 440):
```typescript
  onProgress?.({ agent: skill.agent, skill: skill.id, step: 'complete', message: `${skill.name} complete`, progress: 100, output })
```

On error (in catch blocks):
```typescript
  onProgress?.({ agent: skill.agent, skill: skill.id, step: 'error', message: `Failed: ${error.message}`, progress: 0 })
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/skills-engine.ts
git commit -m "feat: add onProgress callback to runSkill for SSE streaming"
```

---

### Task 2: Create SSE Skill Run Endpoint

**Files:**
- Create: `src/app/api/skills/run-stream/route.ts`

- [ ] **Step 1: Create the SSE endpoint**

```bash
mkdir -p src/app/api/skills/run-stream
```

```typescript
// src/app/api/skills/run-stream/route.ts

export const maxDuration = 300

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runSkill, type SkillProgressEvent } from '@/lib/skills-engine'

export async function POST(request: NextRequest): Promise<Response> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 })
  }

  const body = await request.json() as { brandId?: string; skillId?: string }
  const { brandId, skillId } = body

  if (!brandId || !skillId) {
    return new Response(JSON.stringify({ error: 'brandId and skillId required' }), { status: 400 })
  }

  // Verify brand access
  const admin = createServiceClient()
  const { data: brand } = await admin.from('brands').select('id, owner_id').eq('id', brandId).single()
  if (!brand || brand.owner_id !== user.id) {
    return new Response(JSON.stringify({ error: 'Access denied' }), { status: 403 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch { /* stream may be closed */ }
      }

      const onProgress = (event: SkillProgressEvent) => {
        send('progress', event as unknown as Record<string, unknown>)
      }

      try {
        const result = await runSkill(
          { brandId, skillId, triggeredBy: 'user', additionalContext: { source: 'stream' } },
          onProgress,
        )

        send('result', {
          id: result.id,
          status: result.status,
          output: result.output,
          creditsUsed: result.creditsUsed,
          modelUsed: result.modelUsed,
          durationMs: result.durationMs,
          error: result.error,
        })
      } catch (err) {
        send('error', { message: err instanceof Error ? err.message : 'Skill run failed' })
      } finally {
        send('done', { timestamp: new Date().toISOString() })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/skills/run-stream/
git commit -m "feat: SSE skill run endpoint — streams progress events in real-time"
```

---

### Task 3: Create Mia Trigger Stream Endpoint

**Files:**
- Create: `src/app/api/mia/trigger-stream/route.ts`

- [ ] **Step 1: Create the SSE endpoint for Mia's full cycle**

```bash
mkdir -p src/app/api/mia/trigger-stream
```

```typescript
// src/app/api/mia/trigger-stream/route.ts

export const maxDuration = 300

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runSkill, type SkillProgressEvent } from '@/lib/skills-engine'
import { createMiaDecision } from '@/lib/knowledge/intelligence'
import { callModel } from '@/lib/model-client'
import { loadSkill } from '@/lib/skill-loader'

export async function POST(request: NextRequest): Promise<Response> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 })
  }

  const body = await request.json() as { brandId?: string; userMessage?: string }
  const { brandId, userMessage } = body
  if (!brandId) {
    return new Response(JSON.stringify({ error: 'brandId required' }), { status: 400 })
  }

  const admin = createServiceClient()
  const { data: brand } = await admin.from('brands').select('id, owner_id, name').eq('id', brandId).single()
  if (!brand || brand.owner_id !== user.id) {
    return new Response(JSON.stringify({ error: 'Access denied' }), { status: 403 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch { /* stream may be closed */ }
      }

      try {
        // 1. Run health-check with progress streaming
        send('status', { agent: 'scout', message: 'Starting health check...', phase: 'health-check' })

        let healthOutput: Record<string, unknown> = {}
        const healthResult = await runSkill(
          { brandId, skillId: 'health-check', triggeredBy: 'mia', additionalContext: { source: userMessage ? 'user_request' : 'manual_trigger' } },
          (event) => send('progress', event as unknown as Record<string, unknown>),
        )
        healthOutput = healthResult.output

        send('result', { agent: 'scout', skill: 'health-check', status: healthResult.status, score: healthOutput.overall_score })

        // 2. Mia decides what to do next
        send('status', { agent: 'mia', message: 'Reviewing health-check results...', phase: 'decision' })

        const { data: creds } = await admin.from('credentials').select('platform').eq('brand_id', brandId)
        const platforms = (creds ?? []).map(c => c.platform)

        const { data: instructions } = await admin.from('knowledge_nodes')
          .select('properties')
          .eq('brand_id', brandId)
          .eq('node_type', 'instruction')
          .eq('is_active', true)
        const userInstructions = (instructions ?? [])
          .map(n => (n.properties as Record<string, unknown>)?.text as string)
          .filter(Boolean)

        const todayStart = `${new Date().toISOString().split('T')[0]}T00:00:00.000Z`
        const { data: todayRuns } = await admin.from('skill_runs')
          .select('skill_id').eq('brand_id', brandId).gte('created_at', todayStart).eq('status', 'completed')
        const alreadyRan = (todayRuns ?? []).map(r => r.skill_id)

        // Load Mia's skill for LLM decision
        let miaPrompt = 'You are Mia, an AI marketing manager. Decide which skills to dispatch.'
        try {
          const miaSkill = await loadSkill('mia-manager')
          miaPrompt = miaSkill.sections.systemPrompt + '\n' + (miaSkill.sections.workflow || '')
        } catch { /* use fallback */ }

        const userPrompt = [
          `## Brand: ${brand.name}`,
          `## Platforms: ${platforms.length > 0 ? platforms.join(', ') : 'None'}`,
          `## Health-Check:\n${JSON.stringify(healthOutput, null, 2).slice(0, 2000)}`,
          `## Already Ran: ${alreadyRan.length > 0 ? alreadyRan.join(', ') : 'None'}`,
          userInstructions.length > 0 ? `## Instructions:\n${userInstructions.map(i => '- ' + i).join('\n')}` : '',
          userMessage ? `## User Request: ${userMessage}` : '## Trigger: Daily review',
          '\nReturn JSON: {"skills_to_run":["skill-id"],"reasoning":"...","message_to_user":"..."}',
        ].filter(Boolean).join('\n')

        const llmResult = await callModel({
          model: 'gemini-2.5-flash', provider: 'google',
          systemPrompt: miaPrompt, userPrompt, maxTokens: 1024, temperature: 0.3,
        })

        let skillsToRun: string[] = []
        let reasoning = ''
        let messageToUser = ''

        try {
          let text = llmResult.content.trim()
          const fm = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/)
          if (fm) text = fm[1]!.trim()
          const parsed = JSON.parse(text)
          skillsToRun = parsed.skills_to_run ?? []
          reasoning = parsed.reasoning ?? ''
          messageToUser = parsed.message_to_user ?? ''
        } catch {
          skillsToRun = ['seo-audit', 'competitor-scan', 'ad-copy']
          reasoning = 'Fallback: standard cycle'
          messageToUser = 'Running standard daily review.'
        }

        const filtered = skillsToRun.filter(s => !alreadyRan.includes(s))

        send('decision', {
          agent: 'mia',
          skills: filtered,
          reasoning,
          message: messageToUser,
        })

        // 3. Run each skill with streaming
        for (const skillId of filtered) {
          send('status', { agent: 'mia', message: `Dispatching ${skillId}...`, phase: 'dispatch' })

          try {
            const result = await runSkill(
              { brandId, skillId, triggeredBy: 'mia', additionalContext: { source: 'mia_cycle' } },
              (event) => send('progress', event as unknown as Record<string, unknown>),
            )
            send('result', { agent: result.modelUsed, skill: skillId, status: result.status })
          } catch (err) {
            send('error', { skill: skillId, message: err instanceof Error ? err.message : 'Failed' })
          }
        }

        // Store decision
        if (filtered.length > 0) {
          await createMiaDecision(brandId, {
            decision: 'auto_run', reasoning, follow_up_skills: filtered,
            pending_chain: [], target_agent: 'mia',
          })
        }

        send('complete', { totalSkills: filtered.length, message: messageToUser })
      } catch (err) {
        send('error', { message: err instanceof Error ? err.message : 'Mia trigger failed' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/mia/trigger-stream/
git commit -m "feat: Mia trigger SSE — streams health-check, decision, and follow-up skills in real-time"
```

---

### Task 4: Create Mission Control Component

**Files:**
- Create: `src/components/dashboard/mission-control.tsx`

- [ ] **Step 1: Create the mission control component**

This is a client component with two sections: agent status cards and activity terminal.

```typescript
// src/components/dashboard/mission-control.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { AgentAvatar } from '@/components/agents/agent-avatar'

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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/mission-control.tsx
git commit -m "feat: mission control component — agent status cards + activity terminal with SSE"
```

---

### Task 5: Create Agent Activity Component

**Files:**
- Create: `src/components/agents/agent-activity.tsx`

- [ ] **Step 1: Create per-agent activity terminal**

```typescript
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
}

export function AgentActivity({ brandId, agentId, skillId }: AgentActivityProps) {
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/agents/agent-activity.tsx
git commit -m "feat: per-agent activity terminal with SSE streaming"
```

---

### Task 6: Integrate Mission Control into Dashboard

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/components/dashboard/morning-brief.tsx`

- [ ] **Step 1: Replace morning brief "Run Mia's Review" with mission control trigger**

In `src/components/dashboard/morning-brief.tsx`, the `MiaActions` component currently calls `/api/mia/trigger`. Update it to emit an event that the parent can listen to, so the dashboard can activate mission control mode.

Add a prop `onTriggerReview` to `MorningBriefProps` and call it instead of directly fetching:

In the `MiaActions` component, replace the `handleTrigger` function to call `onTriggerReview` instead of fetching `/api/mia/trigger`.

- [ ] **Step 2: In dashboard page, import and render MissionControl**

The dashboard page is a server component. Add a client wrapper that:
1. Passes `brandId` to `MissionControl`
2. When "Run Mia's Review" is clicked, sets `isRunning=true` which activates the stream
3. When stream completes, refreshes the page data

Since the dashboard is a server component, the `MissionControl` component can be rendered directly (it's 'use client').

Add after the morning brief section:

```tsx
<MissionControl brandId={ctx.brandId} isRunning={false} onRunComplete={() => window.location.reload()} />
```

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx src/components/dashboard/morning-brief.tsx
git commit -m "feat: integrate mission control into dashboard — replaces spinner with live activity"
```

---

### Task 7: Integrate Agent Activity into Agent Detail Page

**Files:**
- Modify: `src/app/dashboard/agents/[agentId]/page.tsx`

- [ ] **Step 1: Add AgentActivity when a skill is running**

Import `AgentActivity` and render it when `runningSkill` is set:

```typescript
import { AgentActivity } from '@/components/agents/agent-activity'
```

Add below the "Latest Output" section (or above it when a skill is actively running):

```tsx
{runningSkill && brandId && (
  <AgentActivity brandId={brandId} agentId={agentId as string} skillId={runningSkill} />
)}
```

Also update `handleRunSkill` to use the streaming endpoint instead of the non-streaming one. The `AgentActivity` component handles the SSE internally, so `handleRunSkill` just needs to set `runningSkill` and let the component take over.

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/agents/[agentId]/page.tsx
git commit -m "feat: agent detail page shows live activity terminal when skills run"
```

---

## Summary

| Task | What | Files | Depends On |
|------|------|-------|-----------|
| 1 | onProgress callback in skills engine | 1 modified | — |
| 2 | SSE skill run endpoint | 1 new | Task 1 |
| 3 | Mia trigger SSE endpoint | 1 new | Task 1 |
| 4 | Mission Control component (cards + terminal) | 1 new | Task 3 |
| 5 | Agent Activity component (per-agent terminal) | 1 new | Task 2 |
| 6 | Dashboard integration | 2 modified | Tasks 3, 4 |
| 7 | Agent page integration | 1 modified | Tasks 2, 5 |

**Recommended execution order:** Task 1 → Tasks 2+3 in parallel → Tasks 4+5 in parallel → Tasks 6+7 in parallel

**Total: ~585 lines across 8 files.**

# Mia Agent Delegation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable Mia to trigger agent skills, chain multi-step workflows, and collect missing data from within the chat interface.

**Architecture:** Mia's LLM response includes a fenced ````actions```` JSON block alongside natural language. The frontend parses it, renders confirmation cards, and on user approval calls a new SSE execution endpoint that runs skills sequentially via the existing `runSkill()` engine, then has Mia summarize results.

**Tech Stack:** Next.js API routes (SSE), existing `skills-engine.ts` / `model-client.ts`, React components, Supabase.

**Spec:** `docs/superpowers/specs/2026-04-14-mia-agent-delegation-design.md`

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `src/lib/mia-actions.ts` | Types, parse action blocks from LLM text, validate, topological sort |
| `src/app/api/mia/actions/execute/route.ts` | SSE endpoint: run skill chains, stream progress, generate summary |
| `src/app/api/mia/actions/collect/route.ts` | Store collected user data into brand context or agent setup |
| `src/components/chat/action-card.tsx` | Skill confirmation/progress/result card |
| `src/components/chat/collect-card.tsx` | Inline data collection form |

### Modified Files

| File | Changes |
|------|---------|
| `src/app/api/mia/chat/route.ts` | Enhanced system prompt with dynamic skills catalog |
| `src/app/dashboard/chat/page.tsx` | Parse actions, render cards, handle execute/collect flows |
| `src/components/chat/chat-message.tsx` | Strip action blocks, pass parsed actions up |

---

## Task 1: Action parser and types (`mia-actions.ts`)

**Files:**
- Create: `src/lib/mia-actions.ts`

- [ ] **Step 1: Create the types and parser**

```typescript
// src/lib/mia-actions.ts

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillAction {
  id: string
  type: 'skill'
  skillId: string
  agentId: string
  reason: string
  dependsOn: string[]
}

export interface CollectAction {
  id: string
  type: 'collect'
  field: string
  storeIn: 'brand_context' | 'agent_setup'
  agentId?: string
  question: string
  fallbackUrl?: string
  dependsOn: string[]
}

export type MiaAction = SkillAction | CollectAction

export interface ParsedMiaResponse {
  /** Message text with the action block stripped out */
  text: string
  /** Parsed actions (empty array if none) */
  actions: MiaAction[]
}

// ---------------------------------------------------------------------------
// Parser — extract ```actions ... ``` block from LLM text
// ---------------------------------------------------------------------------

const ACTION_BLOCK_RE = /```actions\s*\n([\s\S]*?)\n\s*```/

export function parseMiaResponse(raw: string): ParsedMiaResponse {
  const match = raw.match(ACTION_BLOCK_RE)
  if (!match) return { text: raw.trim(), actions: [] }

  const text = raw.replace(ACTION_BLOCK_RE, '').trim()
  let actions: MiaAction[] = []

  try {
    const parsed = JSON.parse(match[1]!) as { actions?: unknown[] }
    if (Array.isArray(parsed.actions)) {
      actions = parsed.actions.filter(isValidAction) as MiaAction[]
    }
  } catch {
    // LLM produced invalid JSON — treat as no actions
  }

  return { text, actions }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isValidAction(a: unknown): boolean {
  if (!a || typeof a !== 'object') return false
  const obj = a as Record<string, unknown>
  if (!obj.id || !obj.type) return false
  if (obj.type === 'skill') {
    return typeof obj.skillId === 'string' && typeof obj.agentId === 'string'
  }
  if (obj.type === 'collect') {
    return typeof obj.field === 'string' && typeof obj.question === 'string'
  }
  return false
}

const MAX_ACTIONS = 5
const MAX_CHAIN_DEPTH = 3

export interface ValidationResult {
  valid: boolean
  errors: string[]
  sorted: MiaAction[]
}

/**
 * Validate actions and return them in topological order.
 * Rejects cycles, unknown deps, too many actions, or deep chains.
 */
export function validateAndSort(actions: MiaAction[]): ValidationResult {
  const errors: string[] = []

  if (actions.length > MAX_ACTIONS) {
    errors.push(`Too many actions (${actions.length}/${MAX_ACTIONS})`)
    return { valid: false, errors, sorted: [] }
  }

  const ids = new Set(actions.map((a) => a.id))

  // Check all dependsOn refs exist
  for (const a of actions) {
    for (const dep of a.dependsOn) {
      if (!ids.has(dep)) {
        errors.push(`Action "${a.id}" depends on unknown action "${dep}"`)
      }
    }
  }
  if (errors.length > 0) return { valid: false, errors, sorted: [] }

  // Topological sort (Kahn's algorithm)
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()
  const actionMap = new Map<string, MiaAction>()

  for (const a of actions) {
    actionMap.set(a.id, a)
    inDegree.set(a.id, a.dependsOn.length)
    for (const dep of a.dependsOn) {
      const existing = adj.get(dep) ?? []
      existing.push(a.id)
      adj.set(dep, existing)
    }
  }

  const queue: string[] = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }

  const sorted: MiaAction[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    sorted.push(actionMap.get(id)!)
    for (const next of adj.get(id) ?? []) {
      const newDeg = (inDegree.get(next) ?? 1) - 1
      inDegree.set(next, newDeg)
      if (newDeg === 0) queue.push(next)
    }
  }

  if (sorted.length !== actions.length) {
    errors.push('Cycle detected in action dependencies')
    return { valid: false, errors, sorted: [] }
  }

  // Check chain depth
  const depth = new Map<string, number>()
  for (const a of sorted) {
    const maxParent = a.dependsOn.reduce((max, dep) => Math.max(max, depth.get(dep) ?? 0), 0)
    depth.set(a.id, maxParent + 1)
    if (maxParent + 1 > MAX_CHAIN_DEPTH) {
      errors.push(`Chain depth exceeds ${MAX_CHAIN_DEPTH} at action "${a.id}"`)
      return { valid: false, errors, sorted: [] }
    }
  }

  return { valid: true, errors: [], sorted }
}

// ---------------------------------------------------------------------------
// Skills catalog builder (for system prompt)
// ---------------------------------------------------------------------------

export function buildSkillsCatalog(
  agents: Array<{ id: string; name: string; skills: string[] }>,
): string {
  const lines = agents
    .filter((a) => a.id !== 'mia') // Mia doesn't trigger herself
    .map((a) => `- ${a.id} (${a.name}): ${a.skills.join(', ')}`)

  return `## Available Skills

You can trigger skills by including an \`\`\`actions block in your response.
Only include actions when the user's request clearly needs a skill to run.
Do NOT include actions for simple conversational questions.

Available skills by agent:
${lines.join('\n')}

If a skill requires data the user hasn't provided, use a "collect" action first.

Action block format — include this fenced block after your message text:

\`\`\`actions
{
  "actions": [
    {
      "id": "a1",
      "type": "skill",
      "skillId": "<skill-id>",
      "agentId": "<agent-id>",
      "reason": "Why this skill is needed",
      "dependsOn": []
    }
  ]
}
\`\`\`

For data collection:
{
  "id": "c1",
  "type": "collect",
  "field": "<field_name>",
  "storeIn": "brand_context",
  "agentId": "<agent-id>",
  "question": "Question to ask the user",
  "fallbackUrl": "/dashboard/agents/<agent-id>",
  "dependsOn": []
}

Rules:
- Maximum 5 actions per block
- Use dependsOn to chain skills (e.g. health-check -> ad-copy)
- Each action needs a unique id (a1, a2, c1, etc.)
- Always include a reason explaining why each skill is needed`
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/mia-actions.ts
git commit -m "feat(mia): action parser — types, validation, topological sort, skills catalog builder"
```

---

## Task 2: Enhanced Mia chat system prompt

**Files:**
- Modify: `src/app/api/mia/chat/route.ts:21-65`

- [ ] **Step 1: Update the system prompt template to include skills catalog placeholder**

In `src/app/api/mia/chat/route.ts`, replace the `MIA_CHAT_SYSTEM_PROMPT` constant and `buildSystemPrompt` function:

```typescript
// Replace the existing MIA_CHAT_SYSTEM_PROMPT (lines 21-46) with:

const MIA_CHAT_SYSTEM_PROMPT = `You are Mia, the AI marketing manager for {brandName}.

Your personality:
- Warm, confident, proactive
- You speak like a senior marketing strategist who genuinely cares about the brand
- You reference specific data and agent findings when available
- You can trigger agent skills to take action — not just talk

Brand context:
- Name: {brandName}
- Domain: {domain}
- Focus: {focusAreas}
- Plan: {plan}

Recent activity:
{recentSkillRunsSummary}

{skillsCatalog}

Keep responses concise but insightful. You're a busy marketing manager, not a verbose chatbot.
When you include an actions block, still write a natural message explaining what you're about to do and why.`
```

- [ ] **Step 2: Update `buildSystemPrompt` to accept and inject the skills catalog**

```typescript
// Replace the existing buildSystemPrompt function (lines 52-65) with:

function buildSystemPrompt(
  brandName: string,
  domain: string,
  focusAreas: string,
  plan: string,
  recentSkillRunsSummary: string,
  skillsCatalog: string,
): string {
  return MIA_CHAT_SYSTEM_PROMPT
    .replace(/{brandName}/g, brandName)
    .replace(/{domain}/g, domain)
    .replace(/{focusAreas}/g, focusAreas)
    .replace(/{plan}/g, plan)
    .replace(/{recentSkillRunsSummary}/g, recentSkillRunsSummary)
    .replace(/{skillsCatalog}/g, skillsCatalog)
}
```

- [ ] **Step 3: Import and use buildSkillsCatalog in the POST handler**

At the top of the file, add:
```typescript
import { buildSkillsCatalog } from '@/lib/mia-actions'
import agentsJson from '../../../skills/agents.json'
```

Then in the POST handler, before `buildSystemPrompt` call (around line 203), add:
```typescript
  const skillsCatalog = buildSkillsCatalog(
    (agentsJson as Array<{ id: string; name: string; skills: string[] }>),
  )
```

Update the `buildSystemPrompt` call to pass `skillsCatalog`:
```typescript
  const systemPrompt = buildSystemPrompt(
    (brand.name as string) ?? 'your brand',
    (brand.domain as string) ?? 'unknown',
    Array.isArray(brand.focus_areas)
      ? (brand.focus_areas as string[]).join(', ')
      : (brand.focus_areas as string) ?? 'general marketing',
    (brand.plan as string) ?? 'standard',
    recentSkillRunsSummary,
    skillsCatalog,
  )
```

- [ ] **Step 4: Also fix the skill_runs query to use admin client (RLS fix)**

In the POST handler around line 184, change `supabase` to `admin`:
```typescript
  const { data: recentRuns } = await admin
    .from('skill_runs')
    .select('skill_id, status, triggered_by, created_at, agent_id')
    .eq('brand_id', brandId)
    .gte('created_at', twentyFourHoursAgo)
    .order('created_at', { ascending: false })
    .limit(10)
```

Also fix the `.select()` field from `agent` to `agent_id` (matching the actual column name in schema).

- [ ] **Step 5: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/app/api/mia/chat/route.ts
git commit -m "feat(mia): enhanced system prompt with dynamic skills catalog"
```

---

## Task 3: Action execution endpoint (`/api/mia/actions/execute`)

**Files:**
- Create: `src/app/api/mia/actions/execute/route.ts`

- [ ] **Step 1: Create the SSE execution endpoint**

```typescript
// src/app/api/mia/actions/execute/route.ts

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runSkill } from '@/lib/skills-engine'
import { loadSkill } from '@/lib/skill-loader'
import { callModel } from '@/lib/model-client'
import {
  type MiaAction,
  type SkillAction,
  validateAndSort,
} from '@/lib/mia-actions'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sseEvent(data: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
}

function errorSSE(code: string, message: string): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(sseEvent({ type: 'error', code, message }))
      controller.close()
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

// ---------------------------------------------------------------------------
// POST /api/mia/actions/execute
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  // 1. Auth
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return errorSSE('UNAUTHORIZED', 'Not authenticated')

  // 2. Parse body
  let body: { brandId?: string; conversationId?: string; actions?: MiaAction[] }
  try {
    body = await request.json()
  } catch {
    return errorSSE('VALIDATION_ERROR', 'Invalid JSON body')
  }

  const { brandId, conversationId, actions } = body
  if (!brandId || !conversationId || !actions || !Array.isArray(actions)) {
    return errorSSE('VALIDATION_ERROR', 'brandId, conversationId, and actions are required')
  }

  // 3. Brand access check
  const admin = createServiceClient()
  const { data: brand } = await admin
    .from('brands')
    .select('id, owner_id, name')
    .eq('id', brandId)
    .single()

  if (!brand) return errorSSE('NOT_FOUND', 'Brand not found')

  if (brand.owner_id !== user.id) {
    const { data: member } = await admin
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single()
    if (!member) return errorSSE('FORBIDDEN', 'Access denied')
  }

  // 4. Validate and sort actions
  const skillActions = actions.filter((a): a is SkillAction => a.type === 'skill')
  const validation = validateAndSort(skillActions)
  if (!validation.valid) {
    return errorSSE('VALIDATION_ERROR', validation.errors.join('; '))
  }

  // 5. Validate all skills exist and compute total credits
  let totalCreditsNeeded = 0
  for (const action of validation.sorted) {
    if (action.type !== 'skill') continue
    try {
      const skill = await loadSkill(action.skillId)
      totalCreditsNeeded += skill.credits
    } catch {
      return errorSSE('NOT_FOUND', `Skill "${action.skillId}" not found`)
    }
  }

  // 6. Pre-check wallet balance
  const { data: wallet } = await admin
    .from('wallets')
    .select('balance, free_credits, free_credits_expires_at')
    .eq('brand_id', brandId)
    .single()

  if (wallet && totalCreditsNeeded > 0) {
    const freeAvail =
      wallet.free_credits_expires_at && new Date(wallet.free_credits_expires_at) > new Date()
        ? (wallet.free_credits ?? 0)
        : 0
    const totalAvail = (wallet.balance ?? 0) + freeAvail
    if (totalAvail < totalCreditsNeeded) {
      return errorSSE(
        'INSUFFICIENT_CREDITS',
        `Need ${totalCreditsNeeded} credits, have ${totalAvail}`,
      )
    }
  }

  // 7. Stream execution
  const stream = new ReadableStream({
    async start(controller) {
      const outputs = new Map<string, Record<string, unknown>>()
      const failed = new Set<string>()

      for (const action of validation.sorted) {
        if (action.type !== 'skill') continue

        // Check if any dependency failed
        const depFailed = action.dependsOn.some((dep) => failed.has(dep))
        if (depFailed) {
          failed.add(action.id)
          controller.enqueue(
            sseEvent({
              type: 'action_failed',
              actionId: action.id,
              skillId: action.skillId,
              agentId: action.agentId,
              error: 'Skipped — a dependency failed',
            }),
          )
          continue
        }

        // Emit start
        controller.enqueue(
          sseEvent({
            type: 'action_start',
            actionId: action.id,
            skillId: action.skillId,
            agentId: action.agentId,
          }),
        )

        // Build additional context from dependency outputs
        const depContext: Record<string, unknown> = {}
        for (const depId of action.dependsOn) {
          const depOutput = outputs.get(depId)
          if (depOutput) depContext[`_from_${depId}`] = depOutput
        }

        try {
          const result = await runSkill({
            brandId,
            skillId: action.skillId,
            triggeredBy: 'mia',
            additionalContext:
              Object.keys(depContext).length > 0 ? depContext : undefined,
          })

          if (result.status === 'completed') {
            outputs.set(action.id, result.output)
            controller.enqueue(
              sseEvent({
                type: 'action_complete',
                actionId: action.id,
                skillId: action.skillId,
                agentId: action.agentId,
                output: result.output,
                creditsUsed: result.creditsUsed,
              }),
            )
          } else {
            failed.add(action.id)
            controller.enqueue(
              sseEvent({
                type: 'action_failed',
                actionId: action.id,
                skillId: action.skillId,
                agentId: action.agentId,
                error: result.error ?? 'Skill run failed',
              }),
            )
          }
        } catch (err) {
          failed.add(action.id)
          controller.enqueue(
            sseEvent({
              type: 'action_failed',
              actionId: action.id,
              skillId: action.skillId,
              agentId: action.agentId,
              error: err instanceof Error ? err.message : 'Unexpected error',
            }),
          )
        }
      }

      // 8. Generate summary via LLM
      const outputSummary = Array.from(outputs.entries())
        .map(([id, out]) => {
          const action = validation.sorted.find((a) => a.id === id)
          return `## ${action?.type === 'skill' ? action.skillId : id}\n${JSON.stringify(out, null, 2)}`
        })
        .join('\n\n')

      const failedSummary =
        failed.size > 0
          ? `\n\nFailed actions: ${Array.from(failed).join(', ')}`
          : ''

      let summaryContent: string
      try {
        const summaryResult = await callModel({
          model: 'claude-sonnet-4-6',
          provider: 'anthropic',
          systemPrompt: `You are Mia, an AI marketing manager for ${brand.name ?? 'the brand'}. Summarize the skill results below for the user. Be concise, highlight key findings and next steps. Do NOT include action blocks.`,
          userPrompt: `Skill results:\n\n${outputSummary}${failedSummary}\n\nProvide a concise summary for the user.`,
          maxTokens: 512,
          temperature: 0.5,
        })
        summaryContent = summaryResult.content
      } catch {
        summaryContent =
          outputs.size > 0
            ? 'Skills completed. Check the results above for details.'
            : 'No skills completed successfully.'
      }

      // Store summary as conversation message
      try {
        await admin.from('conversation_messages').insert({
          conversation_id: conversationId,
          role: 'assistant',
          content: summaryContent,
        })
      } catch {
        // Non-fatal
      }

      controller.enqueue(sseEvent({ type: 'summary', content: summaryContent, conversationId }))
      controller.enqueue(sseEvent({ type: 'done' }))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/mia/actions/execute/route.ts
git commit -m "feat(mia): action execution endpoint — SSE skill chains with summary"
```

---

## Task 4: Data collection endpoint (`/api/mia/actions/collect`)

**Files:**
- Create: `src/app/api/mia/actions/collect/route.ts`

- [ ] **Step 1: Create the collect endpoint**

```typescript
// src/app/api/mia/actions/collect/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

interface CollectRequest {
  brandId: string
  field: string
  value: string
  storeIn: 'brand_context' | 'agent_setup'
  agentId?: string
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Auth
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // 2. Parse body
  let body: Partial<CollectRequest>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { brandId, field, value, storeIn, agentId } = body
  if (!brandId || !field || value === undefined || !storeIn) {
    return NextResponse.json(
      { error: 'brandId, field, value, and storeIn are required' },
      { status: 400 },
    )
  }

  // 3. Brand access check
  const admin = createServiceClient()
  const { data: brand } = await admin
    .from('brands')
    .select('id, owner_id, product_context')
    .eq('id', brandId)
    .single()

  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  }

  if (brand.owner_id !== user.id) {
    const { data: member } = await admin
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single()
    if (!member) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
  }

  // 4. Store the value
  if (storeIn === 'brand_context') {
    const existing = (brand.product_context as Record<string, unknown>) ?? {}
    const updated = { ...existing, [field]: value }

    const { error } = await admin
      .from('brands')
      .update({ product_context: updated })
      .eq('id', brandId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else if (storeIn === 'agent_setup' && agentId) {
    // Upsert into brand_agents config
    const { data: existing } = await admin
      .from('brand_agents')
      .select('config')
      .eq('brand_id', brandId)
      .eq('agent_id', agentId)
      .single()

    const config = (existing?.config as Record<string, unknown>) ?? {}
    config[field] = value

    await admin.from('brand_agents').upsert(
      {
        brand_id: brandId,
        agent_id: agentId,
        config,
      },
      { onConflict: 'brand_id,agent_id' },
    )
  }

  return NextResponse.json({ success: true, field, stored: true })
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/mia/actions/collect/route.ts
git commit -m "feat(mia): data collection endpoint — store user input in brand context"
```

---

## Task 5: ActionCard component

**Files:**
- Create: `src/components/chat/action-card.tsx`

- [ ] **Step 1: Create the ActionCard component**

```tsx
// src/components/chat/action-card.tsx
'use client'

import { useState } from 'react'
import {
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Zap,
} from 'lucide-react'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import { AGENT_MAP } from '@/lib/agents-data'
import { cn } from '@/lib/utils'
import type { SkillAction } from '@/lib/mia-actions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActionStatus = 'pending' | 'running' | 'complete' | 'failed'

export interface ActionState {
  status: ActionStatus
  output?: Record<string, unknown>
  creditsUsed?: number
  error?: string
}

interface ActionCardProps {
  actions: SkillAction[]
  actionStates: Record<string, ActionState>
  totalCredits: number
  onRunAll: () => void
  onSkip: () => void
  disabled?: boolean
}

// ---------------------------------------------------------------------------
// Single action row
// ---------------------------------------------------------------------------

function ActionRow({
  action,
  state,
}: {
  action: SkillAction
  state: ActionState
}) {
  const [expanded, setExpanded] = useState(false)
  const agent = AGENT_MAP[action.agentId]
  const agentColor = agent?.color ?? '#6366f1'

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <AgentAvatar agentId={action.agentId} size="sm" />

        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground truncate">
            {action.skillId}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">
            {action.reason}
          </p>
        </div>

        {/* Status indicator */}
        {state.status === 'running' && (
          <Loader2
            className="h-4 w-4 animate-spin shrink-0"
            style={{ color: agentColor }}
          />
        )}
        {state.status === 'complete' && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        )}
        {state.status === 'failed' && (
          <div className="flex items-center gap-1 text-[10px] text-red-400">
            <XCircle className="h-3.5 w-3.5" />
            <span className="truncate max-w-[120px]">{state.error ?? 'Failed'}</span>
          </div>
        )}
        {state.status === 'pending' && (
          <span className="text-[10px] text-muted-foreground">Pending</span>
        )}
      </div>

      {/* Expanded output */}
      {expanded && state.output && (
        <div className="mt-2 rounded-lg bg-black/20 p-2.5 text-[11px] font-mono text-muted-foreground max-h-60 overflow-auto">
          <pre className="whitespace-pre-wrap break-words">
            {JSON.stringify(state.output, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main ActionCard
// ---------------------------------------------------------------------------

export function ActionCard({
  actions,
  actionStates,
  totalCredits,
  onRunAll,
  onSkip,
  disabled = false,
}: ActionCardProps) {
  const isRunning = Object.values(actionStates).some(
    (s) => s.status === 'running',
  )
  const allDone = Object.values(actionStates).every(
    (s) => s.status === 'complete' || s.status === 'failed',
  )
  const showButtons = !isRunning && !allDone

  return (
    <div className="mt-3 rounded-xl border border-[#6366f1]/20 bg-[#6366f1]/[0.04] p-3 space-y-2.5">
      {/* Header with Run All / Skip */}
      {showButtons && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Zap className="h-3 w-3 text-[#6366f1]" />
            <span>
              {actions.length} skill{actions.length > 1 ? 's' : ''}
              {totalCredits > 0 ? ` \u00b7 ~${totalCredits} credits` : ''}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onSkip}
              disabled={disabled}
              className="px-2.5 py-1 rounded-lg text-[11px] text-muted-foreground
                hover:text-foreground hover:bg-white/[0.06] transition-colors
                disabled:opacity-50"
            >
              Skip
            </button>
            <button
              onClick={onRunAll}
              disabled={disabled}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-medium
                bg-[#6366f1] text-white hover:bg-[#6366f1]/80 transition-colors
                disabled:opacity-50"
            >
              <Play className="h-3 w-3" />
              Run{actions.length > 1 ? ' All' : ''}
            </button>
          </div>
        </div>
      )}

      {/* Action rows */}
      <div className="space-y-1.5">
        {actions.map((action) => (
          <ActionRow
            key={action.id}
            action={action}
            state={actionStates[action.id] ?? { status: 'pending' }}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/action-card.tsx
git commit -m "feat(mia): ActionCard component — skill confirmation/progress/result card"
```

---

## Task 6: CollectCard component

**Files:**
- Create: `src/components/chat/collect-card.tsx`

- [ ] **Step 1: Create the CollectCard component**

```tsx
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
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/collect-card.tsx
git commit -m "feat(mia): CollectCard component — inline data collection with fallback"
```

---

## Task 7: Update ChatMessage to strip action blocks

**Files:**
- Modify: `src/components/chat/chat-message.tsx`

- [ ] **Step 1: Add action block stripping and parsed actions callback**

Add import at top of file:
```typescript
import { parseMiaResponse, type MiaAction } from '@/lib/mia-actions'
```

Update the `ChatMessageProps` interface to add:
```typescript
interface ChatMessageProps {
  role: 'user' | 'mia'
  content: string
  timestamp?: Date
  streaming?: boolean
  agentsReferenced?: string[]
  onActionClick?: (skillId: string) => void
  onActionsFound?: (actions: MiaAction[]) => void
}
```

In the `ChatMessage` component, before the return, add parsing logic:
```typescript
  // Parse and strip action blocks from Mia's messages
  const { text: displayText, actions: parsedActions } = role === 'mia' && !streaming
    ? parseMiaResponse(content)
    : { text: content, actions: [] as MiaAction[] }

  // Notify parent of parsed actions (on first parse)
  useEffect(() => {
    if (parsedActions.length > 0 && onActionsFound) {
      onActionsFound(parsedActions)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content])
```

Add `useEffect` to the imports at top:
```typescript
import { useEffect } from 'react'
```

Update the render to use `displayText` instead of `content` for Mia's messages:
```typescript
  // In the existing render, change line 133 from:
  //   {isUser ? content : parseContent(content, onActionClick)}
  // to:
  {isUser ? content : parseContent(displayText, onActionClick)}
```

Also add `onActionsFound` to the destructured props.

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/chat-message.tsx
git commit -m "feat(mia): ChatMessage strips action blocks, notifies parent of parsed actions"
```

---

## Task 8: Wire up chat page — action execution flow

**Files:**
- Modify: `src/app/dashboard/chat/page.tsx`

This is the largest task. The chat page needs to:
1. Track parsed actions per message
2. Render ActionCard / CollectCard below messages
3. Handle the execute SSE stream
4. Update action states in real-time

- [ ] **Step 1: Add imports and state**

At the top of `chat/page.tsx`, add imports:
```typescript
import { ActionCard, type ActionState } from '@/components/chat/action-card'
import { CollectCard } from '@/components/chat/collect-card'
import { type MiaAction, type SkillAction, type CollectAction, validateAndSort } from '@/lib/mia-actions'
import { loadSkill } from '@/lib/skill-loader'
```

Add new state variables inside the component (after existing state, around line 48):
```typescript
  // Action execution state — keyed by message ID
  const [messageActions, setMessageActions] = useState<Record<string, MiaAction[]>>({})
  const [actionStates, setActionStates] = useState<Record<string, ActionState>>({})
  const [executingMessageId, setExecutingMessageId] = useState<string | null>(null)
```

- [ ] **Step 2: Add handler for when actions are parsed from a message**

```typescript
  // Called when ChatMessage parses actions from Mia's response
  const handleActionsFound = useCallback((messageId: string, actions: MiaAction[]) => {
    setMessageActions((prev) => {
      if (prev[messageId]) return prev // Already set
      return { ...prev, [messageId]: actions }
    })
    // Initialize all action states to pending
    const initialStates: Record<string, ActionState> = {}
    for (const a of actions) {
      initialStates[a.id] = { status: 'pending' }
    }
    setActionStates((prev) => ({ ...prev, ...initialStates }))
  }, [])
```

- [ ] **Step 3: Add the execute handler**

```typescript
  // Execute actions for a specific message
  const handleRunActions = useCallback(
    async (messageId: string) => {
      if (!brandId || !activeConversationId || executingMessageId) return
      const actions = messageActions[messageId]
      if (!actions) return

      const skillActions = actions.filter((a): a is SkillAction => a.type === 'skill')
      if (skillActions.length === 0) return

      setExecutingMessageId(messageId)

      try {
        const res = await fetch('/api/mia/actions/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brandId,
            conversationId: activeConversationId,
            actions: skillActions,
          }),
        })

        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (!raw) continue

            let event: Record<string, unknown>
            try {
              event = JSON.parse(raw)
            } catch {
              continue
            }

            if (event.type === 'action_start') {
              setActionStates((prev) => ({
                ...prev,
                [event.actionId as string]: { status: 'running' },
              }))
            }

            if (event.type === 'action_complete') {
              setActionStates((prev) => ({
                ...prev,
                [event.actionId as string]: {
                  status: 'complete',
                  output: event.output as Record<string, unknown>,
                  creditsUsed: event.creditsUsed as number,
                },
              }))
            }

            if (event.type === 'action_failed') {
              setActionStates((prev) => ({
                ...prev,
                [event.actionId as string]: {
                  status: 'failed',
                  error: event.error as string,
                },
              }))
            }

            if (event.type === 'summary') {
              // Add summary as a new Mia message
              const summaryMsg: Message = {
                id: `summary-${Date.now()}`,
                role: 'mia',
                content: event.content as string,
                timestamp: new Date(),
              }
              setMessages((prev) => [...prev, summaryMsg])
            }
          }
        }
      } catch (err) {
        console.error('[Chat] Execute error:', err)
      } finally {
        setExecutingMessageId(null)
      }
    },
    [brandId, activeConversationId, executingMessageId, messageActions],
  )

  // Skip actions for a message
  const handleSkipActions = useCallback((messageId: string) => {
    const actions = messageActions[messageId]
    if (!actions) return
    const skipped: Record<string, ActionState> = {}
    for (const a of actions) {
      skipped[a.id] = { status: 'failed', error: 'Skipped by user' }
    }
    setActionStates((prev) => ({ ...prev, ...skipped }))
  }, [messageActions])

  // Handle collected data (from CollectCard)
  const handleCollected = useCallback((_actionId: string, _value: string) => {
    // Mark collect action as complete
    setActionStates((prev) => ({
      ...prev,
      [_actionId]: { status: 'complete' },
    }))
  }, [])

  const handleSkipCollect = useCallback((actionId: string) => {
    setActionStates((prev) => ({
      ...prev,
      [actionId]: { status: 'failed', error: 'Skipped' },
    }))
  }, [])
```

- [ ] **Step 4: Update the message rendering to include ActionCard/CollectCard**

In the messages rendering section (around line 358), replace the message map with:

```tsx
            messages.map((msg) => {
              const msgActions = messageActions[msg.id]
              const skillActions = msgActions?.filter((a): a is SkillAction => a.type === 'skill') ?? []
              const collectActions = msgActions?.filter((a): a is CollectAction => a.type === 'collect') ?? []
              const totalCredits = skillActions.reduce((sum, a) => {
                // Estimate 1 credit per skill (actual cost shown after validation)
                return sum + 1
              }, 0)

              return (
                <div key={msg.id}>
                  <ChatMessage
                    role={msg.role}
                    content={msg.content}
                    timestamp={msg.timestamp}
                    streaming={msg.streaming}
                    onActionClick={(skillId) => sendMessage(`Run ${skillId}`)}
                    onActionsFound={(actions) => handleActionsFound(msg.id, actions)}
                  />

                  {/* Collect cards */}
                  {collectActions.map((ca) => (
                    <div key={ca.id} className="ml-11">
                      <CollectCard
                        action={ca}
                        brandId={brandId ?? ''}
                        onCollected={handleCollected}
                        onSkip={handleSkipCollect}
                        disabled={!!executingMessageId}
                      />
                    </div>
                  ))}

                  {/* Action card */}
                  {skillActions.length > 0 && (
                    <div className="ml-11">
                      <ActionCard
                        actions={skillActions}
                        actionStates={actionStates}
                        totalCredits={totalCredits}
                        onRunAll={() => handleRunActions(msg.id)}
                        onSkip={() => handleSkipActions(msg.id)}
                        disabled={!!executingMessageId}
                      />
                    </div>
                  )}
                </div>
              )
            })
```

- [ ] **Step 5: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/chat/page.tsx
git commit -m "feat(mia): wire chat page — action cards, SSE execution, data collection"
```

---

## Task 9: Integration test — manual verification

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Navigate to the Mia chat page**

Go to: `/dashboard/chat`

- [ ] **Step 3: Test basic conversation (no actions)**

Send: "What should I focus on today?"
Expected: Mia responds with text only, no action cards appear.

- [ ] **Step 4: Test skill trigger**

Send: "Run a health check on my brand"
Expected: Mia responds with text explaining what she'll do, plus an ActionCard with health-check skill. "Run" and "Skip" buttons visible.

- [ ] **Step 5: Test action execution**

Click "Run" on the ActionCard.
Expected: Card shows spinner, then completes with checkmark. "View output" expand works. Mia posts a summary message below.

- [ ] **Step 6: Test chain**

Send: "Diagnose my brand and then write some ad copy based on the results"
Expected: ActionCard shows 2 skills (health-check -> ad-copy) with chain. "Run All" button. Both execute sequentially.

- [ ] **Step 7: Test data collection**

Send: "Optimize my landing page" (without having set up a landing page URL)
Expected: CollectCard appears asking for the URL. Submit stores it. If skipped, shows fallback link to agent setup.

- [ ] **Step 8: Commit any fixes from testing**

```bash
git add -u
git commit -m "fix(mia): integration test fixes for agent delegation"
```

---

## Task 10: Final push

- [ ] **Step 1: Final type check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 2: Push**

```bash
git push
```

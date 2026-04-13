# Live Agent Activity UX — Design Spec

**Date:** 2026-04-14
**Status:** Approved

## Problem

When skills run, users see a spinner and nothing else. No feedback on what's happening, how far along it is, or what the agent found. Users think the system is broken.

## Solution

Real-time mission control UI using Server-Sent Events (SSE). Dashboard shows all agents with live status cards + terminal feed. Agent pages show focused activity for that agent.

---

## 1. SSE Streaming from Skill Runs

### New Endpoint: `POST /api/skills/run-stream`

Returns an SSE stream instead of a JSON response. Events:

```
event: status
data: {"agent":"scout","skill":"health-check","step":"starting","message":"Initializing health check..."}

event: progress
data: {"agent":"scout","skill":"health-check","step":"analyzing","message":"Checking product catalog (4 products)","progress":25}

event: progress
data: {"agent":"scout","skill":"health-check","step":"scoring","message":"SEO score: 60 (warning)","progress":60}

event: result
data: {"agent":"scout","skill":"health-check","step":"complete","message":"Score: 78/100 — 2 warnings, 0 critical","output":{...},"progress":100}

event: chain
data: {"agent":"mia","message":"Dispatching Hugo for SEO audit based on warning score","next_skill":"seo-audit","next_agent":"hugo"}

event: done
data: {"total_skills":3,"total_time_ms":45000}
```

### How it works

The existing `runSkill` in `skills-engine.ts` runs synchronously. Instead of modifying it, wrap it with a streaming layer:

1. `/api/skills/run-stream` creates an SSE response
2. Sends `status: starting` immediately
3. Calls `runSkill()` — before the LLM call, sends `progress: analyzing`
4. After LLM completes, sends `result` with the output
5. If Mia chains a follow-up, sends `chain` event
6. Sends `done` when everything finishes

For Mia's trigger (which runs health-check + queues chains):
1. Stream the health-check progress
2. Stream Mia's dispatch decision
3. Stream each queued skill as it starts (chain processor picks them up)

### Implementation approach

Add optional `onProgress` callback to `runSkill`:

```typescript
export async function runSkill(input: SkillRunInput, onProgress?: (event: ProgressEvent) => void): Promise<SkillRunResult> {
  onProgress?.({ step: 'starting', message: `Starting ${input.skillId}...`, progress: 0 })
  // ... existing logic ...
  onProgress?.({ step: 'loading_context', message: 'Gathering brand context...', progress: 10 })
  // ... after MCP data fetch ...
  onProgress?.({ step: 'analyzing', message: 'AI analyzing data...', progress: 30 })
  // ... after LLM call ...
  onProgress?.({ step: 'complete', message: 'Done', progress: 100, output })
}
```

The SSE endpoint wraps this callback into `event:` writes to the response stream.

---

## 2. Dashboard Mission Control

### Agent Status Cards (top of dashboard)

Replace the static agent status bar with live cards:

```
┌─────────────────────────────────────────────────────────────────┐
│ Agent Status                                                     │
│                                                                   │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐         │
│ │ Scout  │ │ Hugo   │ │ Aria   │ │ Echo   │ │ ...    │         │
│ │ ● Run  │ │ ◌ Queue│ │ ○ Idle │ │ ● Run  │ │        │         │
│ │ 78/100 │ │ SEO    │ │        │ │ Scan   │ │        │         │
│ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

States:
- `● Running` (green pulse) — actively executing a skill. Shows skill name.
- `◌ Queued` (yellow) — in Mia's pending chain, waiting.
- `○ Idle` (grey) — not doing anything.
- `✓ Done` (green check, fades after 10s) — just completed.
- `✗ Error` (red) — failed.

Each card shows:
- Agent avatar (small)
- Agent name
- Status indicator (dot + label)
- Current skill name or last result snippet
- Click → navigates to agent detail page

### Activity Terminal (below cards)

Dark terminal-style component showing real-time events:

```
┌─ Mission Control ──────────────────────────────────────────────┐
│                                                                 │
│ 14:32:15 [scout] Starting health check...                      │
│ 14:32:16 [scout] Checking Brand DNA (4 products, 6 competitors)│
│ 14:32:18 [scout] Analyzing with Gemini Flash...                │
│ 14:32:20 [scout] ✓ Score: 78/100 — SEO warning (60)           │
│ 14:32:20 [mia]   Reviewing findings...                         │
│ 14:32:21 [mia]   → Dispatching Hugo: seo-audit                │
│ 14:32:21 [mia]   → Dispatching Echo: competitor-scan           │
│ 14:32:22 [hugo]  Starting SEO audit...                         │
│ 14:32:25 [echo]  Scanning Boheco via ScrapeCreators...         │
│ 14:32:28 [echo]  ✓ Found 3 Boheco ads, 5 Cannazo ads          │
│ 14:32:35 [hugo]  ✓ SEO audit complete — 3 issues found         │
│                                                                 │
│ █                                                               │
└─────────────────────────────────────────────────────────────────┘
```

Color coding:
- Agent names in their brand color (Scout=#0D9488, Hugo=#D97706, etc.)
- Success (✓) in green
- Errors (✗) in red
- Mia dispatch arrows (→) in indigo
- Timestamps in muted grey

Auto-scrolls to bottom. Persists across tab switches (stored in state).

---

## 3. Agent Detail Page Activity

On individual agent pages, show a smaller version of the terminal focused on that agent only:

```
┌─ Hugo Activity ────────────────────────────────────────────────┐
│ 14:32:22 Starting SEO audit...                                  │
│ 14:32:23 Loading Brand DNA context...                           │
│ 14:32:25 Analyzing with Gemini Flash...                         │
│ 14:32:30 Checking meta descriptions on 4 product pages...      │
│ 14:32:33 Analyzing keyword gaps...                              │
│ 14:32:35 ✓ Complete — 3 issues, 2 opportunities                │
│                                                                 │
│ █                                                               │
└─────────────────────────────────────────────────────────────────┘
```

Shows when a skill is running. Collapses/hides when idle (replaced by latest output).

---

## 4. Mia Trigger Integration

When user clicks "Run Mia's Review":

1. Button changes to "Mia is reviewing..." with pulse animation
2. Dashboard switches to mission control mode
3. SSE stream opens to `/api/mia/trigger-stream`
4. Health-check progress streams in real-time
5. Mia's dispatch decision streams
6. Each queued skill streams as chain processor picks it up
7. When all done, mission control shows summary

The "Run Mia's Review" button on the morning brief becomes a trigger for the entire experience.

---

## 5. Files to Create/Modify

### New Files

| File | Purpose | Est. Lines |
|------|---------|-----------|
| `src/app/api/skills/run-stream/route.ts` | SSE endpoint for skill run streaming | 100 |
| `src/app/api/mia/trigger-stream/route.ts` | SSE endpoint for Mia's full cycle | 120 |
| `src/components/dashboard/mission-control.tsx` | Agent status cards + activity terminal | 200 |
| `src/components/agents/agent-activity.tsx` | Per-agent activity terminal | 80 |

### Modified Files

| File | Change | Est. Lines |
|------|--------|-----------|
| `src/lib/skills-engine.ts` | Add `onProgress` callback to `runSkill` | 30 |
| `src/app/dashboard/page.tsx` | Replace static agent bar with mission-control | 20 |
| `src/app/dashboard/agents/[agentId]/page.tsx` | Add agent-activity terminal | 15 |
| `src/components/dashboard/morning-brief.tsx` | Update "Run Mia's Review" to use SSE | 20 |

**Total: ~585 lines across 8 files.**

---

## 6. Progressive Enhancement

- **No SSE support / connection drops**: falls back to polling (existing behavior). UI shows "reconnecting..."
- **Multiple skills running**: terminal interleaves events from all agents with agent-colored prefixes
- **Page navigation during run**: events stored in state, restored when user returns to dashboard

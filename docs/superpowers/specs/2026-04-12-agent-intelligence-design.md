# Agent Intelligence & Interactive System — Design Spec

**Date:** 2026-04-12
**Status:** Approved
**Scope:** Make Growth OS agents proactive, interactive, and visible. Replace hollow agent UX with a working intelligence layer powered by the knowledge graph.

---

## Problem

Agents are structurally complete (12 agents, 50 skills, orchestrator, MCP data layer) but functionally inert:

1. Mia doesn't flag missing connections or explain what's blocked
2. "Instruct Mia" is a fake input (800ms setTimeout, discards text)
3. Skills run with empty data and nobody tells the user why
4. No visibility into Mia's decisions or agent chains
5. Agents have no setup flow — activation means nothing
6. Dashboard shows zero activity context

## Design Principles

- **Graph-native:** All intelligence data flows through existing `knowledge_nodes` + `knowledge_edges`. No new tables.
- **Active blocking over silent degradation:** When something's missing, tell the user and link to the fix.
- **Interactive agents:** Agents ask for what they need (forms + chat). Users provide data, agents become useful.
- **Retention-aware:** Rolling windows and upserts prevent graph bloat. Max ~60 active intelligence nodes per brand.

---

## 1. Knowledge Graph Data Model

All agent intelligence uses existing `knowledge_nodes` and `knowledge_edges` tables.

### New Node Types

| node_type | Lifecycle | Content |
|-----------|-----------|---------|
| `mia_decision` | Rolling. Max 50/brand. Oldest 25 summarized into digest at cap. | `{ decision: 'auto_run'|'blocked'|'needs_review'|'skip', reasoning: string, follow_up_skills: string[], pending_chain: string[], blocked_reason?: string, skill_run_id: string }` |
| `instruction` | Upsert per `(brand_id, agent_id)`. Max 12/brand (one per agent). | `{ text: string, target_agent: string, acknowledged: boolean }` |
| `brand_data` | Upsert per `(brand_id, data_type)`. One per data type. | `{ source: 'manual'|'upload'|'chat', data_type: string, data: Record<string, unknown> }` |
| `platform_status` | Single node per brand, overwritten. Updated after OAuth callbacks and during daily cron. | `{ shopify: boolean, meta: boolean, ga4: boolean, gsc: boolean, klaviyo: boolean, updated_at: string }` |
| `agent_setup` | Upsert per `(brand_id, agent_id)`. Max 12/brand. | `{ state: 'inactive'|'collecting'|'ready', requirements_met: string[], requirements_pending: string[] }` |
| `mia_digest` | One per month, permanent. | `{ month: string, total_decisions: number, auto_runs: number, blocks: number, top_actions: string[], summary: string }` |

### Edges

- `mia_decision` --[`derived_from`]--> insight node (from skill run)
- `mia_decision` --[`dispatched`]--> agent node
- `instruction` --[`targets`]--> agent node
- `brand_data` --[`provides_context`]--> agent node

### Retention Rules

- `mia_decision`: Max 50 per brand. At cap, summarize oldest 25 into a `mia_digest` node using Gemini Flash, then delete them. Run during daily cron.
- `instruction`: Upsert on `(brand_id, name)` where name = `instruction:{agent_id}`. Always exactly 1 per agent.
- `brand_data`: Upsert on `(brand_id, name)` where name = `brand_data:{data_type}`. Always 1 per type.
- `platform_status`: Upsert on `(brand_id, name)` where name = `platform_status`. Always 1.
- `agent_setup`: Upsert on `(brand_id, name)` where name = `agent_setup:{agent_id}`. Always 1 per agent.
- `mia_digest`: Never deleted. ~12 nodes/year. Negligible.

**Steady state: ~60 active intelligence nodes per brand.**

### Query Strategy

Intelligence nodes are queried by **direct indexed lookup** on `(brand_id, node_type)` or `(brand_id, name)`, NOT via semantic RAG search. This keeps pre-flight checks under 50ms.

RAG is only used when building skill prompts (existing behavior) — the new intelligence nodes naturally appear in RAG results because they're standard knowledge nodes.

---

## 2. Mia's Intelligence Layer

### Pre-Flight Checks (before every skill run)

Added to `skills-engine.ts` before the LLM call:

1. **Platform check:** Query `platform_status` node. Compare required platforms (from skill's `mcp_tools`) against connected platforms.
   - If missing: Create `mia_decision` node with `decision: 'blocked'`, create notification with "Connect X" action link. Skip skill.
   - If partial: Run skill, include `data_gaps` note in context.

2. **Instruction check:** Query `instruction` node for the skill's agent. If exists, append to LLM prompt: `"Brand Manager Instruction: {text}"`.

3. **Brand data fallback:** Query `brand_data` nodes for relevant data types. If a platform is missing but manual data exists, inject it into the skill context as supplementary data.

### Post-Flight Actions (after every skill run)

Added to `skills-engine.ts` after the LLM call:

1. **Create `mia_decision` node:** Store decision, reasoning, and pending chain.
2. **Determine follow-ups:** If skill has `chains_to` and output has critical/warning findings:
   - Rule-based for simple cases (score < 40 = critical, dispatch fix agent)
   - LLM-based for complex cases (existing Mia orchestrator behavior)
3. **Store pending chain:** `pending_chain: ['seo-audit', 'email-flow-audit']` in the decision node. The chain processor cron handles execution.
4. **Create notification:** Always create an activity notification. For blocked/needs_review, include action links.

### Decision Rules (no LLM needed)

| Condition | Decision | Action |
|-----------|----------|--------|
| Required platform missing, no manual fallback | `blocked` | Notification with connect/provide-data link |
| Score < 40 in any category | `auto_run` | Dispatch fix agent's primary skill |
| Score 40-60 in any category | `needs_review` | Notification asking user to approve follow-up |
| Score > 60 all categories | `skip` | Log "all healthy" decision, no follow-up |
| User instruction says "focus on X" | Override | Prioritize X skill regardless of scores |

LLM-based Mia decision is only called when: multiple follow-ups compete for priority, or user instruction requires interpretation.

---

## 3. Chain Processor

### Problem

Vercel serverless functions die after response. Can't run Scout → Hugo → Aria in one function.

### Solution

New cron endpoint: `/api/cron/chain-processor`

```
Schedule: "0 */5 * * *" (every 5 min on Pro) or daily on Hobby
```

Logic:
1. Query `mia_decision` nodes where `pending_chain` is non-empty
2. For each, pop the first skill from `pending_chain`
3. Run that skill via `runSkill()`
4. Create a new `mia_decision` for the result
5. Update the original decision's `pending_chain`
6. Process max 5 chains per cron run (prevent timeout)

### Vercel Config

```json
{
  "crons": [
    { "path": "/api/cron/chain-processor", "schedule": "0 3 * * *" }
  ]
}
```

On Hobby: chains complete within 24 hours (daily cron). On Pro: chains complete within 5-10 minutes. Document this trade-off for users.

---

## 4. Agent Activation & Interactive Setup

### Agent Requirements

Each agent defines setup requirements in `agents.json`:

```json
{
  "id": "penny",
  "name": "Penny",
  "setup": {
    "requirements": [
      { "key": "platform:shopify", "label": "Shopify Store", "type": "connection", "required": true },
      { "key": "data:monthly_revenue", "label": "Monthly Revenue", "type": "number", "required": true, "fallback": "manual" },
      { "key": "data:cac", "label": "Customer Acquisition Cost", "type": "number", "required": false, "fallback": "manual" },
      { "key": "data:gross_margin", "label": "Gross Margin %", "type": "number", "required": false, "fallback": "manual" }
    ],
    "chat_prompt": "I'm Penny, your finance agent. I need some numbers to get started. What's your approximate monthly revenue?"
  }
}
```

Agents without a `setup` field (like Scout, who works with whatever is available) skip the setup flow entirely.

### Activation Flow

1. User clicks "Activate" on agent card
2. `POST /api/agents/[agentId]/setup` — creates `agent_setup` node with state `collecting`
3. UI shows setup checklist:
   - `type: 'connection'` → shows platform connection status + "Connect" link
   - `type: 'number'|'text'|'file'` with `fallback: 'manual'` → shows form input
4. User fills form → `POST /api/agents/[agentId]/setup` with data → saves as `brand_data` nodes
5. User can also click "Chat with {agent}" → opens `/dashboard/chat` with agent-specific context pre-loaded
6. After each submission, re-check requirements
7. When all required items are met → update `agent_setup` node to `state: 'ready'`
8. Mia is notified, includes this agent in next orchestration cycle

### Chat-Based Data Collection

When user chats with an agent during setup:
1. Chat uses the agent's `chat_prompt` as system context
2. LLM extracts structured data from conversation
3. Before saving, show confirmation: "I understood: Revenue = Rs 50,00,000. Correct?"
4. User confirms → upsert `brand_data` node
5. Re-check requirements, update setup state

### Form Data Storage

Form submissions save as `brand_data` knowledge nodes:
```
node_type: 'brand_data'
name: 'brand_data:monthly_revenue'
properties: { source: 'manual', data_type: 'monthly_revenue', data: { value: 5000000, currency: 'INR' } }
```

Skills access this data via the existing RAG pipeline. The `brand_data` nodes appear alongside extracted Brand DNA in skill prompts.

---

## 5. Dashboard & Agent Page UX

### Dashboard (`/dashboard`) — Mia's Control Room

**Data source:** Single endpoint `GET /api/dashboard/context?brandId=X` running parallel queries:
- Recent skill_runs (existing)
- `mia_decision` nodes (last 20)
- `platform_status` node
- `agent_setup` nodes (all 12)
- `notification` records (last 10)
- Wallet balance (existing)

**Cached for 30 seconds** server-side to prevent redundant queries.

**Layout changes:**

1. **Morning Brief** — narrative generated from actual `mia_decision` nodes: "3 agents active, 1 blocked. SEO audit found weak meta tags — Hugo is fixing."
2. **Agent Status Bar** — horizontal row of all 12 agents with color-coded status:
   - Green: active (setup ready, running or idle)
   - Yellow: needs setup (collecting data)
   - Red: blocked (missing required connection)
   - Grey: inactive (not activated)
3. **Activity Feed** (replaces Internal Log) — mia_decision nodes rendered as timeline entries with reasoning. Blocked items show action links ("Connect Shopify", "Provide Data").
4. **Blocked Items Panel** — filtered view of blocked decisions with direct fix links.

### Agent Detail Page (`/dashboard/agents/[id]`)

**Three states:**

1. **Inactive** — "Activate" button, agent description, skill list (read-only)
2. **Setting Up** — setup checklist with forms, chat option, progress indicator
3. **Active** — Mia's latest decision for this agent, real instruction input, skill run buttons with live feedback, recent runs with output summaries

**Mia Context Section** (visible in active state):
- "Mia's Latest" — most recent `mia_decision` node targeting this agent, showing reasoning
- "Your Instruction" — reads/writes `instruction` knowledge node for this agent
- Instruction input is real (saves to DB, acknowledged by Mia in next run)

**Skill Run Feedback:**
After clicking "Run", poll `/api/skills/runs?brandId=X&limit=1` every 2s until complete. Show result inline — no page refresh needed.

### Mia's Agent Page (`/dashboard/agents/mia`)

Enhanced view:
- Full decision history timeline (all `mia_decision` nodes, paginated)
- Active instructions across all agents (all `instruction` nodes)
- Chain status: what's running, what's queued in `pending_chain`, what's blocked
- Global instruction: user can set brand-wide priorities ("focus on SEO this month")
- Agent health grid: all 12 agents with status, last run, next scheduled

---

## 6. Files to Create/Modify

### New Files (~1,000 lines)

| File | Purpose | Est. Lines |
|------|---------|-----------|
| `src/lib/agent-setup.ts` | Check/update agent requirements, manage setup state | 150 |
| `src/lib/mia-intelligence.ts` | Pre-flight checks: platform status, instructions, blockers | 200 |
| `src/lib/knowledge/retention.ts` | Digest old mia_decisions, enforce node caps | 100 |
| `src/app/api/dashboard/context/route.ts` | Single endpoint for dashboard data (parallel queries, 30s cache) | 100 |
| `src/app/api/agents/[agentId]/setup/route.ts` | GET setup checklist, POST manual data, check requirements | 150 |
| `src/app/api/agents/[agentId]/instruct/route.ts` | POST instruction to Mia (saves as knowledge node) | 80 |
| `src/app/api/cron/chain-processor/route.ts` | Process pending skill chains from mia_decision nodes | 120 |

### Modified Files (~600 lines changed)

| File | Changes | Est. Lines |
|------|---------|-----------|
| `src/lib/skills-engine.ts` | Add pre-flight + post-flight hooks (platform check, instruction injection, decision storage) | 80 |
| `src/lib/mia-orchestrator.ts` | Write decisions to knowledge graph, read instructions, store pending chains | 80 |
| `src/app/dashboard/page.tsx` | New layout: activity feed, agent status bar, blocked items panel | 200 |
| `src/app/dashboard/agents/[agentId]/page.tsx` | Three-state UI (inactive/setup/active), real instructions, Mia context | 200 |
| `src/components/agents/mia-control.tsx` | Real instruction input, latest decision display | 100 |
| `src/components/dashboard/morning-brief.tsx` | Generate narrative from mia_decision nodes | 50 |
| `src/components/dashboard/internal-log.tsx` | Replace with activity feed showing decisions + reasoning | 80 |
| `skills/agents.json` | Add `setup` field with requirements per agent | 50 |
| `vercel.json` | Add chain-processor cron | 5 |

**Total: ~1,600 lines new/changed across ~15 files.**

---

## 7. Bottlenecks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Knowledge node query per skill pre-flight | +50-100ms latency | Direct indexed lookup on `(brand_id, node_type)`, not semantic RAG |
| Chain processor on Hobby plan | Chains take up to 24h | Document trade-off. Pro plan = 5 min cron. |
| Chat data extraction reliability | Fuzzy user answers | Always confirm with structured form before saving |
| Dashboard context endpoint | 4-5 parallel queries | Single endpoint, `Promise.all`, 30s server cache |
| Agent setup requirements maintenance | Manual config per agent | Define once in `agents.json`, rarely changes |
| Knowledge graph bloat | Uncapped nodes over years | Rolling 30-day window for decisions, upsert for status nodes, monthly digests |
| Mia LLM call per decision | Token cost + latency | Rule-based decisions for simple cases. LLM only for complex priority conflicts. |

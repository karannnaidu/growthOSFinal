# Agent Intelligence & Interactive System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Growth OS agents proactive, interactive, and visible — replace the hollow agent UX with a working intelligence layer powered by the knowledge graph.

**Architecture:** All intelligence data (Mia decisions, user instructions, manual brand data, platform status, agent setup state) stored as knowledge_nodes in the existing graph. Pre-flight/post-flight hooks in skills-engine.ts drive Mia's intelligence. Chain processor cron handles multi-step agent chains on Vercel serverless. Dashboard and agent pages query a single context endpoint.

**Tech Stack:** Existing knowledge graph (Supabase), skills-engine.ts hooks, Next.js API routes, React client components.

**PRD Reference:** `docs/superpowers/specs/2026-04-12-agent-intelligence-design.md`

**Depends on:** Existing knowledge graph tables, skills engine, mia orchestrator, agent pages.

---

### Task 1: Extend Knowledge Graph for Intelligence Node Types

**Files:**
- Create: `supabase/migrations/add-intelligence-node-types.sql`
- Create: `src/lib/knowledge/intelligence.ts`

- [ ] **Step 1: Create migration to extend node_type CHECK constraint**

The `knowledge_nodes` table has a CHECK constraint on `node_type` that only allows specific values. Add the 6 new types.

```sql
-- supabase/migrations/add-intelligence-node-types.sql
-- Add intelligence node types to knowledge_nodes

ALTER TABLE knowledge_nodes DROP CONSTRAINT IF EXISTS knowledge_nodes_node_type_check;

ALTER TABLE knowledge_nodes ADD CONSTRAINT knowledge_nodes_node_type_check
  CHECK (node_type IN (
    -- Existing types
    'product', 'audience', 'competitor', 'content', 'campaign', 'metric',
    'insight', 'trend', 'keyword', 'landing_page', 'email', 'ad_creative',
    'brand_asset', 'persona', 'funnel_stage', 'offer', 'testimonial',
    'usp', 'channel', 'experiment', 'brand_guidelines', 'competitor_creative',
    'top_content',
    -- New intelligence types
    'mia_decision', 'instruction', 'brand_data', 'platform_status',
    'agent_setup', 'mia_digest'
  ));
```

- [ ] **Step 2: Run the migration**

```bash
# Via Supabase dashboard SQL editor, or:
npx supabase db push
```

- [ ] **Step 3: Create intelligence.ts — typed helpers for reading/writing intelligence nodes**

```typescript
// src/lib/knowledge/intelligence.ts
//
// Typed helpers for intelligence knowledge nodes.
// All queries use direct indexed lookups on (brand_id, node_type) or (brand_id, name).
// No semantic RAG search — keeps pre-flight checks under 50ms.

import { createServiceClient } from '@/lib/supabase/service'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MiaDecision {
  decision: 'auto_run' | 'blocked' | 'needs_review' | 'skip'
  reasoning: string
  follow_up_skills: string[]
  pending_chain: string[]
  blocked_reason?: string
  skill_run_id?: string
  target_agent?: string
}

export interface Instruction {
  text: string
  target_agent: string
  acknowledged: boolean
}

export interface BrandDataEntry {
  source: 'manual' | 'upload' | 'chat'
  data_type: string
  data: Record<string, unknown>
}

export interface PlatformStatus {
  shopify: boolean
  meta: boolean
  ga4: boolean
  gsc: boolean
  klaviyo: boolean
  updated_at: string
}

export interface AgentSetupState {
  state: 'inactive' | 'collecting' | 'ready'
  requirements_met: string[]
  requirements_pending: string[]
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

export async function getPlatformStatus(brandId: string): Promise<PlatformStatus | null> {
  const admin = createServiceClient()
  const { data } = await admin
    .from('knowledge_nodes')
    .select('properties')
    .eq('brand_id', brandId)
    .eq('node_type', 'platform_status')
    .eq('is_active', true)
    .limit(1)
    .single()
  return (data?.properties as PlatformStatus) ?? null
}

export async function getInstruction(brandId: string, agentId: string): Promise<Instruction | null> {
  const admin = createServiceClient()
  const { data } = await admin
    .from('knowledge_nodes')
    .select('properties')
    .eq('brand_id', brandId)
    .eq('node_type', 'instruction')
    .eq('name', `instruction:${agentId}`)
    .eq('is_active', true)
    .limit(1)
    .single()
  return (data?.properties as Instruction) ?? null
}

export async function getAgentSetup(brandId: string, agentId: string): Promise<AgentSetupState | null> {
  const admin = createServiceClient()
  const { data } = await admin
    .from('knowledge_nodes')
    .select('properties')
    .eq('brand_id', brandId)
    .eq('node_type', 'agent_setup')
    .eq('name', `agent_setup:${agentId}`)
    .eq('is_active', true)
    .limit(1)
    .single()
  return (data?.properties as AgentSetupState) ?? null
}

export async function getBrandData(brandId: string, dataType: string): Promise<BrandDataEntry | null> {
  const admin = createServiceClient()
  const { data } = await admin
    .from('knowledge_nodes')
    .select('properties')
    .eq('brand_id', brandId)
    .eq('node_type', 'brand_data')
    .eq('name', `brand_data:${dataType}`)
    .eq('is_active', true)
    .limit(1)
    .single()
  return (data?.properties as BrandDataEntry) ?? null
}

export async function getRecentMiaDecisions(brandId: string, limit: number = 20): Promise<Array<MiaDecision & { id: string; created_at: string }>> {
  const admin = createServiceClient()
  const { data } = await admin
    .from('knowledge_nodes')
    .select('id, properties, created_at')
    .eq('brand_id', brandId)
    .eq('node_type', 'mia_decision')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map(n => ({ ...(n.properties as MiaDecision), id: n.id, created_at: n.created_at }))
}

export async function getAllAgentSetups(brandId: string): Promise<Record<string, AgentSetupState>> {
  const admin = createServiceClient()
  const { data } = await admin
    .from('knowledge_nodes')
    .select('name, properties')
    .eq('brand_id', brandId)
    .eq('node_type', 'agent_setup')
    .eq('is_active', true)
  const result: Record<string, AgentSetupState> = {}
  for (const n of data ?? []) {
    const agentId = n.name.replace('agent_setup:', '')
    result[agentId] = n.properties as AgentSetupState
  }
  return result
}

export async function getAllInstructions(brandId: string): Promise<Record<string, Instruction>> {
  const admin = createServiceClient()
  const { data } = await admin
    .from('knowledge_nodes')
    .select('name, properties')
    .eq('brand_id', brandId)
    .eq('node_type', 'instruction')
    .eq('is_active', true)
  const result: Record<string, Instruction> = {}
  for (const n of data ?? []) {
    const agentId = n.name.replace('instruction:', '')
    result[agentId] = n.properties as Instruction
  }
  return result
}

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------

export async function upsertPlatformStatus(brandId: string, status: PlatformStatus): Promise<void> {
  const admin = createServiceClient()
  await admin.from('knowledge_nodes').upsert({
    brand_id: brandId,
    node_type: 'platform_status',
    name: 'platform_status',
    summary: `Connected: ${Object.entries(status).filter(([k, v]) => k !== 'updated_at' && v).map(([k]) => k).join(', ') || 'none'}`,
    properties: { ...status, updated_at: new Date().toISOString() },
    is_active: true,
    confidence: 1.0,
  }, { onConflict: 'brand_id,name', ignoreDuplicates: false })
}

export async function upsertInstruction(brandId: string, agentId: string, text: string): Promise<void> {
  const admin = createServiceClient()
  await admin.from('knowledge_nodes').upsert({
    brand_id: brandId,
    node_type: 'instruction',
    name: `instruction:${agentId}`,
    summary: text.slice(0, 200),
    properties: { text, target_agent: agentId, acknowledged: false },
    is_active: true,
    confidence: 1.0,
  }, { onConflict: 'brand_id,name', ignoreDuplicates: false })
}

export async function upsertAgentSetup(brandId: string, agentId: string, state: AgentSetupState): Promise<void> {
  const admin = createServiceClient()
  await admin.from('knowledge_nodes').upsert({
    brand_id: brandId,
    node_type: 'agent_setup',
    name: `agent_setup:${agentId}`,
    summary: `${agentId}: ${state.state} (${state.requirements_met.length} met, ${state.requirements_pending.length} pending)`,
    properties: state,
    is_active: true,
    confidence: 1.0,
  }, { onConflict: 'brand_id,name', ignoreDuplicates: false })
}

export async function upsertBrandData(brandId: string, dataType: string, data: Record<string, unknown>, source: 'manual' | 'upload' | 'chat' = 'manual'): Promise<void> {
  const admin = createServiceClient()
  await admin.from('knowledge_nodes').upsert({
    brand_id: brandId,
    node_type: 'brand_data',
    name: `brand_data:${dataType}`,
    summary: `${dataType} (${source})`,
    properties: { source, data_type: dataType, data },
    is_active: true,
    confidence: 1.0,
  }, { onConflict: 'brand_id,name', ignoreDuplicates: false })
}

export async function createMiaDecision(brandId: string, decision: MiaDecision): Promise<string> {
  const admin = createServiceClient()
  const { data } = await admin.from('knowledge_nodes').insert({
    brand_id: brandId,
    node_type: 'mia_decision',
    name: `mia_decision:${Date.now()}`,
    summary: `${decision.decision}: ${decision.reasoning.slice(0, 200)}`,
    properties: decision,
    is_active: true,
    confidence: 1.0,
  }).select('id').single()
  return data?.id ?? ''
}

// ---------------------------------------------------------------------------
// Platform status sync — call after OAuth callbacks and during daily cron
// ---------------------------------------------------------------------------

export async function syncPlatformStatus(brandId: string): Promise<PlatformStatus> {
  const admin = createServiceClient()
  const { data: creds } = await admin
    .from('credentials')
    .select('platform')
    .eq('brand_id', brandId)

  const platforms = new Set((creds ?? []).map(c => c.platform))
  const status: PlatformStatus = {
    shopify: platforms.has('shopify'),
    meta: platforms.has('meta'),
    ga4: platforms.has('google'),
    gsc: platforms.has('google'),
    klaviyo: platforms.has('klaviyo'),
    updated_at: new Date().toISOString(),
  }
  await upsertPlatformStatus(brandId, status)
  return status
}
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/add-intelligence-node-types.sql src/lib/knowledge/intelligence.ts
git commit -m "feat: add intelligence node types and typed helpers for knowledge graph"
```

---

### Task 2: Mia Intelligence — Pre-Flight & Post-Flight Hooks

**Files:**
- Create: `src/lib/mia-intelligence.ts`
- Modify: `src/lib/skills-engine.ts`

- [ ] **Step 1: Create mia-intelligence.ts — pre-flight checks and post-flight actions**

```typescript
// src/lib/mia-intelligence.ts
//
// Pre-flight checks before skill runs and post-flight actions after.
// Queries intelligence nodes directly (indexed, not RAG).

import {
  getPlatformStatus, getInstruction, getBrandData,
  createMiaDecision, syncPlatformStatus,
  type MiaDecision, type PlatformStatus,
} from '@/lib/knowledge/intelligence'
import { createServiceClient } from '@/lib/supabase/service'

// ---------------------------------------------------------------------------
// Tool → Platform mapping
// ---------------------------------------------------------------------------

const TOOL_PLATFORM_MAP: Record<string, string> = {
  'shopify.products.list': 'shopify',
  'shopify.orders.list': 'shopify',
  'shopify.shop.get': 'shopify',
  'meta_ads.campaigns.insights': 'meta',
  'meta_ads.adsets.list': 'meta',
  'ga4.report.run': 'ga4',
  'gsc.performance': 'gsc',
  'google_ads.campaigns': 'ga4',
  'klaviyo.lists.get': 'klaviyo',
  'klaviyo.flows.get': 'klaviyo',
}

// ---------------------------------------------------------------------------
// Pre-flight check
// ---------------------------------------------------------------------------

export interface PreFlightResult {
  canRun: boolean
  blocked: boolean
  missingPlatforms: string[]
  instruction: string | null
  supplementaryData: Record<string, unknown>
  dataGapsNote: string | null
}

export async function preFlightCheck(
  brandId: string,
  agentId: string,
  mcpTools: string[],
): Promise<PreFlightResult> {
  // 1. Check platform status
  let platformStatus = await getPlatformStatus(brandId)
  if (!platformStatus) {
    platformStatus = await syncPlatformStatus(brandId)
  }

  const requiredPlatforms = new Set<string>()
  for (const tool of mcpTools) {
    const platform = TOOL_PLATFORM_MAP[tool]
    if (platform) requiredPlatforms.add(platform)
  }

  const missingPlatforms: string[] = []
  for (const platform of requiredPlatforms) {
    const key = platform as keyof PlatformStatus
    if (key !== 'updated_at' && !platformStatus[key]) {
      missingPlatforms.push(platform)
    }
  }

  // 2. Check for manual data fallbacks
  const supplementaryData: Record<string, unknown> = {}
  for (const platform of missingPlatforms) {
    const manualData = await getBrandData(brandId, platform)
    if (manualData) {
      supplementaryData[platform] = manualData.data
    }
  }

  // Determine if truly blocked (required platforms missing AND no manual fallback)
  const requiredMcpTools = mcpTools.filter(t => TOOL_PLATFORM_MAP[t])
  const allRequired = requiredMcpTools.length > 0
  const hasAnyData = Object.keys(supplementaryData).length > 0
  const blocked = allRequired && missingPlatforms.length === requiredPlatforms.size && !hasAnyData

  // 3. Check user instruction
  const instruction = await getInstruction(brandId, agentId)

  // 4. Build data gaps note
  let dataGapsNote: string | null = null
  if (missingPlatforms.length > 0) {
    const gaps = missingPlatforms.filter(p => !supplementaryData[p])
    if (gaps.length > 0) {
      dataGapsNote = `Missing platform data: ${gaps.join(', ')}. Results may be incomplete. Connect these platforms in Settings > Platforms.`
    }
  }

  return {
    canRun: !blocked,
    blocked,
    missingPlatforms,
    instruction: instruction?.text ?? null,
    supplementaryData,
    dataGapsNote,
  }
}

// ---------------------------------------------------------------------------
// Post-flight decision
// ---------------------------------------------------------------------------

export interface PostFlightInput {
  brandId: string
  agentId: string
  skillId: string
  skillRunId: string
  output: Record<string, unknown>
  chainsTo: string[]
  dataGapsNote: string | null
}

export async function postFlightDecision(input: PostFlightInput): Promise<MiaDecision> {
  const { brandId, agentId, skillId, skillRunId, output, chainsTo, dataGapsNote } = input

  // Rule-based decision (no LLM needed for simple cases)
  const categories = output.categories as Record<string, { score: number | null; status: string }> | undefined
  const criticalFindings = (output.critical_findings as unknown[]) ?? []

  let decision: MiaDecision['decision'] = 'skip'
  let reasoning = 'All categories healthy. No follow-up needed.'
  const followUpSkills: string[] = []
  const pendingChain: string[] = []

  if (categories) {
    const scored = Object.entries(categories).filter(([, v]) => v.score !== null)
    const critical = scored.filter(([, v]) => (v.score ?? 100) < 40)
    const warning = scored.filter(([, v]) => (v.score ?? 100) >= 40 && (v.score ?? 100) < 60)

    if (critical.length > 0) {
      decision = 'auto_run'
      reasoning = `Critical scores in: ${critical.map(([k]) => k).join(', ')}. Auto-dispatching fixes.`
      // Map critical categories to fix skills from critical_findings
      for (const f of criticalFindings as Array<{ fix_skill?: string }>) {
        if (f.fix_skill && chainsTo.includes(f.fix_skill)) {
          followUpSkills.push(f.fix_skill)
          pendingChain.push(f.fix_skill)
        }
      }
    } else if (warning.length > 0) {
      decision = 'needs_review'
      reasoning = `Warning scores in: ${warning.map(([k]) => k).join(', ')}. Awaiting user review.`
    }
  }

  if (dataGapsNote) {
    reasoning += ` Note: ${dataGapsNote}`
  }

  const miaDecision: MiaDecision = {
    decision,
    reasoning,
    follow_up_skills: followUpSkills,
    pending_chain: pendingChain,
    skill_run_id: skillRunId,
    target_agent: agentId,
  }

  // Store as knowledge node
  await createMiaDecision(brandId, miaDecision)

  // Create notification
  const admin = createServiceClient()
  await admin.from('notifications').insert({
    brand_id: brandId,
    type: decision === 'blocked' ? 'alert' : decision === 'needs_review' ? 'needs_review' : 'activity',
    agent_id: agentId,
    skill_id: skillId,
    title: decision === 'blocked'
      ? `${agentId} blocked — missing data`
      : decision === 'auto_run'
        ? `Mia dispatching follow-ups for ${skillId}`
        : decision === 'needs_review'
          ? `${skillId} needs your review`
          : `${skillId} completed — all healthy`,
    body: reasoning,
    is_read: false,
  })

  return miaDecision
}

// ---------------------------------------------------------------------------
// Create blocked decision (when pre-flight fails)
// ---------------------------------------------------------------------------

export async function createBlockedDecision(
  brandId: string,
  agentId: string,
  skillId: string,
  missingPlatforms: string[],
): Promise<void> {
  const reasoning = `Cannot run ${skillId}: missing platform connections (${missingPlatforms.join(', ')}). Connect them in Settings > Platforms or provide data manually on the agent page.`

  await createMiaDecision(brandId, {
    decision: 'blocked',
    reasoning,
    follow_up_skills: [],
    pending_chain: [],
    blocked_reason: `Missing: ${missingPlatforms.join(', ')}`,
    target_agent: agentId,
  })

  const admin = createServiceClient()
  await admin.from('notifications').insert({
    brand_id: brandId,
    type: 'alert',
    agent_id: agentId,
    skill_id: skillId,
    title: `${skillId} blocked — connect ${missingPlatforms.join(', ')}`,
    body: reasoning,
    is_read: false,
  })
}
```

- [ ] **Step 2: Integrate pre-flight and post-flight into skills-engine.ts**

In `src/lib/skills-engine.ts`, add hooks around the existing `runSkill` function. Find the section after "5. Fetch live platform data" and before "6. Build prompt and call the LLM":

```typescript
// Add import at top of file:
import { preFlightCheck, postFlightDecision, createBlockedDecision } from '@/lib/mia-intelligence'

// After step 4 (route model) and before step 5 (fetch MCP data), add:

  // 4.5 Pre-flight intelligence check
  let preFlightResult: Awaited<ReturnType<typeof preFlightCheck>> | null = null
  try {
    preFlightResult = await preFlightCheck(input.brandId, skill.agent, skill.mcpTools)

    if (preFlightResult.blocked) {
      // Store blocked decision and notify user
      await createBlockedDecision(input.brandId, skill.agent, skill.id, preFlightResult.missingPlatforms)
      return {
        id: '',
        status: 'failed',
        output: {},
        creditsUsed: 0,
        modelUsed: 'none',
        durationMs: Date.now() - startTime,
        error: `Blocked: missing platform connections (${preFlightResult.missingPlatforms.join(', ')})`,
      }
    }
  } catch (err) {
    console.warn('[SkillsEngine] Pre-flight check failed (continuing):', err)
  }
```

In the `buildPrompt` function, inject instruction and supplementary data:

```typescript
// In buildPrompt, after the existing additionalContext injection, add:
  if (preFlightResult?.instruction) {
    userParts.push(`## Brand Manager Instruction\n${preFlightResult.instruction}`)
  }
  if (preFlightResult?.supplementaryData && Object.keys(preFlightResult.supplementaryData).length > 0) {
    userParts.push(`## Supplementary Brand Data (manual)\n${JSON.stringify(preFlightResult.supplementaryData, null, 2)}`)
  }
  if (preFlightResult?.dataGapsNote) {
    userParts.push(`## Data Gaps\n${preFlightResult.dataGapsNote}`)
  }
```

After the skill run completes and is stored, replace the existing mia orchestration fire-and-forget with the new post-flight:

```typescript
// Replace the existing "11. Auto-chaining via Mia orchestration engine" block with:

  // 11. Post-flight intelligence — Mia decides follow-ups
  if (status === 'completed' && runId) {
    import('@/lib/mia-intelligence')
      .then(({ postFlightDecision }) =>
        postFlightDecision({
          brandId: input.brandId,
          agentId: skill.agent,
          skillId: skill.id,
          skillRunId: runId,
          output,
          chainsTo: skill.chainsTo,
          dataGapsNote: preFlightResult?.dataGapsNote ?? null,
        }),
      )
      .catch((err) => {
        console.warn('[SkillsEngine] Post-flight decision failed (non-fatal):', err)
      })
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/mia-intelligence.ts src/lib/skills-engine.ts
git commit -m "feat: Mia intelligence layer — pre-flight checks and post-flight decisions"
```

---

### Task 3: Agent Setup System

**Files:**
- Create: `src/lib/agent-setup.ts`
- Create: `src/app/api/agents/[agentId]/setup/route.ts`
- Modify: `skills/agents.json`

- [ ] **Step 1: Add setup requirements to agents.json**

Add a `setup` field to each agent that needs specific data. Agents without `setup` (like Scout, Mia) work with whatever is available.

```json
{
  "id": "penny",
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

Add `setup` to these agents (others get no setup — they work with whatever is available):

- **penny**: `platform:shopify` (required), `data:monthly_revenue` (required), `data:cac`, `data:gross_margin`
- **max**: `platform:meta` (required), `data:monthly_ad_spend` (required)
- **luna**: `platform:klaviyo` OR `data:email_list_size` (required)
- **atlas**: `data:target_audience_notes` (required)
- **navi**: `platform:shopify` (required)
- **sage**: `data:current_cvr` (optional), `data:primary_landing_page` (required)
- **hugo**: `data:target_keywords` (optional)
- **aria**: No setup (works from Brand DNA)
- **echo**: No setup (uses env var APIs)
- **nova**: No setup (uses env var APIs)
- **scout**: No setup (works with whatever is available)
- **mia**: No setup (orchestrator)

- [ ] **Step 2: Create agent-setup.ts — requirement checker**

```typescript
// src/lib/agent-setup.ts
//
// Checks and updates agent setup state based on requirements in agents.json.

import { createServiceClient } from '@/lib/supabase/service'
import {
  getPlatformStatus, getBrandData, getAgentSetup,
  upsertAgentSetup, syncPlatformStatus,
  type AgentSetupState,
} from '@/lib/knowledge/intelligence'
import fs from 'fs'
import path from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SetupRequirement {
  key: string       // 'platform:shopify' or 'data:monthly_revenue'
  label: string
  type: 'connection' | 'number' | 'text' | 'file'
  required: boolean
  fallback?: 'manual'
}

export interface AgentSetup {
  requirements: SetupRequirement[]
  chat_prompt?: string
}

export interface RequirementStatus {
  key: string
  label: string
  type: string
  required: boolean
  met: boolean
  value?: unknown
}

// ---------------------------------------------------------------------------
// Load agent setup config from agents.json
// ---------------------------------------------------------------------------

let agentsCache: Record<string, unknown>[] | null = null

function loadAgents(): Record<string, unknown>[] {
  if (agentsCache) return agentsCache
  const raw = fs.readFileSync(path.join(process.cwd(), 'skills', 'agents.json'), 'utf-8')
  agentsCache = JSON.parse(raw)
  return agentsCache!
}

export function getAgentSetupConfig(agentId: string): AgentSetup | null {
  const agents = loadAgents()
  const agent = agents.find((a) => (a as { id: string }).id === agentId) as Record<string, unknown> | undefined
  return (agent?.setup as AgentSetup) ?? null
}

// ---------------------------------------------------------------------------
// Check requirements
// ---------------------------------------------------------------------------

export async function checkRequirements(brandId: string, agentId: string): Promise<{
  status: RequirementStatus[]
  allRequiredMet: boolean
  state: AgentSetupState['state']
}> {
  const setup = getAgentSetupConfig(agentId)
  if (!setup) {
    // No setup needed — agent is always ready
    return { status: [], allRequiredMet: true, state: 'ready' }
  }

  let platformStatus = await getPlatformStatus(brandId)
  if (!platformStatus) {
    platformStatus = await syncPlatformStatus(brandId)
  }

  const statuses: RequirementStatus[] = []

  for (const req of setup.requirements) {
    const [category, name] = req.key.split(':')
    let met = false
    let value: unknown = undefined

    if (category === 'platform') {
      const key = name as keyof typeof platformStatus
      met = !!platformStatus[key]
      value = met ? 'connected' : 'not connected'
    } else if (category === 'data') {
      const brandData = await getBrandData(brandId, name!)
      met = !!brandData
      value = brandData?.data
    }

    statuses.push({ key: req.key, label: req.label, type: req.type, required: req.required, met, value })
  }

  const allRequiredMet = statuses.filter(s => s.required).every(s => s.met)
  const anyMet = statuses.some(s => s.met)
  const state: AgentSetupState['state'] = allRequiredMet ? 'ready' : anyMet ? 'collecting' : 'inactive'

  // Persist state
  await upsertAgentSetup(brandId, agentId, {
    state,
    requirements_met: statuses.filter(s => s.met).map(s => s.key),
    requirements_pending: statuses.filter(s => !s.met).map(s => s.key),
  })

  return { status: statuses, allRequiredMet, state }
}
```

- [ ] **Step 3: Create setup API route**

```typescript
// src/app/api/agents/[agentId]/setup/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRequirements, getAgentSetupConfig } from '@/lib/agent-setup'
import { upsertBrandData } from '@/lib/knowledge/intelligence'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { agentId } = await params
  const brandId = request.nextUrl.searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  const setup = getAgentSetupConfig(agentId)
  const result = await checkRequirements(brandId, agentId)

  return NextResponse.json({
    agentId,
    hasSetup: !!setup,
    chatPrompt: setup?.chat_prompt ?? null,
    ...result,
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { agentId } = await params
  let body: { brandId: string; data: Record<string, { key: string; value: unknown }[]> }
  try {
    body = await request.json() as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { brandId, data: entries } = body
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  // Verify brand access
  const admin = createServiceClient()
  const { data: brand } = await admin.from('brands').select('id, owner_id').eq('id', brandId).single()
  if (!brand || brand.owner_id !== user.id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Save each data entry as a brand_data knowledge node
  for (const entry of (entries as unknown as Array<{ key: string; value: unknown }>) ?? []) {
    const [, dataType] = entry.key.split(':')
    if (dataType) {
      await upsertBrandData(brandId, dataType, { value: entry.value }, 'manual')
    }
  }

  // Re-check requirements
  const result = await checkRequirements(brandId, agentId)

  return NextResponse.json({ success: true, ...result })
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent-setup.ts src/app/api/agents/[agentId]/setup/route.ts skills/agents.json
git commit -m "feat: agent setup system — requirements checking, manual data collection"
```

---

### Task 4: Instruction API

**Files:**
- Create: `src/app/api/agents/[agentId]/instruct/route.ts`
- Modify: `src/components/agents/mia-control.tsx`

- [ ] **Step 1: Create instruct API route**

```typescript
// src/app/api/agents/[agentId]/instruct/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { upsertInstruction, getInstruction } from '@/lib/knowledge/intelligence'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { agentId } = await params
  const brandId = request.nextUrl.searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  const instruction = await getInstruction(brandId, agentId)
  return NextResponse.json({ instruction })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { agentId } = await params
  let body: { brandId: string; instruction: string }
  try {
    body = await request.json() as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { brandId, instruction } = body
  if (!brandId || !instruction?.trim()) {
    return NextResponse.json({ error: 'brandId and instruction required' }, { status: 400 })
  }

  // Verify brand access
  const admin = createServiceClient()
  const { data: brand } = await admin.from('brands').select('id, owner_id').eq('id', brandId).single()
  if (!brand || brand.owner_id !== user.id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  await upsertInstruction(brandId, agentId, instruction.trim())

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Update mia-control.tsx to use real API**

Replace the fake `handleSend` in `src/components/agents/mia-control.tsx`:

```typescript
// Replace the entire MiaControl component with:

'use client'

import { useState, useEffect } from 'react'
import { Send, Sparkles, CheckCircle2 } from 'lucide-react'
import { AgentAvatar } from '@/components/agents/agent-avatar'

interface MiaControlProps {
  agentId: string
  agentName: string
  brandId: string
}

export function MiaControl({ agentId, agentName, brandId }: MiaControlProps) {
  const [instruction, setInstruction] = useState('')
  const [currentInstruction, setCurrentInstruction] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [saved, setSaved] = useState(false)

  // Fetch current instruction
  useEffect(() => {
    if (!brandId) return
    fetch(`/api/agents/${agentId}/instruct?brandId=${brandId}`)
      .then(r => r.json())
      .then(data => {
        if (data.instruction?.text) {
          setCurrentInstruction(data.instruction.text)
        }
      })
      .catch(() => {})
  }, [agentId, brandId])

  async function handleSend() {
    if (!instruction.trim() || isSending || !brandId) return
    setIsSending(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/instruct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, instruction: instruction.trim() }),
      })
      if (res.ok) {
        setCurrentInstruction(instruction.trim())
        setInstruction('')
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="glass-panel rounded-2xl p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <AgentAvatar agentId="mia" size="sm" />
        <div>
          <p className="font-heading font-semibold text-sm text-foreground">Mia&apos;s Instructions</p>
          <p className="text-[10px] text-muted-foreground">Tell Mia how to manage {agentName}</p>
        </div>
      </div>

      {/* Current instruction */}
      {currentInstruction && (
        <div className="rounded-xl bg-[#6366f1]/10 border border-[#6366f1]/20 px-3 py-2.5 mb-3">
          <p className="text-[10px] text-[#6366f1] uppercase tracking-wider mb-1">Active Instruction</p>
          <p className="text-xs text-foreground/80">{currentInstruction}</p>
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
          placeholder={`e.g. "Focus on product pages first"`}
          className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-[#6366f1]/40 focus:outline-none"
        />
        <button
          onClick={handleSend}
          disabled={!instruction.trim() || isSending}
          className="rounded-lg bg-[#6366f1] px-3 py-2 text-white disabled:opacity-40 hover:bg-[#6366f1]/80 transition-colors"
        >
          {saved ? <CheckCircle2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/agents/[agentId]/instruct/route.ts src/components/agents/mia-control.tsx
git commit -m "feat: real instruction system — Mia reads user instructions before skill runs"
```

---

### Task 5: Chain Processor Cron

**Files:**
- Create: `src/app/api/cron/chain-processor/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Create chain-processor cron route**

```typescript
// src/app/api/cron/chain-processor/route.ts

export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runSkill } from '@/lib/skills-engine'

export async function GET(): Promise<NextResponse> {
  const admin = createServiceClient()

  // Find mia_decision nodes with non-empty pending_chain
  const { data: decisions } = await admin
    .from('knowledge_nodes')
    .select('id, brand_id, properties')
    .eq('node_type', 'mia_decision')
    .eq('is_active', true)
    .not('properties->pending_chain', 'eq', '[]')
    .order('created_at', { ascending: true })
    .limit(5) // Max 5 chains per cron run

  if (!decisions || decisions.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  let processed = 0

  for (const node of decisions) {
    const props = node.properties as { pending_chain?: string[]; target_agent?: string }
    const chain = props.pending_chain ?? []
    if (chain.length === 0) continue

    const nextSkill = chain[0]!
    const remainingChain = chain.slice(1)

    try {
      // Run the next skill in the chain
      await runSkill({
        brandId: node.brand_id,
        skillId: nextSkill,
        triggeredBy: 'mia',
        additionalContext: { source: 'chain_processor', parent_decision: node.id },
        chainDepth: 1,
      })

      // Update the decision node — remove processed skill from chain
      await admin
        .from('knowledge_nodes')
        .update({
          properties: { ...props, pending_chain: remainingChain },
          updated_at: new Date().toISOString(),
        })
        .eq('id', node.id)

      processed++
    } catch (err) {
      console.error(`[chain-processor] Failed to run ${nextSkill} for brand ${node.brand_id}:`, err)
      // Mark chain as failed by clearing it
      await admin
        .from('knowledge_nodes')
        .update({
          properties: { ...props, pending_chain: [], blocked_reason: `Chain failed at ${nextSkill}: ${err}` },
          updated_at: new Date().toISOString(),
        })
        .eq('id', node.id)
    }
  }

  return NextResponse.json({ processed })
}
```

- [ ] **Step 2: Add to vercel.json**

```json
{
  "crons": [
    { "path": "/api/cron/daily", "schedule": "0 6 * * *" },
    { "path": "/api/cron/weekly", "schedule": "0 8 * * 1" },
    { "path": "/api/cron/agency-patterns", "schedule": "0 2 * * 0" },
    { "path": "/api/cron/backfill-embeddings", "schedule": "0 3 * * *" },
    { "path": "/api/cron/chain-processor", "schedule": "0 4 * * *" }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/chain-processor/route.ts vercel.json
git commit -m "feat: chain processor cron — executes pending skill chains from Mia decisions"
```

---

### Task 6: Dashboard Context API

**Files:**
- Create: `src/app/api/dashboard/context/route.ts`

- [ ] **Step 1: Create unified dashboard context endpoint**

```typescript
// src/app/api/dashboard/context/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  getRecentMiaDecisions, getPlatformStatus,
  getAllAgentSetups, getAllInstructions,
} from '@/lib/knowledge/intelligence'

// 30-second in-memory cache per brand
const cache = new Map<string, { data: unknown; ts: number }>()
const CACHE_TTL = 30_000

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const brandId = request.nextUrl.searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  // Check cache
  const cached = cache.get(brandId)
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data)
  }

  const admin = createServiceClient()

  // Run all queries in parallel
  const [
    skillRunsResult,
    miaDecisions,
    platformStatus,
    agentSetups,
    instructions,
    notificationsResult,
    walletResult,
  ] = await Promise.all([
    admin.from('skill_runs')
      .select('id, agent_id, skill_id, status, model_used, credits_used, duration_ms, output, error_message, created_at')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false })
      .limit(20),
    getRecentMiaDecisions(brandId, 20),
    getPlatformStatus(brandId),
    getAllAgentSetups(brandId),
    getAllInstructions(brandId),
    admin.from('notifications')
      .select('id, type, agent_id, skill_id, title, body, is_read, created_at')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false })
      .limit(10),
    admin.from('wallets')
      .select('balance, free_credits, free_credits_expires_at')
      .eq('brand_id', brandId)
      .single(),
  ])

  const context = {
    skillRuns: skillRunsResult.data ?? [],
    miaDecisions,
    platformStatus,
    agentSetups,
    instructions,
    notifications: notificationsResult.data ?? [],
    wallet: walletResult.data ?? null,
  }

  // Cache
  cache.set(brandId, { data: context, ts: Date.now() })

  return NextResponse.json(context)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/dashboard/context/route.ts
git commit -m "feat: unified dashboard context API — parallel queries with 30s cache"
```

---

### Task 7: Dashboard UX — Activity Feed, Agent Status Bar, Blocked Items

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/components/dashboard/morning-brief.tsx`
- Modify: `src/components/dashboard/internal-log.tsx`

This is the largest UI task. The dashboard page needs to:
1. Fetch from `/api/dashboard/context` instead of direct Supabase queries
2. Show agent status bar (12 agents with color-coded state)
3. Replace Internal Log with Activity Feed (mia_decision nodes with reasoning)
4. Show blocked items panel with action links
5. Generate morning brief from actual Mia decisions

- [ ] **Step 1: Update dashboard page.tsx to use context API**

This is a significant rewrite of the dashboard. The page currently is a server component doing direct Supabase queries. Convert the data-fetching portion to use the new context API. Keep the server component structure but delegate to client components that fetch from the context endpoint.

Key changes:
- Import and render a new `DashboardClient` component that handles data fetching
- Pass `brandId` from the server component
- `DashboardClient` calls `/api/dashboard/context` and distributes data to child components

- [ ] **Step 2: Update internal-log.tsx to show Mia decisions**

Update the `LogEntry` interface and rendering to include Mia decision context:

```typescript
export interface LogEntry {
  agent: string
  message: string
  timestamp: string
  decision?: string        // 'auto_run' | 'blocked' | 'needs_review' | 'skip'
  reasoning?: string
  actionUrl?: string       // Link to fix blocked items
  actionLabel?: string
}
```

Render decisions with color coding:
- `auto_run`: green accent, shows "Dispatching {skills}"
- `blocked`: red accent, shows "Connect {platform}" link
- `needs_review`: yellow accent, shows "Review" link
- `skip`: grey, shows "All healthy"

- [ ] **Step 3: Update morning-brief.tsx to use Mia decisions for narrative**

Generate the narrative from actual `mia_decision` data:
- Count active/blocked/reviewing agents from `agentSetups`
- Summarize latest critical findings from decisions
- Show blocked items count with direct fix prompt

- [ ] **Step 4: Add agent status bar component**

Create a horizontal row of 12 agent avatars with color-coded status:
- Green dot: `agent_setup.state === 'ready'` or no setup required
- Yellow dot: `agent_setup.state === 'collecting'`
- Red dot: latest `mia_decision` for this agent has `decision === 'blocked'`
- Grey dot: `agent_setup.state === 'inactive'` or no setup node

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/page.tsx src/components/dashboard/morning-brief.tsx src/components/dashboard/internal-log.tsx
git commit -m "feat: dashboard UX — activity feed, agent status bar, blocked items panel"
```

---

### Task 8: Agent Detail Page — Three-State UI

**Files:**
- Modify: `src/app/dashboard/agents/[agentId]/page.tsx`

- [ ] **Step 1: Add setup state detection and routing**

The agent detail page renders one of three views based on setup state:

1. **Inactive**: No `agent_setup` node or `state === 'inactive'`. Shows "Activate" button, description, skill list (read-only).
2. **Setting Up**: `state === 'collecting'`. Shows setup checklist with forms, "Chat with {agent}" link, progress bar.
3. **Active**: `state === 'ready'` or agent has no setup requirements. Shows Mia's latest decision, instruction input, skill run buttons, recent runs.

Fetch setup state from `GET /api/agents/{agentId}/setup?brandId=X`.

- [ ] **Step 2: Build setup checklist view**

For the "Setting Up" state, render each requirement:
- `type: 'connection'`: Show platform name, connected/not badge, "Connect" link to `/dashboard/settings/platforms`
- `type: 'number'`/`type: 'text'`: Show input field with label, "Save" button
- `type: 'file'`: Show file upload area (future — for now show text input)

Form submission calls `POST /api/agents/{agentId}/setup` with the data entries.

After each save, re-fetch setup state to update progress.

- [ ] **Step 3: Build active view with Mia context**

For the "Active" state:
- Fetch latest `mia_decision` targeting this agent from `/api/dashboard/context`
- Show "Mia's Latest" card with decision reasoning
- Show real instruction input (MiaControl component, already fixed in Task 4)
- Show skill cards with "Run Now" buttons
- After running a skill, poll for completion and show result inline

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/agents/[agentId]/page.tsx
git commit -m "feat: three-state agent detail page — inactive, setup, active with Mia context"
```

---

### Task 9: Knowledge Graph Retention

**Files:**
- Create: `src/lib/knowledge/retention.ts`
- Modify: `src/app/api/cron/daily/route.ts`

- [ ] **Step 1: Create retention.ts — digest old decisions, enforce caps**

```typescript
// src/lib/knowledge/retention.ts
//
// Enforces knowledge node retention rules:
// - mia_decision: max 50 per brand, summarize oldest 25 into digest
// - platform_status: sync from credentials table

import { createServiceClient } from '@/lib/supabase/service'
import { callModel } from '@/lib/model-client'
import { syncPlatformStatus } from '@/lib/knowledge/intelligence'

export async function enforceRetention(brandId: string): Promise<{ digestCreated: boolean; nodesDeleted: number }> {
  const admin = createServiceClient()

  // Count mia_decision nodes
  const { count } = await admin
    .from('knowledge_nodes')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brandId)
    .eq('node_type', 'mia_decision')
    .eq('is_active', true)

  if (!count || count < 50) {
    return { digestCreated: false, nodesDeleted: 0 }
  }

  // Get oldest 25
  const { data: oldest } = await admin
    .from('knowledge_nodes')
    .select('id, properties, created_at')
    .eq('brand_id', brandId)
    .eq('node_type', 'mia_decision')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(25)

  if (!oldest || oldest.length === 0) {
    return { digestCreated: false, nodesDeleted: 0 }
  }

  // Summarize into digest using Gemini Flash
  const decisions = oldest.map(n => n.properties)
  const month = new Date(oldest[0]!.created_at).toISOString().slice(0, 7) // YYYY-MM

  const summaryResult = await callModel({
    model: 'gemini-2.5-flash',
    provider: 'google',
    systemPrompt: 'Summarize these Mia AI marketing manager decisions into a concise monthly digest. Include: total decisions, auto-runs, blocks, top actions taken, and key patterns.',
    userPrompt: JSON.stringify(decisions),
    maxTokens: 512,
  })

  // Create digest node
  await admin.from('knowledge_nodes').insert({
    brand_id: brandId,
    node_type: 'mia_digest',
    name: `mia_digest:${month}`,
    summary: summaryResult.content.slice(0, 500),
    properties: {
      month,
      total_decisions: oldest.length,
      auto_runs: decisions.filter((d: Record<string, unknown>) => d.decision === 'auto_run').length,
      blocks: decisions.filter((d: Record<string, unknown>) => d.decision === 'blocked').length,
      summary: summaryResult.content,
    },
    is_active: true,
    confidence: 1.0,
  })

  // Delete old nodes
  const idsToDelete = oldest.map(n => n.id)
  await admin
    .from('knowledge_nodes')
    .update({ is_active: false })
    .in('id', idsToDelete)

  return { digestCreated: true, nodesDeleted: idsToDelete.length }
}

export async function runDailyRetention(): Promise<void> {
  const admin = createServiceClient()

  // Get all active brands
  const { data: brands } = await admin.from('brands').select('id').limit(100)

  for (const brand of brands ?? []) {
    try {
      // Sync platform status from credentials
      await syncPlatformStatus(brand.id)

      // Enforce mia_decision retention
      await enforceRetention(brand.id)
    } catch (err) {
      console.error(`[retention] Failed for brand ${brand.id}:`, err)
    }
  }
}
```

- [ ] **Step 2: Add retention to daily cron**

In `src/app/api/cron/daily/route.ts`, add at the end of the handler:

```typescript
// Import at top:
import { runDailyRetention } from '@/lib/knowledge/retention'

// Add at end of GET handler, before the return:
try {
  await runDailyRetention()
} catch (err) {
  console.error('[daily cron] retention failed:', err)
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/knowledge/retention.ts src/app/api/cron/daily/route.ts
git commit -m "feat: knowledge graph retention — monthly digests, platform status sync"
```

---

### Task 10: Platform Status Sync on OAuth Callbacks

**Files:**
- Modify: `src/app/api/platforms/meta/callback/route.ts`
- Modify: `src/app/api/platforms/shopify/callback/route.ts`
- Modify: `src/app/api/platforms/google/callback/route.ts`
- Modify: `src/app/api/platforms/klaviyo/connect/route.ts`

- [ ] **Step 1: Add syncPlatformStatus call after each OAuth callback stores credentials**

In each platform callback/connect route, after successfully storing credentials, add:

```typescript
// Import at top:
import { syncPlatformStatus } from '@/lib/knowledge/intelligence'

// After credentials are stored successfully:
await syncPlatformStatus(brandId).catch(err =>
  console.warn('[callback] Platform status sync failed:', err)
)
```

Add this to:
- `src/app/api/platforms/meta/callback/route.ts` — after the upsert at line ~160
- `src/app/api/platforms/shopify/callback/route.ts` — after credential storage
- `src/app/api/platforms/google/callback/route.ts` — after credential storage
- `src/app/api/platforms/klaviyo/connect/route.ts` — after credential storage

- [ ] **Step 2: Commit**

```bash
git add src/app/api/platforms/
git commit -m "feat: sync platform_status knowledge node after OAuth callbacks"
```

---

## Phase Summary

| Task | What it builds | Files | Depends on |
|------|---------------|-------|-----------|
| 1 | Intelligence node types + helpers | 2 new | — |
| 2 | Mia pre-flight/post-flight hooks | 1 new, 1 modified | Task 1 |
| 3 | Agent setup system | 2 new, 1 modified | Task 1 |
| 4 | Real instruction system | 1 new, 1 modified | Task 1 |
| 5 | Chain processor cron | 1 new, 1 modified | Task 2 |
| 6 | Dashboard context API | 1 new | Task 1 |
| 7 | Dashboard UX overhaul | 3 modified | Task 6 |
| 8 | Agent detail page 3-state UI | 1 modified | Tasks 3, 4 |
| 9 | Retention system | 1 new, 1 modified | Task 1 |
| 10 | Platform status sync | 4 modified | Task 1 |

**Recommended execution order:** 1 → 2 → 3 → 4 → 5 → 6 → 9 → 10 → 7 → 8

Tasks 7 and 8 (UI) come last because they depend on all the backend pieces being in place.

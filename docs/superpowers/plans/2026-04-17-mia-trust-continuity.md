# Mia Trust & Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Mia chat trustworthy and continuous — aware of connected platforms, surviving window shifts, seeing her team's recent output (including blocked/failed runs), and remembering durable facts across sessions.

**Architecture:** Four additive changes. Three live in `src/app/api/mia/chat/route.ts` (platform status, recency-aware digest, memory retrieval). One lives in `src/app/dashboard/chat/page.tsx` (localStorage persistence). Memory extraction runs async after each assistant turn, writing `mia_memory` nodes into `knowledge_nodes`. A minimal settings panel at `/dashboard/settings/mia-memory` lets users view and delete remembered facts. No breaking changes.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (pg + JSONB), existing `callModel` / `createServiceClient` helpers, Haiku 4.5 for memory extraction. No new dependencies.

**Spec reference:** `docs/superpowers/specs/2026-04-17-mia-trust-continuity-design.md`.

**Note on verification:** No test runner in this repo — `npm run build`, `npm run lint`, one-off tsx scripts for logic checks, and manual browser verification.

---

## File Map

**New files:**
- `supabase/migrations/010-mia-memory-node-type.sql` — add `'mia_memory'` to `valid_node_type` CHECK.
- `src/lib/mia-memory.ts` — `extractMemories()`, `getRelevantMemories()`, `listMemories()`, `deleteMemory()`.
- `src/app/api/mia/memory/route.ts` — `GET` (list) + `DELETE` (by node id).
- `src/app/dashboard/settings/mia-memory/page.tsx` — settings panel UI.
- `scripts/verify-mia-memory-extractor.ts` — offline check of extractor round-trip against a fixture turn.

**Modified files:**
- `src/app/api/mia/chat/route.ts` — platform status fetch, 30-day recency + digest, memory retrieval, memory-extraction kickoff after SSE `done`.
- `src/app/dashboard/chat/page.tsx` — persist `activeConversationId` to `localStorage`, restore on mount.
- `src/app/dashboard/settings/layout.tsx` — add `Mia Memory` nav entry.

---

## Task 1: Platform awareness in Mia's prompt

**Files:**
- Modify: `src/app/api/mia/chat/route.ts`

- [ ] **Step 1: Add platform-status fetch after the brand-access block**

In `POST /api/mia/chat`, after step 6 ("Store user message"), add:

```ts
// 6b. Platform connection status (source of truth for "is Meta connected?")
const { getPlatformStatus, syncPlatformStatus } = await import('@/lib/mia-intelligence')
let platformStatus = await getPlatformStatus(brandId)
if (!platformStatus) {
  try { platformStatus = await syncPlatformStatus(brandId) } catch { platformStatus = null }
}

const connectedPlatformsBlock = platformStatus
  ? [
      `Meta Ads: ${platformStatus.meta ? 'connected' : 'not connected'}`,
      `Shopify: ${platformStatus.shopify ? 'connected' : 'not connected'}`,
      `GA4: ${platformStatus.ga4 ? 'connected' : 'not connected'}`,
      `GSC: ${platformStatus.gsc ? 'connected' : 'not connected'}`,
      `Klaviyo: ${platformStatus.klaviyo ? 'connected' : 'not connected'}`,
    ].join('\n')
  : 'Platform status unknown — verify in Settings → Platforms.'
```

- [ ] **Step 2: Extend the system prompt template**

Replace the `Recent activity:` block in `MIA_CHAT_SYSTEM_PROMPT` with:

```ts
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

## Connected platforms (source of truth — trust these over conversation history)

{connectedPlatforms}

Rules when a platform is CONNECTED:
- Never ask the user to paste numbers, CSVs, or screenshots from that platform.
- To answer questions about it, dispatch the owning agent's skill. It has direct read access.
- If the user doubts the connection, say "Meta is connected — let me pull it now" and trigger the skill.

Rules when a platform is NOT CONNECTED:
- Offer the integration page as the default path: "Connect Meta in Settings → Platforms."
- Manual data entry is allowed only as an explicit second option.

## Recent activity (last 24h — status only)

{recentSkillRunsSummary}

{skillsCatalog}

Keep responses concise but insightful. You're a busy marketing manager, not a verbose chatbot.
When you include an actions block, still write a natural message explaining what you're about to do and why.`
```

- [ ] **Step 3: Update `buildSystemPrompt` to accept the platform block**

```ts
function buildSystemPrompt(
  brandName: string,
  domain: string,
  focusAreas: string,
  plan: string,
  connectedPlatforms: string,
  recentSkillRunsSummary: string,
  skillsCatalog: string,
): string {
  return MIA_CHAT_SYSTEM_PROMPT
    .replace(/{brandName}/g, brandName)
    .replace(/{domain}/g, domain)
    .replace(/{focusAreas}/g, focusAreas)
    .replace(/{plan}/g, plan)
    .replace(/{connectedPlatforms}/g, connectedPlatforms)
    .replace(/{recentSkillRunsSummary}/g, recentSkillRunsSummary)
    .replace(/{skillsCatalog}/g, skillsCatalog)
}
```

And update the single call site in step 8 to pass `connectedPlatformsBlock` as the new argument, in the correct position.

- [ ] **Step 4: Verify build + lint**

```bash
npm run build
npm run lint -- src/app/api/mia/chat/route.ts
```
Expected: both pass with no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/mia/chat/route.ts
git commit -m "feat(mia): inject platform connection status into chat prompt

Mia can now see which platforms are actually connected and is
instructed never to ask users to paste data from connected ones."
```

---

## Task 2: Chat persistence across window shifts

**Files:**
- Modify: `src/app/dashboard/chat/page.tsx`

- [ ] **Step 1: Add helper for the storage key**

Near the top of the file (after imports, before the component):

```ts
function storageKeyForActiveConv(brandId: string): string {
  return `mia_active_conversation_${brandId}`
}
```

- [ ] **Step 2: Persist on `loadConversation`**

Replace `loadConversation` (~line 111) with:

```ts
const loadConversation = useCallback(
  async (conversationId: string) => {
    setIsLoadingHistory(true)
    setActiveConversationId(conversationId)
    setMessages([])

    if (brandId) {
      try { localStorage.setItem(storageKeyForActiveConv(brandId), conversationId) } catch { /* quota or privacy mode */ }
    }

    const { data: msgs } = await supabase
      .from('conversation_messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(100)

    if (msgs) {
      setMessages(
        (msgs as Array<{ id: string; role: string; content: string; created_at: string }>).map(
          (m) => ({
            id: m.id,
            role: m.role === 'assistant' ? 'mia' : 'user',
            content: m.content,
            timestamp: new Date(m.created_at),
          }),
        ),
      )
    }
    setIsLoadingHistory(false)
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [brandId],
)
```

- [ ] **Step 3: Clear on `startNewConversation`**

Replace `startNewConversation` (~line 143):

```ts
const startNewConversation = useCallback(() => {
  setActiveConversationId(null)
  setMessages([])
  if (brandId) {
    try { localStorage.removeItem(storageKeyForActiveConv(brandId)) } catch { /* noop */ }
  }
}, [brandId])
```

- [ ] **Step 4: Persist when the chat route tells us the server-created id (first message in a new conversation)**

Find the SSE consumer block (search for `event.type === 'start' && event.conversationId`) and insert one line right after `setActiveConversationId(newConvId)`:

```ts
if (brandId) {
  try { localStorage.setItem(storageKeyForActiveConv(brandId), newConvId) } catch { /* noop */ }
}
```

- [ ] **Step 5: Restore on mount**

Add a new `useEffect` after the existing init effect (~line 108), gated on `brandId`:

```ts
// Restore last active conversation after brandId resolves
useEffect(() => {
  if (!brandId) return
  let stored: string | null = null
  try { stored = localStorage.getItem(storageKeyForActiveConv(brandId)) } catch { /* noop */ }
  if (stored) {
    loadConversation(stored).catch(() => {
      // If load fails (conversation deleted server-side), drop the stale key
      try { localStorage.removeItem(storageKeyForActiveConv(brandId)) } catch { /* noop */ }
    })
  }
}, [brandId, loadConversation])
```

- [ ] **Step 6: Verify build + manual browser check**

```bash
npm run build
npm run dev
```

Manual steps:
1. Open `/dashboard/chat`, send a message in a fresh conversation.
2. Reload the tab.
3. Expected: same conversation is active, all messages visible.
4. Click "New chat".
5. Reload again — expected: fresh state.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/chat/page.tsx
git commit -m "feat(mia-chat): persist active conversation across window shifts

localStorage key mia_active_conversation_{brandId} stores the
current id; restored on mount so reloads keep context."
```

---

## Task 3: Agent activity digest — widen the recency window and surface output headlines

**Files:**
- Modify: `src/app/api/mia/chat/route.ts`

- [ ] **Step 1: Add a pure headline extractor helper**

Near the helpers at the top of the file (after `sseEvent`):

```ts
/** Extract a short, user-facing line from a completed skill's JSON output. */
function extractHeadline(output: unknown): string {
  if (!output || typeof output !== 'object') return ''
  const o = output as Record<string, unknown>

  // Prefer explicit fields skills commonly set
  for (const key of ['headline', 'summary', 'top_finding', 'recommendation', 'decision']) {
    const v = o[key]
    if (typeof v === 'string' && v.trim().length > 0) return v.slice(0, 200)
  }
  // Then any top-level string field
  for (const v of Object.values(o)) {
    if (typeof v === 'string' && v.trim().length > 0) return v.slice(0, 200)
  }
  // Then the first finding in a findings[] array
  if (Array.isArray(o.findings) && o.findings.length > 0) {
    const f = o.findings[0]
    if (typeof f === 'string') return f.slice(0, 200)
    if (f && typeof f === 'object') {
      const fr = f as Record<string, unknown>
      const cand = fr.title ?? fr.message ?? fr.summary
      if (typeof cand === 'string') return cand.slice(0, 200)
    }
  }
  return ''
}
```

- [ ] **Step 2: Replace the 24h summary with a 30-day digest (keeping the 24h one for short-term context)**

Inside `POST`, replace the current step 7 (`Build recent skill runs summary`) with:

```ts
// 7. Build recent skill runs summary for Mia's context (24h — status-only)
const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
const { data: recentRuns } = await admin
  .from('skill_runs')
  .select('skill_id, status, triggered_by, created_at, agent_id')
  .eq('brand_id', brandId)
  .gte('created_at', twentyFourHoursAgo)
  .order('created_at', { ascending: false })
  .limit(10)

const recentSkillRunsSummary =
  recentRuns && recentRuns.length > 0
    ? recentRuns
        .map(
          (r: Record<string, unknown>) =>
            `- ${r.skill_id} (${r.status}) by ${r.triggered_by ?? 'user'} via ${r.agent_id ?? 'unknown'} agent`,
        )
        .join('\n')
    : 'No recent skill runs in the last 24 hours.'

// 7b. 30-day agent activity digest — last completed run per skill + blocked/failed visibility
const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
const { data: runs30d } = await admin
  .from('skill_runs')
  .select('skill_id, agent_id, status, output, error_message, blocked_reason, created_at')
  .eq('brand_id', brandId)
  .gte('created_at', thirtyDaysAgoIso)
  .order('created_at', { ascending: false })
  .limit(300)

type Run30d = {
  skill_id: string
  agent_id: string | null
  status: string
  output: unknown
  error_message: string | null
  blocked_reason: string | null
  created_at: string
}

// Keep the newest row per skill_id — covers blocked/failed too so Mia can explain silence
const firstBySkill = new Map<string, Run30d>()
for (const r of (runs30d ?? []) as Run30d[]) {
  if (!firstBySkill.has(r.skill_id)) firstBySkill.set(r.skill_id, r)
}

const now = Date.now()
const agentDigest = Array.from(firstBySkill.values())
  .slice(0, 12)
  .map((r) => {
    const days = Math.max(0, Math.floor((now - new Date(r.created_at).getTime()) / (24 * 60 * 60 * 1000)))
    const ago = days === 0 ? 'today' : `${days}d ago`
    const label = `${r.agent_id ?? 'unknown'}/${r.skill_id}`
    if (r.status === 'completed') {
      const headline = extractHeadline(r.output)
      return headline ? `- ${label} (${ago}, completed) — "${headline}"` : `- ${label} (${ago}, completed)`
    }
    if (r.status === 'blocked') {
      return `- ${label} (${ago}, BLOCKED: ${r.blocked_reason ?? 'unknown reason'})`
    }
    if (r.status === 'failed') {
      return `- ${label} (${ago}, FAILED: ${r.error_message ?? 'unknown error'})`
    }
    return `- ${label} (${ago}, ${r.status})`
  })
  .join('\n')

const agentDigestBlock = agentDigest || 'No agent activity in the last 30 days.'
```

- [ ] **Step 3: Add digest + cool-down rules to the prompt template**

Replace the `{skillsCatalog}` slot in `MIA_CHAT_SYSTEM_PROMPT` with the following block (so the section order becomes: connected platforms → 24h activity → 30-day digest → cool-downs → skills catalog):

```ts
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

## Connected platforms (source of truth — trust these over conversation history)

{connectedPlatforms}

Rules when a platform is CONNECTED:
- Never ask the user to paste numbers, CSVs, or screenshots from that platform.
- To answer questions about it, dispatch the owning agent's skill. It has direct read access.
- If the user doubts the connection, say "Meta is connected — let me pull it now" and trigger the skill.

Rules when a platform is NOT CONNECTED:
- Offer the integration page as the default path: "Connect Meta in Settings → Platforms."
- Manual data entry is allowed only as an explicit second option.

## Recent activity (last 24h — status only)

{recentSkillRunsSummary}

## What your team has said recently (last 30 days)

{agentDigest}

## When to suggest a skill (trigger-based, not menu-based)

Default to leading with results, decisions, or creative output. Suggest a diagnostic/audit only when:
- The user explicitly asked for it or described a matching problem.
- A concrete signal warrants it: spend anomaly, revenue dip, new creatives live, new platform connected, competitor event, a completed brief ready to activate.
- The last run was stale AND a new decision depends on fresh data.

Re-run cool-downs (do NOT re-suggest inside these windows unless a fresh trigger above applies):
- health-check: 30 days
- anomaly-detection: 7 days
- customer-signal-analyzer: 7 days
- Any other audit / scan / scorer / analyzer: 14 days

If a diagnostic is inside its cool-down, prefer (a) surfacing results already in the digest, (b) dispatching a creative or decision skill, or (c) one specific clarifying question — never a blanket "let me run some checks". Brand owners lose trust when the same checks keep being re-run.

If the digest shows an agent is BLOCKED or FAILED, say so plainly and tell the user what to do (e.g. "Max is blocked because his Meta tool returned zero rows — check the ad account id in Settings").

{skillsCatalog}

Keep responses concise but insightful. You're a busy marketing manager, not a verbose chatbot.
When you include an actions block, still write a natural message explaining what you're about to do and why.`
```

- [ ] **Step 4: Update `buildSystemPrompt` signature + call site**

```ts
function buildSystemPrompt(
  brandName: string,
  domain: string,
  focusAreas: string,
  plan: string,
  connectedPlatforms: string,
  recentSkillRunsSummary: string,
  agentDigest: string,
  skillsCatalog: string,
): string {
  return MIA_CHAT_SYSTEM_PROMPT
    .replace(/{brandName}/g, brandName)
    .replace(/{domain}/g, domain)
    .replace(/{focusAreas}/g, focusAreas)
    .replace(/{plan}/g, plan)
    .replace(/{connectedPlatforms}/g, connectedPlatforms)
    .replace(/{recentSkillRunsSummary}/g, recentSkillRunsSummary)
    .replace(/{agentDigest}/g, agentDigest)
    .replace(/{skillsCatalog}/g, skillsCatalog)
}
```

Update the call site to pass `agentDigestBlock` between `recentSkillRunsSummary` and `skillsCatalog`.

- [ ] **Step 5: Verify build + lint**

```bash
npm run build
npm run lint -- src/app/api/mia/chat/route.ts
```
Expected: both pass.

- [ ] **Step 6: Manual prompt inspection**

Add a one-shot `console.log('[mia-chat-debug]', systemPrompt.slice(0, 3000))` right before `callModel`. Start dev server, send a chat message, confirm in the server console that:
- Connected platforms section matches actual connection state.
- 30-day digest lists at least one completed/blocked run with a headline or reason.
- Cool-down rules and trigger-based guidance are present.

Remove the `console.log` before committing.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/mia/chat/route.ts
git commit -m "feat(mia): 30-day agent digest + cool-down rules in prompt

Mia now sees the last completed output per skill (including
blocked/failed runs with reasons), plus explicit cool-down
windows so she stops re-suggesting the same diagnostics."
```

---

## Task 4: Migration — add `mia_memory` to `valid_node_type`

**Files:**
- Create: `supabase/migrations/010-mia-memory-node-type.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 010-mia-memory-node-type.sql
-- Adds 'mia_memory' to knowledge_nodes.valid_node_type so Mia can store
-- durable facts extracted from chat turns. See spec:
-- docs/superpowers/specs/2026-04-17-mia-trust-continuity-design.md

ALTER TABLE knowledge_nodes DROP CONSTRAINT IF EXISTS valid_node_type;

ALTER TABLE knowledge_nodes ADD CONSTRAINT valid_node_type CHECK (node_type IN (
  'product', 'audience', 'competitor', 'content',
  'campaign', 'metric', 'insight', 'trend',
  'keyword', 'landing_page', 'email', 'ad_creative',
  'brand_asset', 'persona', 'funnel_stage',
  'offer', 'testimonial', 'usp', 'channel', 'experiment',
  'creative', 'email_flow', 'product_image',
  'competitor_creative', 'video_asset',
  'review_theme', 'price_point',
  'brand_guidelines', 'top_content',
  'mia_decision', 'mia_digest', 'platform_status', 'instruction',
  'agent_setup', 'brand_data',
  -- Added by migration 010
  'mia_memory'
));

CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_mia_memory
  ON knowledge_nodes(brand_id, created_at DESC)
  WHERE node_type = 'mia_memory';
```

- [ ] **Step 2: Apply locally**

```bash
supabase db push
# or against a dev project
psql "$DEV_SUPABASE_URL" -f supabase/migrations/010-mia-memory-node-type.sql
```
Expected: `ALTER TABLE`, `ALTER TABLE`, `CREATE INDEX`.

- [ ] **Step 3: Verify**

```bash
psql "$DEV_SUPABASE_URL" -c "INSERT INTO knowledge_nodes (brand_id, node_type, name, properties) VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 'mia_memory', 'test', '{}'::jsonb);"
```
Expected: `ERROR: ... foreign key ...` (brand id doesn't exist) — i.e. the row failed for FK, not for the CHECK. This proves `mia_memory` is allowed.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/010-mia-memory-node-type.sql
git commit -m "feat(db): allow 'mia_memory' node_type in knowledge_nodes

Migration 010 adds mia_memory to valid_node_type CHECK so Mia
can store durable cross-session memories."
```

---

## Task 5: `src/lib/mia-memory.ts` — extractor + retrieval + list + delete

**Files:**
- Create: `src/lib/mia-memory.ts`

- [ ] **Step 1: Write the module**

```ts
// ---------------------------------------------------------------------------
// Mia Memory — durable cross-session facts stored as mia_memory nodes.
//
// - extractMemories(): called async after each assistant turn; runs cheap
//   model extractor, upserts nodes.
// - getRelevantMemories(): called synchronously when building the chat
//   prompt; returns top-N recent memories for injection.
// - listMemories(): for the settings panel.
// - deleteMemory(): for the settings panel.
// ---------------------------------------------------------------------------

import { createServiceClient } from '@/lib/supabase/service'
import { callModel } from '@/lib/model-client'

export type MemoryKind = 'preference' | 'decision' | 'context_fact' | 'avoid'

export interface MiaMemory {
  id: string
  kind: MemoryKind
  content: string
  confidence: number
  created_at: string
  source_message_id: string | null
}

interface RawMemoryNode {
  id: string
  name: string
  properties: {
    kind?: string
    content?: string
    confidence?: number
    source_message_id?: string
  } | null
  created_at: string
}

const MEMORY_MODEL = 'claude-haiku-4-5-20251001'
const MEMORY_PROVIDER = 'anthropic'
const MAX_MEMORIES_PER_BRAND = 50
const CONFIDENCE_FLOOR = 0.7

const EXTRACTOR_SYSTEM_PROMPT = `You extract durable facts a marketing AI assistant should remember about a brand across sessions.

Output JSON only, no markdown. Shape:
{ "memories": [ { "kind": "preference" | "decision" | "context_fact" | "avoid", "content": "<=200 chars", "confidence": 0.0-1.0 } ] }

Rules:
- "preference" = how the user wants to work (e.g. "prefers terse replies", "hates emojis").
- "decision" = a standing choice about the business (e.g. "Q2 focus is retention, not acquisition").
- "context_fact" = a stable fact about the brand/user (e.g. "primary product is Green Mantra").
- "avoid" = things NOT to do (e.g. "do not re-run health-check more than monthly").
- Skip ephemeral content, pleasantries, single-turn questions, anything already obvious from Brand DNA.
- If nothing durable is in the turn, return { "memories": [] }.
- Confidence: 1.0 = user said it explicitly; 0.7 = clearly implied; skip anything below 0.7.`

function stripJsonFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
}

export async function extractMemories(args: {
  brandId: string
  userMessage: string
  assistantMessage: string
  sourceMessageId?: string | null
}): Promise<{ created: number }> {
  const { brandId, userMessage, assistantMessage, sourceMessageId } = args

  const userPrompt = `## User turn\n${userMessage}\n\n## Assistant reply\n${assistantMessage}`

  let raw: string
  try {
    const result = await callModel({
      model: MEMORY_MODEL,
      provider: MEMORY_PROVIDER,
      systemPrompt: EXTRACTOR_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 384,
      temperature: 0.1,
    })
    raw = result.content
  } catch (err) {
    console.warn('[mia-memory] extractor LLM call failed:', err)
    return { created: 0 }
  }

  type ExtractorOut = { memories?: Array<{ kind?: string; content?: string; confidence?: number }> }
  let parsed: ExtractorOut
  try { parsed = JSON.parse(stripJsonFences(raw)) as ExtractorOut } catch {
    console.warn('[mia-memory] extractor returned unparseable JSON')
    return { created: 0 }
  }

  const VALID_KINDS: MemoryKind[] = ['preference', 'decision', 'context_fact', 'avoid']
  const candidates = (parsed.memories ?? [])
    .filter((m): m is { kind: MemoryKind; content: string; confidence: number } =>
      !!m &&
      typeof m.kind === 'string' && VALID_KINDS.includes(m.kind as MemoryKind) &&
      typeof m.content === 'string' && m.content.trim().length > 0 &&
      typeof m.confidence === 'number' && m.confidence >= CONFIDENCE_FLOOR,
    )
    .map((m) => ({ kind: m.kind, content: m.content.slice(0, 280), confidence: Math.min(1, Math.max(0, m.confidence)) }))

  if (candidates.length === 0) return { created: 0 }

  const admin = createServiceClient()

  // Dedupe: skip inserting if same (kind, content) already exists for this brand
  const { data: existing } = await admin
    .from('knowledge_nodes')
    .select('name, properties')
    .eq('brand_id', brandId)
    .eq('node_type', 'mia_memory')

  const existingSet = new Set(
    ((existing ?? []) as Array<{ name: string; properties: { kind?: string; content?: string } | null }>)
      .map((r) => `${r.properties?.kind ?? ''}::${(r.properties?.content ?? '').toLowerCase()}`),
  )

  let created = 0
  for (const c of candidates) {
    const dedupeKey = `${c.kind}::${c.content.toLowerCase()}`
    if (existingSet.has(dedupeKey)) continue
    const { error } = await admin.from('knowledge_nodes').insert({
      brand_id: brandId,
      node_type: 'mia_memory',
      name: c.content.slice(0, 255),
      summary: c.content,
      properties: {
        kind: c.kind,
        content: c.content,
        confidence: c.confidence,
        source_message_id: sourceMessageId ?? null,
      },
    })
    if (!error) created++
  }

  // Enforce the 50-memory cap: delete oldest/lowest-confidence overflow
  const { data: all } = await admin
    .from('knowledge_nodes')
    .select('id, created_at, properties')
    .eq('brand_id', brandId)
    .eq('node_type', 'mia_memory')
    .order('created_at', { ascending: false })

  if (all && all.length > MAX_MEMORIES_PER_BRAND) {
    const overflow = all.slice(MAX_MEMORIES_PER_BRAND)
    const ids = overflow.map((r) => (r as { id: string }).id)
    if (ids.length > 0) {
      await admin.from('knowledge_nodes').delete().in('id', ids)
    }
  }

  return { created }
}

export async function getRelevantMemories(brandId: string, limit = 20): Promise<MiaMemory[]> {
  const admin = createServiceClient()
  const { data } = await admin
    .from('knowledge_nodes')
    .select('id, name, properties, created_at')
    .eq('brand_id', brandId)
    .eq('node_type', 'mia_memory')
    .order('created_at', { ascending: false })
    .limit(limit)

  return ((data ?? []) as RawMemoryNode[]).map((r) => ({
    id: r.id,
    kind: (r.properties?.kind as MemoryKind) ?? 'context_fact',
    content: r.properties?.content ?? r.name,
    confidence: r.properties?.confidence ?? 0.7,
    created_at: r.created_at,
    source_message_id: r.properties?.source_message_id ?? null,
  }))
}

export async function listMemories(brandId: string): Promise<MiaMemory[]> {
  return getRelevantMemories(brandId, MAX_MEMORIES_PER_BRAND)
}

export async function deleteMemory(brandId: string, memoryId: string): Promise<boolean> {
  const admin = createServiceClient()
  const { error } = await admin
    .from('knowledge_nodes')
    .delete()
    .eq('id', memoryId)
    .eq('brand_id', brandId)
    .eq('node_type', 'mia_memory')
  return !error
}
```

- [ ] **Step 2: Offline extractor check**

Create `scripts/verify-mia-memory-extractor.ts`:

```ts
import { callModel } from '../src/lib/model-client'

const SYSTEM = `You extract durable facts a marketing AI assistant should remember about a brand across sessions.

Output JSON only, no markdown. Shape:
{ "memories": [ { "kind": "preference" | "decision" | "context_fact" | "avoid", "content": "<=200 chars", "confidence": 0.0-1.0 } ] }

Rules: preference / decision / context_fact / avoid as per spec. Skip ephemera.`

async function main() {
  const userMessage = "I hate when you run health-check every day. Also we don't care about acquisition this quarter — focus on retention."
  const assistantMessage = "Got it — I'll hold health-check and skew toward retention skills."

  const result = await callModel({
    model: 'claude-haiku-4-5-20251001',
    provider: 'anthropic',
    systemPrompt: SYSTEM,
    userPrompt: `## User turn\n${userMessage}\n\n## Assistant reply\n${assistantMessage}`,
    maxTokens: 384,
    temperature: 0.1,
  })
  console.log('RAW:', result.content)
  const parsed = JSON.parse(result.content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim())
  console.log('PARSED:', JSON.stringify(parsed, null, 2))
  const kinds = new Set(parsed.memories?.map((m: { kind: string }) => m.kind))
  if (!kinds.has('avoid') || !kinds.has('decision')) {
    console.error('FAIL: expected at least one "avoid" and one "decision" memory')
    process.exit(1)
  }
  console.log('OK')
}

main().catch((e) => { console.error(e); process.exit(1) })
```

Run:
```bash
npx tsx scripts/verify-mia-memory-extractor.ts
```
Expected: prints `OK`.

- [ ] **Step 3: Verify build + lint**

```bash
npm run build
npm run lint -- src/lib/mia-memory.ts
```
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/mia-memory.ts scripts/verify-mia-memory-extractor.ts
git commit -m "feat(mia-memory): extractor + retrieval + list + delete helpers

Extractor uses Haiku 4.5 to pull preference/decision/context_fact/avoid
memories from a chat turn. Dedupe on (kind, content); hard cap of 50
per brand. Retrieval returns top-N recent for prompt injection."
```

---

## Task 6: Wire extractor + retrieval into `api/mia/chat`

**Files:**
- Modify: `src/app/api/mia/chat/route.ts`

- [ ] **Step 1: Import the helpers**

Add to the import block at the top:

```ts
import { extractMemories, getRelevantMemories, type MiaMemory } from '@/lib/mia-memory'
```

- [ ] **Step 2: Fetch memories before building the prompt**

After step 7b (30-day digest), add step 7c:

```ts
// 7c. Retrieve durable memories for prompt injection
let memories: MiaMemory[] = []
try { memories = await getRelevantMemories(brandId, 20) } catch { memories = [] }

const memoriesBlock = memories.length > 0
  ? memories.map((m) => `- [${m.kind}] ${m.content}`).join('\n')
  : 'No durable memories yet — anything the user tells you about their preferences, decisions, or context will be remembered across sessions.'
```

- [ ] **Step 3: Add the memories slot to the prompt template**

Insert this section between `## What your team has said recently` and `## When to suggest a skill` in `MIA_CHAT_SYSTEM_PROMPT`:

```
## What you remember about this brand

{memories}
```

- [ ] **Step 4: Update `buildSystemPrompt` signature + call site**

```ts
function buildSystemPrompt(
  brandName: string,
  domain: string,
  focusAreas: string,
  plan: string,
  connectedPlatforms: string,
  recentSkillRunsSummary: string,
  agentDigest: string,
  memories: string,
  skillsCatalog: string,
): string {
  return MIA_CHAT_SYSTEM_PROMPT
    .replace(/{brandName}/g, brandName)
    .replace(/{domain}/g, domain)
    .replace(/{focusAreas}/g, focusAreas)
    .replace(/{plan}/g, plan)
    .replace(/{connectedPlatforms}/g, connectedPlatforms)
    .replace(/{recentSkillRunsSummary}/g, recentSkillRunsSummary)
    .replace(/{agentDigest}/g, agentDigest)
    .replace(/{memories}/g, memories)
    .replace(/{skillsCatalog}/g, skillsCatalog)
}
```

Update the call site to pass `memoriesBlock` between `agentDigestBlock` and `skillsCatalog`.

- [ ] **Step 5: Trigger extraction after the SSE `done` event**

Inside the `ReadableStream.start` function, after `controller.enqueue(sseEvent({ type: 'done' }))` and before `controller.close()` in the `finally` block, change the flow so extraction kicks off *after* `done` but does not block the response:

```ts
// Send done event
controller.enqueue(sseEvent({ type: 'done' }))

// Fire-and-forget memory extraction — do NOT await. If it fails, we log.
void extractMemories({
  brandId,
  userMessage: message.trim(),
  assistantMessage: result.content,
  sourceMessageId: null,
}).catch((err) => console.warn('[mia-chat] memory extraction failed:', err))
```

- [ ] **Step 6: Verify build + lint**

```bash
npm run build
npm run lint -- src/app/api/mia/chat/route.ts
```
Expected: both pass.

- [ ] **Step 7: Manual end-to-end check**

Start dev, open the chat, send:
> "Stop running health-check more than once a month. And our Q2 focus is retention."

After the reply streams in, wait ~10 seconds, then query Supabase:
```sql
select properties, created_at from knowledge_nodes
  where brand_id = '<your-brand>' and node_type = 'mia_memory'
  order by created_at desc limit 5;
```
Expected: at least one `avoid` memory for health-check cadence and one `decision` for retention focus.

Then reload the page → open a *new* conversation → send "What do you know about my preferences?" → Mia should reference the remembered facts.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/mia/chat/route.ts
git commit -m "feat(mia-chat): wire memory retrieval + async extraction

Prompt now includes up to 20 durable memories. After each assistant
turn, Haiku extracts new memories in the background without blocking
the SSE response."
```

---

## Task 7: `/api/mia/memory` endpoint — list + delete

**Files:**
- Create: `src/app/api/mia/memory/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { listMemories, deleteMemory } from '@/lib/mia-memory'

async function assertAccess(userId: string, brandId: string): Promise<boolean> {
  const admin = createServiceClient()
  const { data: brand } = await admin.from('brands').select('owner_id').eq('id', brandId).single()
  if (!brand) return false
  if (brand.owner_id === userId) return true
  const { data: member } = await admin
    .from('brand_members').select('brand_id')
    .eq('brand_id', brandId).eq('user_id', userId).single()
  return !!member
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const brandId = new URL(request.url).searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })
  if (!(await assertAccess(user.id, brandId))) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  const memories = await listMemories(brandId)
  return NextResponse.json({ memories })
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { brandId?: string; memoryId?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { brandId, memoryId } = body
  if (!brandId || !memoryId) {
    return NextResponse.json({ error: 'brandId and memoryId required' }, { status: 400 })
  }
  if (!(await assertAccess(user.id, brandId))) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  const ok = await deleteMemory(brandId, memoryId)
  if (!ok) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Verify build + lint**

```bash
npm run build
npm run lint -- src/app/api/mia/memory/route.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/mia/memory/route.ts
git commit -m "feat(mia-memory): GET/DELETE endpoint for the memory settings UI"
```

---

## Task 8: Settings panel — `/dashboard/settings/mia-memory`

**Files:**
- Create: `src/app/dashboard/settings/mia-memory/page.tsx`
- Modify: `src/app/dashboard/settings/layout.tsx` (add nav entry)

- [ ] **Step 1: Write the page**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Brain, Trash2 } from 'lucide-react'

interface MiaMemory {
  id: string
  kind: 'preference' | 'decision' | 'context_fact' | 'avoid'
  content: string
  confidence: number
  created_at: string
}

const KIND_COLORS: Record<MiaMemory['kind'], string> = {
  preference: '#6366f1',
  decision: '#10b981',
  context_fact: '#f59e0b',
  avoid: '#ef4444',
}

export default function MiaMemoryPage() {
  const [brandId, setBrandId] = useState<string | null>(null)
  const [memories, setMemories] = useState<MiaMemory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch('/api/brands/me')
        if (res.ok) {
          const data = await res.json()
          if (data.brandId) setBrandId(data.brandId)
        }
      } catch { /* ignore */ }
    }
    init()
  }, [])

  useEffect(() => {
    if (!brandId) return
    async function load() {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/mia/memory?brandId=${brandId}`)
        if (res.ok) {
          const data = await res.json()
          setMemories(data.memories ?? [])
        }
      } finally { setIsLoading(false) }
    }
    load()
  }, [brandId])

  async function handleDelete(memoryId: string) {
    if (!brandId || deletingId) return
    setDeletingId(memoryId)
    try {
      const res = await fetch('/api/mia/memory', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, memoryId }),
      })
      if (res.ok) setMemories((prev) => prev.filter((m) => m.id !== memoryId))
    } finally { setDeletingId(null) }
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-white/[0.04]" />
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-[#6366f1]/15 flex items-center justify-center">
          <Brain className="w-4 h-4 text-[#6366f1]" />
        </div>
        <div>
          <h2 className="font-heading font-semibold text-lg text-foreground">Mia&apos;s Memory</h2>
          <p className="text-xs text-muted-foreground">Durable facts Mia remembers about you and the brand, across sessions.</p>
        </div>
      </div>

      {memories.length === 0 ? (
        <Card className="glass-panel">
          <CardContent className="py-10 text-center">
            <Brain className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No memories yet. Tell Mia about your preferences or constraints in chat — she&apos;ll remember them here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {memories.map((m) => (
            <Card key={m.id} className="glass-panel">
              <CardContent className="py-3 px-4 flex items-start gap-3">
                <span
                  className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 mt-0.5"
                  style={{ background: `${KIND_COLORS[m.kind]}22`, color: KIND_COLORS[m.kind] }}
                >
                  {m.kind}
                </span>
                <p className="flex-1 text-sm text-foreground/90">{m.content}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(m.id)}
                  disabled={deletingId === m.id}
                  className="shrink-0 text-muted-foreground hover:text-[#ef4444]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add nav entry**

Open `src/app/dashboard/settings/layout.tsx`, find the nav-items array (look for the existing `Brand DNA` entry), and add:

```tsx
{ href: '/dashboard/settings/mia-memory', label: "Mia's Memory", icon: Brain },
```

Add `Brain` to the `lucide-react` import if not already present.

- [ ] **Step 3: Verify build + lint + manual check**

```bash
npm run build
npm run lint
npm run dev
```

Visit `/dashboard/settings/mia-memory`:
- Empty state renders when no memories exist.
- After Task 6's end-to-end test, memories appear here.
- Delete button removes a memory, list updates, refresh shows it's gone.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/settings/mia-memory/page.tsx src/app/dashboard/settings/layout.tsx
git commit -m "feat(mia-memory): settings panel to view + delete remembered facts

Lists all mia_memory nodes for the active brand with kind badges.
Users can delete any fact, giving them full control over Mia's memory."
```

---

## Task 9: Final verification + ship

**Files:** none (verification only)

- [ ] **Step 1: Full build + lint**

```bash
npm run build
npm run lint
```
Expected: both pass with zero new warnings.

- [ ] **Step 2: Full end-to-end walkthrough in dev**

1. Open `/dashboard/chat`. Send "What platforms do I have connected?" — Mia should list the actual state from `platform_status`, not hedge.
2. Send "Stop running health-check so often, and our Q2 focus is retention." Wait for reply, reload the page. Expected: conversation is restored with all messages.
3. Navigate to `/dashboard/settings/mia-memory`. Expected: at least one `avoid` and one `decision` memory present.
4. Start a fresh conversation ("New chat"). Ask "What do you know about my preferences?" Expected: Mia references the remembered facts.
5. Ask "How's Max doing?" — Mia should reference Max's last run from the digest, and if Max is blocked/failed, say why in plain language.
6. From the settings panel, delete one memory. Ask Mia about it — she should no longer reference it.

- [ ] **Step 3: Push**

```bash
git push origin main
```

- [ ] **Step 4: Update spec status**

Edit `docs/superpowers/specs/2026-04-17-mia-trust-continuity-design.md`:

```diff
-**Status:** Draft
+**Status:** Shipped
```

Commit:
```bash
git add docs/superpowers/specs/2026-04-17-mia-trust-continuity-design.md
git commit -m "docs(specs): mark mia-trust-continuity as shipped"
git push origin main
```

---

## Self-review

**Spec coverage:**
- Item 1 (platform awareness) → Task 1 ✓
- Item 2 (chat persistence) → Task 2 ✓
- Item 3 (agent activity digest, including blocked/failed visibility) → Task 3 ✓
- Item 4 (chat → KG memory: migration, extractor, retrieval, settings panel) → Tasks 4–8 ✓
- Testing section — Tasks 3, 5, 6, 8, 9 cover the manual verifications that stand in for the spec's test types. No automated test runner exists in this repo; this is the best available equivalent.
- Out-of-scope items (cron/OAuth audit, rich memory UI, cross-brand memory) — correctly excluded.

**Placeholder scan:** no TBDs, TODOs, "handle edge cases", or "similar to Task N" references.

**Type consistency:** `MiaMemory` / `MemoryKind` / `RawMemoryNode` defined in `mia-memory.ts` and re-used consistently in the API route and settings page. `buildSystemPrompt` signature grows monotonically (Task 1 → Task 3 → Task 6); call site is updated in the same task that extends the signature.

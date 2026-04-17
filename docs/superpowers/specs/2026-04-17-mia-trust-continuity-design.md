# Mia Trust & Continuity — Design Spec

**Date:** 2026-04-17
**Status:** Draft
**Depends on:** nothing
**Blocks:** none (but unblocks better Mia-led UX across the app)

## Problem

Mia is the user's primary interface to the 12-agent team. Four observed failures undermine that trust:

1. **Mia is platform-blind in chat.** She hedges ("or you can paste in key metrics and I'll analyze them directly") even when the brand has Meta connected. Her system prompt contains no platform-connection state, so she fills the gap with a wrong fallback.
2. **Chat does not survive a window shift.** `conversation_messages` rows persist server-side, but `src/app/dashboard/chat/page.tsx` never restores `activeConversationId` on mount. Every reload starts a blank conversation. Users describe it as "talking to a memory-loss patient."
3. **Mia has no line-of-sight to her team's recent output.** She sees `skill_runs` from the last 24h (status only, no content). She can't answer "what did Max say today" because Max's output never enters her prompt. If Max is silent, she also can't tell whether he's blocked, failed, or simply never triggered.
4. **Mia forgets across sessions.** Chat turns are written to `conversation_messages` but never flow into `knowledge_nodes`. Decisions ("skip health-check this week"), preferences ("I hate emojis"), and brand-specific facts ("our Q2 focus is retention") are lost the next session.

Each failure individually is small; together they make Mia feel shallow. Users stop trusting her because the same answers keep surfacing and because she can't remember yesterday.

## Solution Overview

Four changes, scoped so each can ship independently:

1. **Platform awareness** — load `platform_status` in `api/mia/chat`, inject a `Connected platforms` block, add prompt rules that forbid "paste your data" fallbacks when a platform is connected.
2. **Chat persistence** — on active-conversation change, write `mia_active_conversation_{brandId}` to `localStorage`; on mount, read and hydrate via the existing `loadConversation`.
3. **Agent activity digest** — extend the 30-day recency map (already added for cool-downs) into a full *digest*: for each agent, include last-run status and a 1-line summary of the last completed output. Surfaces "Max ran 9h ago, top finding: ..." directly in Mia's prompt. Includes `blocked`/`failed` runs so Mia can tell the user *why* an agent is silent.
4. **Chat → KG memory** — after each user+assistant turn pair, run a small extractor (cheap model) that writes `mia_memory` nodes to `knowledge_nodes`. On next session, top-N memories re-enter Mia's system prompt.

Each change is opt-in to the next — platform awareness works without persistence, persistence works without the digest, digest works without KG memory. Ship in that order.

No breaking changes. No schema changes except one nullable column for the KG memory feature.

---

## 1. Platform awareness in chat

### Data flow

`getPlatformStatus(brandId)` already exists in `src/lib/mia-intelligence.ts` and returns `{ shopify, meta, ga4, gsc, klaviyo, ... }`. Currently used only by pre-flight.

Extend `api/mia/chat/route.ts` to call it once per request and feed the result into the system prompt.

### Prompt additions

Insert after the `Recent activity` block:

```
## Connected platforms (source of truth)

Meta Ads: {connected|not connected}
Shopify: {connected|not connected}
GA4: {connected|not connected}
GSC: {connected|not connected}
Klaviyo: {connected|not connected}

Rules when a platform is connected:
- Never ask the user to paste data, numbers, or screenshots from that platform.
- If the user wants insights from it, dispatch the owning agent's skill. It has direct read access.
- If the user seems to doubt the connection, say "Meta is connected — let me pull it now" and trigger the skill.

Rules when a platform is NOT connected:
- Offer the integration page as the default path: "Connect Meta in Settings → Platforms."
- Manual-data fallback is allowed only as an explicit second option, not the opening line.
```

### Contract

Input: existing `POST /api/mia/chat` request.
Output: unchanged. Prompt is larger by ~300 tokens.

Failure: `getPlatformStatus` errors are non-fatal; fall back to an "Unknown — verify in Settings" line.

---

## 2. Chat persistence across window shifts

### UI change (one file)

`src/app/dashboard/chat/page.tsx`:

- On `setActiveConversationId(id)`: also `localStorage.setItem('mia_active_conversation_' + brandId, id)`. Clear on sign-out.
- On mount (after `brandId` resolves): read the stored id; if present, call `loadConversation(stored)`.
- On "New chat" button: clear the key.

### Edge cases

- Stored conversation deleted server-side → `loadConversation` fetches zero messages → UI behaves like a fresh chat; clear the stored key silently.
- Brand switch → key is brand-scoped, so switching brands doesn't cross streams.
- Private/incognito → `localStorage` works per session; acceptable.

### No server change needed

`conversation_messages` already persists. `GET` queries by `conversation_id` already work.

---

## 3. Agent activity digest in Mia's prompt

### What changes

The recency map added earlier (`skillRecencyTable`) lists skill IDs + days-ago. Extend to include the last completed run's top-line finding.

### Data fetch

One extra query: for each distinct `skill_id` in the 30-day window, fetch the most recent `completed` row's `output` field. Extract a `headline` — if the skill declares one in its output schema, use it; otherwise fall back to the first string field ≤200 chars.

Cap total prompt addition at ~1500 tokens (≈10 agent summaries).

### Prompt format

```
## What your team has said recently (last 30 days)

- max/budget-allocation (9h ago, completed) — "ROAS on Cold-Purchase fell 24% WoW. Recommend pausing 3 ad sets."
- scout/health-check (9h ago, completed) — "Overall 68/100. Weakest: email (42). Strongest: brand_coherence (89)."
- aria/image-brief (2d ago, completed) — "Generated 4 creative variants for Green Mantra launch."
- max/ad-performance-analyzer (1d ago, BLOCKED: meta_ads.campaigns.insights returned zero rows — check ad account id)
```

Crucially, `blocked` and `failed` rows are shown, not hidden. This is how Mia becomes able to answer "why isn't Max running?" — because Mia can see that Max *tried* and was blocked.

### Engineering detail

- Re-use the 30-day query from the cool-down feature, widen the `select` to include `output, error, blocked_reason, status`.
- Headline extraction is a pure function; no new LLM call.

---

## 4. Chat → brand KG memory

### Node type

One new node type: `mia_memory`. Properties:

```ts
{
  kind: 'preference' | 'decision' | 'context_fact' | 'avoid'
  content: string      // the remembered fact, ≤280 chars
  source_message_id: string
  confidence: number   // 0-1 from the extractor
  created_at: string
}
```

`knowledge_nodes.node_type` is CHECK-constrained (see `supabase/migrations/002-add-intelligence-node-types.sql`). One migration adds `'mia_memory'` to the allow-list; no other schema change needed — `properties` is already JSONB.

### Extraction flow

After every assistant turn in `api/mia/chat`:

1. Take the user's last message and Mia's response.
2. Call Haiku with a short extractor prompt: "Extract durable facts the assistant should remember across sessions. Return an array; empty if nothing durable."
3. For each extracted fact, upsert a `mia_memory` node.

Runs async (after the SSE `done` event) so chat latency is unaffected.

### Retrieval flow

On next chat request, fetch the top N (e.g. 20) recent `mia_memory` nodes for the brand, rank by recency + simple keyword relevance to the new user message, inject into system prompt as:

```
## What you remember about this brand

- [preference] User prefers terse replies, no bullet spam.
- [decision] Skip Max until Meta spend crosses $5k/mo.
- [context_fact] Primary product: Green Mantra (botanical skincare).
- [avoid] Founder dislikes re-running health-check more than monthly.
```

### Guardrails

- Hard cap: 50 `mia_memory` nodes per brand. Oldest/lowest-confidence evicted on overflow.
- User-visible surface: a "Mia's memory" panel in settings where the user can view and delete any remembered fact. This is required — silent memory is a trust problem, not a fix for one.
- Extraction model is cheap (Haiku); one call per turn. Estimated cost: ~$0.001/turn.

### Failure modes

Extractor failure → log and drop. Memory is best-effort; never block chat on it.
Retrieval failure → proceed with empty memory block. Chat still works.

---

## Scope boundaries

**In scope:**
- Items 1, 2, 3, 4 above.
- Minimal "Mia's memory" settings panel (list + delete only).
- Diagnostic surface: the digest (#3) naturally exposes why Max is silent.

**Out of scope (separate plans):**
- Cron/OAuth audit to actually *fix* Max silence if the root cause is infrastructure. The digest only makes the problem visible; fixing it may require checking Vercel cron config and Meta token health. Flag for follow-up.
- Richer memory UI (edit, tag, search).
- Cross-brand memory (user-level vs brand-level).
- Automated memory summarization/compaction beyond the 50-node cap.

---

## Architecture

```
┌────────────────────┐
│ dashboard/chat UI  │ localStorage: mia_active_conversation_{brandId}
└────────┬───────────┘
         │
         ▼
┌─────────────────────────────────┐
│ POST /api/mia/chat              │
│  ├─ getPlatformStatus()  ───────┼──▶ inject connected platforms
│  ├─ recent skill runs (24h)     │
│  ├─ 30-day recency + digest ────┼──▶ inject agent activity
│  ├─ top mia_memory nodes   ─────┼──▶ inject remembered facts
│  └─ callModel(Sonnet)           │
└───────────┬─────────────────────┘
            │ SSE done
            ▼
┌─────────────────────────────────┐
│ async: memory extractor (Haiku) │
│  └─ upsert mia_memory nodes     │
└─────────────────────────────────┘
```

## Testing

- **Platform awareness:** unit-test the prompt builder with `meta=true/false` fixtures; snapshot.
- **Persistence:** Playwright — open chat, send message, reload, verify conversation restored.
- **Digest:** seed `skill_runs` with one `completed` + one `blocked` row per agent; assert both appear in prompt.
- **KG memory:** integration test — send a message that contains a clear preference ("I hate emojis"), assert a `mia_memory` node is created with `kind: 'preference'`.

## Risks

- **Prompt bloat.** Digest + memory can push Mia's system prompt past 4k tokens. Mitigations: cap digest at 10 agents, memory at 20 nodes. Monitor token usage per turn.
- **Bad memories stick.** If the extractor invents a "fact", it lives for 50 turns. Mitigations: confidence floor (≥0.7), user-visible delete, hard cap.
- **Window-focus race on persistence.** If two tabs modify the key simultaneously, last write wins. Acceptable.

## Ship order

1. Platform awareness — 1 hour.
2. Chat persistence — 30 min.
3. Agent activity digest — 2 hours.
4. KG memory — 1 day (extractor + retrieval + settings panel + tests).

Ship 1+2+3 as a single PR ("Mia trust pass"); 4 as a follow-up.

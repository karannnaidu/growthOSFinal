# Mia Agent Delegation — Design Spec

**Date:** 2026-04-14
**Status:** Approved
**Scope:** Enable Mia to trigger skills, chain multi-step workflows, and collect missing data — all from within the chat interface.

---

## 1. Problem

Mia's chat is purely conversational. She receives brand context and recent skill run summaries but cannot execute any agent skills. Her system prompt contains `[ACTION:skill-id]` syntax that nothing parses. Users must manually navigate to each agent's page and click "Run" for every skill.

## 2. Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Autonomy model | Confirm-first (B) | User clicks "Run" before skills execute. An `autoExecute` flag is baked in from day one so flipping to autonomous mode is a config change, not a rewrite. |
| Result display | Summary + expandable card (C) | Mia writes a natural-language summary; full structured output is available via "View full output" expand. |
| Chaining | Multi-step chains (B) | Mia proposes a full chain, user approves once, skills execute sequentially with output flowing downstream. |
| Data collection | Conversational with fallback (A+) | Mia asks for missing data inline. If collection fails or user skips, falls back to a link to the agent setup page. |
| Action format | Structured JSON action blocks (Approach 2) | Fenced ````actions ... ```` blocks in Mia's response. Reliable parsing, supports chains with dependencies and data-collection steps. |

## 3. Architecture

```
User message
    |
    v
POST /api/mia/chat  -->  LLM (Claude Sonnet)  -->  Response text + ```actions {...}```
    |
    v
Frontend parses response:
  - Strips action block from displayed text
  - Renders Mia's message
  - Renders ActionCard / CollectCard components below message
    |
    v
User clicks "Run All" (or auto-execute if flag is on)
    |
    v
POST /api/mia/actions/execute  -->  SSE stream
  - Topologically sorts actions by dependsOn
  - Executes skills sequentially via runSkill()
  - Passes prior outputs as additionalContext to dependents
  - After all skills complete, calls LLM for summary
  - Stores summary + skill outputs as conversation messages
    |
    v
Frontend renders:
  - Per-action progress (spinner -> complete/failed)
  - Mia's summary message
  - Expandable full output cards
```

## 4. Action Block Format

Mia's LLM response contains natural language plus an optional fenced block:

```
I'll run Scout's health check and then generate fresh ad copy based on the findings.

​```actions
{
  "actions": [
    {
      "id": "a1",
      "type": "skill",
      "skillId": "health-check",
      "agentId": "scout",
      "reason": "Diagnose current brand health",
      "dependsOn": []
    },
    {
      "id": "a2",
      "type": "skill",
      "skillId": "ad-copy",
      "agentId": "aria",
      "reason": "Generate ad copy based on health check findings",
      "dependsOn": ["a1"]
    }
  ]
}
​```
```

### Action Types

**`skill`** — Execute a skill via skills-engine.

```json
{
  "id": "a1",
  "type": "skill",
  "skillId": "health-check",
  "agentId": "scout",
  "reason": "Human-readable explanation",
  "dependsOn": []
}
```

**`collect`** — Ask user for missing data before proceeding.

```json
{
  "id": "c1",
  "type": "collect",
  "field": "primary_landing_page",
  "storeIn": "brand_context",
  "agentId": "sage",
  "question": "What's your main landing page URL?",
  "fallbackUrl": "/dashboard/agents/sage",
  "dependsOn": []
}
```

### Validation Rules

- `skillId` must exist in the skills directory (validated via `loadSkill()`)
- `agentId` must match the skill's owning agent
- `dependsOn` must reference valid action IDs within the same block (no cycles)
- Maximum 5 actions per block (prevent runaway chains)
- Maximum chain depth of 3 (dependsOn chains)

## 5. System Prompt Enhancement

Mia's system prompt gets a `## Available Skills` section auto-generated from `agents.json`:

```
## Available Skills

You can trigger skills by including an ```actions block in your response.
Only include actions when the user's request clearly needs them.

Available skills by agent:
- scout: health-check, anomaly-detection, customer-signal-analyzer, returns-analyzer
- aria: ad-copy, image-brief, ugc-script, social-content-calendar, ...
- luna: email-copy, email-flow-audit, abandoned-cart-recovery, ...
- max: budget-allocation, ad-scaling, channel-expansion-advisor
- sage: page-cro, signup-flow-cro, ab-test-design, pricing-optimizer
- atlas: audience-targeting, persona-builder, influencer-finder, ...
- echo: competitor-scan, competitor-creative-library, ...
- penny: billing-check, unit-economics, cash-flow-forecast
- hugo: seo-audit, keyword-strategy, programmatic-seo
- navi: inventory-alert, reorder-calculator, compliance-checker
- nova: geo-visibility

If a skill requires data the user hasn't provided, use a "collect" action
to ask for it before running the skill.

Format: include a fenced ```actions block with JSON. See examples in context.
```

The skills catalog is built dynamically from `agents.json` at request time — no hardcoded list.

## 6. Execution Engine — `/api/mia/actions/execute`

### Request

```typescript
POST /api/mia/actions/execute
Content-Type: application/json

{
  brandId: string
  conversationId: string
  actions: MiaAction[]
}
```

### SSE Events

| Event | Fields | Frontend Behavior |
|-------|--------|-------------------|
| `action_start` | `actionId`, `skillId`, `agentId` | Show spinner on ActionCard |
| `action_complete` | `actionId`, `skillId`, `output`, `creditsUsed` | Show checkmark, store output for expand |
| `action_failed` | `actionId`, `skillId`, `error` | Show error, grey out dependents |
| `summary` | `content`, `conversationId` | Render as new Mia message |
| `done` | — | Unlock chat input |

### Execution Logic

```
1. Validate all actions (skill exists, no cycles, chain depth <= 3)
2. Topological sort by dependsOn
3. For each action in order:
   a. If type === "collect": skip (already handled by frontend)
   b. If any dependency failed: emit action_failed, skip
   c. Emit action_start
   d. Build additionalContext from resolved dependency outputs
   e. Call runSkill({ brandId, skillId, triggeredBy: 'mia', additionalContext })
   f. Emit action_complete or action_failed
4. Gather all outputs
5. Call LLM with: "Summarize these skill results for the user" + all outputs
6. Store summary as conversation_message (role: 'assistant')
7. Emit summary event
8. Emit done
```

### Error Handling

- If a skill fails, all actions that depend on it are skipped with `action_failed` + reason "dependency failed"
- The summary LLM call includes failed actions so Mia can explain what went wrong
- If the summary LLM call itself fails, emit a static fallback: "Skills completed. Check the results above."

## 7. Data Collection — `/api/mia/actions/collect`

### Request

```typescript
POST /api/mia/actions/collect
Content-Type: application/json

{
  brandId: string
  field: string
  value: string
  storeIn: "brand_context" | "agent_setup"
}
```

### Storage Logic

- `"brand_context"` — upserts into `brands.product_context` JSONB field (merges the key)
- `"agent_setup"` — upserts into the agent's setup data in `brand_agents.config`

### Response

```json
{ "success": true, "field": "primary_landing_page", "stored": true }
```

## 8. Frontend Components

### `ActionCard` (`src/components/chat/action-card.tsx`)

Renders inline below Mia's chat message.

**States:**
- `pending` — Shows skill name, agent icon, reason, estimated credits. "Run" and "Skip" buttons.
- `running` — Spinner, "Running health-check..." text
- `complete` — Green checkmark, credits used, "View output" expand toggle
- `failed` — Red X, error message

**Chain display:** When multiple actions exist, show a single "Run All (2 skills, ~2 credits)" button at the top, with individual action rows below showing the chain order.

**`autoExecute` behavior:** When `brand_agents.config.auto_execute` is true for Mia, the component renders directly in `running` state and calls the execute endpoint on mount. No button.

### `CollectCard` (`src/components/chat/collect-card.tsx`)

- Shows Mia's question as label
- Text input field
- "Submit" button → calls `/api/mia/actions/collect`
- On success, if there are dependent skills waiting, triggers execution
- "Skip" link below → shows fallback message with link to agent setup page

### `ChatMessage` modifications

- Before rendering content, strip the ````actions ... ```` block
- Parse the stripped block into `MiaAction[]`
- Render `ActionCard`/`CollectCard` components after the message text

## 9. autoExecute Flag

Stored in `brand_agents.config` for Mia's agent:

```json
{
  "enabled": true,
  "auto_approve": false,
  "auto_execute": false,   // <-- this flag
  "revealed": true
}
```

**When `auto_execute` is false (default):** ActionCards show Run/Skip buttons. User confirms.

**When `auto_execute` is true:** ActionCards skip confirmation, immediately call execute endpoint. The cards still render (showing progress), but no user interaction needed.

**How to flip:** User says "shift to autonomous mode" → update `brand_agents.config` for Mia. Could also be a toggle in Mia's settings panel, or a chat command Mia recognizes.

## 10. New Files

| File | Purpose |
|------|---------|
| `src/lib/mia-actions.ts` | Parse action blocks from LLM text, validate actions, topological sort, type definitions |
| `src/app/api/mia/actions/execute/route.ts` | Execute skill chains via SSE |
| `src/app/api/mia/actions/collect/route.ts` | Store collected user data |
| `src/components/chat/action-card.tsx` | Skill confirmation/progress card |
| `src/components/chat/collect-card.tsx` | Inline data collection form |

## 11. Modified Files

| File | Changes |
|------|---------|
| `src/app/api/mia/chat/route.ts` | Enhanced system prompt with dynamic skills catalog + action block format instructions |
| `src/app/dashboard/chat/page.tsx` | Parse actions from Mia's response, render ActionCards/CollectCards, handle execute/collect calls, refresh runs |
| `src/components/chat/chat-message.tsx` | Strip action blocks before rendering, pass parsed actions to parent |

## 12. Security Considerations

- All endpoints verify auth + brand access (same pattern as existing routes)
- `autoExecute` is per-brand config, not a global setting — each brand controls their own autonomy level
- Maximum 5 actions per block prevents runaway credit consumption
- Chain depth capped at 3 prevents infinite recursion
- Credit balance is checked before execution starts (sum of all skill credits in the chain)
- The `collect` endpoint only writes to the authenticated user's brand context

## 13. Credit Handling

Before executing a chain:
1. Sum `creditsRequired` for all skills in the chain
2. Check wallet balance upfront (fail fast if insufficient)
3. Deduct per-skill as each completes (existing skills-engine logic)
4. If a mid-chain skill fails, only credits for completed skills are charged

The "Run All" button shows total estimated credits: "Run All (3 skills, ~4 credits)"

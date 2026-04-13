# Smart Skill Output Renderer — Design Spec

**Date:** 2026-04-14
**Status:** Approved
**Scope:** Replace all raw JSON output rendering across the platform with a single pattern-detecting universal renderer.

---

## 1. Problem

Skill outputs render as raw JSON in most of the platform:
- **ActionCard (Mia chat):** `JSON.stringify` in `<pre>` block when user expands completed actions
- **Run detail page (`/dashboard/runs/[runId]`):** `JSON.stringify` in `<pre>` block
- **Agent detail page DefaultOutput:** Truncated, barely-formatted JSON for 54 of 59 skills
- Only 5 agents (scout, aria, max, penny, hugo) have custom renderers

Users see walls of JSON instead of actionable information.

## 2. Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Approach | Smart universal renderer (A) | One component that detects output patterns and picks the right layout. No per-skill maintenance. New skills auto-render. |
| Scope | All 4 locations (A) | ActionCard, run detail page, agent detail page fallback, exports page |
| Keying | Shape-based, not skill-ID-based | Inspect the value shape (array of objects with headlines? numeric values? issues with severity?) and render accordingly |
| Existing custom renderers | Keep as overrides | The 5 agent-specific renderers (scout, aria, max, penny, hugo) stay. Only DefaultOutput is replaced. |

## 3. Pattern Detection

The renderer walks each top-level key in the output object and picks the best sub-component based on the value's shape.

### Detection Rules (evaluated in order)

| # | Key Pattern | Value Shape | Renders As | Component |
|---|-------------|-------------|------------|-----------|
| 1 | `*score*`, `*rating*` | number 0-100 | Circular gauge with color | `ScoreGauge` |
| 2 | `issues`, `findings`, `critical_findings`, `problems` | array of objects with `issue`/`finding`/`problem` field | Color-coded severity list | `IssueList` |
| 3 | `recommendations`, `action_items`, `next_steps`, `suggestions` | array of strings or objects with text field | Numbered action items | `RecommendationList` |
| 4 | any key | array of objects where >50% have `headline`/`title`/`name` + `body`/`description`/`text` | Card grid | `CardGrid` |
| 5 | any key | object where >70% of values are numbers | Stat cards in a grid | `MetricsRow` |
| 6 | `channels`, `allocations`, `by_product`, `by_channel`, `breakdown` | array of uniform objects (same keys) | Table | `DataTable` |
| 7 | `categories` | object of objects with `score`/`status`/`summary` | Status category cards | `CategoryCards` |
| 8 | `positive_signals`, `strengths`, `highlights` | array of strings | Green bullet list | `SignalList` (color: green) |
| 9 | `data_gaps`, `warnings`, `risks` | array of strings | Amber bullet list | `SignalList` (color: amber) |
| 10 | `content`, `summary`, `analysis`, `report` | long string (>100 chars) | Formatted prose block | `ProseBlock` |
| 11 | any key | array of strings | Simple bullet list | `BulletList` |
| 12 | any key | string | Inline text | `TextValue` |
| 13 | any key | object | Recursive render of child keys | recurse `renderValue` |
| 14 | fallback | anything | Stringified in styled code block | `FallbackValue` |

### How Detection Works

```
function detectPattern(key: string, value: unknown): ComponentType
  1. Normalize key to lowercase, strip underscores
  2. Check key-specific rules first (#1, #2, #3, #7, #8, #9, #10)
  3. Then check value-shape rules (#4, #5, #6, #11, #12, #13)
  4. Fallback to #14
```

A single output object can use multiple patterns. For example, health-check output:
- `overall_score: 72` → ScoreGauge
- `categories: { product_health: { score: 85, status: "healthy", summary: "..." } }` → CategoryCards
- `critical_findings: [{ category: "...", finding: "..." }]` → IssueList
- `positive_signals: ["Good reviews", ...]` → SignalList (green)
- `data_gaps: ["No GA4 data", ...]` → SignalList (amber)

## 4. Sub-Components

All are internal to the file. Not exported.

### ScoreGauge
- Circular SVG progress ring (same style as existing ScoutOutput)
- Color: green >= 70, amber >= 40, red < 40
- Score number centered
- Key name as label below

### IssueList
- Each issue is a row with colored severity dot (red/amber/green based on `severity`/`status`/`priority` field)
- Bold issue title, muted evidence/description text below
- If no severity field, default to amber

### RecommendationList
- Numbered list (1. 2. 3.)
- Each item: bold action text, muted detail below
- If objects, look for `action`/`recommendation`/`title` as the bold text and `detail`/`description`/`reason` as the muted text
- If strings, just show numbered text

### CardGrid
- 2-column grid on desktop, 1-column on mobile
- Each card: bold headline/title, muted body/description, optional colored accent fields (cta, score, status)
- Max 6 cards shown, "+N more" if truncated

### MetricsRow
- 3-column grid of stat cards
- Each card: large bold number, muted label below
- Numbers formatted: currency detection ($, percentages), `.toLocaleString()` for large numbers

### DataTable
- Standard table with header row from object keys
- Alternating row shading
- Numeric columns right-aligned
- Max 10 rows shown, "+N more" footer if truncated

### CategoryCards
- 2-3 column grid
- Each card: category name, score (bold), status dot (colored), summary text
- Same style as existing ScoutOutput categories

### SignalList
- Bullet list with colored dots (green for positive, amber for warnings)
- Simple text per item

### ProseBlock
- Rendered as formatted text with whitespace preserved
- If the string contains markdown-like patterns (##, **, -), basic markdown rendering
- Max height with scroll overflow

### BulletList
- Simple `•` prefixed list
- Max 8 items shown, "+N more" if truncated

### TextValue
- Inline text for short strings, block text for longer ones
- Key rendered as section header

### FallbackValue
- Styled code block (not raw `<pre>`)
- Monospace, dark background, rounded corners
- `JSON.stringify(value, null, 2)` but only as last resort

## 5. Hidden Keys

These keys are stripped before rendering (metadata, not user-facing):
- `model`, `provider`, `content` (when it's the raw LLM response fallback from skills-engine)
- Any key starting with `_` (internal context like `_mia_instruction`, `_supplementary_data`)

## 6. File Changes

### New File

| File | Purpose |
|------|---------|
| `src/components/ui/skill-output.tsx` | Universal pattern-detecting renderer. Single export: `SkillOutput` |

### Modified Files

| File | Change |
|------|--------|
| `src/components/agents/agent-output.tsx` | Replace `DefaultOutput` internals with `<SkillOutput>`. Keep 5 custom renderers as overrides. |
| `src/components/chat/action-card.tsx` | Replace `<pre>{JSON.stringify(...)}</pre>` with `<SkillOutput output={state.output} />` |
| `src/app/dashboard/runs/[runId]/page.tsx` | Replace `<pre>{JSON.stringify(...)}</pre>` with `<SkillOutput output={run.output} />` |

### Not Changed

- No API routes modified
- No data schemas modified
- No skill markdown files modified
- The 5 existing custom renderers (ScoutOutput, AriaOutput, etc.) are untouched

## 7. Component API

```typescript
interface SkillOutputProps {
  output: Record<string, unknown> | string | null
  /** Max height in pixels before scroll. Default: 400 */
  maxHeight?: number
  /** Compact mode for inline use (ActionCard). Reduces padding/font sizes. Default: false */
  compact?: boolean
}

export function SkillOutput({ output, maxHeight = 400, compact = false }: SkillOutputProps)
```

- ActionCard uses `compact={true}` (smaller fonts, tighter spacing)
- Run detail page and agent detail page use defaults
- `maxHeight` controls the scroll container height

## 8. Rendering Priority

When multiple keys match the same pattern, render in this order:
1. Score/gauge keys first (the headline number)
2. Categories (the breakdown)
3. Issues/findings (what's wrong)
4. Recommendations (what to do)
5. Signals (positive/negative lists)
6. Data tables/cards (supporting detail)
7. Prose/text (narrative content)
8. Everything else

This ensures the most important information appears at the top regardless of JSON key order.

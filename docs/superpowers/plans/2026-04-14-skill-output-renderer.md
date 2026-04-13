# Smart Skill Output Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all raw JSON skill output rendering with a single pattern-detecting universal renderer that produces human-friendly UI.

**Architecture:** One new component (`SkillOutput`) detects common output patterns (scores, issues, recommendations, card grids, metric dashboards, tables) and renders each key with the best-fit sub-component. It replaces DefaultOutput in agent-output.tsx, the raw JSON in action-card.tsx, and the raw JSON in the run detail page.

**Tech Stack:** React, TypeScript, Tailwind CSS, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-04-14-skill-output-renderer-design.md`

---

## File Map

### New File

| File | Responsibility |
|------|---------------|
| `src/components/ui/skill-output.tsx` | Universal pattern-detecting renderer. Single export: `SkillOutput`. All sub-components internal. |

### Modified Files

| File | Change |
|------|--------|
| `src/components/agents/agent-output.tsx` | Replace `DefaultOutput` body with `<SkillOutput>` |
| `src/components/chat/action-card.tsx` | Replace `<pre>{JSON.stringify(...)}</pre>` with `<SkillOutput compact>` |
| `src/app/dashboard/runs/[runId]/page.tsx` | Replace `<pre>{JSON.stringify(...)}</pre>` with `<SkillOutput>` |

---

## Task 1: Create SkillOutput component — pattern detection + all sub-components

**Files:**
- Create: `src/components/ui/skill-output.tsx`

This is the core of the entire feature — one file with all rendering logic.

- [ ] **Step 1: Create the complete SkillOutput component**

Create `src/components/ui/skill-output.tsx` with the following content:

```tsx
'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SkillOutputProps {
  output: Record<string, unknown> | string | null
  maxHeight?: number
  compact?: boolean
}

// ---------------------------------------------------------------------------
// Hidden keys — metadata, not user-facing
// ---------------------------------------------------------------------------

const HIDDEN_KEYS = new Set(['model', 'provider', '_mia_instruction', '_supplementary_data', '_data_gaps'])

function isHiddenKey(key: string): boolean {
  return HIDDEN_KEYS.has(key) || key.startsWith('_')
}

// ---------------------------------------------------------------------------
// Pattern detection
// ---------------------------------------------------------------------------

type PatternType =
  | 'score'
  | 'issues'
  | 'recommendations'
  | 'card_grid'
  | 'metrics'
  | 'data_table'
  | 'categories'
  | 'signal_positive'
  | 'signal_warning'
  | 'prose'
  | 'bullet_list'
  | 'text'
  | 'object'
  | 'fallback'

const SCORE_KEYS = /score|rating/i
const ISSUE_KEYS = /^(issues|findings|critical_findings|problems|errors|bugs)$/i
const REC_KEYS = /^(recommendations|action_items|next_steps|suggestions|actions|improvements)$/i
const POSITIVE_KEYS = /^(positive_signals|strengths|highlights|successes|wins|pros)$/i
const WARNING_KEYS = /^(data_gaps|warnings|risks|concerns|limitations|cons|missing)$/i
const TABLE_KEYS = /^(channels|allocations|by_product|by_channel|breakdown|products|competitors|segments|campaigns)$/i
const PROSE_KEYS = /^(content|summary|analysis|report|overview|description|explanation|narrative)$/i
const CATEGORY_KEYS = /^(categories|dimensions|pillars|areas)$/i

function isCardGridArray(val: unknown[]): boolean {
  if (val.length === 0) return false
  const objs = val.filter((v) => v && typeof v === 'object' && !Array.isArray(v)) as Record<string, unknown>[]
  if (objs.length < val.length * 0.5) return false
  const cardKeys = ['headline', 'title', 'name', 'heading', 'subject']
  const bodyKeys = ['body', 'description', 'text', 'primary_text', 'copy', 'detail']
  return objs.some((o) => {
    const keys = Object.keys(o).map((k) => k.toLowerCase())
    return cardKeys.some((ck) => keys.includes(ck)) || bodyKeys.some((bk) => keys.includes(bk))
  })
}

function isUniformObjectArray(val: unknown[]): boolean {
  if (val.length < 2) return false
  const objs = val.filter((v) => v && typeof v === 'object' && !Array.isArray(v)) as Record<string, unknown>[]
  if (objs.length < val.length * 0.8) return false
  const firstKeys = Object.keys(objs[0]!).sort().join(',')
  return objs.slice(1, 5).every((o) => Object.keys(o).sort().join(',') === firstKeys)
}

function isMostlyNumeric(obj: Record<string, unknown>): boolean {
  const values = Object.values(obj)
  if (values.length === 0) return false
  const numCount = values.filter((v) => typeof v === 'number').length
  return numCount / values.length >= 0.6
}

function isCategoryObject(obj: Record<string, unknown>): boolean {
  const values = Object.values(obj)
  if (values.length === 0) return false
  return values.every(
    (v) => v && typeof v === 'object' && !Array.isArray(v) &&
      ('status' in (v as Record<string, unknown>) || 'score' in (v as Record<string, unknown>)),
  )
}

function detectPattern(key: string, value: unknown): PatternType {
  // Key-specific rules first
  if (SCORE_KEYS.test(key) && typeof value === 'number') return 'score'
  if (ISSUE_KEYS.test(key) && Array.isArray(value)) return 'issues'
  if (REC_KEYS.test(key) && Array.isArray(value)) return 'recommendations'
  if (POSITIVE_KEYS.test(key) && Array.isArray(value)) return 'signal_positive'
  if (WARNING_KEYS.test(key) && Array.isArray(value)) return 'signal_warning'
  if (CATEGORY_KEYS.test(key) && typeof value === 'object' && !Array.isArray(value) && value !== null) {
    if (isCategoryObject(value as Record<string, unknown>)) return 'categories'
  }
  if (PROSE_KEYS.test(key) && typeof value === 'string' && value.length > 100) return 'prose'
  if (TABLE_KEYS.test(key) && Array.isArray(value) && isUniformObjectArray(value)) return 'data_table'

  // Value-shape rules
  if (Array.isArray(value)) {
    if (isCardGridArray(value)) return 'card_grid'
    if (isUniformObjectArray(value)) return 'data_table'
    if (value.every((v) => typeof v === 'string')) return 'bullet_list'
    // Array of non-uniform objects — try card grid as fallback
    if (value.length > 0 && value.every((v) => v && typeof v === 'object')) return 'card_grid'
    return 'bullet_list'
  }
  if (typeof value === 'string') {
    return value.length > 100 ? 'prose' : 'text'
  }
  if (typeof value === 'number' || typeof value === 'boolean') return 'text'
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    if (isMostlyNumeric(value as Record<string, unknown>)) return 'metrics'
    return 'object'
  }
  return 'fallback'
}

// ---------------------------------------------------------------------------
// Rendering priority — sort keys by importance
// ---------------------------------------------------------------------------

const PRIORITY: Record<PatternType, number> = {
  score: 0,
  categories: 1,
  issues: 2,
  recommendations: 3,
  signal_positive: 4,
  signal_warning: 5,
  metrics: 6,
  data_table: 7,
  card_grid: 8,
  prose: 9,
  bullet_list: 10,
  text: 11,
  object: 12,
  fallback: 13,
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({ label, compact }: { label: string; compact?: boolean }) {
  return (
    <p className={cn(
      'uppercase tracking-widest text-muted-foreground',
      compact ? 'text-[9px] mb-0.5' : 'text-[10px] mb-1.5',
    )}>
      {label.replace(/_/g, ' ')}
    </p>
  )
}

function ScoreGauge({ label, value, compact }: { label: string; value: number; compact?: boolean }) {
  const maxScore = value > 1 && value <= 10 ? 10 : 100
  const pct = Math.min(100, Math.max(0, (value / maxScore) * 100))
  const color = pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#e11d48'
  const size = compact ? 'h-14 w-14' : 'h-20 w-20'

  return (
    <div className="flex items-center gap-3">
      <div className={cn('relative shrink-0', size)}>
        <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
          <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="3" className="text-white/[0.06]" />
          <circle cx="18" cy="18" r="16" fill="none" stroke={color} strokeWidth="3" strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round" />
        </svg>
        <span className={cn('absolute inset-0 flex items-center justify-center font-bold font-heading text-foreground', compact ? 'text-xs' : 'text-sm')}>
          {value}
        </span>
      </div>
      <div>
        <p className={cn('font-medium text-foreground', compact ? 'text-[10px]' : 'text-sm')}>
          {label.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </p>
      </div>
    </div>
  )
}

function IssueList({ items, compact }: { items: unknown[]; compact?: boolean }) {
  return (
    <div className="space-y-2">
      {items.slice(0, compact ? 5 : 10).map((item, i) => {
        const obj = (typeof item === 'object' && item !== null ? item : { issue: String(item) }) as Record<string, unknown>
        const title = String(obj.issue ?? obj.finding ?? obj.problem ?? obj.title ?? obj.name ?? item)
        const detail = obj.evidence ?? obj.description ?? obj.detail ?? obj.reason ?? obj.impact
        const severity = String(obj.severity ?? obj.status ?? obj.priority ?? 'medium').toLowerCase()
        const dotColor = severity.includes('critical') || severity.includes('high') || severity.includes('red')
          ? '#e11d48'
          : severity.includes('low') || severity.includes('healthy') || severity.includes('green')
            ? '#10b981'
            : '#f59e0b'

        return (
          <div key={i} className="flex gap-2">
            <span className="mt-1.5 h-2 w-2 rounded-full shrink-0" style={{ background: dotColor }} />
            <div className="min-w-0">
              <p className={cn('text-foreground', compact ? 'text-[11px]' : 'text-xs font-medium')}>{title}</p>
              {detail && (
                <p className={cn('text-muted-foreground line-clamp-2', compact ? 'text-[10px]' : 'text-[11px] mt-0.5')}>
                  {String(detail)}
                </p>
              )}
            </div>
          </div>
        )
      })}
      {items.length > (compact ? 5 : 10) && (
        <p className="text-[10px] text-muted-foreground/50">+{items.length - (compact ? 5 : 10)} more</p>
      )}
    </div>
  )
}

function RecommendationList({ items, compact }: { items: unknown[]; compact?: boolean }) {
  return (
    <div className="space-y-1.5">
      {items.slice(0, compact ? 5 : 10).map((item, i) => {
        const isObj = typeof item === 'object' && item !== null
        const obj = (isObj ? item : {}) as Record<string, unknown>
        const title = isObj
          ? String(obj.action ?? obj.recommendation ?? obj.title ?? obj.suggestion ?? obj.name ?? item)
          : String(item)
        const detail = isObj ? (obj.detail ?? obj.description ?? obj.reason ?? obj.impact) : undefined

        return (
          <div key={i} className="flex gap-2">
            <span className={cn('shrink-0 font-bold text-[#6366f1]', compact ? 'text-[10px]' : 'text-xs')}>
              {i + 1}.
            </span>
            <div className="min-w-0">
              <p className={cn('text-foreground', compact ? 'text-[11px]' : 'text-xs')}>{title}</p>
              {detail && (
                <p className={cn('text-muted-foreground line-clamp-2', compact ? 'text-[10px]' : 'text-[11px] mt-0.5')}>
                  {String(detail)}
                </p>
              )}
            </div>
          </div>
        )
      })}
      {items.length > (compact ? 5 : 10) && (
        <p className="text-[10px] text-muted-foreground/50">+{items.length - (compact ? 5 : 10)} more</p>
      )}
    </div>
  )
}

function CardGrid({ items, compact }: { items: unknown[]; compact?: boolean }) {
  const cards = items.slice(0, compact ? 4 : 6)
  return (
    <div className={cn('grid gap-2', compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2')}>
      {cards.map((item, i) => {
        const obj = (typeof item === 'object' && item !== null ? item : { content: String(item) }) as Record<string, unknown>
        const title = String(obj.headline ?? obj.title ?? obj.name ?? obj.heading ?? obj.subject ?? '')
        const body = String(obj.body ?? obj.description ?? obj.text ?? obj.primary_text ?? obj.copy ?? obj.detail ?? obj.content ?? '')
        const accent = obj.cta ?? obj.status ?? obj.type ?? obj.category
        const score = obj.score ?? obj.rating

        return (
          <div key={i} className="rounded-lg bg-white/[0.04] border border-white/[0.06] p-3 space-y-1">
            {title && <p className={cn('font-semibold text-foreground', compact ? 'text-[11px]' : 'text-xs')}>{title}</p>}
            {body && body !== title && (
              <p className={cn('text-muted-foreground line-clamp-3', compact ? 'text-[10px]' : 'text-[11px]')}>{body}</p>
            )}
            <div className="flex items-center gap-2">
              {accent && (
                <span className="text-[10px] font-medium text-[#6366f1]">{String(accent)}</span>
              )}
              {score !== undefined && (
                <span className="text-[10px] font-mono text-foreground/70">{String(score)}</span>
              )}
            </div>
          </div>
        )
      })}
      {items.length > (compact ? 4 : 6) && (
        <p className="text-[10px] text-muted-foreground/50 col-span-full">+{items.length - (compact ? 4 : 6)} more</p>
      )}
    </div>
  )
}

function MetricsRow({ data, compact }: { data: Record<string, unknown>; compact?: boolean }) {
  const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined).slice(0, compact ? 6 : 9)
  return (
    <div className={cn('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3')}>
      {entries.map(([key, val]) => {
        let display = String(val)
        if (typeof val === 'number') {
          if (key.includes('margin') || key.includes('rate') || key.includes('percent') || key.includes('pct')) {
            display = `${(val * (val < 1 ? 100 : 1)).toFixed(1)}%`
          } else if (key.includes('cost') || key.includes('revenue') || key.includes('spend') || key.includes('price') || key.includes('cac') || key.includes('ltv')) {
            display = `$${val.toLocaleString()}`
          } else {
            display = val.toLocaleString()
          }
        }
        return (
          <div key={key} className="rounded-lg bg-white/[0.04] border border-white/[0.06] p-2.5 text-center">
            <p className={cn('font-heading font-bold text-foreground', compact ? 'text-sm' : 'text-lg')}>{display}</p>
            <p className={cn('text-muted-foreground capitalize', compact ? 'text-[9px]' : 'text-[10px]')}>
              {key.replace(/_/g, ' ')}
            </p>
          </div>
        )
      })}
    </div>
  )
}

function DataTable({ items, compact }: { items: Record<string, unknown>[]; compact?: boolean }) {
  if (items.length === 0) return null
  const columns = Object.keys(items[0]!)
  const rows = items.slice(0, compact ? 5 : 10)

  return (
    <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/[0.06]">
            {columns.map((col) => (
              <th key={col} className={cn(
                'px-3 py-2 text-muted-foreground font-medium capitalize',
                typeof items[0]![col] === 'number' ? 'text-right' : 'text-left',
              )}>
                {col.replace(/_/g, ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-white/[0.03]">
              {columns.map((col) => (
                <td key={col} className={cn(
                  'px-3 py-2 text-foreground',
                  typeof row[col] === 'number' ? 'text-right font-mono' : 'text-left',
                )}>
                  {typeof row[col] === 'number' ? Number(row[col]).toLocaleString() : String(row[col] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {items.length > (compact ? 5 : 10) && (
        <p className="text-[10px] text-muted-foreground/50 px-3 py-2">+{items.length - (compact ? 5 : 10)} more rows</p>
      )}
    </div>
  )
}

function CategoryCards({ data, compact }: { data: Record<string, Record<string, unknown>>; compact?: boolean }) {
  return (
    <div className={cn('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3')}>
      {Object.entries(data).map(([key, cat]) => {
        const status = String(cat.status ?? '').toLowerCase()
        const dotColor = status === 'healthy' || status === 'good' || status === 'green'
          ? '#10b981'
          : status === 'critical' || status === 'red' || status === 'bad'
            ? '#e11d48'
            : '#f59e0b'

        return (
          <div key={key} className="rounded-lg bg-white/[0.04] border border-white/[0.06] p-2">
            <div className="flex items-center justify-between mb-0.5">
              <p className="text-[10px] text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</p>
              <span className="w-2 h-2 rounded-full" style={{ background: dotColor }} />
            </div>
            {cat.score !== undefined && (
              <p className={cn('font-bold font-heading text-foreground', compact ? 'text-xs' : 'text-sm')}>{String(cat.score)}</p>
            )}
            {cat.summary && (
              <p className={cn('text-muted-foreground line-clamp-2', compact ? 'text-[9px]' : 'text-[10px]')}>{String(cat.summary)}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SignalList({ items, color, compact }: { items: unknown[]; color: 'green' | 'amber'; compact?: boolean }) {
  const dotColor = color === 'green' ? '#10b981' : '#f59e0b'
  const limit = compact ? 3 : 5
  return (
    <div className="space-y-1">
      {items.slice(0, limit).map((item, i) => (
        <div key={i} className="flex gap-2 items-start">
          <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: dotColor }} />
          <p className={cn('text-muted-foreground', compact ? 'text-[10px]' : 'text-xs')}>{String(item)}</p>
        </div>
      ))}
      {items.length > limit && (
        <p className="text-[10px] text-muted-foreground/50 ml-3.5">+{items.length - limit} more</p>
      )}
    </div>
  )
}

function ProseBlock({ text, compact }: { text: string; compact?: boolean }) {
  return (
    <div className={cn(
      'text-foreground/80 whitespace-pre-wrap leading-relaxed',
      compact ? 'text-[11px] max-h-40' : 'text-xs max-h-60',
      'overflow-auto',
    )}>
      {text.slice(0, 3000)}
    </div>
  )
}

function FallbackValue({ value }: { value: unknown }) {
  return (
    <div className="rounded-lg bg-black/20 p-2.5 text-[11px] font-mono text-muted-foreground max-h-40 overflow-auto">
      <pre className="whitespace-pre-wrap break-words">
        {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Value renderer — picks sub-component based on detected pattern
// ---------------------------------------------------------------------------

function RenderValue({ keyName, value, compact }: { keyName: string; value: unknown; compact?: boolean }) {
  const pattern = detectPattern(keyName, value)

  switch (pattern) {
    case 'score':
      return <ScoreGauge label={keyName} value={value as number} compact={compact} />
    case 'issues':
      return <IssueList items={value as unknown[]} compact={compact} />
    case 'recommendations':
      return <RecommendationList items={value as unknown[]} compact={compact} />
    case 'card_grid':
      return <CardGrid items={value as unknown[]} compact={compact} />
    case 'metrics':
      return <MetricsRow data={value as Record<string, unknown>} compact={compact} />
    case 'data_table':
      return <DataTable items={value as Record<string, unknown>[]} compact={compact} />
    case 'categories':
      return <CategoryCards data={value as Record<string, Record<string, unknown>>} compact={compact} />
    case 'signal_positive':
      return <SignalList items={value as unknown[]} color="green" compact={compact} />
    case 'signal_warning':
      return <SignalList items={value as unknown[]} color="amber" compact={compact} />
    case 'prose':
      return <ProseBlock text={value as string} compact={compact} />
    case 'bullet_list':
      return (
        <div className="space-y-1">
          {(value as unknown[]).slice(0, compact ? 5 : 8).map((item, i) => (
            <p key={i} className={cn('text-muted-foreground', compact ? 'text-[10px]' : 'text-xs')}>
              • {typeof item === 'string' ? item : JSON.stringify(item).slice(0, 200)}
            </p>
          ))}
          {(value as unknown[]).length > (compact ? 5 : 8) && (
            <p className="text-[10px] text-muted-foreground/50">+{(value as unknown[]).length - (compact ? 5 : 8)} more</p>
          )}
        </div>
      )
    case 'text':
      return <p className={cn('text-foreground', compact ? 'text-[11px]' : 'text-xs')}>{String(value)}</p>
    case 'object': {
      // Recursive render for nested objects
      const obj = value as Record<string, unknown>
      const entries = Object.entries(obj).filter(([k]) => !isHiddenKey(k))
      return (
        <div className={cn('space-y-3 pl-2 border-l-2 border-white/[0.06]', compact ? 'ml-1' : 'ml-2')}>
          {entries.slice(0, 8).map(([k, v]) => (
            <div key={k}>
              <SectionHeader label={k} compact={compact} />
              <RenderValue keyName={k} value={v} compact={compact} />
            </div>
          ))}
        </div>
      )
    }
    default:
      return <FallbackValue value={value} />
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function SkillOutput({ output, maxHeight = 400, compact = false }: SkillOutputProps) {
  const [expanded, setExpanded] = useState(false)

  if (!output) {
    return <p className="text-xs text-muted-foreground py-4 text-center">No output available.</p>
  }

  if (typeof output === 'string') {
    return <ProseBlock text={output} compact={compact} />
  }

  // Filter hidden keys and detect patterns for sorting
  const entries = Object.entries(output)
    .filter(([key]) => !isHiddenKey(key))
    .map(([key, value]) => ({ key, value, pattern: detectPattern(key, value) }))
    .sort((a, b) => (PRIORITY[a.pattern] ?? 13) - (PRIORITY[b.pattern] ?? 13))

  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground py-4 text-center">No output available.</p>
  }

  // In compact mode, show first 4 sections collapsed by default
  const visibleEntries = compact && !expanded ? entries.slice(0, 4) : entries
  const hasMore = compact && !expanded && entries.length > 4

  return (
    <div className={cn('space-y-4 overflow-auto', compact ? 'space-y-3' : '')} style={{ maxHeight }}>
      {visibleEntries.map(({ key, value }) => (
        <div key={key}>
          {/* Don't show header for score gauges — they self-label */}
          {detectPattern(key, value) !== 'score' && (
            <SectionHeader label={key} compact={compact} />
          )}
          <RenderValue keyName={key} value={value} compact={compact} />
        </div>
      ))}
      {hasMore && (
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1 text-[10px] text-[#6366f1] hover:text-[#818cf8] transition-colors"
        >
          <ChevronDown className="h-3 w-3" />
          Show {entries.length - 4} more sections
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors (ignore any pre-existing errors in `scripts/` directory)

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/skill-output.tsx
git commit -m "feat: SkillOutput — universal pattern-detecting skill output renderer"
```

---

## Task 2: Replace DefaultOutput in agent-output.tsx

**Files:**
- Modify: `src/components/agents/agent-output.tsx`

- [ ] **Step 1: Read the current file**

Read `src/components/agents/agent-output.tsx` to see the full current state.

- [ ] **Step 2: Add import for SkillOutput**

At the top of the file, after `'use client'`, add:
```typescript
import { SkillOutput } from '@/components/ui/skill-output'
```

- [ ] **Step 3: Replace the DefaultOutput function body**

Replace the entire `DefaultOutput` function (the function that starts with `function DefaultOutput({ output }:` and handles both string and object output) with:

```typescript
function DefaultOutput({ output }: { output: Record<string, unknown> | string }) {
  return <SkillOutput output={typeof output === 'string' ? { content: output } : output} />
}
```

This preserves the function name and signature so the `switch` statement in `AgentOutput` that calls `<DefaultOutput output={output} />` still works. But now it delegates to the smart renderer.

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/components/agents/agent-output.tsx
git commit -m "feat: agent-output DefaultOutput now uses SkillOutput renderer"
```

---

## Task 3: Replace raw JSON in ActionCard

**Files:**
- Modify: `src/components/chat/action-card.tsx`

- [ ] **Step 1: Read the current file**

Read `src/components/chat/action-card.tsx`.

- [ ] **Step 2: Add import for SkillOutput**

At the top of the file, after existing imports, add:
```typescript
import { SkillOutput } from '@/components/ui/skill-output'
```

- [ ] **Step 3: Replace the expanded output block**

Find this block (around lines 100-107):
```tsx
      {/* Expanded output */}
      {expanded && state.output && (
        <div className="mt-2 rounded-lg bg-black/20 p-2.5 text-[11px] font-mono text-muted-foreground max-h-60 overflow-auto">
          <pre className="whitespace-pre-wrap break-words">
            {JSON.stringify(state.output, null, 2)}
          </pre>
        </div>
      )}
```

Replace with:
```tsx
      {/* Expanded output */}
      {expanded && state.output && (
        <div className="mt-2">
          <SkillOutput output={state.output} compact maxHeight={240} />
        </div>
      )}
```

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/action-card.tsx
git commit -m "feat: ActionCard uses SkillOutput instead of raw JSON"
```

---

## Task 4: Replace raw JSON in run detail page

**Files:**
- Modify: `src/app/dashboard/runs/[runId]/page.tsx`

- [ ] **Step 1: Read the current file**

Read `src/app/dashboard/runs/[runId]/page.tsx`.

- [ ] **Step 2: Add import for SkillOutput**

At the top of the file, with other imports, add:
```typescript
import { SkillOutput } from '@/components/ui/skill-output'
```

- [ ] **Step 3: Replace the raw JSON output block**

Find this block (around lines 204-218):
```tsx
      {/* Output */}
      {run.output && (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border/30">
            <h2 className="font-heading font-semibold text-sm text-foreground">
              Output
            </h2>
          </div>
          <div className="p-6">
            <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap break-words bg-black/20 rounded-xl p-4 max-h-96 overflow-y-auto">
              {JSON.stringify(run.output, null, 2)}
            </pre>
          </div>
        </div>
      )}
```

Replace with:
```tsx
      {/* Output */}
      {run.output && (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border/30">
            <h2 className="font-heading font-semibold text-sm text-foreground">
              Output
            </h2>
          </div>
          <div className="p-6">
            <SkillOutput output={run.output as Record<string, unknown>} maxHeight={600} />
          </div>
        </div>
      )}
```

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add "src/app/dashboard/runs/[runId]/page.tsx"
git commit -m "feat: run detail page uses SkillOutput instead of raw JSON"
```

---

## Task 5: Final type check and push

- [ ] **Step 1: Final type check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 2: Push**

```bash
git push
```

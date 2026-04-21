'use client'

import { useEffect, useState } from 'react'
import { AudienceTierCard, type AudienceTier } from './AudienceTierCard'

interface AudienceStepProps {
  brandId: string
  objective: string
  dailyBudget: number
  onConfirm: (selectedTiers: AudienceTier[]) => void
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; summary: string; fallback: string | null }
  | { kind: 'error'; message: string }

interface SkillRunResponse {
  success: boolean
  data?: {
    status: 'completed' | 'failed' | 'blocked'
    output: Record<string, unknown>
    error?: string
  }
  error?: { code: string; message: string }
}

interface SkillOutput {
  tiers?: AudienceTier[]
  summary?: string
  fallback_reason?: string | null
  error?: string
  recommendation?: string
}

export function AudienceStep({ brandId, objective, dailyBudget, onConfirm }: AudienceStepProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [feedback, setFeedback] = useState('')
  const [tiers, setTiers] = useState<AudienceTier[]>([])

  async function runSkill(userFeedback?: string) {
    setState({ kind: 'loading' })
    try {
      const res = await fetch('/api/skills/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          skillId: 'audience-targeting',
          additionalContext: {
            objective,
            daily_budget: dailyBudget,
            ...(userFeedback ? { user_feedback: userFeedback } : {}),
          },
        }),
      })
      const body = (await res.json()) as SkillRunResponse
      if (!res.ok || !body.success || !body.data) {
        setState({ kind: 'error', message: body.error?.message ?? 'Audience skill failed' })
        return
      }
      if (body.data.status !== 'completed') {
        setState({ kind: 'error', message: body.data.error ?? `Skill ${body.data.status}` })
        return
      }
      const output = body.data.output as SkillOutput
      if (output.error) {
        const hint = output.recommendation ? ` ${output.recommendation}` : ''
        setState({ kind: 'error', message: `${output.error}.${hint}` })
        return
      }
      const nextTiers = output.tiers ?? []
      setTiers(nextTiers)
      setSelected(new Set(nextTiers.map((_, i) => i)))
      setState({
        kind: 'ready',
        summary: output.summary ?? '',
        fallback: output.fallback_reason ?? null,
      })
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Network error' })
    }
  }

  useEffect(() => {
    runSkill()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId])

  function toggle(i: number) {
    const next = new Set(selected)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    setSelected(next)
  }

  function editTier(i: number, updated: AudienceTier) {
    const next = [...tiers]
    next[i] = updated
    setTiers(next)
  }

  if (state.kind === 'loading') {
    return <div className="text-sm text-zinc-500">Max is proposing audience tiers…</div>
  }
  if (state.kind === 'error') {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        {state.message}{' '}
        <button onClick={() => runSkill()} className="underline">Retry</button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Audience</h3>
        {state.summary && <p className="text-sm text-zinc-600">{state.summary}</p>}
        {state.fallback && (
          <p className="text-xs text-amber-700 mt-1">Note: {state.fallback.replace(/_/g, ' ')}.</p>
        )}
      </div>

      <div className="space-y-3">
        {tiers.map((tier, i) => (
          <AudienceTierCard
            key={i}
            tier={tier}
            selected={selected.has(i)}
            onToggle={() => toggle(i)}
            onEdit={updated => editTier(i, updated)}
          />
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-zinc-300 p-3">
        <p className="text-sm mb-2">Not quite right? Tell Max what to change:</p>
        <textarea
          value={feedback}
          onChange={e => setFeedback(e.target.value)}
          placeholder="e.g. focus on tier-2 cities only; exclude 18-24; emphasize repeat-purchase intent"
          className="w-full rounded border border-zinc-300 p-2 text-sm"
          rows={2}
        />
        <button
          onClick={() => runSkill(feedback)}
          disabled={!feedback.trim()}
          className="mt-2 rounded bg-zinc-900 text-white text-sm px-3 py-1 disabled:opacity-50"
        >
          Ask Max to re-propose
        </button>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => onConfirm(Array.from(selected).map(i => tiers[i]!).filter(Boolean))}
          disabled={selected.size === 0}
          className="rounded bg-emerald-600 text-white px-4 py-2 disabled:opacity-50"
        >
          Use {selected.size} tier{selected.size === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  )
}

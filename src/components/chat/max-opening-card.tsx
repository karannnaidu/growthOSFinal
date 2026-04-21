'use client'

import { useState } from 'react'

export interface MaxOpeningPayload {
  preflight_verdict: 'ready' | 'warning' | 'blocked'
  preflight_summary: string
  budget_suggestion: { min: number; max: number; currency: string }
  requires_user_input: string[]
}

export function MaxOpeningCard({
  payload,
  onSubmit,
}: {
  payload: MaxOpeningPayload
  onSubmit: (input: { angle: string; budget: number; proposeAll: boolean }) => void
}) {
  const [angle, setAngle] = useState('')
  const [budget, setBudget] = useState(payload.budget_suggestion.max)

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm space-y-3">
      <div>
        <div className="text-xs text-zinc-500 mb-1">Pre-flight</div>
        <div>{payload.preflight_summary}</div>
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Angle / theme for this campaign</label>
        <input
          type="text"
          value={angle}
          onChange={e => setAngle(e.target.value)}
          placeholder="e.g. Diwali sale — 20% off skincare"
          className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">
          Budget ({payload.budget_suggestion.currency})/day — I suggest {payload.budget_suggestion.min}–{payload.budget_suggestion.max}
        </label>
        <input
          type="number"
          value={budget}
          onChange={e => setBudget(Number(e.target.value))}
          className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onSubmit({ angle, budget, proposeAll: false })}
          disabled={!angle.trim() || budget <= 0}
          className="rounded bg-zinc-900 text-white text-sm px-3 py-1 disabled:opacity-50"
        >
          Submit
        </button>
        <button
          onClick={() => onSubmit({ angle: '', budget: payload.budget_suggestion.max, proposeAll: true })}
          className="rounded border border-zinc-300 text-sm px-3 py-1"
        >
          Propose everything
        </button>
      </div>
    </div>
  )
}

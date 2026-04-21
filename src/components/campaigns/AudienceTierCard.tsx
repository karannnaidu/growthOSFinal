'use client'

import { useState } from 'react'

export interface AudienceTier {
  name: string
  source: 'brand_dna' | 'meta_history' | 'fusion'
  targeting: Record<string, unknown>
  reasoning: string
  expected_weekly_reach_estimate?: string
}

export function AudienceTierCard({
  tier,
  selected,
  onToggle,
  onEdit,
}: {
  tier: AudienceTier
  selected: boolean
  onToggle: () => void
  onEdit: (next: AudienceTier) => void
}) {
  const [showReasoning, setShowReasoning] = useState(false)
  const targetingJson = JSON.stringify(tier.targeting, null, 2)
  const [editingJson, setEditingJson] = useState(false)
  const [jsonDraft, setJsonDraft] = useState(targetingJson)
  const [jsonError, setJsonError] = useState<string | null>(null)

  function saveJson() {
    try {
      const parsed = JSON.parse(jsonDraft) as Record<string, unknown>
      onEdit({ ...tier, targeting: parsed })
      setEditingJson(false)
      setJsonError(null)
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : 'Invalid JSON')
    }
  }

  return (
    <div className={`rounded-lg border p-4 ${selected ? 'border-emerald-400 bg-emerald-50/40' : 'border-zinc-200'}`}>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="mt-1"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{tier.name}</span>
            <SourceBadge source={tier.source} />
          </div>
          {tier.expected_weekly_reach_estimate && (
            <div className="text-xs text-zinc-500 mt-1">
              ~{tier.expected_weekly_reach_estimate}/week reach
            </div>
          )}
        </div>
      </label>

      <div className="mt-3 flex items-center gap-4 text-xs">
        <button onClick={() => setShowReasoning(s => !s)} className="underline text-zinc-600">
          {showReasoning ? 'Hide reasoning' : 'Why this tier'}
        </button>
        <button onClick={() => setEditingJson(e => !e)} className="underline text-zinc-600">
          {editingJson ? 'Cancel edit' : 'Edit targeting'}
        </button>
      </div>

      {showReasoning && (
        <p className="mt-2 text-xs text-zinc-700">{tier.reasoning}</p>
      )}

      {editingJson && (
        <div className="mt-3">
          <textarea
            className="w-full rounded border border-zinc-300 p-2 font-mono text-xs"
            rows={10}
            value={jsonDraft}
            onChange={e => setJsonDraft(e.target.value)}
          />
          {jsonError && <p className="text-xs text-red-600 mt-1">{jsonError}</p>}
          <div className="mt-2 flex gap-2">
            <button onClick={saveJson} className="rounded bg-zinc-900 text-white text-xs px-3 py-1">
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SourceBadge({ source }: { source: AudienceTier['source'] }) {
  const label = source === 'brand_dna' ? 'Brand DNA' : source === 'meta_history' ? 'From your data' : 'Fusion'
  const cls =
    source === 'brand_dna' ? 'bg-violet-100 text-violet-900' :
    source === 'meta_history' ? 'bg-sky-100 text-sky-900' :
    'bg-emerald-100 text-emerald-900'
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cls}`}>{label}</span>
}

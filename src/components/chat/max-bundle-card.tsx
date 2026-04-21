'use client'

import { useState } from 'react'
import { AudienceTierCard, type AudienceTier } from '@/components/campaigns/AudienceTierCard'

export interface MaxBundlePayload {
  audience: { tiers: AudienceTier[] }
  copy: { variants: Array<{ headline: string; body: string; cta: string }> }
  image_brief: { summary: string }
}

export function MaxBundleCard({
  payload,
  onApprove,
}: {
  payload: MaxBundlePayload
  onApprove: (approved: {
    selectedTiers: AudienceTier[]
    selectedCopyIdx: number
    imageBriefSummary: string
  }) => void
}) {
  const [tiers, setTiers] = useState(payload.audience.tiers)
  const [tierSelected, setTierSelected] = useState<Set<number>>(new Set(payload.audience.tiers.map((_, i) => i)))
  const [copyIdx, setCopyIdx] = useState(0)

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 space-y-4">
      <section>
        <h4 className="font-medium mb-2">Audience</h4>
        <div className="space-y-2">
          {tiers.map((tier, i) => (
            <AudienceTierCard
              key={i}
              tier={tier}
              selected={tierSelected.has(i)}
              onToggle={() => {
                const next = new Set(tierSelected)
                if (next.has(i)) next.delete(i); else next.add(i)
                setTierSelected(next)
              }}
              onEdit={(updated) => {
                const copy = [...tiers]
                copy[i] = updated
                setTiers(copy)
              }}
            />
          ))}
        </div>
      </section>

      <section>
        <h4 className="font-medium mb-2">Copy variants</h4>
        <div className="space-y-2">
          {payload.copy.variants.map((v, i) => (
            <label key={i} className={`block rounded border p-3 text-sm cursor-pointer ${copyIdx === i ? 'border-emerald-400 bg-emerald-50/40' : 'border-zinc-200'}`}>
              <input
                type="radio"
                name="copy"
                checked={copyIdx === i}
                onChange={() => setCopyIdx(i)}
                className="mr-2"
              />
              <strong>{v.headline}</strong>
              <p className="text-xs text-zinc-600 mt-1">{v.body}</p>
              <p className="text-xs text-zinc-500 mt-1">CTA: {v.cta}</p>
            </label>
          ))}
        </div>
      </section>

      <section>
        <h4 className="font-medium mb-2">Image brief</h4>
        <p className="text-sm text-zinc-700">{payload.image_brief.summary}</p>
      </section>

      <button
        onClick={() =>
          onApprove({
            selectedTiers: Array.from(tierSelected).map(i => tiers[i]!).filter(Boolean),
            selectedCopyIdx: copyIdx,
            imageBriefSummary: payload.image_brief.summary,
          })
        }
        disabled={tierSelected.size === 0}
        className="w-full rounded bg-emerald-600 text-white px-4 py-2 disabled:opacity-50"
      >
        Approve & generate images
      </button>
    </div>
  )
}

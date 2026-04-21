'use client'

import type { PreflightResult } from '@/lib/preflight-types'

export function MaxHandoffCard({ preflight }: { preflight: PreflightResult }) {
  const color =
    preflight.verdict === 'blocked' ? 'border-red-300 bg-red-50' :
    preflight.verdict === 'warning' ? 'border-amber-300 bg-amber-50' :
    'border-emerald-300 bg-emerald-50'

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${color}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Max</span>
        <span className="text-xs text-zinc-400">pre-flight</span>
      </div>
      <div className="font-medium">
        {preflight.verdict === 'ready' && 'All systems go.'}
        {preflight.verdict === 'warning' && `Ready to proceed with ${preflight.warnings.length} warning(s).`}
        {preflight.verdict === 'blocked' && `Can't launch yet: ${preflight.blocked_reason}`}
      </div>
      {preflight.warnings.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {preflight.warnings.map((w, i) => (
            <li key={i}>• {w.message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

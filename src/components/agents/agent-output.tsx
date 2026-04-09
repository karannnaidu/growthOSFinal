'use client'

interface AgentOutputProps {
  agentId: string
  output: Record<string, unknown> | string | null
}

// ---------------------------------------------------------------------------
// Per-agent output renderers
// ---------------------------------------------------------------------------

function HugoOutput({ output }: { output: Record<string, unknown> }) {
  const scores = (output.scores ?? output.audit ?? output) as Record<string, number | string>
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-foreground">SEO Audit Scores</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {Object.entries(scores).map(([key, val]) => (
          <div
            key={key}
            className="rounded-lg bg-white/[0.04] border border-white/[0.06] p-2.5 text-center"
          >
            <p className="text-lg font-heading font-bold text-foreground">{String(val)}</p>
            <p className="text-[10px] text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function AriaOutput({ output }: { output: Record<string, unknown> }) {
  const items = (output.creatives ?? output.variants ?? output.cards ?? [output]) as Record<string, unknown>[]
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-foreground">Creative Previews</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map((item, i) => {
          const headline = item.headline ? String(item.headline) : null
          const body = item.body ? String(item.body) : null
          const cta = item.cta ? String(item.cta) : null
          return (
            <div
              key={i}
              className="rounded-lg bg-white/[0.04] border border-white/[0.06] p-3 space-y-1"
            >
              {headline && (
                <p className="text-xs font-semibold text-foreground">{headline}</p>
              )}
              {body && (
                <p className="text-[11px] text-muted-foreground line-clamp-3">{body}</p>
              )}
              {cta && (
                <p className="text-[10px] font-medium" style={{ color: '#F97316' }}>{cta}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MaxOutput({ output }: { output: Record<string, unknown> }) {
  const allocations = (output.allocations ?? output.channels ?? output) as Record<string, unknown>
  const entries = Array.isArray(allocations) ? allocations : Object.entries(allocations)
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-foreground">Budget Allocation</p>
      <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-left px-3 py-2 text-muted-foreground font-medium">Channel</th>
              <th className="text-right px-3 py-2 text-muted-foreground font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(Array.isArray(entries) ? entries : []).map((entry, i) => {
              const [key, val] = Array.isArray(entry)
                ? entry
                : [String((entry as Record<string, unknown>).channel ?? i), (entry as Record<string, unknown>).amount ?? '']
              return (
                <tr key={i} className="border-b border-white/[0.03]">
                  <td className="px-3 py-2 text-foreground">{String(key)}</td>
                  <td className="px-3 py-2 text-right text-foreground font-mono">{String(val)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PennyOutput({ output }: { output: Record<string, unknown> }) {
  const metrics = (output.projections ?? output.forecast ?? output) as Record<string, unknown>
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-foreground">Financial Projections</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {Object.entries(metrics).map(([key, val]) => (
          <div
            key={key}
            className="rounded-lg bg-white/[0.04] border border-white/[0.06] p-2.5 text-center"
          >
            <p className="text-sm font-heading font-bold text-foreground font-mono">{String(val)}</p>
            <p className="text-[10px] text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function ScoutOutput({ output }: { output: Record<string, unknown> }) {
  const score = Number(output.health_score ?? output.healthScore ?? output.score ?? 0)
  const maxScore = 100
  const pct = Math.min(100, Math.max(0, (score / maxScore) * 100))
  const color = pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#e11d48'

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-foreground">Health Score</p>
      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0">
          <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
            <circle
              cx="18" cy="18" r="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-white/[0.06]"
            />
            <circle
              cx="18" cy="18" r="16"
              fill="none"
              stroke={color}
              strokeWidth="3"
              strokeDasharray={`${pct} ${100 - pct}`}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold font-heading text-foreground">
            {score}
          </span>
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          {Object.entries(output)
            .filter(([k]) => k !== 'health_score' && k !== 'healthScore' && k !== 'score')
            .slice(0, 4)
            .map(([k, v]) => (
              <p key={k}>
                <span className="capitalize">{k.replace(/_/g, ' ')}</span>: {String(v)}
              </p>
            ))}
        </div>
      </div>
    </div>
  )
}

function DefaultOutput({ output }: { output: Record<string, unknown> | string }) {
  const text = typeof output === 'string' ? output : JSON.stringify(output, null, 2)
  return (
    <pre className="text-[10px] text-muted-foreground font-mono whitespace-pre-wrap break-all max-h-60 overflow-auto">
      {text.slice(0, 3000)}
    </pre>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AgentOutput({ agentId, output }: AgentOutputProps) {
  if (!output) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">No output available yet.</p>
    )
  }

  if (typeof output === 'string') {
    return <DefaultOutput output={output} />
  }

  switch (agentId.toLowerCase()) {
    case 'hugo':
      return <HugoOutput output={output} />
    case 'aria':
      return <AriaOutput output={output} />
    case 'max':
      return <MaxOutput output={output} />
    case 'penny':
      return <PennyOutput output={output} />
    case 'scout':
      return <ScoutOutput output={output} />
    default:
      return <DefaultOutput output={output} />
  }
}

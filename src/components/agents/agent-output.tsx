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
  const score = Number(output.overall_score ?? output.health_score ?? output.score ?? 0)
  const categories = (output.categories ?? {}) as Record<string, { score: number | null; status: string; summary: string }>
  const positiveSignals = (output.positive_signals ?? []) as string[]
  const dataGaps = (output.data_gaps ?? []) as string[]
  const criticalFindings = (output.critical_findings ?? []) as Array<{ category: string; finding: string }>
  const maxScore = 100
  const pct = Math.min(100, Math.max(0, (score / maxScore) * 100))
  const color = pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#e11d48'

  return (
    <div className="space-y-4">
      {/* Overall score */}
      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0">
          <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
            <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="3" className="text-white/[0.06]" />
            <circle cx="18" cy="18" r="16" fill="none" stroke={color} strokeWidth="3" strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round" />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold font-heading text-foreground">{score}</span>
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Health Score</p>
          <p className="text-[10px] text-muted-foreground">{Object.keys(categories).length} categories analyzed</p>
        </div>
      </div>

      {/* Categories */}
      {Object.keys(categories).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Object.entries(categories).map(([key, cat]) => {
            const catColor = cat.status === 'healthy' ? '#10b981' : cat.status === 'warning' ? '#f59e0b' : cat.status === 'critical' ? '#e11d48' : '#6b7280'
            return (
              <div key={key} className="rounded-lg bg-white/[0.04] border border-white/[0.06] p-2">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-[10px] text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</p>
                  <span className="w-2 h-2 rounded-full" style={{ background: catColor }} />
                </div>
                <p className="text-sm font-bold font-heading text-foreground">{cat.score ?? '—'}</p>
                <p className="text-[9px] text-muted-foreground line-clamp-2">{cat.summary}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Critical findings */}
      {criticalFindings.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[#e11d48] mb-1">Critical Findings</p>
          {criticalFindings.map((f, i) => (
            <p key={i} className="text-xs text-muted-foreground">• {f.finding || String(f)}</p>
          ))}
        </div>
      )}

      {/* Positive signals */}
      {positiveSignals.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[#10b981] mb-1">Positive Signals</p>
          {positiveSignals.slice(0, 3).map((s, i) => (
            <p key={i} className="text-xs text-muted-foreground">• {s}</p>
          ))}
        </div>
      )}

      {/* Data gaps */}
      {dataGaps.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[#f59e0b] mb-1">Missing Data</p>
          {dataGaps.map((g, i) => (
            <p key={i} className="text-xs text-muted-foreground">• {g}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function DefaultOutput({ output }: { output: Record<string, unknown> | string }) {
  if (typeof output === 'string') {
    return (
      <div className="text-xs text-foreground/80 whitespace-pre-wrap max-h-80 overflow-auto leading-relaxed">
        {output.slice(0, 5000)}
      </div>
    )
  }

  // Render structured output as readable sections
  const { content, model, provider, ...rest } = output
  const displayObj = content ? { content } : rest

  return (
    <div className="space-y-3 max-h-80 overflow-auto">
      {Object.entries(displayObj).map(([key, val]) => {
        if (val === null || val === undefined) return null
        const isArray = Array.isArray(val)
        const isObject = typeof val === 'object' && !isArray
        return (
          <div key={key}>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{key.replace(/_/g, ' ')}</p>
            {typeof val === 'string' ? (
              <p className="text-xs text-foreground/80 whitespace-pre-wrap">{val.slice(0, 1000)}</p>
            ) : isArray ? (
              <div className="space-y-1">
                {(val as unknown[]).slice(0, 5).map((item, i) => (
                  <p key={i} className="text-xs text-muted-foreground">• {typeof item === 'string' ? item : JSON.stringify(item).slice(0, 200)}</p>
                ))}
                {(val as unknown[]).length > 5 && <p className="text-[10px] text-muted-foreground/50">+{(val as unknown[]).length - 5} more</p>}
              </div>
            ) : isObject ? (
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(val as Record<string, unknown>).slice(0, 8).map(([k, v]) => (
                  <div key={k} className="rounded bg-white/[0.04] px-2 py-1">
                    <p className="text-[9px] text-muted-foreground capitalize">{k.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-foreground truncate">{String(v)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-foreground font-mono">{String(val)}</p>
            )}
          </div>
        )
      })}
    </div>
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

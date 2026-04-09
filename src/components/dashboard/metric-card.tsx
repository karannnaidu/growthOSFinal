import { cn } from '@/lib/utils'

interface MetricCardProps {
  label: string
  value: string
  change?: string
  status: 'optimal' | 'stable' | 'declining'
  sparklineData?: number[]
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  optimal: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Optimal' },
  stable: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Stable' },
  declining: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'Declining' },
}

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(...data, 1)
  return (
    <div className="flex items-end gap-[3px] h-8" aria-hidden="true">
      {data.map((v, i) => (
        <div
          key={i}
          className="w-1.5 rounded-sm bg-[#6366f1]/60"
          style={{ height: `${Math.max((v / max) * 100, 8)}%` }}
        />
      ))}
    </div>
  )
}

export function MetricCard({ label, value, change, status, sparklineData }: MetricCardProps) {
  const s = (STATUS_STYLES[status] ?? STATUS_STYLES.stable) as { bg: string; text: string; label: string }

  return (
    <div className="glass-panel rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
          {label}
        </span>
        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', s.bg, s.text)}>
          {s.label}
        </span>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-mono text-2xl font-bold text-foreground leading-none">{value}</p>
          {change && (
            <span
              className={cn(
                'inline-block mt-1.5 text-xs font-medium',
                change.startsWith('+') ? 'text-emerald-400' : change.startsWith('-') ? 'text-red-400' : 'text-muted-foreground',
              )}
            >
              {change}
            </span>
          )}
        </div>
        {sparklineData && sparklineData.length > 0 && <Sparkline data={sparklineData} />}
      </div>
    </div>
  )
}

import Link from 'next/link'
import { Sparkles, ArrowRight } from 'lucide-react'

interface MorningBriefProps {
  narrative: string
  metricsContext: string
  latestRunId?: string
  brandId?: string
}

export function MorningBrief({
  narrative,
  metricsContext,
  latestRunId,
  brandId,
}: MorningBriefProps) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="glass-panel rounded-2xl p-6 md:p-8 relative overflow-hidden">
      {/* Subtle gradient accent */}
      <div
        className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl"
        style={{
          background: 'linear-gradient(90deg, #6366f1, #818cf8, #6366f1)',
        }}
        aria-hidden="true"
      />

      {/* Badge + date */}
      <div className="flex items-center gap-3 mb-4">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-[#6366f1]/15 text-[#6366f1] border border-[#6366f1]/20">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          Mia&apos;s Morning Brief
        </span>
        <span className="text-xs text-muted-foreground">{today}</span>
      </div>

      {/* Narrative */}
      <h2 className="font-heading text-xl md:text-2xl font-bold text-foreground leading-snug mb-3">
        {narrative}
      </h2>

      {/* Metrics context */}
      <p className="text-sm text-muted-foreground leading-relaxed mb-6 max-w-2xl">
        {metricsContext}
      </p>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/chat"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium
            bg-[#6366f1] text-white hover:bg-[#6366f1]/90 active:scale-[0.98]
            transition-all duration-150 shadow-lg shadow-[#6366f1]/20"
        >
          Execute Strategy
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>

        {latestRunId && (
          <Link
            href={`/dashboard/runs/${latestRunId}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium
              text-foreground border border-white/[0.1] hover:border-white/[0.2] hover:bg-white/[0.04]
              transition-all duration-150"
          >
            View Full Audit
          </Link>
        )}
      </div>
    </div>
  )
}

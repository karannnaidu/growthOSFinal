'use client'

import { ONE_CREW_CONTENT } from './landing-content'
import { useInViewport } from './use-in-viewport'
import { useReducedMotion } from './use-reduced-motion'
import { useCountUp } from './use-count-up'

function AgentPill({ name, live }: { name: string; live?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0D9488]/10 text-[#0D9488] text-[11px] font-semibold tracking-wide">
      {live && <span className="relative flex w-1.5 h-1.5">
        <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-75" />
        <span className="relative block w-1.5 h-1.5 rounded-full bg-green-500" />
      </span>}
      {name}
    </span>
  )
}

function CounterLine({ n, label, enabled }: { n: number; label: string; enabled: boolean }) {
  const value = useCountUp(n, 1200, enabled)
  return (
    <li className="flex items-baseline gap-2">
      <span className="font-heading font-bold text-2xl text-[#0D9488] tabular-nums">{value}</span>
      <span className="text-sm text-[#45464d]">{label}</span>
    </li>
  )
}

export function ResearchCard() {
  const { research } = ONE_CREW_CONTENT
  const { ref, inView } = useInViewport<HTMLDivElement>(0.3)
  const reduced = useReducedMotion()
  const enabled = inView && !reduced

  return (
    <div
      ref={ref}
      className="relative p-6 rounded-2xl bg-white border border-[#c6c6cd]/40 hover:shadow-[0_0_0_2px_#0D948833] transition-shadow overflow-hidden min-h-[480px] flex flex-col"
    >
      {/* Scanning line sweep */}
      {!reduced && (
        <div className="pointer-events-none absolute inset-x-0 h-1/3 bg-gradient-to-b from-transparent via-[#0D9488]/5 to-transparent animate-[sweep_6s_ease-in-out_infinite]" />
      )}

      <header className="space-y-4 mb-6">
        <span className="inline-block px-2.5 py-1 rounded-full bg-[#0D9488]/10 text-[#0D9488] text-[11px] font-bold uppercase tracking-wider">
          Research
        </span>
        <div className="flex flex-wrap gap-1.5">
          <AgentPill name="Scout" live />
          <AgentPill name="Echo" />
          <AgentPill name="Atlas" />
        </div>
      </header>

      <ul className="space-y-4 flex-1">
        {research.stats.map((s) => (
          <CounterLine key={s.label} n={s.number} label={`${s.label}`} enabled={enabled} />
        ))}
      </ul>
    </div>
  )
}

'use client'

import { PublicNav } from './public-nav'
import { PublicFooter } from './public-footer'
import { AnimatedGlassCard } from './animated-glass-card'
import { SECURITY_BADGES, SECURITY_PILLARS } from './landing-content'
import { useReducedMotion } from './use-reduced-motion'

function DataLaneDiagram() {
  const reduced = useReducedMotion()
  const brands = ['Brand A', 'Brand B', 'Brand C']
  return (
    <section className="py-16 bg-white">
      <div className="max-w-5xl mx-auto px-6">
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-center text-[#0b1c30] mb-10">
          One brand per lane. No crossover.
        </h2>
        <div className="space-y-4">
          {brands.map((b, i) => (
            <div
              key={b}
              className="relative h-14 rounded-lg bg-[#eff4ff] border border-[#c6c6cd]/30 flex items-center px-5 overflow-hidden"
            >
              <span className="font-semibold text-[#0b1c30] z-10">{b}</span>
              {!reduced && (
                <span
                  className="absolute top-1/2 -translate-y-1/2 w-24 h-6 rounded-full bg-gradient-to-r from-transparent via-[#6b38d4]/40 to-transparent pointer-events-none"
                  style={{ animation: `laneSweep 4s ease-in-out ${i * 0.6}s infinite` }}
                />
              )}
              <span className="ml-auto z-10 text-[#6b38d4] text-sm font-mono">🔒 isolated</span>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-[#45464d]">
          Row-level security at the database layer. Agents literally cannot query outside their brand&apos;s lane.
        </p>
      </div>
    </section>
  )
}

export default function SecurityPage() {
  const reduced = useReducedMotion()

  return (
    <div className="!bg-[#f8f9ff] !text-[#0b1c30] font-body selection:bg-[#e9ddff] selection:text-[#5516be] min-h-screen">
      <PublicNav />
      <main className="pt-20">
        {/* Hero */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-6 text-center space-y-6">
            <div className="inline-block relative">
              <div
                className="w-24 h-24 rounded-full bg-[#6b38d4]/15 flex items-center justify-center"
                style={{ animation: reduced ? 'none' : 'breathe 2.4s ease-in-out infinite' }}
              >
                <svg
                  className="w-12 h-12 text-[#6b38d4]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
            </div>
            <h1 className="font-heading font-bold text-4xl md:text-5xl lg:text-6xl text-[#0b1c30]">
              Your data is yours. Always.
            </h1>
            <p className="text-lg text-[#45464d] max-w-2xl mx-auto">
              Agents operate on your data in isolated lanes. Fully encrypted, fully logged, fully under your control.
            </p>
          </div>
        </section>

        {/* Badges */}
        <section className="py-12 bg-white border-y border-[#c6c6cd]/10">
          <div className="max-w-6xl mx-auto px-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {SECURITY_BADGES.map((b, i) => (
                <div
                  key={b.id}
                  className="rounded-xl border border-[#c6c6cd]/40 bg-white p-4 text-center hover:-translate-y-1 hover:shadow-md transition-all"
                  style={{ animation: reduced ? 'none' : `badgePop 400ms ease-out ${i * 80}ms both` }}
                >
                  <div className="font-heading font-bold text-sm text-[#0b1c30]">{b.label}</div>
                  <div className="text-[11px] text-[#45464d] mt-0.5">{b.note}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pillars */}
        <section className="py-16">
          <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-6">
            {SECURITY_PILLARS.map((p, i) => (
              <AnimatedGlassCard key={p.id} delay={i * 100}>
                <h3 className="font-heading font-bold text-xl text-[#0b1c30]">{p.title}</h3>
                <p className="mt-2 text-sm text-[#45464d] leading-relaxed">{p.body}</p>
              </AnimatedGlassCard>
            ))}
          </div>
        </section>

        <DataLaneDiagram />
      </main>
      <PublicFooter />
    </div>
  )
}

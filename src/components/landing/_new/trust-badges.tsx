'use client'

import { TRUST_BADGES } from './landing-content'
import { useInViewport } from './use-in-viewport'
import { useReducedMotion } from './use-reduced-motion'

export function TrustBadges() {
  const { ref, inView } = useInViewport<HTMLDivElement>(0.3)
  const reduced = useReducedMotion()
  const animate = inView && !reduced

  return (
    <section ref={ref} className="py-16 bg-white border-b border-[#c6c6cd]/10">
      <div className="max-w-5xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {TRUST_BADGES.map((b, i) => (
            <div
              key={b.label}
              className="flex flex-col items-center text-center space-y-2 p-4 rounded-xl bg-[#f8f9ff] border border-[#c6c6cd]/30"
              style={{
                animation: animate ? `badgePop 300ms ease-out ${i * 150}ms both` : 'none',
              }}
            >
              <span className="text-3xl">{b.icon}</span>
              <span className="text-xs font-medium text-[#0b1c30]">{b.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 text-center">
          <a href="/privacy" className="relative inline-block text-sm text-[#6b38d4] font-semibold group">
            Read our data policy →
            <span className="absolute left-0 -bottom-0.5 h-0.5 w-0 bg-[#6b38d4] group-hover:w-full transition-all duration-300" />
          </a>
        </div>
      </div>
    </section>
  )
}

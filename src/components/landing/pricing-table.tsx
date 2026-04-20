'use client'

import Link from 'next/link'
import { useState } from 'react'
import { PRICING_TIERS, PRICING_FAQ_ITEMS } from './landing-content'
import { useInViewport } from './use-in-viewport'
import { useReducedMotion } from './use-reduced-motion'
import { useCountUp } from './use-count-up'
import { FaqAccordion } from './faq-accordion'

function AnimatedPrice({ value, active }: { value: number; active: boolean }) {
  const n = useCountUp(value, 400, active)
  return <span className="tabular-nums">{n}</span>
}

export function PricingTable() {
  const [annual, setAnnual] = useState(true)
  const reduced = useReducedMotion()
  const { ref, inView } = useInViewport<HTMLDivElement>(0.2)
  const animActive = inView && !reduced

  return (
    <>
      <section className="py-20 bg-white">
        <div ref={ref} className="max-w-6xl mx-auto px-6">
          <header className="text-center space-y-3 mb-10">
            <span className="inline-block rounded-full bg-[#e9ddff] px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#5516be]">
              Pricing
            </span>
            <h1 className="font-heading font-bold text-4xl md:text-5xl text-[#0b1c30]">
              Simple. Transparent. Grows with you.
            </h1>
            <p className="text-[#45464d]">Start free for 14 days. Cancel anytime.</p>
          </header>

          {/* Monthly / Annual toggle */}
          <div className="flex justify-center mb-10">
            <div className="inline-flex rounded-full bg-[#eff4ff] p-1 border border-[#c6c6cd]/30">
              <button
                type="button"
                onClick={() => setAnnual(false)}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors ${
                  !annual ? 'bg-white text-[#0b1c30] shadow' : 'text-[#45464d]'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setAnnual(true)}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors ${
                  annual ? 'bg-white text-[#0b1c30] shadow' : 'text-[#45464d]'
                }`}
              >
                Annual{' '}
                <span className="ml-1 text-[10px] text-[#059669] font-bold">SAVE 20%</span>
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {PRICING_TIERS.map((tier, i) => {
              const price = annual ? tier.priceAnnual : tier.priceMonthly
              return (
                <div
                  key={tier.id}
                  className={`relative rounded-2xl p-8 border transition-all hover:-translate-y-1 hover:shadow-xl ${
                    tier.popular
                      ? 'border-[#6b38d4] bg-white shadow-[0_0_0_4px_#6b38d420]'
                      : 'border-[#c6c6cd]/40 bg-white'
                  }`}
                  style={{
                    animation: animActive ? `fadeSlide 400ms ease-out ${i * 120}ms both` : 'none',
                    opacity: inView || reduced ? 1 : 0,
                  }}
                >
                  {tier.popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[#6b38d4] text-white text-[11px] font-bold uppercase tracking-wider">
                      Most popular
                    </span>
                  )}
                  <h3 className="font-heading font-bold text-xl text-[#0b1c30]">{tier.name}</h3>
                  <p className="text-sm text-[#45464d] mt-1 min-h-[40px]">{tier.tagline}</p>
                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="font-heading font-bold text-5xl text-[#0b1c30]">
                      $<AnimatedPrice value={price} active={animActive} />
                    </span>
                    <span className="text-[#45464d] text-sm">
                      /mo{annual && ', billed annually'}
                    </span>
                  </div>
                  <ul className="mt-6 space-y-2.5 text-sm text-[#0b1c30]">
                    {tier.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <span className="text-[#6b38d4] font-bold">✓</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={`/signup?plan=${tier.id}`}
                    className={`mt-8 block text-center py-3 rounded-xl font-bold transition-all hover:-translate-y-[2px] active:scale-95 ${
                      tier.popular
                        ? 'bg-[#6b38d4] text-white hover:shadow-xl'
                        : 'bg-[#0b1c30] text-white hover:shadow-lg'
                    }`}
                  >
                    Start free trial
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Pricing FAQ */}
      <FaqAccordion items={PRICING_FAQ_ITEMS} title="Pricing questions" />
    </>
  )
}

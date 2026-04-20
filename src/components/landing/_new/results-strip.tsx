'use client'

import Image from 'next/image'
import { useState } from 'react'
import { RESULT_CASES } from './landing-content'
import { useInViewport } from './use-in-viewport'
import { useReducedMotion } from './use-reduced-motion'

function CaseTile({ c, delay }: { c: (typeof RESULT_CASES)[number]; delay: number }) {
  const [flipped, setFlipped] = useState(false)
  const { ref, inView } = useInViewport<HTMLDivElement>(0.3)
  const reduced = useReducedMotion()

  return (
    <div
      ref={ref}
      className="[perspective:1000px] opacity-0 translate-y-3"
      style={{
        animation: inView && !reduced ? `fadeSlide 400ms ease-out ${delay}ms forwards` : 'none',
        opacity: inView || reduced ? 1 : 0,
      }}
    >
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="relative w-full aspect-[5/4] [transform-style:preserve-3d] transition-transform duration-500 hover:[transform:rotateY(180deg)]"
        style={{ transform: flipped ? 'rotateY(180deg)' : undefined }}
        aria-label={`${c.brand} case study`}
      >
        {/* Front */}
        <div className="absolute inset-0 p-5 rounded-2xl bg-white border border-[#c6c6cd]/40 flex flex-col justify-between [backface-visibility:hidden]">
          <Image src={c.logo} alt={c.brand} width={100} height={30} className="grayscale h-7 w-auto object-contain opacity-70" />
          <div className="text-left">
            <div className="font-heading font-extrabold text-4xl text-[#6b38d4]">{c.metric}</div>
            <p className="text-sm text-[#45464d] mt-1">{c.context}</p>
          </div>
          <span className="self-start px-2 py-0.5 rounded-full bg-[#eff4ff] text-[10px] font-semibold text-[#45464d]">
            {c.platform}
          </span>
        </div>

        {/* Back */}
        <div className="absolute inset-0 p-5 rounded-2xl bg-[#0b1c30] text-white flex flex-col justify-center text-left [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <p className="text-sm leading-relaxed italic">&ldquo;{c.quote}&rdquo;</p>
          <p className="mt-3 text-xs text-white/70">— {c.founderName}</p>
        </div>
      </button>
    </div>
  )
}

export function ResultsStrip() {
  return (
    <section className="py-20 bg-white border-b border-[#c6c6cd]/10">
      <div className="max-w-7xl mx-auto px-6 space-y-10">
        <header className="text-center space-y-3">
          <h2 className="font-heading font-bold text-4xl md:text-5xl text-[#0b1c30]">
            Real brands. Real numbers. 90 days or less.
          </h2>
        </header>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {RESULT_CASES.map((c, i) => (
            <CaseTile key={c.brand} c={c} delay={i * 100} />
          ))}
        </div>
      </div>
    </section>
  )
}

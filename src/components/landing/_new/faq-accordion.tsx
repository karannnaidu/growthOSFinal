'use client'

import { useState } from 'react'
import { FAQ_ITEMS } from './landing-content'

function FaqRow({ q, a, isOpen, onToggle }: { q: string; a: string; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-[#c6c6cd]/40">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 py-5 text-left hover:bg-[#eff4ff]/50 transition-colors"
        aria-expanded={isOpen}
      >
        <span className="font-heading font-semibold text-lg text-[#0b1c30]">{q}</span>
        <svg
          className="w-5 h-5 text-[#6b38d4] flex-shrink-0 transition-transform duration-200"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className="grid transition-all duration-300 ease-out"
        style={{
          gridTemplateRows: isOpen ? '1fr' : '0fr',
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div className="overflow-hidden">
          <p className="pb-5 text-[#45464d] leading-relaxed">{a}</p>
        </div>
      </div>
    </div>
  )
}

export function FaqAccordion() {
  const [openIdx, setOpenIdx] = useState<number | null>(0)

  return (
    <section className="py-20 bg-[#f8f9ff] border-b border-[#c6c6cd]/10">
      <div className="max-w-3xl mx-auto px-6 space-y-8">
        <header className="text-center space-y-3">
          <h2 className="font-heading font-bold text-4xl md:text-5xl text-[#0b1c30]">Questions?</h2>
        </header>
        <div>
          {FAQ_ITEMS.map((item, i) => (
            <FaqRow
              key={item.q}
              q={item.q}
              a={item.a}
              isOpen={openIdx === i}
              onToggle={() => setOpenIdx((p) => (p === i ? null : i))}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

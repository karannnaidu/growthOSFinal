'use client'

import { useEffect, useState } from 'react'
import { ONE_CREW_CONTENT } from './landing-content'
import { useInViewport } from './use-in-viewport'
import { useReducedMotion } from './use-reduced-motion'

export function CreateCard() {
  const { create } = ONE_CREW_CONTENT
  const { ref, inView } = useInViewport<HTMLDivElement>(0.3)
  const reduced = useReducedMotion()
  const enabled = inView && !reduced

  const [tabIdx, setTabIdx] = useState(0)
  const [showContent, setShowContent] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setShowContent(true)
      return
    }
    setShowContent(false)
    const reveal = setTimeout(() => setShowContent(true), 1000)
    const next = setTimeout(() => {
      setTabIdx((p) => (p + 1) % create.tabs.length)
    }, 3000)
    return () => {
      clearTimeout(reveal)
      clearTimeout(next)
    }
  }, [tabIdx, enabled, create.tabs.length])

  const current = create.tabs[tabIdx]
  if (!current) return null

  return (
    <div
      ref={ref}
      className="relative p-6 rounded-2xl bg-white border border-[#c6c6cd]/40 hover:shadow-[0_0_0_2px_#F9731633] transition-shadow min-h-[480px] flex flex-col"
    >
      <header className="space-y-4 mb-6">
        <span className="inline-block px-2.5 py-1 rounded-full bg-[#F97316]/10 text-[#F97316] text-[11px] font-bold uppercase tracking-wider">
          Create
        </span>

        <div className="flex gap-1 text-[12px] border-b border-[#c6c6cd]/30 overflow-x-auto">
          {create.tabs.map((t, i) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTabIdx(i)}
              className={`relative pb-2 px-3 transition-colors whitespace-nowrap ${
                i === tabIdx ? 'text-[#F97316] font-semibold' : 'text-[#45464d]'
              }`}
            >
              {t.label}
              {i === tabIdx && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#F97316] transition-all" />
              )}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 space-y-3">
        {showContent ? (
          <div className="space-y-3 animate-[fadeIn_200ms_ease-out]">
            <p className="text-[15px] text-[#0b1c30] leading-snug">{current.content}</p>
            <p className="text-xs text-[#45464d]/70">{current.caption}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="h-4 rounded bg-gradient-to-r from-[#eff4ff] via-[#e9ddff] to-[#eff4ff] animate-[shimmer_1.2s_linear_infinite] bg-[length:200%_100%]" />
            <div className="h-4 w-3/4 rounded bg-gradient-to-r from-[#eff4ff] via-[#e9ddff] to-[#eff4ff] animate-[shimmer_1.2s_linear_infinite] bg-[length:200%_100%]" />
          </div>
        )}
      </div>

      <div className="inline-flex items-center gap-1.5 mt-4 self-end text-xs text-green-700 font-medium animate-[fadeIn_200ms_ease-out]">
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
        </svg>
        Delivered to your dashboard
      </div>
    </div>
  )
}

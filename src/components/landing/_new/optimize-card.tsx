'use client'

import { useEffect, useState } from 'react'
import { ONE_CREW_CONTENT } from './landing-content'
import { useInViewport } from './use-in-viewport'
import { useReducedMotion } from './use-reduced-motion'

export function OptimizeCard() {
  const { optimize } = ONE_CREW_CONTENT
  const { ref, inView } = useInViewport<HTMLDivElement>(0.3)
  const reduced = useReducedMotion()
  const enabled = inView && !reduced

  const [metricIdx, setMetricIdx] = useState(0)
  const [showToast, setShowToast] = useState(false)

  useEffect(() => {
    if (!enabled) return
    const next = setInterval(() => {
      setMetricIdx((p) => {
        const np = (p + 1) % optimize.metrics.length
        if (np === 0) {
          setShowToast(true)
          setTimeout(() => setShowToast(false), 2000)
        }
        return np
      })
    }, 3000)
    return () => clearInterval(next)
  }, [enabled, optimize.metrics.length])

  const current = optimize.metrics[metricIdx]
  if (!current) return null

  return (
    <div
      ref={ref}
      className="relative p-6 rounded-2xl bg-white border border-[#c6c6cd]/40 hover:shadow-[0_0_0_2px_#3B82F633] transition-shadow min-h-[480px] flex flex-col overflow-hidden"
    >
      <header className="space-y-4 mb-6">
        <span className="inline-block px-2.5 py-1 rounded-full bg-[#3B82F6]/10 text-[#3B82F6] text-[11px] font-bold uppercase tracking-wider">
          Optimize
        </span>
      </header>

      <div className="flex-1 flex items-center justify-center">
        <div key={metricIdx} className="text-center space-y-2 animate-[fadeIn_200ms_ease-out]">
          <div
            className={`inline-flex items-center gap-2 text-2xl font-heading font-bold ${
              current.tone === 'up' ? 'text-green-600' : 'text-amber-600'
            }`}
          >
            <span>{current.tone === 'up' ? '↗' : '⏸'}</span>
            <span>{current.text}</span>
          </div>
        </div>
      </div>

      {/* Toast */}
      <div
        className={`absolute left-6 right-6 bottom-6 px-4 py-3 rounded-xl bg-[#0b1c30] text-white text-sm shadow-xl transition-all duration-300 ${
          showToast ? 'translate-y-0 opacity-100' : 'translate-y-16 opacity-0 pointer-events-none'
        }`}
      >
        {optimize.toast}
      </div>
    </div>
  )
}

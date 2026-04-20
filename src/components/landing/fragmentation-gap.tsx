'use client'

import { useInViewport } from './use-in-viewport'
import { useReducedMotion } from './use-reduced-motion'

const TOOLS = [
  { id: 'meta', label: 'Meta Ads', x: 10, y: 20 },
  { id: 'ahrefs', label: 'Ahrefs', x: 72, y: 15 },
  { id: 'klaviyo', label: 'Klaviyo', x: 82, y: 55 },
  { id: 'finance', label: 'Finance', x: 15, y: 75 },
  { id: 'ga4', label: 'GA4', x: 45, y: 38 },
  { id: 'store', label: 'Storefront', x: 55, y: 80 },
]

export function FragmentationGap() {
  const { ref, inView } = useInViewport<HTMLDivElement>(0.4)
  const reduced = useReducedMotion()
  const animate = inView && !reduced

  return (
    <div ref={ref} className="relative h-[320px] w-full">
      {/* SVG connector lines — drawn only when in view */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {animate &&
          TOOLS.map((t, i) => (
            <line
              key={t.id}
              x1="50"
              y1="50"
              x2={t.x + 5}
              y2={t.y + 5}
              stroke="#6b38d4"
              strokeWidth="0.3"
              strokeDasharray="200"
              strokeDashoffset="200"
              style={{ animation: `drawLine 600ms ease-out ${i * 100 + 400}ms forwards` }}
            />
          ))}
      </svg>

      {/* Mia center halo */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-[#6b38d4]/20 flex items-center justify-center z-10">
        <div className="w-12 h-12 rounded-full bg-[#6b38d4] text-white font-bold flex items-center justify-center text-sm shadow-lg">
          Mia
        </div>
      </div>

      {/* Tool pills — absolutely positioned, fade in staggered */}
      {TOOLS.map((t, i) => (
        <div
          key={t.id}
          className="absolute px-3 py-1.5 rounded-full border border-[#e5eeff] bg-white text-xs font-medium text-[#0b1c30] shadow-sm whitespace-nowrap"
          style={{
            left: `${t.x}%`,
            top: `${t.y}%`,
            animation: animate ? `fadeSlide 400ms ease-out ${i * 80}ms both` : 'none',
            opacity: inView || reduced ? 1 : 0,
          }}
        >
          {t.label}
        </div>
      ))}
    </div>
  )
}

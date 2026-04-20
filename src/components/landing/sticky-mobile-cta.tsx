'use client'

import { useEffect, useState } from 'react'
import { UrlInputCta } from './url-input-cta'
import { CTA_LABELS } from './landing-content'

export function StickyMobileCta() {
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 200)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (dismissed) return null

  return (
    <div className="lg:hidden fixed inset-x-0 bottom-0 z-50 pointer-events-none">
      <div
        className={`pointer-events-auto transition-transform duration-300 ${visible ? 'translate-y-0' : 'translate-y-full'}`}
      >
        {expanded ? (
          <div className="bg-white border-t border-[#c6c6cd]/40 shadow-2xl p-5 space-y-4 rounded-t-2xl">
            <div className="flex items-center justify-between">
              <span className="font-heading font-bold text-[#0b1c30]">Start free</span>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Close"
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#eff4ff]"
              >
                ✕
              </button>
            </div>
            <UrlInputCta label={CTA_LABELS.final} />
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-[#0b1c30] text-white px-5 py-3">
            <button type="button" onClick={() => setExpanded(true)} className="flex-1 text-left font-semibold">
              Start free →
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss"
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

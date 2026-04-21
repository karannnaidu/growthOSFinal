'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { HERO_CONTENT, HERO_SURFACES, CTA_LABELS } from './landing-content'
import { UrlInputCta } from './url-input-cta'
import { renderSurface } from './hero-canvas-surfaces'
import { useReducedMotion } from './use-reduced-motion'
import { useBatteryOk } from './use-battery-ok'

export function HeroSplitCanvas() {
  const reduced = useReducedMotion()
  const batteryOk = useBatteryOk()
  const animating = !reduced && batteryOk

  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const [agentCount, setAgentCount] = useState(11)

  useEffect(() => {
    if (!animating || paused) return
    const i = setInterval(() => {
      setIdx((p) => (p + 1) % HERO_SURFACES.length)
    }, 4000)
    return () => clearInterval(i)
  }, [animating, paused])

  // Fake "agents working" tick for anchor status line
  useEffect(() => {
    if (!animating) return
    const i = setInterval(() => {
      setAgentCount((n) => (n === 11 ? 12 : 11))
    }, 8000)
    return () => clearInterval(i)
  }, [animating])

  const current = HERO_SURFACES[idx]

  return (
    <section className="relative flex items-center overflow-hidden bg-[#f8f9ff] pt-8 pb-14 sm:pt-12 sm:pb-20 lg:min-h-[90vh] lg:pb-24 border-b border-[#c6c6cd]/10">
      <div className="max-w-7xl mx-auto w-full px-6 grid lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* Left — copy + URL input */}
        <div className="lg:col-span-5 space-y-5 sm:space-y-7 relative z-10 order-1 lg:order-1 text-center lg:text-left">
          <h1 className="font-heading font-extrabold text-[2.25rem] leading-[1.08] sm:text-5xl md:text-6xl lg:text-7xl tracking-tight sm:tracking-tighter sm:leading-[1.05] text-[#0b1c30]">
            Your <span className="text-[#6b38d4]">AI marketing crew.</span> One URL away.
          </h1>
          <p className="text-base sm:text-lg text-[#45464d] max-w-xl mx-auto lg:mx-0 leading-relaxed">
            {HERO_CONTENT.subhead}
          </p>
          <div className="flex justify-center lg:justify-start">
            <UrlInputCta size="hero" label={CTA_LABELS.hero} />
          </div>
        </div>

        {/* Right — Mia anchor stacked above rotating canvas */}
        <div
          className="lg:col-span-7 order-2 lg:order-2 flex flex-col items-center gap-4 sm:gap-5 w-full"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {/* Mia breathing glow */}
          <div className="relative w-44 h-44 sm:w-60 sm:h-60 lg:w-[360px] lg:h-[360px]">
            <div
              className="absolute inset-0 rounded-full blur-3xl"
              style={{
                background: 'radial-gradient(circle, #6b38d4 0%, transparent 70%)',
                animation: animating ? 'breathe 2s ease-in-out infinite' : 'none',
              }}
            />
            <Image
              src="/agents/mia.png"
              alt="Mia, your AI marketing manager"
              fill
              sizes="(max-width: 640px) 176px, (max-width: 1024px) 240px, 360px"
              priority
              className="relative z-10 rounded-full object-cover"
            />
          </div>

          {/* Anchor status line — just below Mia */}
          <div className="max-w-full px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-white/90 backdrop-blur border border-[#c6c6cd]/40 shadow-sm text-[12px] sm:text-sm text-[#0b1c30]">
            <span className="inline-flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
              <span>
                Running your store on autopilot. <strong>{agentCount} agents working.</strong>
              </span>
            </span>
          </div>

          {/* Rotating canvas surface — stacked below, never on her face */}
          {current && (
            <div
              key={current.id}
              className="w-full max-w-[320px]"
              style={{ animation: animating ? 'surfaceIn 400ms cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none' }}
            >
              {renderSurface(current)}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

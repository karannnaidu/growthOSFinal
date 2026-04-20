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
    <section className="relative min-h-[90vh] flex items-center overflow-hidden bg-[#f8f9ff] pt-12 pb-24 border-b border-[#c6c6cd]/10">
      <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-12 gap-12 items-center">
        {/* Left — copy + URL input */}
        <div className="lg:col-span-5 space-y-7 relative z-10 order-2 lg:order-1">
          <h1 className="font-heading font-extrabold text-5xl md:text-6xl lg:text-7xl tracking-tighter leading-[1.05] text-[#0b1c30]">
            Your <span className="text-[#6b38d4]">AI marketing crew.</span> One URL away.
          </h1>
          <p className="text-lg text-[#45464d] max-w-xl leading-relaxed">{HERO_CONTENT.subhead}</p>
          <UrlInputCta size="hero" label={CTA_LABELS.hero} />
        </div>

        {/* Right — Mia anchor + rotating canvas */}
        <div
          className="lg:col-span-7 order-1 lg:order-2 relative flex items-center justify-center min-h-[480px]"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {/* Mia breathing glow */}
          <div className="relative">
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
              width={360}
              height={360}
              priority
              className="relative z-10 rounded-full"
            />
          </div>

          {/* Anchor status line */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-white/90 backdrop-blur border border-[#c6c6cd]/40 shadow-sm text-sm text-[#0b1c30]">
            <span className="inline-flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Running your store on autopilot. <strong>{agentCount} agents working.</strong>
            </span>
          </div>

          {/* Rotating canvas surface */}
          {current && (
            <div
              key={current.id}
              className="absolute top-8 -right-2 md:right-8"
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

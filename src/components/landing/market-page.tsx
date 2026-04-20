'use client'

import { PublicNav } from './public-nav'
import { PublicFooter } from './public-footer'
import { AnimatedGlassCard } from './animated-glass-card'
import { FragmentationGap } from './fragmentation-gap'
import { useInViewport } from './use-in-viewport'
import { useReducedMotion } from './use-reduced-motion'
import { useCountUp } from './use-count-up'
import {
  AlertTriangle,
  Clock,
  Brain,
  Sparkles,
} from 'lucide-react'

function PurpleBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-full bg-[#e9ddff] px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#5516be]">
      {children}
    </span>
  )
}

function StatNumber({
  value,
  suffix = '',
  className = '',
}: {
  value: number
  suffix?: string
  className?: string
}) {
  const { ref, inView } = useInViewport<HTMLDivElement>(0.3)
  const reduced = useReducedMotion()
  const hasDecimal = !Number.isInteger(value)
  const scaled = hasDecimal ? Math.round(value * 10) : value
  const n = useCountUp(scaled, 1200, inView && !reduced)
  const display = hasDecimal ? (n / 10).toFixed(1) : n
  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {display}
      {suffix}
    </span>
  )
}

export default function MarketPage() {
  return (
    <div className="!bg-[#f8f9ff] !text-[#0b1c30] font-body selection:bg-[#e9ddff] selection:text-[#5516be] min-h-screen">
      <PublicNav />

      <main className="pt-20">
        <section className="mx-auto w-full max-w-7xl px-6 py-16">
          {/* Hero */}
          <div className="text-center">
            <PurpleBadge>The Problem</PurpleBadge>
            <h1 className="font-heading mt-6 text-4xl font-bold leading-tight text-[#0b1c30] md:text-5xl lg:text-6xl">
              You&apos;re running a brand.{' '}
              <span className="text-[#45464d]/50">Not a marketing department.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-[#45464d]">
              Most D2C founders juggle 11+ tools, 4 dashboards, and zero clarity. They spend more time managing software than growing their brand.
            </p>
          </div>

          {/* Testimonial glass card */}
          <div className="mx-auto mt-10 max-w-2xl">
            <AnimatedGlassCard className="text-center" delay={100}>
              <div className="flex justify-center mb-4">
                <div className="w-10 h-10 rounded-full bg-[#6b38d4] flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-base italic text-[#0b1c30]">
                &ldquo;Mia flagged a drop in ROAS before I even noticed. She paused the ad and briefed me by 9am.&rdquo;
              </p>
              <p className="mt-3 text-sm font-medium text-[#45464d]">— D2C Founder, Skincare Brand</p>
              <div className="mt-4 inline-block rounded-full bg-[#e9ddff] px-3 py-1 text-xs font-semibold text-[#5516be]">
                Trusted by D2C founders
              </div>
            </AnimatedGlassCard>
          </div>

          {/* Two-column grid */}
          <div className="mt-12 grid gap-8 lg:grid-cols-2">
            {/* Left: Fragmentation Gap (signature animation) */}
            <AnimatedGlassCard className="relative overflow-hidden" delay={0}>
              <h3 className="font-heading text-xl font-bold text-[#0b1c30]">The Fragmentation Gap</h3>
              <p className="mt-2 text-sm text-[#45464d]">Your marketing stack is a patchwork of disconnected tools — until Mia ties them together.</p>
              <div className="mt-4">
                <FragmentationGap />
              </div>
            </AnimatedGlassCard>

            {/* Right: Stats cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <AnimatedGlassCard className="text-center" delay={80}>
                <Clock className="mx-auto h-8 w-8 text-[#6b38d4]" />
                <p className="mt-3 font-heading text-2xl font-bold text-[#0b1c30]">
                  <StatNumber value={4.7} suffix=" hrs/day" />
                </p>
                <p className="mt-1 text-xs text-[#45464d]">Manual Overhead</p>
              </AnimatedGlassCard>
              <AnimatedGlassCard className="text-center" delay={160}>
                <AlertTriangle className="mx-auto h-8 w-8 text-[#6b38d4]" />
                <p className="mt-3 font-heading text-2xl font-bold text-[#0b1c30]">Silent Bias</p>
                <p className="mt-1 text-xs text-[#45464d]">Algorithms optimize for spend, not profit</p>
              </AnimatedGlassCard>
              <AnimatedGlassCard className="text-center" delay={240}>
                <Brain className="mx-auto h-8 w-8 text-[#6b38d4]" />
                <p className="mt-3 font-heading text-2xl font-bold text-[#0b1c30]">Maximum Paralysis</p>
                <p className="mt-1 text-xs text-[#45464d]">Too many dashboards, too little action</p>
              </AnimatedGlassCard>
            </div>
          </div>

          {/* Bottom stat */}
          <div className="mt-10 text-center">
            <AnimatedGlassCard dark className="mx-auto inline-block" delay={320}>
              <p className="text-base font-medium text-white/60">Founders waste</p>
              <p className="font-heading text-3xl font-bold text-white">
                <StatNumber value={14.3} suffix=" hours/week" />
              </p>
              <p className="text-sm text-white/60">on Software Stewardship</p>
            </AnimatedGlassCard>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}

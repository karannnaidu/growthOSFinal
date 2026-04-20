'use client'

import { useInViewport } from './use-in-viewport'
import { useReducedMotion } from './use-reduced-motion'

export function AnimatedGlassCard({
  children,
  className = '',
  dark = false,
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  dark?: boolean
  delay?: number
}) {
  const { ref, inView } = useInViewport<HTMLDivElement>(0.2)
  const reduced = useReducedMotion()
  const visible = inView || reduced

  return (
    <div
      ref={ref}
      className={`rounded-[40px] border p-6 transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-xl ${
        dark
          ? 'border-white/10 bg-[#111c2d] text-white'
          : 'border-white/60 bg-white/80 backdrop-blur-[20px]'
      } ${className}`}
      style={{
        animation: visible && !reduced ? `fadeSlide 400ms ease-out ${delay}ms both` : 'none',
        opacity: visible || reduced ? 1 : 0,
      }}
    >
      {children}
    </div>
  )
}

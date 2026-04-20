'use client'

import Image from 'next/image'
import { useState } from 'react'
import type { AgentRosterEntry } from './landing-content'
import { useInViewport } from './use-in-viewport'
import { useReducedMotion } from './use-reduced-motion'
import { useCountUp } from './use-count-up'

export function AgentCard({ agent, delay }: { agent: AgentRosterEntry; delay: number }) {
  const [hover, setHover] = useState(false)
  const { ref, inView } = useInViewport<HTMLDivElement>(0.2)
  const reduced = useReducedMotion()
  const tasks = useCountUp(agent.tasksThisWeek, 900, inView && !reduced)

  return (
    <div
      ref={ref}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="group relative rounded-2xl bg-white border border-[#c6c6cd]/40 overflow-hidden hover:-translate-y-1 hover:shadow-xl transition-[transform,box-shadow] duration-300"
      style={{
        animation: inView && !reduced ? `fadeSlide 400ms ease-out ${delay}ms both` : 'none',
        opacity: inView || reduced ? 1 : 0,
      }}
    >
      {/* Portrait */}
      <div
        className="relative aspect-square overflow-hidden"
        style={{ backgroundColor: `${agent.color}20` }}
      >
        <Image
          src={agent.avatar}
          alt={agent.name}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          className="object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <span
          className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide text-white shadow"
          style={{ backgroundColor: agent.color }}
        >
          {agent.role}
        </span>
      </div>

      {/* Body */}
      <div className="p-4 space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-heading font-bold text-lg text-[#0b1c30]">{agent.name}</h3>
          <span className="text-[11px] text-[#45464d] tabular-nums whitespace-nowrap">
            <span className="font-bold" style={{ color: agent.color }}>
              {tasks}
            </span>{' '}
            tasks / wk
          </span>
        </div>
        <p className="text-sm text-[#45464d] leading-snug">{agent.tagline}</p>

        {/* Skills reveal on hover (grid-rows morph) */}
        <div
          className="grid transition-[grid-template-rows] duration-300"
          style={{ gridTemplateRows: hover ? '1fr' : '0fr' }}
        >
          <div className="overflow-hidden">
            <ul className="pt-2 space-y-1 text-[12px] text-[#45464d]">
              {agent.topSkills.map((s) => (
                <li key={s} className="flex items-center gap-1.5">
                  <span
                    className="w-1 h-1 rounded-full"
                    style={{ backgroundColor: agent.color }}
                  />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

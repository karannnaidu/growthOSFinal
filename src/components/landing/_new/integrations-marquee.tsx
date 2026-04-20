'use client'

import Image from 'next/image'
import { INTEGRATIONS_CONTENT } from './landing-content'
import { useReducedMotion } from './use-reduced-motion'

export function IntegrationsMarquee() {
  const reduced = useReducedMotion()
  const allItems = INTEGRATIONS_CONTENT.groups.flatMap((g, gi) =>
    g.items.map((item, ii) => ({ ...item, group: g.label, key: `${gi}-${ii}` })),
  )
  // Duplicate for seamless loop
  const doubled = [...allItems, ...allItems]

  return (
    <section className="py-16 border-b border-[#c6c6cd]/10 bg-white">
      <div className="max-w-7xl mx-auto px-6 text-center mb-10">
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-[#0b1c30] mb-2">
          {INTEGRATIONS_CONTENT.header}
        </h2>
        <p className="text-[#45464d]">{INTEGRATIONS_CONTENT.subtext}</p>
      </div>

      <div className="relative overflow-hidden group">
        <div
          className="flex gap-12 items-center"
          style={{
            width: 'max-content',
            animation: reduced ? 'none' : 'marquee 40s linear infinite',
          }}
        >
          {doubled.map((item, i) => (
            <div
              key={`${item.key}-${i}`}
              className="flex-shrink-0 grayscale hover:grayscale-0 hover:rotate-[3deg] transition-all duration-300"
            >
              <Image
                src={item.logo}
                alt={item.name}
                width={140}
                height={40}
                className="h-10 w-auto object-contain"
              />
            </div>
          ))}
        </div>
        {/* Edge gradients */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-white to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-white to-transparent" />
      </div>
    </section>
  )
}

'use client'

import { ONE_CREW_CONTENT } from './landing-content'
import { ResearchCard } from './research-card'
import { CreateCard } from './create-card'
import { OptimizeCard } from './optimize-card'

export function OneCrewBlock() {
  return (
    <section className="py-20 bg-[#f8f9ff] border-b border-[#c6c6cd]/10">
      <div className="max-w-7xl mx-auto px-6 space-y-12">
        <header className="text-center max-w-3xl mx-auto space-y-3">
          <h2 className="font-heading font-bold text-4xl md:text-5xl text-[#0b1c30]">
            {ONE_CREW_CONTENT.header}
          </h2>
          <p className="text-lg text-[#45464d]">{ONE_CREW_CONTENT.sub}</p>
        </header>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <ResearchCard />
          <CreateCard />
          <OptimizeCard />
        </div>
      </div>
    </section>
  )
}

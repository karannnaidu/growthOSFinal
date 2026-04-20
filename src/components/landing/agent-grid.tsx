import { AgentCard } from './agent-card'
import { AGENT_ROSTER } from './landing-content'

export function AgentGrid() {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <header className="text-center space-y-3 mb-12">
          <span className="inline-block rounded-full bg-[#e9ddff] px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#5516be]">
            Meet the Crew
          </span>
          <h1 className="font-heading font-bold text-4xl md:text-5xl lg:text-6xl text-[#0b1c30]">
            One manager. Eleven specialists. All autonomous.
          </h1>
          <p className="text-lg text-[#45464d] max-w-2xl mx-auto">
            Mia runs the show. The other eleven each own one lane of your marketing and report back daily.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {AGENT_ROSTER.map((agent, i) => (
            <AgentCard key={agent.id} agent={agent} delay={i * 50} />
          ))}
        </div>
      </div>
    </section>
  )
}

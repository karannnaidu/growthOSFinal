import Link from 'next/link'
import { AgentAvatar } from '@/components/agents/agent-avatar'

// ── Agent data ────────────────────────────────────────────────────
const AGENTS = [
  { id: 'mia',   name: 'Mia',   role: 'Chief of Staff',       color: '#6366f1' },
  { id: 'scout', name: 'Scout', role: 'Market Intelligence',   color: '#0d9488' },
  { id: 'aria',  name: 'Aria',  role: 'Ad Creative Director',  color: '#f97316' },
  { id: 'luna',  name: 'Luna',  role: 'Content Strategist',    color: '#10b981' },
  { id: 'hugo',  name: 'Hugo',  role: 'Email & CRM Lead',      color: '#d97706' },
  { id: 'sage',  name: 'Sage',  role: 'SEO & Organic Growth',  color: '#8b5cf6' },
  { id: 'max',   name: 'Max',   role: 'Paid Media Manager',    color: '#3b82f6' },
  { id: 'atlas', name: 'Atlas', role: 'Analytics & BI',        color: '#e11d48' },
  { id: 'echo',  name: 'Echo',  role: 'Social Media Manager',  color: '#64748b' },
  { id: 'nova',  name: 'Nova',  role: 'Brand Voice Designer',  color: '#7c3aed' },
  { id: 'navi',  name: 'Navi',  role: 'Customer Experience',   color: '#0ea5e9' },
  { id: 'penny', name: 'Penny', role: 'Revenue Optimizer',     color: '#059669' },
]

// ── Pricing ───────────────────────────────────────────────────────
const PLANS = [
  {
    name: 'Free',
    price: '₹0',
    period: '',
    credits: '100 (one-time)',
    agents: '3 agents',
    customSkills: false,
    teamMembers: '1 member',
    support: 'Community',
    cta: 'Get Started Free',
    href: '/signup',
    highlighted: false,
  },
  {
    name: 'Starter',
    price: '₹1,499',
    period: '/mo',
    credits: '500/mo',
    agents: 'All 12',
    customSkills: false,
    teamMembers: '3 members',
    support: 'Email',
    cta: 'Start Starter',
    href: '/signup?plan=starter',
    highlighted: false,
  },
  {
    name: 'Growth',
    price: '₹3,999',
    period: '/mo',
    credits: '1,500/mo',
    agents: 'All 12',
    customSkills: true,
    teamMembers: '10 members',
    support: 'Priority',
    cta: 'Start Growing',
    href: '/signup?plan=growth',
    highlighted: true,
  },
  {
    name: 'Agency',
    price: '₹9,999',
    period: '/mo',
    credits: '5,000/mo',
    agents: 'All 12',
    customSkills: true,
    teamMembers: 'Unlimited',
    support: 'Dedicated',
    cta: 'Go Agency',
    href: '/signup?plan=agency',
    highlighted: false,
  },
]

// ── How It Works steps ────────────────────────────────────────────
const STEPS = [
  {
    step: '01',
    title: 'Connect',
    description:
      'Link your Shopify store, ad accounts, and analytics. Growth OS ingests your data in minutes.',
    color: '#6366f1',
  },
  {
    step: '02',
    title: 'Diagnose',
    description:
      'Mia and her team audit your brand, identify leaks, and surface the highest-leverage opportunities.',
    color: '#10b981',
  },
  {
    step: '03',
    title: 'Grow',
    description:
      '12 AI agents execute — writing copy, launching ads, optimizing emails, and reporting results daily.',
    color: '#f97316',
  },
]

// ── CheckIcon ────────────────────────────────────────────────────
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
    >
      <path
        fillRule="evenodd"
        d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
    >
      <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
    </svg>
  )
}

// ── ArrowRight ────────────────────────────────────────────────────
function ArrowRight({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
    >
      <path
        fillRule="evenodd"
        d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

// ── Main Component ────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#111c2d] text-white scroll-smooth">
      {/* ── Nav ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 backdrop-blur-md border-b border-white/5 bg-[#111c2d]/80">
        <span className="font-heading font-bold text-lg tracking-tight">
          Growth<span className="text-[#6366f1]"> OS</span>
        </span>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm text-white/70 hover:text-white transition-colors px-3 py-1.5"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="text-sm bg-[#6366f1] hover:bg-[#4f52d4] text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Get Started Free
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section
        id="hero"
        className="relative min-h-screen flex items-center justify-center text-center px-4 pt-16 overflow-hidden"
      >
        {/* Radial glow from top */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full"
          style={{
            background:
              'radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.25) 0%, transparent 70%)',
          }}
        />

        <div className="relative z-10 max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-[#6366f1]/30 bg-[#6366f1]/10 px-4 py-1.5 text-sm text-[#a5b4fc] mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-[#6366f1] inline-block" />
            AI-powered marketing for D2C brands
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-heading font-bold mb-6 leading-tight tracking-tight">
            Meet Mia.
            <br />
            <span className="text-[#6366f1]">Your AI Chief of Staff.</span>
          </h1>

          <p className="text-lg sm:text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
            Your marketing team. Already hired. 12 AI agents that diagnose, create, optimize, and
            grow your D2C brand — for less than the cost of a single freelancer.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 bg-[#6366f1] hover:bg-[#4f52d4] text-white px-8 py-4 rounded-xl text-lg font-semibold transition-colors w-full sm:w-auto justify-center"
            >
              Get Started Free <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 border border-white/10 hover:border-white/20 text-white/70 hover:text-white px-8 py-4 rounded-xl text-lg font-medium transition-colors w-full sm:w-auto justify-center"
            >
              Sign in
            </Link>
          </div>

          <p className="mt-5 text-sm text-white/40">100 free credits. No credit card required.</p>

          {/* Avatar cluster */}
          <div className="mt-16 flex items-center justify-center gap-2 flex-wrap">
            {AGENTS.slice(0, 6).map((agent) => (
              <AgentAvatar key={agent.id} agentId={agent.id} size="sm" />
            ))}
            <span className="text-xs text-white/40 ml-2">+6 more agents</span>
          </div>
        </div>
      </section>

      {/* ── Social Proof ── */}
      <section className="py-16 px-4 border-y border-white/5">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm text-white/40 uppercase tracking-widest font-medium mb-8">
            Trusted by D2C founders saving ₹1–4L/month
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-12">
            {['Skincare Brand', 'Fashion Label', 'Health & Wellness', 'Home Decor', 'Pet Care'].map(
              (brand) => (
                <span
                  key={brand}
                  className="text-white/25 font-heading font-semibold text-base md:text-lg tracking-tight"
                >
                  {brand}
                </span>
              ),
            )}
          </div>
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { stat: '₹2.3L', label: 'Avg. monthly savings on marketing spend' },
              { stat: '3.8×', label: 'Average ROAS improvement in 90 days' },
              { stat: '12', label: 'Specialized AI agents working for you' },
            ].map(({ stat, label }) => (
              <div
                key={stat}
                className="glass-panel rounded-2xl px-6 py-5 text-center"
              >
                <p className="text-3xl font-heading font-bold text-[#6366f1]">{stat}</p>
                <p className="mt-1 text-sm text-white/50">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Agent Showcase ── */}
      <section id="agents" className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-heading font-bold mb-4">
              Your 12-agent AI team
            </h2>
            <p className="text-white/50 max-w-xl mx-auto">
              Each agent is a specialist. Together, they cover every corner of your marketing
              funnel.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {AGENTS.map((agent) => (
              <div
                key={agent.id}
                className="glass-panel rounded-2xl p-4 flex flex-col items-center text-center gap-3 transition-all duration-200 hover:scale-[1.04] group"
                style={{
                  '--agent-color': agent.color,
                } as React.CSSProperties}
              >
                <div
                  className="relative"
                  style={{
                    filter: `drop-shadow(0 0 10px ${agent.color}55)`,
                  }}
                >
                  <AgentAvatar agentId={agent.id} size="md" />
                </div>
                <div>
                  <p className="font-heading font-semibold text-sm text-white leading-tight">
                    {agent.name}
                  </p>
                  <p className="text-[11px] text-white/40 leading-tight mt-0.5">{agent.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-24 px-4 bg-white/[0.02]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-heading font-bold mb-4">
              How it works
            </h2>
            <p className="text-white/50 max-w-xl mx-auto">
              From first login to fully-automated growth — in three steps.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 md:gap-8">
            {STEPS.map(({ step, title, description, color }) => (
              <div key={step} className="glass-panel rounded-2xl p-7 flex flex-col gap-4">
                <div
                  className="text-4xl font-heading font-bold"
                  style={{ color }}
                >
                  {step}
                </div>
                <div>
                  <h3 className="font-heading font-bold text-xl mb-2">{title}</h3>
                  <p className="text-sm text-white/50 leading-relaxed">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-heading font-bold mb-4">
              Simple, transparent pricing
            </h2>
            <p className="text-white/50 max-w-xl mx-auto">
              Start free. Scale as you grow. Cancel anytime.
            </p>
          </div>

          {/* Mobile: stack / Tablet+: grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`relative glass-panel rounded-2xl p-6 flex flex-col gap-5 transition-all duration-200 ${
                  plan.highlighted
                    ? 'border border-[#6366f1]/50 ring-1 ring-[#6366f1]/20'
                    : ''
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-block bg-[#6366f1] text-white text-xs font-semibold px-3 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}

                <div>
                  <p className="font-heading font-bold text-lg text-white">{plan.name}</p>
                  <div className="flex items-baseline gap-0.5 mt-1">
                    <span className="text-3xl font-heading font-bold text-white">{plan.price}</span>
                    {plan.period && (
                      <span className="text-sm text-white/40">{plan.period}</span>
                    )}
                  </div>
                </div>

                <ul className="flex flex-col gap-3 text-sm flex-1">
                  <PricingRow label={plan.credits} sublabel="Credits" />
                  <PricingRow label={plan.agents} sublabel="Agents" />
                  <PricingRow
                    label={plan.customSkills ? 'Yes' : 'No'}
                    sublabel="Custom Skills"
                    positive={plan.customSkills}
                  />
                  <PricingRow label={plan.teamMembers} sublabel="Team Members" />
                  <PricingRow label={plan.support} sublabel="Support" />
                </ul>

                <Link
                  href={plan.href}
                  className={`text-center text-sm font-semibold py-3 rounded-xl transition-colors ${
                    plan.highlighted
                      ? 'bg-[#6366f1] hover:bg-[#4f52d4] text-white'
                      : 'border border-white/10 hover:border-white/20 text-white/70 hover:text-white'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Section ── */}
      <section className="py-24 px-4 bg-white/[0.02] border-y border-white/5">
        <div className="max-w-3xl mx-auto text-center">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full"
            style={{
              background:
                'radial-gradient(ellipse at 50% 50%, rgba(99,102,241,0.15) 0%, transparent 70%)',
            }}
          />
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-heading font-bold mb-5 relative">
            Your AI marketing team awaits.
          </h2>
          <p className="text-white/50 text-lg mb-10 relative">
            Join hundreds of D2C founders who replaced expensive freelancers with Growth OS.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-[#6366f1] hover:bg-[#4f52d4] text-white px-10 py-4 rounded-xl text-lg font-semibold transition-colors"
          >
            Start Free Today <ArrowRight className="w-5 h-5" />
          </Link>
          <p className="mt-4 text-sm text-white/30">100 free credits. No credit card required.</p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-10 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="font-heading font-bold text-base tracking-tight">
            Growth<span className="text-[#6366f1]"> OS</span>
          </span>
          <p className="text-xs text-white/30 order-last sm:order-none">
            &copy; {new Date().getFullYear()} Growth OS. All rights reserved.
          </p>
          <nav className="flex items-center gap-5 text-xs text-white/40">
            <Link href="/privacy" className="hover:text-white/70 transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-white/70 transition-colors">
              Terms
            </Link>
            <Link href="mailto:hello@growthOS.ai" className="hover:text-white/70 transition-colors">
              Contact
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}

// ── Pricing Row Helper ─────────────────────────────────────────────
function PricingRow({
  label,
  sublabel,
  positive,
}: {
  label: string
  sublabel: string
  positive?: boolean
}) {
  const isCheck = label === 'Yes'
  const isCross = label === 'No'

  return (
    <li className="flex items-center justify-between gap-2">
      <span className="text-white/40 text-xs">{sublabel}</span>
      {isCheck ? (
        <CheckIcon className="w-4 h-4 text-[#10b981] shrink-0" />
      ) : isCross ? (
        <XIcon className="w-4 h-4 text-white/20 shrink-0" />
      ) : (
        <span className="text-white/80 text-xs font-medium text-right">{label}</span>
      )}
    </li>
  )
}

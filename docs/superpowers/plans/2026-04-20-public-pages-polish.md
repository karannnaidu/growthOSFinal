# Public Pages Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add micro-interactions and one signature moment to each of the 6 public pages (Market, Agents, Pricing, Security, Agency, About) so they match the polish of the redesigned landing page.

**Architecture:** Additive polish only. Reuse the existing motion primitives from `src/components/landing/` (`use-reduced-motion`, `use-in-viewport`, `use-count-up`). Each page keeps its current structure and content; we layer in staggered entrances, counter-ups, hover lifts, plus one page-specific signature animation. All interactions respect `prefers-reduced-motion`.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, CSS keyframes (no framer-motion), lucide-react icons, existing shared hooks.

**Shared motion primitives (already built, reuse as-is):**
- `src/components/landing/use-reduced-motion.ts` — gates animations
- `src/components/landing/use-in-viewport.ts` — IntersectionObserver trigger
- `src/components/landing/use-count-up.ts` — animated number ticker
- `src/components/landing/faq-accordion.tsx` — single-open FAQ
- Keyframes in `src/app/globals.css`: `fadeSlide`, `shimmer`, `drawLine`, `breathe`, `shine`, `badgePop`, `fadeIn`, `sweep`, `surfaceIn`

**Guard rails:**
- Platform-agnostic copy — any "Shopify" references in body copy should read "D2C store" / "your store" (memory: `project_landing_positioning`).
- Autopilot tone — past-tense action verbs, no permission-asking copy (memory: `project_autopilot_positioning`).
- `noUncheckedIndexedAccess: true` — narrow array lookups with guards or optional chaining.

---

## Phase 1 — Market page polish

**Target file:** `src/components/landing/market-page.tsx` (129 lines, currently static glass cards).

**Signature moment:** The 6 tool pills in "The Fragmentation Gap" drift apart on entry, then on scroll past the section a subtle Mia halo draws SVG lines connecting them — visual metaphor for unification.

### Task 1.1 — Platform-agnostic copy

- [ ] **Step 1:** Replace the Shopify reference in the subhead.
  - File: `src/components/landing/market-page.tsx`
  - Find: `Most Shopify founders juggle 11+ tools`
  - Replace with: `Most D2C founders juggle 11+ tools`
- [ ] **Step 2:** Commit — `market: platform-agnostic hero copy`

### Task 1.2 — Animated GlassCard wrapper

- [ ] **Step 1:** Create `src/components/landing/animated-glass-card.tsx`:

```tsx
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
```

- [ ] **Step 2:** In `market-page.tsx`, replace the local `GlassCard` with `AnimatedGlassCard` and pass `delay={i * 80}` where looping.
- [ ] **Step 3:** Run `npx tsc --noEmit` — expect no errors.
- [ ] **Step 4:** Commit — `market: animated glass card entrance + hover lift`

### Task 1.3 — Counter-up on stats

- [ ] **Step 1:** Import `useCountUp` + `useInViewport` in `market-page.tsx`.
- [ ] **Step 2:** Create a small `StatNumber` helper inside the file:

```tsx
function StatNumber({ value, suffix = '' }: { value: number; suffix?: string }) {
  const { ref, inView } = useInViewport<HTMLDivElement>(0.3)
  const reduced = useReducedMotion()
  const n = useCountUp(value, 1200, inView && !reduced)
  return (
    <div ref={ref} className="font-heading text-2xl font-bold text-[#0b1c30] tabular-nums">
      {n}{suffix}
    </div>
  )
}
```

- [ ] **Step 3:** Swap `4.7 hrs/day` → `<StatNumber value={4.7} suffix=" hrs/day" />` and `14.3 hours/week` → `<StatNumber value={14.3} suffix=" hours/week" />`. Adjust typography to match existing sizes.
- [ ] **Step 4:** Commit — `market: counter-up animation on stat cards`

### Task 1.4 — Fragmentation gap signature animation

- [ ] **Step 1:** Create `src/components/landing/fragmentation-gap.tsx`:

```tsx
'use client'

import { useInViewport } from './use-in-viewport'
import { useReducedMotion } from './use-reduced-motion'

const TOOLS = [
  { id: 'meta', label: 'Meta Ads', x: 10, y: 20 },
  { id: 'ahrefs', label: 'Ahrefs', x: 75, y: 15 },
  { id: 'klaviyo', label: 'Klaviyo', x: 85, y: 55 },
  { id: 'finance', label: 'Finance', x: 15, y: 75 },
  { id: 'ga4', label: 'GA4', x: 45, y: 40 },
  { id: 'shopify', label: 'Storefront', x: 55, y: 80 },
]

export function FragmentationGap() {
  const { ref, inView } = useInViewport<HTMLDivElement>(0.4)
  const reduced = useReducedMotion()
  const animate = inView && !reduced

  return (
    <div ref={ref} className="relative h-[320px] w-full">
      {/* SVG lines (drawn only when in view) */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        {animate && TOOLS.map((t, i) => (
          <line
            key={t.id}
            x1="50" y1="50"
            x2={t.x + 5} y2={t.y + 5}
            stroke="#6b38d4"
            strokeWidth="0.3"
            strokeDasharray="200"
            strokeDashoffset="200"
            style={{ animation: `drawLine 600ms ease-out ${i * 100 + 400}ms forwards` }}
          />
        ))}
      </svg>

      {/* Mia center halo */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-[#6b38d4]/20 flex items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-[#6b38d4] text-white font-bold flex items-center justify-center text-sm">Mia</div>
      </div>

      {/* Tool pills */}
      {TOOLS.map((t, i) => (
        <div
          key={t.id}
          className="absolute px-3 py-1.5 rounded-full border border-[#e5eeff] bg-white text-xs font-medium text-[#0b1c30] shadow-sm"
          style={{
            left: `${t.x}%`,
            top: `${t.y}%`,
            animation: animate ? `fadeSlide 400ms ease-out ${i * 80}ms both` : 'none',
          }}
        >
          {t.label}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2:** In `market-page.tsx`, replace the static tool-pills list inside "The Fragmentation Gap" `GlassCard` with `<FragmentationGap />`. Remove the old `.map` block.
- [ ] **Step 3:** Run `npx tsc --noEmit` and `npm run build` to confirm no errors.
- [ ] **Step 4:** Manually open http://localhost:3001/market, scroll to the section, and verify the pills and lines animate.
- [ ] **Step 5:** Commit — `market: fragmentation-gap signature animation`

---

## Phase 2 — Agents page rebuild

**Target files:**
- `src/app/agents/client.tsx` (currently renders 4 slides)
- New: `src/components/landing/agent-grid.tsx` (12-agent grid)
- New: `src/components/landing/agent-card.tsx`
- Reference: `skills/agents.json` (canonical roster with colors + descriptions)

**Signature moment:** 12-agent grid (3×4 desktop, 2×6 tablet, 1×12 mobile). Each card shows portrait + name + role pill. On hover, card scales + rotates slightly and reveals top-3 skills. Counter-up on "X tasks this week" per agent.

### Task 2.1 — Load roster into landing-content

- [ ] **Step 1:** Add to `src/components/landing/landing-content.ts`:

```ts
export interface AgentRosterEntry {
  id: string
  name: string
  role: string
  color: string
  avatar: string
  tagline: string
  topSkills: string[]
  tasksThisWeek: number
}

export const AGENT_ROSTER: AgentRosterEntry[] = [
  { id: 'mia',    name: 'Mia',    role: 'Manager',              color: '#6366F1', avatar: '/agents/mia.png',    tagline: 'Orchestrates your crew.',                 topSkills: ['Weekly briefing', 'Agent delegation', 'Launch planning'], tasksThisWeek: 42 },
  { id: 'scout',  name: 'Scout',  role: 'Diagnostician',        color: '#0D9488', avatar: '/agents/scout.png',  tagline: 'Spots the problem before you do.',        topSkills: ['Health check', 'Anomaly detection', 'Returns analysis'],   tasksThisWeek: 18 },
  { id: 'aria',   name: 'Aria',   role: 'Creative Director',    color: '#F97316', avatar: '/agents/aria.png',   tagline: 'Writes ads your best copywriter wishes she wrote.', topSkills: ['Ad copy', 'UGC scripts', 'Creative fatigue detector'], tasksThisWeek: 24 },
  { id: 'luna',   name: 'Luna',   role: 'Email + Retention',    color: '#10B981', avatar: '/agents/luna.png',   tagline: 'Keeps customers coming back.',            topSkills: ['Email flows', 'Cart recovery', 'Churn prevention'],          tasksThisWeek: 15 },
  { id: 'hugo',   name: 'Hugo',   role: 'SEO + Content',        color: '#D97706', avatar: '/agents/hugo.png',   tagline: 'Builds organic traffic on autopilot.',    topSkills: ['SEO audit', 'Keyword strategy', 'Programmatic SEO'],          tasksThisWeek: 9  },
  { id: 'sage',   name: 'Sage',   role: 'CRO + Pricing',        color: '#8B5CF6', avatar: '/agents/sage.png',   tagline: 'Finds money your funnel is leaking.',     topSkills: ['Page CRO', 'A/B tests', 'Pricing optimizer'],                tasksThisWeek: 11 },
  { id: 'max',    name: 'Max',    role: 'Budget + Channels',    color: '#3B82F6', avatar: '/agents/max.png',    tagline: 'Scales what works, kills what doesn\'t.', topSkills: ['Budget allocation', 'Ad scaling', 'Campaign optimizer'],     tasksThisWeek: 33 },
  { id: 'atlas',  name: 'Atlas',  role: 'Analyst',              color: '#0EA5E9', avatar: '/agents/atlas.png',  tagline: 'Reads your numbers so you don\'t have to.', topSkills: ['Cohort analysis', 'LTV modeling', 'Attribution'],          tasksThisWeek: 14 },
  { id: 'echo',   name: 'Echo',   role: 'Competitor Intel',     color: '#EC4899', avatar: '/agents/echo.png',   tagline: 'Watches your rivals while you sleep.',    topSkills: ['Competitor scans', 'Creative drops', 'Positioning shifts'],  tasksThisWeek: 7  },
  { id: 'nova',   name: 'Nova',   role: 'AI Visibility',        color: '#EF4444', avatar: '/agents/nova.png',   tagline: 'Gets your brand cited in ChatGPT + Perplexity.', topSkills: ['GEO audit', 'llms.txt', 'Brand mention tracking'],     tasksThisWeek: 5  },
  { id: 'navi',   name: 'Navi',   role: 'Customer Insights',    color: '#14B8A6', avatar: '/agents/navi.png',   tagline: 'Turns reviews into product roadmaps.',    topSkills: ['Review mining', 'Sentiment tracking', 'Persona builder'],    tasksThisWeek: 12 },
  { id: 'penny',  name: 'Penny',  role: 'Finance',              color: '#059669', avatar: '/agents/penny.png',  tagline: 'Your AI CFO — watches cash and margin.',  topSkills: ['CAC/LTV audit', 'Cashflow projection', 'Margin analyzer'],   tasksThisWeek: 6  },
]
```

- [ ] **Step 2:** Commit — `landing-content: add AGENT_ROSTER with 12 entries`

### Task 2.2 — AgentCard component

- [ ] **Step 1:** Create `src/components/landing/agent-card.tsx`:

```tsx
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
      <div className="relative aspect-square overflow-hidden" style={{ backgroundColor: `${agent.color}20` }}>
        <Image
          src={agent.avatar}
          alt={agent.name}
          fill
          sizes="(max-width: 768px) 50vw, 25vw"
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
        <div className="flex items-baseline justify-between">
          <h3 className="font-heading font-bold text-lg text-[#0b1c30]">{agent.name}</h3>
          <span className="text-[11px] text-[#45464d] tabular-nums">
            <span className="font-bold" style={{ color: agent.color }}>{tasks}</span> tasks this week
          </span>
        </div>
        <p className="text-sm text-[#45464d] leading-snug">{agent.tagline}</p>

        {/* Skills reveal on hover */}
        <div
          className="grid transition-[grid-template-rows] duration-300"
          style={{ gridTemplateRows: hover ? '1fr' : '0fr' }}
        >
          <div className="overflow-hidden">
            <ul className="pt-2 space-y-1 text-[12px] text-[#45464d]">
              {agent.topSkills.map((s) => (
                <li key={s} className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full" style={{ backgroundColor: agent.color }} />
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
```

- [ ] **Step 2:** Run `npx tsc --noEmit`.
- [ ] **Step 3:** Commit — `agents: AgentCard with portrait + hover-revealed skills`

### Task 2.3 — AgentGrid section

- [ ] **Step 1:** Create `src/components/landing/agent-grid.tsx`:

```tsx
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
```

- [ ] **Step 2:** Replace `src/app/agents/client.tsx` contents:

```tsx
'use client'

import { PublicNav } from '@/components/landing/public-nav'
import { PublicFooter } from '@/components/landing/public-footer'
import { AgentGrid } from '@/components/landing/agent-grid'

export default function AgentsPageClient() {
  return (
    <div className="!bg-[#f8f9ff] !text-[#0b1c30] font-body selection:bg-[#e9ddff] selection:text-[#5516be] min-h-screen">
      <PublicNav />
      <main className="pt-20">
        <AgentGrid />
      </main>
      <PublicFooter />
    </div>
  )
}
```

- [ ] **Step 3:** `npx tsc --noEmit` + `npm run build`.
- [ ] **Step 4:** Manually open http://localhost:3001/agents and hover each card.
- [ ] **Step 5:** Commit — `agents: swap 4-slide layout for 12-agent grid`

---

## Phase 3 — Pricing page polish

**Target file:** `src/app/pricing/client.tsx` currently renders a single `PricingSlide` from `slides.tsx`. We'll replace with a dedicated component.

**Signature moment:** Monthly/Annual toggle that morphs the price number smoothly (not a hard swap). "Most popular" tier has a soft glow halo.

### Task 3.1 — Pricing content

- [ ] **Step 1:** Append to `src/components/landing/landing-content.ts`:

```ts
export interface PricingTier {
  id: string
  name: string
  priceMonthly: number
  priceAnnual: number
  tagline: string
  features: string[]
  popular?: boolean
}

export const PRICING_TIERS: PricingTier[] = [
  {
    id: 'starter',
    name: 'Starter',
    priceMonthly: 49, priceAnnual: 39,
    tagline: 'For solo founders getting started.',
    features: ['3 core agents (Mia, Scout, Aria)', '500 credits/month', 'Email support', '1 brand workspace'],
  },
  {
    id: 'growth',
    name: 'Growth',
    priceMonthly: 149, priceAnnual: 119,
    tagline: 'For brands scaling past $1M.',
    features: ['All 12 agents', '3,000 credits/month', 'Priority support', '3 brand workspaces', 'BYO AI keys (optional)'],
    popular: true,
  },
  {
    id: 'scale',
    name: 'Scale',
    priceMonthly: 499, priceAnnual: 399,
    tagline: 'For multi-brand operators.',
    features: ['All 12 agents', 'Unlimited credits', 'Dedicated slack channel', 'Unlimited brands', 'Custom skill library', 'White-label option'],
  },
]
```

- [ ] **Step 2:** Commit — `landing-content: add PRICING_TIERS`

### Task 3.2 — PricingTable component

- [ ] **Step 1:** Create `src/components/landing/pricing-table.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { useState } from 'react'
import { PRICING_TIERS } from './landing-content'
import { useInViewport } from './use-in-viewport'
import { useReducedMotion } from './use-reduced-motion'
import { useCountUp } from './use-count-up'

function AnimatedPrice({ value, active }: { value: number; active: boolean }) {
  const n = useCountUp(value, 400, active)
  return <span className="tabular-nums">{n}</span>
}

export function PricingTable() {
  const [annual, setAnnual] = useState(true)
  const reduced = useReducedMotion()
  const { ref, inView } = useInViewport<HTMLDivElement>(0.2)

  return (
    <section className="py-20 bg-white">
      <div ref={ref} className="max-w-6xl mx-auto px-6">
        <header className="text-center space-y-3 mb-10">
          <span className="inline-block rounded-full bg-[#e9ddff] px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#5516be]">
            Pricing
          </span>
          <h1 className="font-heading font-bold text-4xl md:text-5xl text-[#0b1c30]">
            Simple. Transparent. Grows with you.
          </h1>
          <p className="text-[#45464d]">Start free for 14 days. Cancel anytime.</p>
        </header>

        {/* Monthly/Annual toggle */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex rounded-full bg-[#eff4ff] p-1 border border-[#c6c6cd]/30">
            <button
              type="button"
              onClick={() => setAnnual(false)}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors ${!annual ? 'bg-white text-[#0b1c30] shadow' : 'text-[#45464d]'}`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors ${annual ? 'bg-white text-[#0b1c30] shadow' : 'text-[#45464d]'}`}
            >
              Annual <span className="ml-1 text-[10px] text-[#059669] font-bold">SAVE 20%</span>
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {PRICING_TIERS.map((tier, i) => {
            const price = annual ? tier.priceAnnual : tier.priceMonthly
            return (
              <div
                key={tier.id}
                className={`relative rounded-2xl p-8 border transition-all ${
                  tier.popular
                    ? 'border-[#6b38d4] bg-white shadow-[0_0_0_4px_#6b38d420]'
                    : 'border-[#c6c6cd]/40 bg-white'
                } hover:-translate-y-1 hover:shadow-xl`}
                style={{
                  animation: inView && !reduced ? `fadeSlide 400ms ease-out ${i * 120}ms both` : 'none',
                  opacity: inView || reduced ? 1 : 0,
                }}
              >
                {tier.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[#6b38d4] text-white text-[11px] font-bold uppercase tracking-wider">
                    Most popular
                  </span>
                )}
                <h3 className="font-heading font-bold text-xl text-[#0b1c30]">{tier.name}</h3>
                <p className="text-sm text-[#45464d] mt-1 min-h-[40px]">{tier.tagline}</p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="font-heading font-bold text-5xl text-[#0b1c30]">
                    $<AnimatedPrice value={price} active={inView && !reduced} />
                  </span>
                  <span className="text-[#45464d] text-sm">/mo{annual && ', billed annually'}</span>
                </div>
                <ul className="mt-6 space-y-2.5 text-sm text-[#0b1c30]">
                  {tier.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span className="text-[#6b38d4] font-bold">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`mt-8 block text-center py-3 rounded-xl font-bold transition-all hover:-translate-y-[2px] active:scale-95 ${
                    tier.popular
                      ? 'bg-[#6b38d4] text-white hover:shadow-xl'
                      : 'bg-[#0b1c30] text-white hover:shadow-lg'
                  }`}
                >
                  Start free trial
                </Link>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2:** Replace `src/app/pricing/client.tsx` to render `<PricingTable />` instead of `<PricingSlide />`.
- [ ] **Step 3:** `npx tsc --noEmit` + `npm run build`.
- [ ] **Step 4:** Open http://localhost:3001/pricing, toggle Monthly/Annual and verify the price number morphs.
- [ ] **Step 5:** Commit — `pricing: 3-tier table with annual toggle + price morph`

### Task 3.3 — Reuse FAQ at bottom

- [ ] **Step 1:** Add pricing-specific FAQ entries to `landing-content.ts` in a new export:

```ts
export const PRICING_FAQ_ITEMS = [
  { q: 'Can I cancel anytime?', a: 'Yes. Cancel in one click from your dashboard — no email back-and-forth.' },
  { q: 'What are credits?', a: 'Credits power every AI action (ad draft, email, analysis). Typical brand uses 2,000–3,000/month.' },
  { q: 'Do I need my own AI API keys?', a: 'No. We include model inference at every tier. You can BYO keys on Growth+ if you want direct control.' },
  { q: 'Is the free trial full-featured?', a: 'Yes. 14 days, all 12 agents, 1,000 credits included. No card required to start.' },
]
```

- [ ] **Step 2:** In `pricing-table.tsx`, after the tier grid, add:

```tsx
import { FaqAccordion } from './faq-accordion'
// inside PricingTable, after the tier grid:
<div className="mt-20 max-w-3xl mx-auto">
  <h2 className="font-heading font-bold text-3xl text-center text-[#0b1c30] mb-8">Pricing questions</h2>
  <FaqAccordion items={PRICING_FAQ_ITEMS} />
</div>
```

- [ ] **Step 3:** Open `faq-accordion.tsx` — if it doesn't accept an `items` prop, refactor so it does (currently it likely uses `FAQ_ITEMS` from content). Add `items?: FaqItem[]` prop, default to the landing's items.
- [ ] **Step 4:** `npx tsc --noEmit`. Commit — `pricing: FAQ accordion reused with pricing-specific Q&As`

---

## Phase 4 — Security page polish

**Target file:** `src/app/security/client.tsx` (currently renders `SecuritySlide` from `slides.tsx`).

**Signature moment:** Animated data-flow diagram — brand lanes run in parallel, each isolated, with a lock icon between them. Breathing lock icon in the hero.

### Task 4.1 — Security content

- [ ] **Step 1:** Append to `landing-content.ts`:

```ts
export const SECURITY_BADGES = [
  { id: 'soc2',  label: 'SOC 2 Type II', note: 'In progress' },
  { id: 'gdpr',  label: 'GDPR',          note: 'Compliant' },
  { id: 'ccpa',  label: 'CCPA',          note: 'Compliant' },
  { id: 'aes',   label: 'AES-256',       note: 'At rest' },
  { id: 'tls',   label: 'TLS 1.3',       note: 'In transit' },
  { id: 'rls',   label: 'Row-level auth', note: 'Supabase RLS' },
]

export const SECURITY_PILLARS = [
  { id: 'isolation', title: 'Your brand, your lane',  body: 'Every brand runs in an isolated data lane. Agents for brand A literally cannot see brand B.' },
  { id: 'encryption', title: 'Encrypted end to end',   body: 'AES-256 at rest. TLS 1.3 in transit. Nothing unencrypted ever hits disk.' },
  { id: 'audit',     title: 'Every action is logged', body: 'Full audit trail: which agent, which skill, which input, which output, at what timestamp.' },
  { id: 'keys',      title: 'Your keys, optionally',  body: 'Bring your own OpenAI / Anthropic / fal.ai keys on Growth+ — we never touch them in plaintext.' },
]
```

- [ ] **Step 2:** Commit — `landing-content: add SECURITY_BADGES + SECURITY_PILLARS`

### Task 4.2 — SecurityPage component

- [ ] **Step 1:** Create `src/components/landing/security-page.tsx`:

```tsx
'use client'

import { PublicNav } from './public-nav'
import { PublicFooter } from './public-footer'
import { AnimatedGlassCard } from './animated-glass-card'
import { SECURITY_BADGES, SECURITY_PILLARS } from './landing-content'
import { useReducedMotion } from './use-reduced-motion'

export default function SecurityPage() {
  const reduced = useReducedMotion()

  return (
    <div className="!bg-[#f8f9ff] !text-[#0b1c30] font-body selection:bg-[#e9ddff] selection:text-[#5516be] min-h-screen">
      <PublicNav />
      <main className="pt-20">
        {/* Hero */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-6 text-center space-y-6">
            <div className="inline-block relative">
              <div className="w-24 h-24 rounded-full bg-[#6b38d4]/15 flex items-center justify-center"
                   style={{ animation: reduced ? 'none' : 'breathe 2s ease-in-out infinite' }}>
                <svg className="w-12 h-12 text-[#6b38d4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
            </div>
            <h1 className="font-heading font-bold text-4xl md:text-5xl lg:text-6xl text-[#0b1c30]">
              Your data is yours. Always.
            </h1>
            <p className="text-lg text-[#45464d] max-w-2xl mx-auto">
              Agents operate on your data in isolated lanes. Fully encrypted, fully logged, fully under your control.
            </p>
          </div>
        </section>

        {/* Badges */}
        <section className="py-12 bg-white border-y border-[#c6c6cd]/10">
          <div className="max-w-6xl mx-auto px-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {SECURITY_BADGES.map((b, i) => (
                <div
                  key={b.id}
                  className="rounded-xl border border-[#c6c6cd]/40 bg-white p-4 text-center hover:-translate-y-1 hover:shadow-md transition-all"
                  style={{ animation: reduced ? 'none' : `badgePop 400ms ease-out ${i * 80}ms both` }}
                >
                  <div className="font-heading font-bold text-sm text-[#0b1c30]">{b.label}</div>
                  <div className="text-[11px] text-[#45464d] mt-0.5">{b.note}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pillars */}
        <section className="py-16">
          <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-6">
            {SECURITY_PILLARS.map((p, i) => (
              <AnimatedGlassCard key={p.id} delay={i * 100}>
                <h3 className="font-heading font-bold text-xl text-[#0b1c30]">{p.title}</h3>
                <p className="mt-2 text-sm text-[#45464d] leading-relaxed">{p.body}</p>
              </AnimatedGlassCard>
            ))}
          </div>
        </section>

        {/* Data-lane diagram */}
        <DataLaneDiagram />
      </main>
      <PublicFooter />
    </div>
  )
}

function DataLaneDiagram() {
  const reduced = useReducedMotion()
  return (
    <section className="py-16 bg-white">
      <div className="max-w-5xl mx-auto px-6">
        <h2 className="font-heading font-bold text-3xl text-center text-[#0b1c30] mb-10">One brand per lane. No crossover.</h2>
        <div className="space-y-4">
          {['Brand A', 'Brand B', 'Brand C'].map((b, i) => (
            <div
              key={b}
              className="relative h-14 rounded-lg bg-[#eff4ff] border border-[#c6c6cd]/30 flex items-center px-5 overflow-hidden"
            >
              <span className="font-semibold text-[#0b1c30] z-10">{b}</span>
              {!reduced && (
                <span
                  className="absolute top-1/2 -translate-y-1/2 w-16 h-6 rounded-full bg-gradient-to-r from-transparent via-[#6b38d4]/40 to-transparent"
                  style={{ animation: `sweep 3s ease-in-out ${i * 0.4}s infinite` }}
                />
              )}
              <span className="ml-auto z-10 text-[#6b38d4] text-sm font-mono">🔒 isolated</span>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-[#45464d]">
          Row-level security at the database layer. Agents literally cannot query outside their brand's lane.
        </p>
      </div>
    </section>
  )
}
```

- [ ] **Step 2:** Update `src/app/security/client.tsx` to render `<SecurityPage />` (new default export) instead of `<SecuritySlide />`.
- [ ] **Step 3:** `npx tsc --noEmit` + `npm run build`.
- [ ] **Step 4:** Open http://localhost:3001/security and verify the breathing lock, badge stagger, and lane sweep.
- [ ] **Step 5:** Commit — `security: hero lock + badges + data-lane diagram`

---

## Phase 5 — Agency page polish

**Target file:** `src/app/agency/client.tsx`.

**Signature moment:** Hero with 5 brand logos orbiting around a central Mia — metaphor for "one crew, many brands". Below: multi-brand dashboard preview with click-to-switch.

### Task 5.1 — Agency content

- [ ] **Step 1:** Append to `landing-content.ts`:

```ts
export const AGENCY_FEATURES = [
  { id: 'multibrand',  title: 'Unlimited brands',       body: 'Manage 10, 50, 500 brands from one dashboard. No per-seat tax, no surprise overages.' },
  { id: 'whitelabel',  title: 'White-label ready',      body: 'Your logo, your domain, your colors. Your clients never see ours.' },
  { id: 'rbac',        title: 'Granular roles',         body: 'Owner, ops, client — scope access per brand, per skill, per action.' },
  { id: 'billing',     title: 'One bill, split view',   body: 'Agency master invoice. Per-brand credit usage breakdown for client billing.' },
  { id: 'reporting',   title: 'Weekly client reports',  body: 'Mia briefs each client every Monday with what shipped, what moved, what\'s next.' },
  { id: 'api',         title: 'API + webhooks',         body: 'Push agent events into your existing PM tool (Notion, Asana, Linear).' },
]

export const AGENCY_ORBIT_BRANDS = [
  { id: 'a', label: 'Skincare Co' },
  { id: 'b', label: 'Apparel Brand' },
  { id: 'c', label: 'Coffee Roasters' },
  { id: 'd', label: 'Pet Wellness' },
  { id: 'e', label: 'Home Goods' },
]
```

- [ ] **Step 2:** Commit — `landing-content: add AGENCY_FEATURES + orbit brands`

### Task 5.2 — AgencyPage with orbit hero

- [ ] **Step 1:** Create `src/components/landing/agency-page.tsx`:

```tsx
'use client'

import Image from 'next/image'
import Link from 'next/link'
import { PublicNav } from './public-nav'
import { PublicFooter } from './public-footer'
import { AGENCY_FEATURES, AGENCY_ORBIT_BRANDS } from './landing-content'
import { useReducedMotion } from './use-reduced-motion'
import { useInViewport } from './use-in-viewport'

function OrbitHero() {
  const reduced = useReducedMotion()
  const n = AGENCY_ORBIT_BRANDS.length
  return (
    <div className="relative w-[420px] h-[420px] mx-auto">
      {/* Center Mia */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 rounded-full overflow-hidden border-4 border-white shadow-xl">
        <Image src="/agents/mia.png" alt="Mia" width={112} height={112} />
      </div>

      {/* Orbit ring */}
      <div
        className="absolute inset-0 rounded-full border border-dashed border-[#6b38d4]/30"
        style={{ animation: reduced ? 'none' : 'spin 40s linear infinite' }}
      >
        {AGENCY_ORBIT_BRANDS.map((brand, i) => {
          const angle = (i * 360) / n
          const rad = (angle * Math.PI) / 180
          const r = 190
          const x = 210 + r * Math.cos(rad)
          const y = 210 + r * Math.sin(rad)
          return (
            <div
              key={brand.id}
              className="absolute px-3 py-1.5 rounded-full bg-white border border-[#c6c6cd]/30 shadow text-xs font-semibold text-[#0b1c30]"
              style={{
                left: x,
                top: y,
                transform: 'translate(-50%, -50%)',
                animation: reduced ? 'none' : 'spin 40s linear infinite reverse',
              }}
            >
              {brand.label}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function AgencyPage() {
  const { ref, inView } = useInViewport<HTMLDivElement>(0.2)
  const reduced = useReducedMotion()

  return (
    <div className="!bg-[#f8f9ff] !text-[#0b1c30] font-body selection:bg-[#e9ddff] selection:text-[#5516be] min-h-screen">
      <PublicNav />
      <main className="pt-20">
        {/* Hero */}
        <section className="py-16">
          <div className="max-w-6xl mx-auto px-6 grid lg:grid-cols-2 gap-10 items-center">
            <div className="space-y-5">
              <span className="inline-block rounded-full bg-[#e9ddff] px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#5516be]">
                For Agencies
              </span>
              <h1 className="font-heading font-bold text-4xl md:text-5xl lg:text-6xl text-[#0b1c30] leading-[1.05]">
                One crew. <span className="text-[#6b38d4]">Many brands.</span>
              </h1>
              <p className="text-lg text-[#45464d] max-w-xl">
                Spin up the full Growth OS crew per client. White-labeled, isolated, billed centrally. Run 50 brands from one seat.
              </p>
              <Link
                href="/signup?agency=true"
                className="inline-flex bg-[#0b1c30] text-white px-6 py-3 rounded-xl font-bold hover:-translate-y-[2px] hover:shadow-xl active:scale-95 transition-all"
              >
                Book agency demo
              </Link>
            </div>
            <OrbitHero />
          </div>
        </section>

        {/* Feature grid */}
        <section ref={ref} className="py-16 bg-white">
          <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {AGENCY_FEATURES.map((f, i) => (
              <div
                key={f.id}
                className="p-6 rounded-2xl bg-white border border-[#c6c6cd]/40 hover:-translate-y-1 hover:shadow-xl transition-all"
                style={{
                  animation: inView && !reduced ? `fadeSlide 400ms ease-out ${i * 80}ms both` : 'none',
                  opacity: inView || reduced ? 1 : 0,
                }}
              >
                <h3 className="font-heading font-bold text-lg text-[#0b1c30]">{f.title}</h3>
                <p className="mt-2 text-sm text-[#45464d] leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  )
}
```

- [ ] **Step 2:** Update `src/app/agency/client.tsx` to render `<AgencyPage />`.
- [ ] **Step 3:** `npx tsc --noEmit` + `npm run build`.
- [ ] **Step 4:** Open http://localhost:3001/agency and verify the orbit animates.
- [ ] **Step 5:** Commit — `agency: orbit hero + features grid`

---

## Phase 6 — About page polish

**Target file:** `src/app/about/client.tsx` (53 lines, thin — hero + 3 stats + CTA).

**Signature moment:** Counter-up on the three existing stats (12 / 50+ / 24/7). Reuse the landing's animated signature founder note.

### Task 6.1 — Counter-up stats

- [ ] **Step 1:** In `src/app/about/client.tsx`, add imports:

```tsx
import { useInViewport } from '@/components/landing/use-in-viewport'
import { useCountUp } from '@/components/landing/use-count-up'
import { useReducedMotion } from '@/components/landing/use-reduced-motion'
```

- [ ] **Step 2:** Add an inline `AboutStat` helper above the `AboutPageClient` function:

```tsx
function AboutStat({ value, suffix = '', label }: { value: number; suffix?: string; label: string }) {
  const { ref, inView } = useInViewport<HTMLDivElement>(0.3)
  const reduced = useReducedMotion()
  const n = useCountUp(value, 1200, inView && !reduced)
  return (
    <div ref={ref} className="rounded-[40px] border border-white/60 bg-white/80 backdrop-blur-[20px] p-8 text-center hover:-translate-y-1 hover:shadow-xl transition-all">
      <p className="font-heading text-4xl font-bold text-[#6b38d4] tabular-nums">{n}{suffix}</p>
      <p className="mt-2 text-sm text-[#45464d]">{label}</p>
    </div>
  )
}
```

- [ ] **Step 3:** Replace the three hard-coded stat cards with `<AboutStat value={12} label="Specialized AI Agents" />`, `<AboutStat value={50} suffix="+" label="Marketing Skills" />`, `<AboutStat value={24} suffix="/7" label="Autonomous Operation" />`.
- [ ] **Step 4:** `npx tsc --noEmit`. Commit — `about: counter-up stats + hover lift`

### Task 6.2 — Add founder note

- [ ] **Step 1:** Below the stats grid in `about/client.tsx`, above the final CTA, render `<FounderNote />` (existing component from landing).
- [ ] **Step 2:** Import: `import { FounderNote } from '@/components/landing/founder-note'`
- [ ] **Step 3:** `npx tsc --noEmit`. Commit — `about: reuse animated founder note`

---

## Phase 7 — Verification

### Task 7.1 — Build + QA sweep

- [ ] **Step 1:** `npm run build` — expect clean build.
- [ ] **Step 2:** `npx tsc --noEmit` — expect no errors.
- [ ] **Step 3:** Start dev server (if not running) and manually load each of: `/market`, `/agents`, `/pricing`, `/security`, `/agency`, `/about`. Scroll through each, verify:
  - Initial entrance animations fire
  - Hover lifts work on cards
  - Counter-ups run once on viewport entry (don't re-run on re-scroll)
  - No console errors
  - Reduced-motion (DevTools → Rendering → "Emulate CSS prefers-reduced-motion: reduce") disables animations gracefully
- [ ] **Step 4:** If any issues found, fix inline and commit with specific message.
- [ ] **Step 5:** Commit final — `public-pages: polish pass complete — all 6 pages animated`

### Task 7.2 — Lighthouse spot-check (optional but recommended)

- [ ] **Step 1:** Run Lighthouse against `/agents` (heaviest page due to grid + images).
- [ ] **Step 2:** Targets: Performance ≥ 85, Accessibility ≥ 95. If lower, investigate (likely image sizing or CLS).
- [ ] **Step 3:** No commit required unless fixes needed.

---

## Out of scope (flagged, not solved here)

- **Penny and Luna portraits** — user flagged the `public/agents/penny.png` and `public/agents/luna.png` don't visually match their roles. Only one file per agent exists in the folder (no alternates to swap). Separate asset regeneration task.
- **Market page copy beyond the Shopify line** — any deeper rewrite of body copy.
- **Actual SOC 2 / GDPR compliance status** — copy uses placeholder states ("In progress", "Compliant"). User should confirm with legal before going live.

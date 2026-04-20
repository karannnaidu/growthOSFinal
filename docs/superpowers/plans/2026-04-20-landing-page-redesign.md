# Landing Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the public landing page (`src/components/landing/landing-page.tsx`) per design spec `docs/superpowers/specs/2026-04-20-landing-page-redesign-design.md` — URL-as-CTA hero, platform-agnostic positioning, 3-card "One Crew" block, trust cluster, 43 micro-interactions.

**Architecture:** Decompose the current 657-line single-file landing into focused sub-components in `src/components/landing/`. Copy lives in `landing-content.ts` as typed constants so marketing edits don't require touching animation code. Animations are CSS-only + small React state machines (no new dependencies). Respect `prefers-reduced-motion` globally.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4, TypeScript, existing color palette (`#f8f9ff`, `#0b1c30`, `#6b38d4`), existing `<PublicNav />` and `<PublicFooter />`. No new dependencies.

**Test strategy:** Project has no test framework installed. Verification is **manual browser check via `npm run dev`** at the end of each task, plus `npm run build` after each phase to catch type errors. The implementer MUST state explicitly whether they verified the feature in the browser.

**Execution mode:** Phase-by-phase. Complete all tasks in a phase, then run `npm run build`, then commit the phase before starting the next.

---

## Phase 0 — Foundation

### Task 0.1: Scaffold folder and content file

**Files:**
- Create: `src/components/landing/_new/.gitkeep` (temporary staging dir so we don't break the live page mid-build)
- Create: `src/components/landing/_new/landing-content.ts`

Rationale for `_new/` staging: we'll build components in isolation, then swap the export in `landing-page.tsx` at Phase 6. This avoids a half-broken homepage during development.

- [ ] **Step 1: Create the staging folder**

```bash
mkdir -p src/components/landing/_new
touch src/components/landing/_new/.gitkeep
```

- [ ] **Step 2: Create `landing-content.ts` with typed copy constants**

Create `src/components/landing/_new/landing-content.ts`:

```typescript
// Single source of truth for landing-page copy and structured data.
// Edit here to change marketing copy; component files consume these.

export const HERO_CONTENT = {
  h1: 'Your AI marketing crew. One URL away.',
  subhead:
    'Paste your store URL. Mia briefs 11 specialist agents. They run your marketing on autopilot.',
  urlPlaceholders: ['yourstore.com', 'acme.co', 'brand.shop', 'hellobrand.com'],
  ctaLabel: 'Start free →',
  ctaMicrocopy: 'No credit card. 14-day free trial.',
  miaStatus: 'Running your store on autopilot. 11 agents working.',
} as const

export type HeroSurface = {
  id: 'aria' | 'max' | 'scout' | 'echo' | 'penny'
  agent: string
  caption: string
  body: string
  accentColor: string
}

export const HERO_SURFACES: HeroSurface[] = [
  {
    id: 'aria',
    agent: 'Aria',
    caption: 'Aria · drafting variant 2 of 4',
    body: 'Drafted 4 ad variants from 147 customer reviews. Testing variant 3.',
    accentColor: '#F97316',
  },
  {
    id: 'max',
    agent: 'Max',
    caption: 'Max · live on Meta',
    body: "Paused 'Summer v1' — CPA drifted +22%. Scaled 'UGC hook 3' to $120/day.",
    accentColor: '#3B82F6',
  },
  {
    id: 'scout',
    agent: 'Scout',
    caption: 'Scout · 2 min ago',
    body: 'Spotted: checkout abandons spiked Tuesday 2pm. Flagged to Sage.',
    accentColor: '#0D9488',
  },
  {
    id: 'echo',
    agent: 'Echo',
    caption: 'Echo · competitive watch',
    body: '3 competitors dropped new hero images this week. Cached to library.',
    accentColor: '#64748B',
  },
  {
    id: 'penny',
    agent: 'Penny',
    caption: 'Penny · weekly',
    body: 'CAC fell to $18.40 (−9% WoW). LTV:CAC now 4.2x.',
    accentColor: '#059669',
  },
]

export const INTEGRATIONS_CONTENT = {
  header: 'Works with your stack — not against it.',
  subtext: 'Deep on Shopify. Friendly with everyone else.',
  groups: [
    {
      label: 'Storefronts',
      items: [
        { name: 'Shopify', logo: '/logos/shopify.svg' },
        { name: 'WooCommerce', logo: '/logos/woocommerce.svg' },
        { name: 'Wix', logo: '/logos/wix.svg' },
        { name: 'Squarespace', logo: '/logos/squarespace.svg' },
        { name: 'Webflow', logo: '/logos/webflow.svg' },
      ],
    },
    {
      label: 'Ad platforms',
      items: [
        { name: 'Meta', logo: '/logos/meta.svg' },
        { name: 'Google', logo: '/logos/google.svg' },
        { name: 'TikTok', logo: '/logos/tiktok.svg' },
        { name: 'Pinterest', logo: '/logos/pinterest.svg' },
      ],
    },
    {
      label: 'Email/SMS',
      items: [
        { name: 'Klaviyo', logo: '/logos/klaviyo.svg' },
        { name: 'Mailchimp', logo: '/logos/mailchimp.svg' },
        { name: 'Postscript', logo: '/logos/postscript.svg' },
      ],
    },
    {
      label: 'Analytics',
      items: [
        { name: 'GA4', logo: '/logos/ga4.svg' },
        { name: 'Triple Whale', logo: '/logos/triple-whale.svg' },
      ],
    },
  ],
} as const

export const ONE_CREW_CONTENT = {
  header: 'One crew. Every part of your marketing.',
  sub: 'Research, create, optimize — running in parallel, reporting up to Mia.',
  research: {
    avatars: ['Scout', 'Echo', 'Atlas'],
    stats: [
      { number: 147, label: 'customer reviews analyzed', agent: 'Scout' },
      { number: 3, label: 'competitor creative drops spotted this week', agent: 'Echo' },
      { number: 2, label: 'untapped audience segments surfaced', agent: 'Atlas' },
    ],
    accentColor: '#0D9488',
  },
  create: {
    tabs: [
      {
        id: 'ad',
        label: 'Ad copy',
        content: 'POV: You stop scrolling on reviews. Then scroll to checkout.',
        caption: 'Aria · Draft 3 of 4',
      },
      {
        id: 'email',
        label: 'Email',
        content: 'Subject: Did we forget something? 👀',
        caption: 'Luna · Cart recovery · Day 1',
      },
      {
        id: 'landing',
        label: 'Landing page',
        content: 'The only moisturizer tested on 200 real noses.',
        caption: 'Hugo · H1 rewrite',
      },
      {
        id: 'seo',
        label: 'SEO brief',
        content: "Target: 'best retinol for sensitive skin' — 8.2k/mo",
        caption: 'Hugo · keyword strategy',
      },
    ],
    accentColor: '#F97316',
  },
  optimize: {
    metrics: [
      { text: '+23% ROAS · UGC hooks', tone: 'up' as const },
      { text: '−14% CPA · Price anchoring test', tone: 'up' as const },
      { text: '$18.40 CAC · Down 9% WoW', tone: 'up' as const },
      { text: 'Paused 2 ads draining budget', tone: 'flat' as const },
    ],
    toast: "Skill saved ✨ 'UGC hook formula' added to your playbook",
    accentColor: '#3B82F6',
  },
} as const

export type ResultCase = {
  brand: string
  logo: string
  metric: string
  context: string
  platform: 'Shopify' | 'WooCommerce' | 'Custom'
  quote: string
  founderName: string
}

// Placeholder case studies. Replace with real data before launch.
export const RESULT_CASES: ResultCase[] = [
  {
    brand: 'Sample Brand A',
    logo: '/logos/placeholder-brand-a.svg',
    metric: '+34% ROAS',
    context: 'D2C skincare · 21 days · Aria + Max',
    platform: 'Shopify',
    quote: 'The creative refresh cycle paid for itself in a week.',
    founderName: 'Founder, Sample Brand A',
  },
  {
    brand: 'Sample Brand B',
    logo: '/logos/placeholder-brand-b.svg',
    metric: '−28% CAC',
    context: 'DTC apparel · 45 days · Luna + Atlas',
    platform: 'WooCommerce',
    quote: 'Email flows we never had time to build now run themselves.',
    founderName: 'Founder, Sample Brand B',
  },
  {
    brand: 'Sample Brand C',
    logo: '/logos/placeholder-brand-c.svg',
    metric: '+52% AOV',
    context: 'Wellness · 30 days · Sage + Atlas',
    platform: 'Custom',
    quote: 'Sage found a pricing change we would have missed.',
    founderName: 'Founder, Sample Brand C',
  },
  {
    brand: 'Sample Brand D',
    logo: '/logos/placeholder-brand-d.svg',
    metric: '+41% LTV',
    context: 'Food & bev · 60 days · Luna + Penny',
    platform: 'Shopify',
    quote: 'Penny caught a margin leak in week two. Game changer.',
    founderName: 'Founder, Sample Brand D',
  },
]

export const FOUNDER_NOTE = {
  paragraphs: [
    'I built Growth OS after watching dozens of D2C founders pay agencies $8–15k/month for work that arrived late, went stale fast, and still needed chasing.',
    'This isn\'t another ChatGPT wrapper. It\'s an autopilot crew — 12 specialists with their own skills, memory, and schedules — not one generalist in a chatbox. Mia orchestrates them based on what your store actually needs.',
    'Your data never trains shared models. Your creatives are yours. You can export everything and cancel anytime. That\'s the deal.',
  ],
  signatureName: 'Karan',
  signatureRole: 'Founder, Growth OS',
  signatureImage: '/founder-photo.jpg',
} as const

export const TRUST_BADGES = [
  { icon: '🛡️', label: 'Your data never trains shared models' },
  { icon: '🇪🇺', label: 'GDPR + CCPA compliant' },
  { icon: '🔄', label: 'Export everything. Cancel anytime.' },
  { icon: '🔒', label: 'SOC 2 Type II — in progress' },
] as const

export type FaqItem = { q: string; a: string }

export const FAQ_ITEMS: FaqItem[] = [
  {
    q: "I'm not on Shopify. Does this work for me?",
    a: 'Yes. We connect to WooCommerce, Wix, Squarespace, Webflow, and custom sites. Shopify is our deepest integration; the others are solid and improving weekly.',
  },
  {
    q: 'I already have an agency. Why would I switch?',
    a: 'Agencies bill $8–15k/month and take weeks to ship. Growth OS runs 24/7, ships in hours, and costs less than a junior strategist. Keep the agency for what humans do best — we handle the grind.',
  },
  {
    q: 'Is this just ChatGPT with a UI?',
    a: 'No. 12 specialist agents, each with their own skills, memory, and schedules. Mia orchestrates them based on what your store needs — not what you type into a box.',
  },
  {
    q: 'What if Mia makes a bad call?',
    a: 'She asks for approval on budget changes, brand-sensitive decisions, and anything below her confidence threshold. Everything else she executes and reports back.',
  },
  {
    q: 'Does this work under $10k MRR?',
    a: 'Yes. The agents scale down. For small brands, the biggest wins are usually Luna (email flows) and Hugo (SEO) — both compound without ad spend.',
  },
  {
    q: 'Who owns the creatives Mia generates?',
    a: 'You do. Always. Export anytime, use anywhere, no watermarks, no restrictions.',
  },
  {
    q: 'How fast will I see results?',
    a: '14–30 days for first wins (abandoned-cart recovery, creative refresh). 60–90 days for compounding results (SEO, LTV lift, new audience segments).',
  },
  {
    q: 'What does it cost?',
    a: 'Starts affordable with no ad-spend percentage. See full pricing for current tiers.',
  },
]

export const CTA_LABELS = {
  hero: 'Start free →',
  midPage: 'See what Mia finds on your store →',
  final: 'Start free → Mia begins in 60 seconds',
} as const
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors (file is only types + consts).

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/_new/
git commit -m "landing(new): scaffold content module with all copy"
```

---

### Task 0.2: Add utility hooks

**Files:**
- Create: `src/components/landing/_new/use-reduced-motion.ts`
- Create: `src/components/landing/_new/use-in-viewport.ts`
- Create: `src/components/landing/_new/use-battery-ok.ts`
- Create: `src/components/landing/_new/use-count-up.ts`

- [ ] **Step 1: Create `use-reduced-motion.ts`**

```typescript
'use client'

import { useEffect, useState } from 'react'

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return reduced
}
```

- [ ] **Step 2: Create `use-in-viewport.ts`**

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'

export function useInViewport<T extends HTMLElement = HTMLDivElement>(
  threshold = 0.3,
): { ref: React.RefObject<T | null>; inView: boolean } {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])

  return { ref, inView }
}
```

- [ ] **Step 3: Create `use-battery-ok.ts`**

```typescript
'use client'

import { useEffect, useState } from 'react'

type BatteryManager = { level: number; charging: boolean; addEventListener: (t: string, h: () => void) => void; removeEventListener: (t: string, h: () => void) => void }
type NavigatorWithBattery = Navigator & { getBattery?: () => Promise<BatteryManager> }

export function useBatteryOk(): boolean {
  const [ok, setOk] = useState(true)

  useEffect(() => {
    const nav = navigator as NavigatorWithBattery
    if (!nav.getBattery) return

    let battery: BatteryManager | null = null
    let cancelled = false

    const update = () => {
      if (!battery) return
      setOk(battery.charging || battery.level >= 0.2)
    }

    nav.getBattery().then((b) => {
      if (cancelled) return
      battery = b
      update()
      b.addEventListener('levelchange', update)
      b.addEventListener('chargingchange', update)
    })

    return () => {
      cancelled = true
      if (battery) {
        battery.removeEventListener('levelchange', update)
        battery.removeEventListener('chargingchange', update)
      }
    }
  }, [])

  return ok
}
```

- [ ] **Step 4: Create `use-count-up.ts`**

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'

export function useCountUp(target: number, durationMs = 1200, enabled = true): number {
  const [value, setValue] = useState(0)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) {
      setValue(target)
      return
    }

    let frameId: number

    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts
      const elapsed = ts - startRef.current
      const progress = Math.min(elapsed / durationMs, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(target * eased))

      if (progress < 1) frameId = requestAnimationFrame(tick)
    }

    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [target, durationMs, enabled])

  return value
}
```

- [ ] **Step 5: Verify compilation**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/landing/_new/
git commit -m "landing(new): add animation utility hooks"
```

---

### Task 0.3: Add logo directory and placeholder SVGs

**Files:**
- Create: `public/logos/.gitkeep`
- Create: 14 placeholder SVG files in `public/logos/`
- Create: 4 placeholder brand logos in `public/logos/placeholder-brand-{a,b,c,d}.svg`

Placeholder SVGs are generic grey pill-shapes with the platform name — the implementer or user replaces with real logos before launch.

- [ ] **Step 1: Create the logos directory**

```bash
mkdir -p public/logos
touch public/logos/.gitkeep
```

- [ ] **Step 2: Create a placeholder logo template and instantiate 18 files**

For each of these names, create `public/logos/<slug>.svg` with this template (swap `<LABEL>` for the display name):

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" width="200" height="60">
  <rect x="4" y="4" width="192" height="52" rx="26" fill="#e9ddff" stroke="#c6c6cd" stroke-width="1"/>
  <text x="100" y="37" text-anchor="middle" font-family="system-ui, sans-serif" font-size="18" font-weight="600" fill="#45464d"><LABEL></text>
</svg>
```

Slugs to create:
`shopify`, `woocommerce`, `wix`, `squarespace`, `webflow`, `meta`, `google`, `tiktok`, `pinterest`, `klaviyo`, `mailchimp`, `postscript`, `ga4`, `triple-whale`, `placeholder-brand-a`, `placeholder-brand-b`, `placeholder-brand-c`, `placeholder-brand-d`.

Labels use the platform's display name (e.g., `Triple Whale`, `GA4`). For placeholder brands use `Brand A`, `Brand B`, etc.

- [ ] **Step 3: Verify files exist**

```bash
ls public/logos/ | wc -l
```
Expected: `19` (18 SVGs + .gitkeep).

- [ ] **Step 4: Commit**

```bash
git add public/logos/
git commit -m "landing(new): add placeholder platform + brand logos"
```

---

## Phase 1 — Hero

### Task 1.1: URL input CTA component (reusable)

**Files:**
- Create: `src/components/landing/_new/url-input-cta.tsx`

This component is used in 3 places (hero, mid-page, final CTA). Props control the label + size variant.

- [ ] **Step 1: Create `url-input-cta.tsx`**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { HERO_CONTENT } from './landing-content'
import { useReducedMotion } from './use-reduced-motion'

type Size = 'hero' | 'default' | 'final'

const SIZE_CLASSES: Record<Size, { input: string; button: string; wrap: string }> = {
  hero: {
    wrap: 'flex flex-col sm:flex-row gap-3 w-full max-w-xl',
    input: 'h-16 text-lg px-5',
    button: 'h-16 px-8 text-lg',
  },
  default: {
    wrap: 'flex flex-col sm:flex-row gap-3 w-full max-w-lg',
    input: 'h-14 text-base px-4',
    button: 'h-14 px-6 text-base',
  },
  final: {
    wrap: 'flex flex-col sm:flex-row gap-3 w-full max-w-xl',
    input: 'h-14 text-base px-4',
    button: 'h-14 px-6 text-base',
  },
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const u = new URL(withScheme)
    if (!u.hostname.includes('.')) return null
    return u.toString()
  } catch {
    return null
  }
}

export function UrlInputCta({ size = 'default', label }: { size?: Size; label: string }) {
  const router = useRouter()
  const reduced = useReducedMotion()
  const [value, setValue] = useState('')
  const [placeholderIdx, setPlaceholderIdx] = useState(0)
  const [placeholderText, setPlaceholderText] = useState(HERO_CONTENT.urlPlaceholders[0])
  const [focused, setFocused] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cycling typewriter placeholder (only when empty + not focused + motion allowed)
  useEffect(() => {
    if (reduced || focused || value.length > 0) return
    const target = HERO_CONTENT.urlPlaceholders[placeholderIdx]
    let i = 0
    setPlaceholderText('')
    const typer = setInterval(() => {
      i += 1
      setPlaceholderText(target.slice(0, i))
      if (i >= target.length) {
        clearInterval(typer)
        setTimeout(() => {
          setPlaceholderIdx((p) => (p + 1) % HERO_CONTENT.urlPlaceholders.length)
        }, 1500)
      }
    }, 120)
    return () => clearInterval(typer)
  }, [placeholderIdx, focused, value, reduced])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const normalized = normalizeUrl(value)
    if (!normalized) {
      setError('Please enter a valid store URL.')
      return
    }
    setError(null)
    const target = `/signup?store=${encodeURIComponent(normalized)}`
    router.push(target)
  }

  const classes = SIZE_CLASSES[size]
  const buttonPulseClass = focused && !reduced ? 'animate-[pulse_1s_ease-in-out_infinite]' : ''

  return (
    <form onSubmit={onSubmit} className="space-y-2 w-full">
      <div className={classes.wrap}>
        <input
          type="url"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            if (error) setError(null)
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={reduced ? HERO_CONTENT.urlPlaceholders[0] : placeholderText}
          aria-label="Your store URL"
          className={`flex-1 rounded-xl border border-[#c6c6cd] bg-white focus:border-[#6b38d4] focus:ring-2 focus:ring-[#6b38d4]/30 outline-none transition-all ${classes.input}`}
        />
        <button
          type="submit"
          className={`relative overflow-hidden rounded-xl bg-[#0b1c30] text-white font-bold hover:-translate-y-[2px] hover:shadow-xl active:scale-95 transition-all ${classes.button} ${buttonPulseClass}`}
        >
          <span className="relative z-10">{label}</span>
          {!reduced && (
            <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shine_6s_linear_infinite]" />
          )}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-[#45464d]/70">{HERO_CONTENT.ctaMicrocopy}</p>
    </form>
  )
}
```

- [ ] **Step 2: Add `shine` keyframe to `globals.css`**

Append to `src/app/globals.css`:

```css
@keyframes shine {
  0% { transform: translateX(-100%); }
  40%, 100% { transform: translateX(200%); }
}
```

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/_new/url-input-cta.tsx src/app/globals.css
git commit -m "landing(new): reusable URL-input CTA with typewriter placeholder + shine"
```

---

### Task 1.2: Hero canvas surfaces

**Files:**
- Create: `src/components/landing/_new/hero-canvas-surfaces.tsx`

Each surface is a small presentational tile for one agent. Rendered individually; rotation is managed by the parent.

- [ ] **Step 1: Create `hero-canvas-surfaces.tsx`**

```typescript
'use client'

import type { HeroSurface } from './landing-content'

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide"
      style={{ backgroundColor: `${color}1A`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {children}
    </span>
  )
}

export function SurfaceAria({ s }: { s: HeroSurface }) {
  return (
    <div className="p-5 rounded-2xl bg-white border border-[#c6c6cd]/40 shadow-lg space-y-3 w-[320px]">
      <Pill color={s.accentColor}>{s.caption}</Pill>
      <div className="grid grid-cols-2 gap-2">
        <div className="h-20 rounded-lg bg-gradient-to-br from-[#f8f9ff] to-[#eff4ff] border border-[#c6c6cd]/30" />
        <div className="relative h-20 rounded-lg bg-gradient-to-br from-[#eff4ff] to-[#e9ddff] border border-[#F97316]/30 animate-[pulse_1.2s_ease-out_1]">
          <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-[#F97316] text-white text-[9px] font-bold tracking-wider">NEW</span>
        </div>
      </div>
      <p className="text-[13px] leading-snug text-[#45464d]">{s.body}</p>
    </div>
  )
}

export function SurfaceMax({ s }: { s: HeroSurface }) {
  const rows = [
    { name: "Summer v1", roas: '1.4x', status: 'Paused' },
    { name: "UGC hook 3", roas: '3.8x', status: 'Scaling' },
    { name: "Retarget 30d", roas: '5.2x', status: 'Stable' },
  ]
  return (
    <div className="p-5 rounded-2xl bg-white border border-[#c6c6cd]/40 shadow-lg space-y-3 w-[320px]">
      <Pill color={s.accentColor}>{s.caption}</Pill>
      <div className="text-[12px] divide-y divide-[#c6c6cd]/20">
        {rows.map((r, i) => (
          <div
            key={r.name}
            className={`flex justify-between items-center py-2 ${i === 0 ? 'animate-[fadeSlide_300ms_ease-out_1]' : ''}`}
          >
            <span className="text-[#0b1c30] font-medium">{r.name}</span>
            <span className="text-[#45464d]">{r.roas}</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                r.status === 'Paused'
                  ? 'bg-amber-100 text-amber-800'
                  : r.status === 'Scaling'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-slate-100 text-slate-700'
              }`}
            >
              {r.status}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[13px] leading-snug text-[#45464d]">{s.body}</p>
    </div>
  )
}

export function SurfaceScout({ s }: { s: HeroSurface }) {
  return (
    <div className="p-5 rounded-2xl bg-white border border-[#c6c6cd]/40 shadow-lg space-y-3 w-[320px]">
      <Pill color={s.accentColor}>
        <span className="relative">
          <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-75" />
          <span className="relative block w-1.5 h-1.5 rounded-full bg-red-500" />
        </span>
        {s.caption}
      </Pill>
      <p className="text-[13px] leading-snug text-[#45464d]">{s.body}</p>
    </div>
  )
}

export function SurfaceEcho({ s }: { s: HeroSurface }) {
  return (
    <div className="p-5 rounded-2xl bg-white border border-[#c6c6cd]/40 shadow-lg space-y-3 w-[320px]">
      <Pill color={s.accentColor}>{s.caption}</Pill>
      <div className="grid grid-cols-3 gap-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="aspect-video rounded bg-gradient-to-br from-slate-100 to-slate-200" />
        ))}
      </div>
      <p className="text-[13px] leading-snug text-[#45464d]">{s.body}</p>
    </div>
  )
}

export function SurfacePenny({ s }: { s: HeroSurface }) {
  return (
    <div className="p-5 rounded-2xl bg-white border border-[#c6c6cd]/40 shadow-lg space-y-3 w-[320px]">
      <Pill color={s.accentColor}>{s.caption}</Pill>
      <svg viewBox="0 0 200 40" className="w-full h-10">
        <polyline
          points="0,32 30,28 60,30 90,22 120,18 150,12 180,8 200,6"
          fill="none"
          stroke={s.accentColor}
          strokeWidth="2"
          strokeLinecap="round"
          style={{ strokeDasharray: 400, strokeDashoffset: 400, animation: 'drawLine 600ms ease-out forwards' }}
        />
      </svg>
      <p className="text-[13px] leading-snug text-[#45464d]">{s.body}</p>
    </div>
  )
}

export function renderSurface(s: HeroSurface) {
  switch (s.id) {
    case 'aria': return <SurfaceAria s={s} />
    case 'max': return <SurfaceMax s={s} />
    case 'scout': return <SurfaceScout s={s} />
    case 'echo': return <SurfaceEcho s={s} />
    case 'penny': return <SurfacePenny s={s} />
  }
}
```

- [ ] **Step 2: Add keyframes to `globals.css`**

Append:

```css
@keyframes fadeSlide {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes drawLine {
  to { stroke-dashoffset: 0; }
}
```

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/_new/hero-canvas-surfaces.tsx src/app/globals.css
git commit -m "landing(new): 5 hero canvas surfaces with per-surface micro-interactions"
```

---

### Task 1.3: Hero split-canvas component

**Files:**
- Create: `src/components/landing/_new/hero-split-canvas.tsx`

- [ ] **Step 1: Create `hero-split-canvas.tsx`**

```typescript
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
          <div
            key={current.id}
            className="absolute top-8 -right-2 md:right-8"
            style={{ animation: animating ? 'surfaceIn 400ms cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none' }}
          >
            {renderSurface(current)}
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Add keyframes to `globals.css`**

Append:

```css
@keyframes breathe {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.55; }
}
@keyframes surfaceIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
```

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual browser check**

Temporarily swap `src/components/landing/landing-page.tsx` to render only the new hero:

```tsx
import { HeroSplitCanvas } from './_new/hero-split-canvas'
export default function LandingPage() {
  return <HeroSplitCanvas />
}
```

Run: `npm run dev` and open the homepage. Verify:
- Mia portrait with breathing glow
- URL input with cycling typewriter placeholder
- CTA button with shine sweep
- Rotating canvas surfaces every ~4s
- Hover on right side pauses rotation
- Status line shows "11 agents working" / "12 agents working" toggle

Revert `landing-page.tsx` (leave it on the old content). Only commit `_new/` changes.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/_new/hero-split-canvas.tsx src/app/globals.css
git commit -m "landing(new): hero with Mia anchor + 5-surface rotating canvas"
```

---

### Phase 1 gate

Run full build:

```bash
npm run build
```

Expected: clean build, no type errors. If errors, fix before Phase 2.

---

## Phase 2 — Integrations Marquee

### Task 2.1: Marquee component

**Files:**
- Create: `src/components/landing/_new/integrations-marquee.tsx`

- [ ] **Step 1: Create component**

```typescript
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
```

- [ ] **Step 2: Add marquee keyframe + pause-on-hover to `globals.css`**

Append:

```css
@keyframes marquee {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
@media (hover: hover) {
  .group:hover [style*="marquee"] { animation-play-state: paused !important; }
}
```

- [ ] **Step 3: Manual browser check**

Temporarily render `<IntegrationsMarquee />` in `landing-page.tsx`. Verify:
- Marquee scrolls left smoothly, no jitter at loop point
- Hover pauses it
- Logos greyscale → color on hover, tilt ~3°
- Edge fade gradients visible

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/_new/integrations-marquee.tsx src/app/globals.css
git commit -m "landing(new): integrations marquee with hover pause + greyscale→color"
```

---

## Phase 3 — One Crew 3-Card Block

### Task 3.1: Research card

**Files:**
- Create: `src/components/landing/_new/research-card.tsx`

- [ ] **Step 1: Create component**

```typescript
'use client'

import { ONE_CREW_CONTENT } from './landing-content'
import { useInViewport } from './use-in-viewport'
import { useReducedMotion } from './use-reduced-motion'
import { useCountUp } from './use-count-up'

function AgentDot({ name, live }: { name: string; live?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-7 h-7 rounded-full bg-[#0D9488]/15 flex items-center justify-center text-[10px] font-bold text-[#0D9488]">
        {name[0]}
      </div>
      {live && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
    </div>
  )
}

function CounterLine({ n, label, enabled }: { n: number; label: string; enabled: boolean }) {
  const value = useCountUp(n, 1200, enabled)
  return (
    <li className="flex items-baseline gap-2">
      <span className="font-heading font-bold text-2xl text-[#0D9488] tabular-nums">{value}</span>
      <span className="text-sm text-[#45464d]">{label}</span>
    </li>
  )
}

export function ResearchCard() {
  const { research } = ONE_CREW_CONTENT
  const { ref, inView } = useInViewport<HTMLDivElement>(0.3)
  const reduced = useReducedMotion()
  const enabled = inView && !reduced

  return (
    <div
      ref={ref}
      className="relative p-6 rounded-2xl bg-white border border-[#c6c6cd]/40 hover:shadow-[0_0_0_2px_#0D948833] transition-shadow overflow-hidden min-h-[480px] flex flex-col"
    >
      {/* Scanning line sweep */}
      {!reduced && (
        <div className="pointer-events-none absolute inset-x-0 h-1/3 bg-gradient-to-b from-transparent via-[#0D9488]/5 to-transparent animate-[sweep_6s_ease-in-out_infinite]" />
      )}

      <header className="space-y-4 mb-6">
        <span className="inline-block px-2.5 py-1 rounded-full bg-[#0D9488]/10 text-[#0D9488] text-[11px] font-bold uppercase tracking-wider">
          Research
        </span>
        <div className="flex gap-2">
          <AgentDot name="Scout" live />
          <AgentDot name="Echo" />
          <AgentDot name="Atlas" />
        </div>
      </header>

      <ul className="space-y-4 flex-1">
        {research.stats.map((s) => (
          <CounterLine key={s.label} n={s.number} label={`${s.label}`} enabled={enabled} />
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Add `sweep` keyframe to `globals.css`**

Append:

```css
@keyframes sweep {
  0%, 100% { transform: translateY(-50%); opacity: 0.3; }
  50% { transform: translateY(50vh); opacity: 0.6; }
}
```

Note: the 50vh is card-relative-ish due to overflow-hidden — fine for visual effect.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/_new/research-card.tsx src/app/globals.css
git commit -m "landing(new): research card with counter-up + scanning sweep"
```

---

### Task 3.2: Create card

**Files:**
- Create: `src/components/landing/_new/create-card.tsx`

- [ ] **Step 1: Create component**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { ONE_CREW_CONTENT } from './landing-content'
import { useInViewport } from './use-in-viewport'
import { useReducedMotion } from './use-reduced-motion'

export function CreateCard() {
  const { create } = ONE_CREW_CONTENT
  const { ref, inView } = useInViewport<HTMLDivElement>(0.3)
  const reduced = useReducedMotion()
  const enabled = inView && !reduced

  const [tabIdx, setTabIdx] = useState(0)
  const [showContent, setShowContent] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setShowContent(true)
      return
    }
    setShowContent(false)
    const reveal = setTimeout(() => setShowContent(true), 1000)
    const next = setTimeout(() => {
      setTabIdx((p) => (p + 1) % create.tabs.length)
    }, 3000)
    return () => {
      clearTimeout(reveal)
      clearTimeout(next)
    }
  }, [tabIdx, enabled, create.tabs.length])

  const current = create.tabs[tabIdx]

  return (
    <div
      ref={ref}
      className="relative p-6 rounded-2xl bg-white border border-[#c6c6cd]/40 hover:shadow-[0_0_0_2px_#F9731633] transition-shadow min-h-[480px] flex flex-col"
    >
      <header className="space-y-4 mb-6">
        <span className="inline-block px-2.5 py-1 rounded-full bg-[#F97316]/10 text-[#F97316] text-[11px] font-bold uppercase tracking-wider">
          Create
        </span>

        <div className="flex gap-1 text-[12px] border-b border-[#c6c6cd]/30 overflow-x-auto">
          {create.tabs.map((t, i) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTabIdx(i)}
              className={`relative pb-2 px-3 transition-colors whitespace-nowrap ${
                i === tabIdx ? 'text-[#F97316] font-semibold' : 'text-[#45464d]'
              }`}
            >
              {t.label}
              {i === tabIdx && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#F97316] transition-all" />
              )}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 space-y-3">
        {showContent ? (
          <div className="space-y-3 animate-[fadeIn_200ms_ease-out]">
            <p className="text-[15px] text-[#0b1c30] leading-snug">{current.content}</p>
            <p className="text-xs text-[#45464d]/70">{current.caption}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="h-4 rounded bg-gradient-to-r from-[#eff4ff] via-[#e9ddff] to-[#eff4ff] animate-[shimmer_1.2s_linear_infinite] bg-[length:200%_100%]" />
            <div className="h-4 w-3/4 rounded bg-gradient-to-r from-[#eff4ff] via-[#e9ddff] to-[#eff4ff] animate-[shimmer_1.2s_linear_infinite] bg-[length:200%_100%]" />
          </div>
        )}
      </div>

      <div className="inline-flex items-center gap-1.5 mt-4 self-end text-xs text-green-700 font-medium animate-[fadeIn_200ms_ease-out]">
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
        </svg>
        Delivered to your dashboard
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add shimmer/fadeIn keyframes to `globals.css`**

Append:

```css
@keyframes shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/_new/create-card.tsx src/app/globals.css
git commit -m "landing(new): create card with tab rotation + skeleton reveal"
```

---

### Task 3.3: Optimize card

**Files:**
- Create: `src/components/landing/_new/optimize-card.tsx`

- [ ] **Step 1: Create component**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { ONE_CREW_CONTENT } from './landing-content'
import { useInViewport } from './use-in-viewport'
import { useReducedMotion } from './use-reduced-motion'

export function OptimizeCard() {
  const { optimize } = ONE_CREW_CONTENT
  const { ref, inView } = useInViewport<HTMLDivElement>(0.3)
  const reduced = useReducedMotion()
  const enabled = inView && !reduced

  const [metricIdx, setMetricIdx] = useState(0)
  const [showToast, setShowToast] = useState(false)

  useEffect(() => {
    if (!enabled) return
    const next = setInterval(() => {
      setMetricIdx((p) => {
        const np = (p + 1) % optimize.metrics.length
        if (np === 0) {
          setShowToast(true)
          setTimeout(() => setShowToast(false), 2000)
        }
        return np
      })
    }, 3000)
    return () => clearInterval(next)
  }, [enabled, optimize.metrics.length])

  const current = optimize.metrics[metricIdx]

  return (
    <div
      ref={ref}
      className="relative p-6 rounded-2xl bg-white border border-[#c6c6cd]/40 hover:shadow-[0_0_0_2px_#3B82F633] transition-shadow min-h-[480px] flex flex-col overflow-hidden"
    >
      <header className="space-y-4 mb-6">
        <span className="inline-block px-2.5 py-1 rounded-full bg-[#3B82F6]/10 text-[#3B82F6] text-[11px] font-bold uppercase tracking-wider">
          Optimize
        </span>
      </header>

      <div className="flex-1 flex items-center justify-center">
        <div key={metricIdx} className="text-center space-y-2 animate-[fadeIn_200ms_ease-out]">
          <div
            className={`inline-flex items-center gap-2 text-2xl font-heading font-bold ${
              current.tone === 'up' ? 'text-green-600' : 'text-amber-600'
            }`}
          >
            <span>{current.tone === 'up' ? '↗' : '⏸'}</span>
            <span>{current.text}</span>
          </div>
        </div>
      </div>

      {/* Toast */}
      <div
        className={`absolute left-6 right-6 bottom-6 px-4 py-3 rounded-xl bg-[#0b1c30] text-white text-sm shadow-xl transition-all duration-300 ${
          showToast ? 'translate-y-0 opacity-100' : 'translate-y-16 opacity-0 pointer-events-none'
        }`}
      >
        {optimize.toast}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/landing/_new/optimize-card.tsx
git commit -m "landing(new): optimize card with metric ticker + skill-saved toast"
```

---

### Task 3.4: One Crew block composer

**Files:**
- Create: `src/components/landing/_new/one-crew-block.tsx`

- [ ] **Step 1: Create component**

```typescript
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
```

- [ ] **Step 2: Manual browser check**

Render `<OneCrewBlock />` temporarily in `landing-page.tsx`. Verify:
- 3 cards side by side on desktop
- Research card counts up (147, 3, 2), pulsing dot on Scout, subtle sweep
- Create card cycles tabs every 3s, shimmer → reveal
- Optimize card cycles metrics, toast slides in every ~12s
- All hover border glows work in respective agent colors

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/_new/one-crew-block.tsx
git commit -m "landing(new): one-crew-block composing the 3 cards"
```

---

## Phase 4 — Trust Cluster

### Task 4.1: Results strip

**Files:**
- Create: `src/components/landing/_new/results-strip.tsx`

- [ ] **Step 1: Create component**

```typescript
'use client'

import Image from 'next/image'
import { useState } from 'react'
import { RESULT_CASES } from './landing-content'
import { useInViewport } from './use-in-viewport'
import { useReducedMotion } from './use-reduced-motion'

function CaseTile({ c, delay }: { c: (typeof RESULT_CASES)[number]; delay: number }) {
  const [flipped, setFlipped] = useState(false)
  const { ref, inView } = useInViewport<HTMLDivElement>(0.3)
  const reduced = useReducedMotion()

  return (
    <div
      ref={ref}
      className="[perspective:1000px] opacity-0 translate-y-3"
      style={{
        animation: inView && !reduced ? `fadeSlide 400ms ease-out ${delay}ms forwards` : 'none',
        opacity: inView || reduced ? 1 : 0,
      }}
    >
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="relative w-full aspect-[5/4] [transform-style:preserve-3d] transition-transform duration-500 hover:[transform:rotateY(180deg)]"
        style={{ transform: flipped ? 'rotateY(180deg)' : undefined }}
        aria-label={`${c.brand} case study`}
      >
        {/* Front */}
        <div className="absolute inset-0 p-5 rounded-2xl bg-white border border-[#c6c6cd]/40 flex flex-col justify-between [backface-visibility:hidden]">
          <Image src={c.logo} alt={c.brand} width={100} height={30} className="grayscale h-7 w-auto object-contain opacity-70" />
          <div className="text-left">
            <div className="font-heading font-extrabold text-4xl text-[#6b38d4]">{c.metric}</div>
            <p className="text-sm text-[#45464d] mt-1">{c.context}</p>
          </div>
          <span className="self-start px-2 py-0.5 rounded-full bg-[#eff4ff] text-[10px] font-semibold text-[#45464d]">
            {c.platform}
          </span>
        </div>

        {/* Back */}
        <div className="absolute inset-0 p-5 rounded-2xl bg-[#0b1c30] text-white flex flex-col justify-center text-left [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <p className="text-sm leading-relaxed italic">&ldquo;{c.quote}&rdquo;</p>
          <p className="mt-3 text-xs text-white/70">— {c.founderName}</p>
        </div>
      </button>
    </div>
  )
}

export function ResultsStrip() {
  return (
    <section className="py-20 bg-white border-b border-[#c6c6cd]/10">
      <div className="max-w-7xl mx-auto px-6 space-y-10">
        <header className="text-center space-y-3">
          <h2 className="font-heading font-bold text-4xl md:text-5xl text-[#0b1c30]">
            Real brands. Real numbers. 90 days or less.
          </h2>
        </header>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {RESULT_CASES.map((c, i) => (
            <CaseTile key={c.brand} c={c} delay={i * 100} />
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/landing/_new/results-strip.tsx
git commit -m "landing(new): results strip with 3D tile flip + stagger entrance"
```

---

### Task 4.2: Founder note

**Files:**
- Create: `src/components/landing/_new/founder-note.tsx`

- [ ] **Step 1: Create component**

```typescript
'use client'

import Image from 'next/image'
import { FOUNDER_NOTE } from './landing-content'
import { useInViewport } from './use-in-viewport'
import { useReducedMotion } from './use-reduced-motion'

function SignatureSvg({ animate }: { animate: boolean }) {
  return (
    <svg viewBox="0 0 240 60" width="180" height="46" className="text-[#6b38d4]">
      <path
        d="M 10 40 Q 22 10, 34 40 T 58 40 M 68 20 Q 82 20, 82 40 T 102 30 M 112 30 L 112 50 M 112 30 Q 120 20, 128 30 M 140 20 Q 152 50, 164 20 M 174 20 L 180 48 L 192 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 400,
          strokeDashoffset: animate ? 0 : 400,
          transition: 'stroke-dashoffset 1200ms ease-out',
        }}
      />
    </svg>
  )
}

export function FounderNote() {
  const { ref, inView } = useInViewport<HTMLDivElement>(0.2)
  const reduced = useReducedMotion()
  const animate = inView && !reduced

  return (
    <section ref={ref} className="py-20 bg-[#f8f9ff] border-b border-[#c6c6cd]/10">
      <div className="max-w-2xl mx-auto px-6 space-y-6">
        <div className="space-y-4 text-[#0b1c30] leading-relaxed">
          {FOUNDER_NOTE.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <div className="pt-4 flex items-center gap-4">
          <Image
            src={FOUNDER_NOTE.signatureImage}
            alt={FOUNDER_NOTE.signatureName}
            width={48}
            height={48}
            className="rounded-full border-2 border-white shadow"
            onError={(e) => {
              // fallback: hide on error, avatar with initial shows below
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
          <div>
            <SignatureSvg animate={animate} />
            <div className="text-sm text-[#45464d] mt-1">
              {FOUNDER_NOTE.signatureName} · {FOUNDER_NOTE.signatureRole}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/landing/_new/founder-note.tsx
git commit -m "landing(new): founder note with animated signature draw-in"
```

---

### Task 4.3: Trust badges

**Files:**
- Create: `src/components/landing/_new/trust-badges.tsx`

- [ ] **Step 1: Create component**

```typescript
'use client'

import { TRUST_BADGES } from './landing-content'
import { useInViewport } from './use-in-viewport'
import { useReducedMotion } from './use-reduced-motion'

export function TrustBadges() {
  const { ref, inView } = useInViewport<HTMLDivElement>(0.3)
  const reduced = useReducedMotion()
  const animate = inView && !reduced

  return (
    <section ref={ref} className="py-16 bg-white border-b border-[#c6c6cd]/10">
      <div className="max-w-5xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {TRUST_BADGES.map((b, i) => (
            <div
              key={b.label}
              className="flex flex-col items-center text-center space-y-2 p-4 rounded-xl bg-[#f8f9ff] border border-[#c6c6cd]/30"
              style={{
                animation: animate ? `badgePop 300ms ease-out ${i * 150}ms both` : 'none',
              }}
            >
              <span className="text-3xl">{b.icon}</span>
              <span className="text-xs font-medium text-[#0b1c30]">{b.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 text-center">
          <a href="/privacy" className="relative inline-block text-sm text-[#6b38d4] font-semibold group">
            Read our data policy →
            <span className="absolute left-0 -bottom-0.5 h-0.5 w-0 bg-[#6b38d4] group-hover:w-full transition-all duration-300" />
          </a>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Add `badgePop` keyframe to `globals.css`**

```css
@keyframes badgePop {
  0% { opacity: 0; transform: scale(0.9); }
  60% { transform: scale(1.08); }
  100% { opacity: 1; transform: scale(1); }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/_new/trust-badges.tsx src/app/globals.css
git commit -m "landing(new): trust badges with staggered pop-in + link underline grow"
```

---

### Task 4.4: FAQ accordion

**Files:**
- Create: `src/components/landing/_new/faq-accordion.tsx`

- [ ] **Step 1: Create component**

```typescript
'use client'

import { useState } from 'react'
import { FAQ_ITEMS } from './landing-content'

function FaqRow({ q, a, isOpen, onToggle }: { q: string; a: string; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-[#c6c6cd]/40">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 py-5 text-left hover:bg-[#eff4ff]/50 transition-colors"
        aria-expanded={isOpen}
      >
        <span className="font-heading font-semibold text-lg text-[#0b1c30]">{q}</span>
        <svg
          className="w-5 h-5 text-[#6b38d4] flex-shrink-0 transition-transform duration-200"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className="grid transition-all duration-300 ease-out"
        style={{
          gridTemplateRows: isOpen ? '1fr' : '0fr',
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div className="overflow-hidden">
          <p className="pb-5 text-[#45464d] leading-relaxed">{a}</p>
        </div>
      </div>
    </div>
  )
}

export function FaqAccordion() {
  const [openIdx, setOpenIdx] = useState<number | null>(0)

  return (
    <section className="py-20 bg-[#f8f9ff] border-b border-[#c6c6cd]/10">
      <div className="max-w-3xl mx-auto px-6 space-y-8">
        <header className="text-center space-y-3">
          <h2 className="font-heading font-bold text-4xl md:text-5xl text-[#0b1c30]">Questions?</h2>
        </header>
        <div>
          {FAQ_ITEMS.map((item, i) => (
            <FaqRow
              key={item.q}
              q={item.q}
              a={item.a}
              isOpen={openIdx === i}
              onToggle={() => setOpenIdx((p) => (p === i ? null : i))}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/landing/_new/faq-accordion.tsx
git commit -m "landing(new): FAQ accordion with single-open + chevron rotate"
```

---

## Phase 5 — Repeat CTAs + Sticky Mobile Bar

### Task 5.1: Mid-page and final CTA sections

**Files:**
- Create: `src/components/landing/_new/cta-midpage.tsx`
- Create: `src/components/landing/_new/cta-final.tsx`

- [ ] **Step 1: Create `cta-midpage.tsx`**

```typescript
import { UrlInputCta } from './url-input-cta'
import { CTA_LABELS } from './landing-content'

export function CtaMidpage() {
  return (
    <section className="py-16 bg-white border-b border-[#c6c6cd]/10">
      <div className="max-w-3xl mx-auto px-6 text-center space-y-6">
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-[#0b1c30]">
          See what Mia finds on your store.
        </h2>
        <div className="flex justify-center">
          <UrlInputCta label={CTA_LABELS.midPage} />
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Create `cta-final.tsx`**

```typescript
import { UrlInputCta } from './url-input-cta'
import { CTA_LABELS } from './landing-content'

export function CtaFinal() {
  return (
    <section className="py-20 bg-gradient-to-br from-[#6b38d4] to-[#0b1c30] text-white">
      <div className="max-w-3xl mx-auto px-6 text-center space-y-6">
        <h2 className="font-heading font-bold text-4xl md:text-5xl">
          Still reading? Paste your URL.
        </h2>
        <p className="text-lg text-white/80">Mia begins in 60 seconds.</p>
        <div className="flex justify-center">
          <UrlInputCta size="final" label={CTA_LABELS.final} />
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/_new/cta-midpage.tsx src/components/landing/_new/cta-final.tsx
git commit -m "landing(new): mid-page and final CTA sections"
```

---

### Task 5.2: Sticky mobile CTA

**Files:**
- Create: `src/components/landing/_new/sticky-mobile-cta.tsx`

- [ ] **Step 1: Create component**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { UrlInputCta } from './url-input-cta'
import { CTA_LABELS } from './landing-content'

export function StickyMobileCta() {
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 200)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (dismissed) return null

  return (
    <div className="lg:hidden fixed inset-x-0 bottom-0 z-50 pointer-events-none">
      <div
        className={`pointer-events-auto transition-transform duration-300 ${visible ? 'translate-y-0' : 'translate-y-full'}`}
      >
        {expanded ? (
          <div className="bg-white border-t border-[#c6c6cd]/40 shadow-2xl p-5 space-y-4 rounded-t-2xl">
            <div className="flex items-center justify-between">
              <span className="font-heading font-bold text-[#0b1c30]">Start free</span>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Close"
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#eff4ff]"
              >
                ✕
              </button>
            </div>
            <UrlInputCta label={CTA_LABELS.hero} />
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-[#0b1c30] text-white px-5 py-3">
            <button type="button" onClick={() => setExpanded(true)} className="flex-1 text-left font-semibold">
              Start free →
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss"
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/landing/_new/sticky-mobile-cta.tsx
git commit -m "landing(new): sticky mobile CTA bar with expandable URL drawer"
```

---

## Phase 6 — Wire It All Together

### Task 6.1: Compose the new landing page

**Files:**
- Modify: `src/components/landing/landing-page.tsx`

This replaces the entire current component body with the new composition, while keeping `<PublicNav />` and `<PublicFooter />` as-is.

- [ ] **Step 1: Replace `landing-page.tsx` contents**

Overwrite `src/components/landing/landing-page.tsx` with:

```typescript
import { PublicNav } from './public-nav'
import { PublicFooter } from './public-footer'
import { HeroSplitCanvas } from './_new/hero-split-canvas'
import { IntegrationsMarquee } from './_new/integrations-marquee'
import { OneCrewBlock } from './_new/one-crew-block'
import { CtaMidpage } from './_new/cta-midpage'
import { ResultsStrip } from './_new/results-strip'
import { FounderNote } from './_new/founder-note'
import { TrustBadges } from './_new/trust-badges'
import { FaqAccordion } from './_new/faq-accordion'
import { CtaFinal } from './_new/cta-final'
import { StickyMobileCta } from './_new/sticky-mobile-cta'

export default function LandingPage() {
  return (
    <div className="!bg-[#f8f9ff] !text-[#0b1c30] font-body selection:bg-[#e9ddff] selection:text-[#5516be] min-h-screen">
      <PublicNav />
      <main className="pt-20">
        <HeroSplitCanvas />
        <IntegrationsMarquee />
        <OneCrewBlock />
        <CtaMidpage />
        <ResultsStrip />
        <FounderNote />
        <TrustBadges />
        <FaqAccordion />
        <CtaFinal />
      </main>
      <PublicFooter />
      <StickyMobileCta />
    </div>
  )
}
```

- [ ] **Step 2: Run full build**

Run: `npm run build`
Expected: successful build, no type errors. Fix any before proceeding.

- [ ] **Step 3: Manual browser check — full page**

Run: `npm run dev`. Navigate to `http://localhost:3000/`. Go through the full page:

- Hero: URL input, typewriter placeholder cycling, CTA shine, Mia glow, canvas rotation (5 surfaces), hover pause
- Integrations marquee scrolls + pause-on-hover + greyscale→color
- 3-card block: counters animate, tabs rotate, metrics cycle, toast appears
- Results strip: tiles flip on hover, 4 brands visible, platform badges mix Shopify/Woo/Custom
- Founder note: signature draws in
- Trust badges: stagger-pop, "Read our data policy" link underline grows
- FAQ accordion: open/close, chevron rotates
- Mid-page CTA: URL input works
- Final CTA: gradient section, URL input works, submits to `/signup?store=<url>`

Test URL submission: type `example.com`, submit → should redirect to `/signup?store=https%3A%2F%2Fexample.com%2F`.

- [ ] **Step 4: Manual mobile check**

Open devtools, toggle to mobile viewport (iPhone 14, 390×844). Verify:
- Hero stacks, Mia above copy, URL full-width
- Marquee single row
- 3 cards stack
- Results strip 2-up grid, tap to flip
- FAQ full-width
- Sticky CTA appears on scroll past hero, dismissible, expands to show URL input

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/landing-page.tsx
git commit -m "landing: swap in new URL-first autopilot landing page"
```

---

## Phase 7 — Polish

### Task 7.1: Accessibility and reduced-motion audit

- [ ] **Step 1: Keyboard navigation check**

With `npm run dev` running, tab through the page from top to bottom. Verify:
- All URL inputs reachable and focusable
- All CTA buttons focusable and operable with Enter
- FAQ buttons reachable and toggle with Enter/Space
- Result tiles focusable, flip with Enter
- Sticky CTA and dismiss button reachable

If anything's missing, add `tabIndex={0}` and keyboard handlers.

- [ ] **Step 2: Screen-reader smoke test**

Use macOS VoiceOver (Cmd+F5) or NVDA on Windows. Verify:
- Section headings announce correctly
- Animated elements don't spam live regions (they shouldn't — no `aria-live`)
- Buttons have clear labels (`aria-label` where needed)

- [ ] **Step 3: `prefers-reduced-motion` test**

In Chrome devtools → Rendering → "Emulate CSS media feature prefers-reduced-motion: reduce". Reload. Verify:
- No rotating canvas (first surface shown statically)
- No marquee scroll
- No counter-up (final values shown immediately)
- No tab rotation (first tab shown)
- No metric ticker (first metric shown)
- No toast
- No shine/pulse animations

- [ ] **Step 4: Lighthouse check**

Run Lighthouse (devtools → Lighthouse tab) on mobile. Targets:
- Performance ≥ 85 (real target 90, but 85 is acceptable pre-launch since logos are placeholders)
- Accessibility ≥ 95
- Best Practices ≥ 90
- SEO ≥ 90

If performance tanks, check: are animations running on layout-triggering properties? Convert any `top`/`left`/`width`/`height` animations to `transform`/`opacity`. Check: are all hero images using `priority` and proper sizing?

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "landing(polish): a11y + reduced-motion + perf fixes"
```

(Only if fixes were made. Skip if audit was clean.)

---

### Task 7.2: Clean up staging folder name

**Files:**
- Move: `src/components/landing/_new/*` → `src/components/landing/`
- Update imports in: `src/components/landing/landing-page.tsx`

- [ ] **Step 1: Move files out of `_new/`**

```bash
cd src/components/landing
for f in _new/*.ts _new/*.tsx; do
  mv "$f" "./$(basename "$f")"
done
rmdir _new 2>/dev/null || true
```

- [ ] **Step 2: Update imports in `landing-page.tsx`**

Replace every `./_new/<file>` import with `./<file>`. Final imports should look like:

```typescript
import { HeroSplitCanvas } from './hero-split-canvas'
import { IntegrationsMarquee } from './integrations-marquee'
// ... etc
```

- [ ] **Step 3: Update cross-imports within moved files**

The moved files reference each other with relative imports. Check each new file and confirm imports like `./landing-content` still resolve (they should — files are now siblings, same relative path works).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Rebuild and browser re-check**

```bash
npm run build
npm run dev
```

Load homepage, spot-check hero + 3-card + FAQ for any regressions.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "landing: flatten _new/ into landing/ now that redesign is live"
```

---

### Phase 7 gate

Final build + visual smoke test:

```bash
npm run build
```

If green: redesign is complete. Leave open questions (case studies, founder copy, pricing link, logo assets) for follow-up per the spec's "Open questions" section.

---

## Spec coverage checklist

Before declaring the plan complete, verify every spec section has a task:

| Spec section | Plan task |
|---|---|
| Section 1 — Hero split canvas | Task 1.1, 1.2, 1.3 |
| Section 2 — Integrations marquee | Task 2.1 |
| Section 3 — One Crew 3-card block | Task 3.1, 3.2, 3.3, 3.4 |
| Section 4a — Results strip | Task 4.1 |
| Section 4b — Founder note | Task 4.2 |
| Section 4c — Trust badges | Task 4.3 |
| Section 4d — FAQ accordion | Task 4.4 |
| Section 5 — Repeat CTAs | Task 5.1 |
| Section 5 — Sticky mobile CTA | Task 5.2 |
| Section 6 — Mobile treatment | Task 6.1 Step 4 (manual check across all tasks via responsive classes) |
| Section 7 — Copy rewrite | Task 0.1 (content module) + all component tasks consume from it |
| 43 micro-interactions | Distributed across Tasks 1.1–5.2; enumerated in spec |
| `prefers-reduced-motion` | Each component; Task 7.1 Step 3 verification |
| Low-battery pause | `use-battery-ok` hook (Task 0.2); used in `hero-split-canvas` (Task 1.3) |
| Testing approach | Manual browser verification at each task + Task 7.1 |

**All sections covered.**

'use client'

import Image from 'next/image'
import Link from 'next/link'
import {
  AlertTriangle,
  BarChart3,
  TrendingUp,
  Mail,
  Heart,
  ShoppingCart,
  Shield as ShieldIcon,
  Sparkles,
  Search,
  Globe,
  CreditCard,
  Calculator,
  Users,
  Layers,
  CheckCircle2,
  DollarSign,
  PiggyBank,
  Eye,
  FileText,
  Key,
  Lock,
  Database,
  Zap,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  Monitor,
  Target,
  BarChart2,
  MessageSquare,
  Gauge,
  Clock,
  Brain,
  Activity,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════════════════
   Shared pieces
   ═══════════════════════════════════════════════════════════════════════════ */

const SLIDES = [
  'problem', 'aria', 'luna', 'penny', 'seo', 'pricing', 'credits', 'security', 'agency',
] as const

export function GlassCard({
  children,
  className = '',
  dark = false,
}: {
  children: React.ReactNode
  className?: string
  dark?: boolean
}) {
  return (
    <div
      className={`rounded-[40px] border p-6 ${
        dark
          ? 'border-white/10 bg-[#111c2d] text-white'
          : 'border-white/60 bg-white/80 backdrop-blur-[20px]'
      } ${className}`}
    >
      {children}
    </div>
  )
}

export function PurpleBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-full bg-[#e9ddff] px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#5516be]">
      {children}
    </span>
  )
}

export function SpeakerNotes({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-12 rounded-[40px] border border-[#e5eeff] bg-[#eff4ff] p-6">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#45464d]">Presenter Notes</p>
      <div className="text-sm leading-relaxed text-[#45464d]">{children}</div>
    </div>
  )
}

export function SlideNav({ current }: { current: string }) {
  const idx = SLIDES.indexOf(current as (typeof SLIDES)[number])
  const prev = idx > 0 ? SLIDES[idx - 1] : null
  const next = idx < SLIDES.length - 1 ? SLIDES[idx + 1] : null

  return (
    <div className="mt-16 flex items-center justify-between border-t border-[#e5eeff] pt-6">
      {prev ? (
        <Link href={`/deck/${prev}`} className="flex items-center gap-2 text-sm font-medium text-[#45464d] hover:text-[#6b38d4]">
          <ChevronLeft className="h-4 w-4" /> Previous
        </Link>
      ) : <span />}
      <span className="text-xs text-[#45464d]">{idx + 1} / {SLIDES.length}</span>
      {next ? (
        <Link href={`/deck/${next}`} className="flex items-center gap-2 text-sm font-medium text-[#45464d] hover:text-[#6b38d4]">
          Next <ChevronRight className="h-4 w-4" />
        </Link>
      ) : <span />}
    </div>
  )
}

export function AgentImage({ slug, size = 280 }: { slug: string; size?: number }) {
  const available = ['aria', 'hugo', 'mia', 'scout']
  if (!available.includes(slug)) {
    return (
      <div
        className="flex items-center justify-center rounded-3xl bg-gradient-to-br from-[#6b38d4] to-[#111c2d]"
        style={{ width: size, height: size }}
      >
        <Sparkles className="h-16 w-16 text-white/60" />
      </div>
    )
  }
  return (
    <Image
      src={`/agents/${slug}.png`}
      alt={slug}
      width={size}
      height={size}
      className="rounded-3xl object-cover"
    />
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. PROBLEM
   ═══════════════════════════════════════════════════════════════════════════ */

export function ProblemSlide() {
  return (
    <section className="mx-auto w-full max-w-7xl px-6 py-16">
      <div className="text-center">
        <PurpleBadge>The Problem</PurpleBadge>
        <h1 className="font-heading mt-6 text-4xl font-bold leading-tight text-[#0b1c30] md:text-5xl lg:text-6xl">
          You&apos;re running a brand.{' '}
          <span className="text-[#45464d]/50">Not a marketing department.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-[#45464d]">
          Most Shopify founders juggle 11+ tools, 4 dashboards, and zero clarity. Growth OS replaces the chaos with a single AI-powered command center.
        </p>
      </div>

      <div className="mx-auto mt-10 max-w-2xl">
        <GlassCard className="text-center">
          <p className="text-base italic text-[#0b1c30]">
            &ldquo;Mia flagged a drop in ROAS before I even noticed. Saved us $12k in a weekend.&rdquo;
          </p>
          <p className="mt-3 text-sm font-medium text-[#45464d]">— D2C Founder, Skincare Brand</p>
          <div className="mt-4 inline-block rounded-full bg-[#e9ddff] px-3 py-1 text-xs font-semibold text-[#5516be]">
            Trusted by D2C founders
          </div>
        </GlassCard>
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-2">
        <GlassCard className="relative overflow-hidden">
          <h3 className="font-heading text-xl font-bold text-[#0b1c30]">The Fragmentation Gap</h3>
          <p className="mt-2 text-sm text-[#45464d]">Your marketing stack is a patchwork of disconnected tools.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {['Meta Ads', 'Ahrefs', 'Klaviyo', 'Finance', 'GA4', 'Shopify'].map((tool) => (
              <span key={tool} className="rounded-full border border-[#e5eeff] bg-[#eff4ff] px-4 py-2 text-sm font-medium text-[#0b1c30]">
                {tool}
              </span>
            ))}
          </div>
        </GlassCard>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <GlassCard className="text-center">
            <Clock className="mx-auto h-8 w-8 text-[#6b38d4]" />
            <p className="mt-3 font-heading text-2xl font-bold text-[#0b1c30]">4.7 hrs/day</p>
            <p className="mt-1 text-xs text-[#45464d]">Manual Overhead</p>
          </GlassCard>
          <GlassCard className="text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-[#6b38d4]" />
            <p className="mt-3 font-heading text-2xl font-bold text-[#0b1c30]">Silent Bias</p>
            <p className="mt-1 text-xs text-[#45464d]">Algorithms optimize for spend, not profit</p>
          </GlassCard>
          <GlassCard className="text-center">
            <Brain className="mx-auto h-8 w-8 text-[#6b38d4]" />
            <p className="mt-3 font-heading text-2xl font-bold text-[#0b1c30]">Maximum Paralysis</p>
            <p className="mt-1 text-xs text-[#45464d]">Too many dashboards, too little action</p>
          </GlassCard>
        </div>
      </div>

      <div className="mt-10 text-center">
        <GlassCard dark className="mx-auto inline-block">
          <p className="text-base font-medium text-white/60">Founders waste</p>
          <p className="font-heading text-3xl font-bold text-white">14.3 hours/week</p>
          <p className="text-sm text-white/60">on Software Stewardship</p>
        </GlassCard>
      </div>

    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. ARIA
   ═══════════════════════════════════════════════════════════════════════════ */

export function AriaSlide() {
  return (
    <section className="mx-auto w-full max-w-7xl px-6 py-16">
      <div className="grid gap-12 lg:grid-cols-2">
        <div>
          <div className="flex items-center gap-4">
            <div className="overflow-hidden rounded-2xl border-2 border-[#6b38d4] p-0.5">
              <AgentImage slug="aria" size={80} />
            </div>
            <div>
              <h3 className="font-heading text-xl font-bold text-[#0b1c30]">Aria</h3>
              <PurpleBadge>Creative Director</PurpleBadge>
            </div>
          </div>

          <p className="mt-2 text-xs font-medium uppercase tracking-wider text-[#6b38d4]">Intelligence Layer 01</p>

          <h1 className="font-heading mt-6 text-4xl font-bold leading-tight text-[#0b1c30] md:text-5xl">
            Your AI Creative Director
          </h1>
          <p className="mt-4 text-lg text-[#45464d]">
            Aria generates scroll-stopping ad copy, UGC scripts, and creative variants — all tuned to your brand voice and buyer persona.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <span className="rounded-full bg-[#e9ddff] px-4 py-2 text-sm font-medium text-[#5516be]">Senior Copy Quality</span>
            <span className="rounded-full bg-[#e9ddff] px-4 py-2 text-sm font-medium text-[#5516be]">Fatigue Detection</span>
          </div>

          <SpeakerNotes>
            <p>Aria writes like a senior creative lead — not a chatbot. She adapts to brand voice profiles and includes built-in fatigue detection to rotate creatives before engagement drops.</p>
          </SpeakerNotes>
        </div>

        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <GlassCard className="relative">
              <div className="absolute right-4 top-4 rounded-full bg-[#6b38d4] px-3 py-1 text-xs font-bold text-white">98% Match</div>
              <FileText className="h-8 w-8 text-[#6b38d4]" />
              <h4 className="font-heading mt-3 text-base font-semibold text-[#0b1c30]">Facebook Ad Variant</h4>
              <p className="mt-2 text-xs text-[#45464d]">
                &ldquo;Transform your morning routine with clinically-proven ingredients...&rdquo;
              </p>
              <div className="mt-3 flex gap-2">
                <span className="rounded bg-[#eff4ff] px-2 py-0.5 text-[10px] text-[#45464d]">CTA: Shop Now</span>
                <span className="rounded bg-[#eff4ff] px-2 py-0.5 text-[10px] text-[#45464d]">Hook: Problem</span>
              </div>
            </GlassCard>

            <GlassCard className="relative">
              <MessageSquare className="h-8 w-8 text-[#6b38d4]" />
              <h4 className="font-heading mt-3 text-base font-semibold text-[#0b1c30]">UGC Hook Script</h4>
              <p className="mt-2 text-xs text-[#45464d]">
                &ldquo;I was skeptical too... until I saw my skin after just one week.&rdquo;
              </p>
              <div className="mt-3">
                <span className="rounded bg-[#eff4ff] px-2 py-0.5 text-[10px] text-[#45464d]">TikTok / Reels</span>
              </div>
            </GlassCard>
          </div>

          <GlassCard className="border-orange-200 bg-orange-50/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-6 w-6 text-orange-500" />
                <div>
                  <h4 className="font-heading text-base font-semibold text-[#0b1c30]">Fatigue Alert</h4>
                  <p className="text-xs text-[#45464d]">Ad Set &ldquo;Summer Glow Q3&rdquo;</p>
                </div>
              </div>
              <span className="font-heading text-xl font-bold text-orange-500">14% CTR degradation</span>
            </div>
          </GlassCard>

          <GlassCard dark>
            <div className="flex items-center gap-3">
              <AgentImage slug="mia" size={40} />
              <div>
                <p className="text-sm font-semibold text-white">Mia Orchestrator</p>
                <p className="text-xs text-white/60">&ldquo;Rotating creative set C with Aria&apos;s new variants. Confidence: 94%.&rdquo;</p>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>

    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. LUNA
   ═══════════════════════════════════════════════════════════════════════════ */

export function LunaSlide() {
  return (
    <section className="mx-auto w-full max-w-7xl px-6 py-16">
      <div className="text-center">
        <PurpleBadge>Agent Spotlight</PurpleBadge>
        <h1 className="font-heading mt-6 text-4xl font-bold leading-tight text-[#0b1c30] md:text-5xl">
          Luna — Your AI Email &amp; Retention Manager
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-[#45464d]">
          Luna owns your entire email lifecycle — from welcome flows to churn prevention. She writes, optimizes, and deploys sequences that recover revenue while you sleep.
        </p>
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-3">
        <GlassCard>
          <div className="flex items-center gap-3">
            <AgentImage slug="luna" size={48} />
            <div>
              <p className="font-heading text-base font-semibold text-[#0b1c30]">Luna Orchestrator</p>
              <p className="text-xs text-[#45464d]">Retention Intelligence</p>
            </div>
          </div>
          <p className="mt-4 text-sm italic text-[#0b1c30]">
            &ldquo;Welcome flow open rate is 12% below benchmark. Recommend A/B test on subject line with urgency hook.&rdquo;
          </p>
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-[#45464d]">
              <span>Flow Optimization</span>
              <span className="font-semibold text-[#6b38d4]">92%</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-[#e5eeff]">
              <div className="h-2 rounded-full bg-[#6b38d4]" style={{ width: '92%' }} />
            </div>
          </div>
          <button className="mt-4 w-full rounded-full bg-[#6b38d4] py-2 text-sm font-semibold text-white hover:bg-[#5516be]">
            Deploy Fixes
          </button>
        </GlassCard>

        <div>
          <h3 className="mb-4 text-center font-heading text-lg font-semibold text-[#0b1c30]">
            Managed Retention Lifecycle
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: <Mail className="h-6 w-6" />, label: 'Welcome Flow' },
              { icon: <ShoppingCart className="h-6 w-6" />, label: 'Abandoned Cart' },
              { icon: <Heart className="h-6 w-6" />, label: 'Loyalty Loop' },
              { icon: <ShieldIcon className="h-6 w-6" />, label: 'Churn Defense' },
            ].map((item) => (
              <GlassCard key={item.label} className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#e9ddff] text-[#6b38d4]">
                  {item.icon}
                </div>
                <p className="mt-2 text-sm font-medium text-[#0b1c30]">{item.label}</p>
              </GlassCard>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <GlassCard>
            <h4 className="font-heading text-base font-semibold text-[#0b1c30]">Audit Checklist</h4>
            <ul className="mt-3 space-y-2">
              {['Subject line A/B testing', 'Send-time optimization', 'Segment hygiene review', 'Deliverability audit'].map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-[#45464d]">
                  <CheckCircle2 className="h-4 w-4 text-[#6b38d4]" /> {item}
                </li>
              ))}
            </ul>
          </GlassCard>

          <GlassCard dark>
            <h4 className="text-base font-semibold text-white">Luna Performance</h4>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/60">Revenue Recovery</span>
                <span className="font-heading text-lg font-bold text-emerald-400">+28%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/60">Churn Reduction</span>
                <span className="font-heading text-lg font-bold text-emerald-400">-12%</span>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>

      <SpeakerNotes>
        <p>Luna doesn&apos;t just write emails — she manages the full retention lifecycle. From welcome flows to win-back campaigns, Luna monitors performance metrics and auto-optimizes sequences when engagement drops.</p>
      </SpeakerNotes>

    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. PENNY
   ═══════════════════════════════════════════════════════════════════════════ */

export function PennySlide() {
  return (
    <section className="mx-auto w-full max-w-7xl px-6 py-16">
      <div className="text-center">
        <PurpleBadge>Agent Spotlight</PurpleBadge>
        <h1 className="font-heading mt-6 text-4xl font-bold leading-tight text-[#0b1c30] md:text-5xl">
          Penny — Your AI CFO
        </h1>
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-3">
        <GlassCard>
          <h4 className="font-heading text-base font-semibold text-[#0b1c30]">Unit Economics</h4>
          <div className="mt-4 space-y-3">
            {[
              { label: 'True CAC', value: '$42.18' },
              { label: 'LTV', value: '$184.50' },
              { label: 'LTV:CAC', value: '4.3x' },
              { label: 'Margin', value: '64.2%' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between border-b border-[#e5eeff] pb-2">
                <span className="text-sm text-[#45464d]">{item.label}</span>
                <span className="font-heading text-lg font-bold text-[#0b1c30]">{item.value}</span>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard>
          <h4 className="font-heading text-base font-semibold text-[#0b1c30]">90-Day Forecast</h4>
          <div className="mt-4 flex items-end gap-2" style={{ height: 120 }}>
            {[40, 55, 65, 58, 72, 80, 75, 88, 95].map((h, i) => (
              <div key={i} className="flex-1 rounded-t-lg bg-[#6b38d4]" style={{ height: `${h}%`, opacity: 0.4 + (i / 9) * 0.6 }} />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-[#45464d]">
            <span>Month 1</span><span>Month 2</span><span>Month 3</span>
          </div>
        </GlassCard>

        <div className="flex flex-col gap-4">
          <GlassCard className="border-orange-200 bg-orange-50/80">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-orange-500" />
              <div>
                <h4 className="font-heading text-base font-semibold text-[#0b1c30]">Penny Alert</h4>
                <p className="text-sm text-[#45464d]">Ad Spend Efficiency dropping — recommend reallocation from Meta to Google.</p>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="flex items-center gap-4">
            <AgentImage slug="penny" size={64} />
            <div>
              <p className="font-heading text-base font-semibold text-[#0b1c30]">Penny</p>
              <p className="text-xs italic text-[#45464d]">&ldquo;Your blended CAC improved 18% this quarter. LTV:CAC ratio is healthy at 4.3x.&rdquo;</p>
            </div>
          </GlassCard>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { icon: <Database className="h-5 w-5" />, label: 'Multi-Source Audit' },
          { icon: <Brain className="h-5 w-5" />, label: 'LLM Reasoning Chains' },
          { icon: <Lock className="h-5 w-5" />, label: 'Bank-Grade Privacy' },
          { icon: <Activity className="h-5 w-5" />, label: 'Predictive Logic' },
        ].map((b) => (
          <div key={b.label} className="flex items-center gap-3 rounded-full border border-[#e5eeff] bg-[#eff4ff] px-4 py-3">
            <span className="text-[#6b38d4]">{b.icon}</span>
            <span className="text-sm font-medium text-[#0b1c30]">{b.label}</span>
          </div>
        ))}
      </div>

      <SpeakerNotes>
        <p>Penny audits your financials with LLM reasoning chains — not just rule-based logic. She understands context, flags anomalies, and projects cash flow with bank-grade data isolation.</p>
      </SpeakerNotes>

    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. SEO (Hugo & Nova)
   ═══════════════════════════════════════════════════════════════════════════ */

export function SeoSlide() {
  return (
    <section className="mx-auto w-full max-w-7xl px-6 py-16">
      <div className="text-center">
        <PurpleBadge>Dual Agent System</PurpleBadge>
        <h1 className="font-heading mt-6 text-4xl font-bold leading-tight text-[#0b1c30] md:text-5xl">
          Hugo &amp; Nova — Own search. Own the AI answer box.
        </h1>
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-2">
        <GlassCard>
          <div className="flex items-center gap-3">
            <AgentImage slug="hugo" size={48} />
            <div>
              <h3 className="font-heading text-lg font-bold text-[#0b1c30]">Hugo</h3>
              <p className="text-xs font-medium text-[#6b38d4]">SEO Agent — Traditional Search</p>
            </div>
          </div>
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl bg-[#eff4ff] p-4">
              <div className="flex items-center gap-2">
                <Search className="h-5 w-5 text-[#6b38d4]" />
                <h4 className="font-heading text-sm font-semibold text-[#0b1c30]">Semantic SEO Audit</h4>
              </div>
              <p className="mt-2 text-xs text-[#45464d]">Deep-crawls your site for content gaps, thin pages, and cannibalization issues.</p>
            </div>
            <div className="rounded-2xl bg-[#eff4ff] p-4">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-[#6b38d4]" />
                <h4 className="font-heading text-sm font-semibold text-[#0b1c30]">Keyword Cluster Engine</h4>
              </div>
              <p className="mt-2 text-xs text-[#45464d]">AI-driven keyword clustering with intent mapping and difficulty scoring.</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard dark>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#6b38d4]/20">
              <Globe className="h-6 w-6 text-[#6b38d4]" />
            </div>
            <div>
              <h3 className="font-heading text-lg font-bold text-white">Nova</h3>
              <p className="text-xs font-medium text-[#6b38d4]">GEO Agent — AI Search</p>
            </div>
          </div>
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl bg-white/5 p-4">
              <h4 className="font-heading text-sm font-semibold text-white">Answer Box Hijacking</h4>
              <p className="mt-2 text-xs text-white/60">Optimize content to appear in AI Overviews, ChatGPT citations, and Perplexity answers.</p>
            </div>
            <div className="rounded-2xl bg-white/5 p-4">
              <h4 className="font-heading text-sm font-semibold text-white">Citation Tracking</h4>
              <div className="mt-2 flex items-center gap-4">
                <div>
                  <span className="font-heading text-2xl font-bold text-[#6b38d4]">89%</span>
                  <p className="text-[10px] text-white/40">Citation Rate</p>
                </div>
                <div>
                  <span className="font-heading text-2xl font-bold text-emerald-400">Top 3</span>
                  <p className="text-[10px] text-white/40">Average Position</p>
                </div>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      <SpeakerNotes>
        <p>Hugo handles traditional SEO — audits, keyword clusters, and on-page optimization. Nova is our GEO agent — she optimizes your content for AI search engines like ChatGPT, Perplexity, and Google AI Overviews.</p>
      </SpeakerNotes>

    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   6. PRICING
   ═══════════════════════════════════════════════════════════════════════════ */

export function PricingSlide() {
  /*
   * Credit economics (internal — 50%+ margin guaranteed):
   * ──────────────────────────────────────────────────────
   * Blended AI cost per credit ≈ ₹1.50
   *   Text (Gemini Flash / GPT-4o-mini)  → ₹0.50–1  per credit
   *   Text (Claude Sonnet / GPT-4o)      → ₹2–4     per credit
   *   Image gen (fal.ai)                 → ₹4–5     per 5-credit task
   *   Video gen (fal.ai)                 → ₹20–25   per 15-credit task
   *
   * Launch  → 500  credits × ₹1.50 = ₹750   cost  → ₹2,999 revenue → 75% margin
   * Growth  → 1,500 credits × ₹1.50 = ₹2,250 cost → ₹5,999 revenue → 62% margin
   * Scale   → 5,000 credits × ₹1.50 = ₹7,500 cost → ₹14,999 revenue → 50% margin
   */
  const tiers = [
    {
      name: 'Launch',
      price: '2,999',
      popular: false,
      dark: false,
      features: [
        '1 brand',
        '5 agents',
        '500 credits/mo',
        'Text generation (copy, emails, captions)',
        '10 AI images/mo via fal.ai',
        'Basic analytics',
        'Community support',
      ],
    },
    {
      name: 'Growth',
      price: '5,999',
      popular: true,
      dark: true,
      features: [
        '3 brands',
        'All 12 agents',
        '1,500 credits/mo',
        'Unlimited text generation',
        '50 AI images + 5 videos/mo via fal.ai',
        'Advanced analytics & custom prompts',
        'Priority support',
      ],
    },
    {
      name: 'Scale',
      price: '14,999',
      popular: false,
      dark: false,
      features: [
        'Unlimited brands',
        'All agents + custom skills',
        '5,000 credits/mo',
        'Unlimited text, images & video via fal.ai',
        'White-label & API access',
        'Dedicated account manager',
      ],
    },
  ]

  return (
    <section className="mx-auto w-full max-w-7xl px-6 py-16">
      <div className="text-center">
        <PurpleBadge>Pricing</PurpleBadge>
        <h1 className="font-heading mt-6 text-4xl font-bold leading-tight text-[#0b1c30] md:text-5xl">
          Pay for what you use. Start free. Scale as you grow.
        </h1>
      </div>

      {/* ── Pricing Tiers ── */}
      <div className="mt-12 grid gap-8 md:grid-cols-3">
        {tiers.map((tier) => (
          <GlassCard key={tier.name} dark={tier.dark} className={`relative flex flex-col ${tier.popular ? 'ring-2 ring-[#6b38d4]' : ''}`}>
            {tier.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#6b38d4] px-4 py-1 text-xs font-bold text-white">
                Most Popular
              </span>
            )}
            <h3 className={`font-heading text-xl font-bold ${tier.dark ? 'text-white' : 'text-[#0b1c30]'}`}>{tier.name}</h3>
            <p className="mt-3">
              <span className={`font-heading text-3xl font-bold ${tier.dark ? 'text-white' : 'text-[#0b1c30]'}`}>
                ₹{tier.price}
              </span>
              <span className={`text-sm ${tier.dark ? 'text-white/40' : 'text-[#45464d]'}`}>/mo</span>
            </p>
            <ul className="mt-6 flex flex-1 flex-col gap-2">
              {tier.features.map((f) => (
                <li key={f} className={`flex items-center gap-2 text-sm ${tier.dark ? 'text-white/70' : 'text-[#45464d]'}`}>
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[#6b38d4]" />
                  {f}
                </li>
              ))}
            </ul>
            <button
              className={`mt-6 w-full rounded-full py-3 text-sm font-semibold transition-colors ${
                tier.dark
                  ? 'bg-white text-[#0b1c30] hover:bg-white/90'
                  : 'bg-[#0b1c30] text-white hover:bg-[#111c2d]'
              }`}
            >
              Get Started
            </button>
          </GlassCard>
        ))}
      </div>

      {/* ── What is a Credit? ── */}
      <div className="mt-20 text-center">
        <PurpleBadge>Credits</PurpleBadge>
        <h3 className="font-heading mt-6 text-3xl font-bold text-[#0b1c30]">How credits work</h3>
        <p className="mx-auto mt-3 max-w-xl text-[#45464d]">
          Every task consumes credits based on complexity. Cheaper models handle simple tasks; premium models handle creative and strategic work.
        </p>
      </div>

      <div className="mx-auto mt-8 grid max-w-4xl gap-6 md:grid-cols-4">
        <GlassCard className="text-center">
          <Zap className="mx-auto h-8 w-8 text-[#6b38d4]" />
          <p className="mt-3 font-heading text-xl font-bold text-[#0b1c30]">1 Credit</p>
          <p className="mt-1 text-xs text-[#45464d]">Subject lines, social captions, quick replies</p>
        </GlassCard>
        <GlassCard className="text-center">
          <FileText className="mx-auto h-8 w-8 text-[#6b38d4]" />
          <p className="mt-3 font-heading text-xl font-bold text-[#0b1c30]">3 Credits</p>
          <p className="mt-1 text-xs text-[#45464d]">Ad copy, email drafts, competitor summaries</p>
        </GlassCard>
        <GlassCard className="text-center">
          <Sparkles className="mx-auto h-8 w-8 text-[#6b38d4]" />
          <p className="mt-3 font-heading text-xl font-bold text-[#0b1c30]">5 Credits</p>
          <p className="mt-1 text-xs text-[#45464d]">Full audits, AI image generation (fal.ai), financial analysis</p>
        </GlassCard>
        <GlassCard className="text-center">
          <Eye className="mx-auto h-8 w-8 text-[#6b38d4]" />
          <p className="mt-3 font-heading text-xl font-bold text-[#0b1c30]">15 Credits</p>
          <p className="mt-1 text-xs text-[#45464d]">AI video generation (fal.ai), multi-step campaign builds</p>
        </GlassCard>
      </div>

      {/* ── Agent workload + The Hard Math ── */}
      <div className="mt-20 text-center">
        <PurpleBadge>The Hard Math</PurpleBadge>
        <h3 className="font-heading mt-6 text-3xl font-bold text-[#0b1c30]">
          One month of full marketing — less than one agency invoice.
        </h3>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <GlassCard>
          <h4 className="font-heading text-lg font-semibold text-[#0b1c30]">What 1,500 credits/mo gets you</h4>
          <div className="mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e5eeff] text-left text-xs uppercase tracking-wider text-[#45464d]">
                  <th className="pb-2">Agent</th>
                  <th className="pb-2">Output</th>
                  <th className="pb-2 text-right">Credits</th>
                </tr>
              </thead>
              <tbody className="text-[#0b1c30]">
                {[
                  { agent: 'Aria', output: '8 ad sets + 20 images', credits: '200' },
                  { agent: 'Scout', output: '4 site audits + anomaly scans', credits: '100' },
                  { agent: 'Max', output: '30 days budget optimization', credits: '150' },
                  { agent: 'Luna', output: '12 email flows + A/B tests', credits: '180' },
                  { agent: 'Penny', output: '8 financial reports', credits: '120' },
                  { agent: 'Hugo', output: '4 SEO audits + content briefs', credits: '100' },
                  { agent: 'Nova', output: '2 GEO visibility audits', credits: '50' },
                  { agent: 'Mia', output: 'Daily briefings + orchestration', credits: '150' },
                ].map((row) => (
                  <tr key={row.agent} className="border-b border-[#e5eeff]">
                    <td className="py-2 font-medium">{row.agent}</td>
                    <td className="py-2 text-[#45464d]">{row.output}</td>
                    <td className="py-2 text-right font-semibold">{row.credits}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 font-heading font-bold" colSpan={2}>Total</td>
                  <td className="py-2 text-right font-heading font-bold text-[#6b38d4]">1,050</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-3 text-xs text-[#45464d] italic">450 credits remaining for ad-hoc tasks, video generation, and overflow.</p>
          </div>
        </GlassCard>

        <GlassCard dark>
          <h4 className="font-heading text-lg font-semibold text-white">THE HARD MATH</h4>
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-white/60">Growth OS (Growth plan)</span>
              <span className="font-heading text-2xl font-bold text-emerald-400">₹5,999/mo</span>
            </div>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-white/60">Senior Freelancer</span>
              <span className="font-heading text-2xl font-bold text-white/40">₹35,000/mo</span>
            </div>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-white/60">Marketing Agency</span>
              <span className="font-heading text-2xl font-bold text-white/40">₹75,000/mo</span>
            </div>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-white/60">In-house team (3 people)</span>
              <span className="font-heading text-2xl font-bold text-white/40">₹1,50,000/mo</span>
            </div>
            <div className="flex items-center justify-between pt-2">
              <span className="text-lg font-semibold text-white">You Save</span>
              <span className="font-heading text-3xl font-bold text-emerald-400">₹29,000–₹1.44L/mo</span>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* ── Mia quote ── */}
      <div className="mt-8">
        <GlassCard className="flex items-center gap-4">
          <AgentImage slug="mia" size={48} />
          <div>
            <p className="font-heading text-base font-semibold text-[#0b1c30]">Mia Orchestrator</p>
            <p className="text-sm italic text-[#45464d]">
              &ldquo;At current velocity, your 12-agent team completes 47 marketing tasks/week — equivalent to a 3-person team working full time, for under ₹6,000/month.&rdquo;
            </p>
          </div>
        </GlassCard>
      </div>

      {/* ── Mia credit meter ── */}
      <GlassCard dark className="mx-auto mt-6 max-w-md">
        <div className="flex items-center gap-3">
          <AgentImage slug="mia" size={40} />
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-white">Penny&apos;s Credit Meter — Growth Plan</p>
            <div className="mt-1 h-2 rounded-full bg-white/10">
              <div className="h-2 rounded-full bg-[#6b38d4]" style={{ width: '70%' }} />
            </div>
            <p className="mt-1 text-xs text-white/40">1,050 / 1,500 credits used this month</p>
          </div>
        </div>
      </GlassCard>

    </section>
  )
}

/* CreditsSlide is now merged into PricingSlide — kept as alias for deck backward compat */
export function CreditsSlide() {
  return null
}

/* ═══════════════════════════════════════════════════════════════════════════
   8. SECURITY
   ═══════════════════════════════════════════════════════════════════════════ */

export function SecuritySlide() {
  const features = [
    {
      icon: <Layers className="h-8 w-8" />,
      title: 'Data Isolation',
      desc: 'Each brand operates in a fully isolated data partition with Supabase Row-Level Security.',
    },
    {
      icon: <Key className="h-8 w-8" />,
      title: 'Encrypted Keys',
      desc: 'All API keys and credentials encrypted at rest with AES-256. Zero plain-text storage.',
    },
    {
      icon: <CreditCard className="h-8 w-8" />,
      title: 'Secure Payments',
      desc: 'PCI-compliant payment processing via Stripe. We never touch your card data.',
    },
    {
      icon: <FileText className="h-8 w-8" />,
      title: 'Full Audit Log',
      desc: 'Every agent action and data access is logged, timestamped, and fully traceable.',
    },
  ]

  return (
    <section className="mx-auto w-full max-w-7xl px-6 py-16">
      <div className="text-center">
        <PurpleBadge>Security</PurpleBadge>
        <h1 className="font-heading mt-6 text-4xl font-bold leading-tight text-[#0b1c30] md:text-5xl">
          Your data is yours. Always.
        </h1>
      </div>

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f) => (
          <GlassCard key={f.title} className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#e9ddff] text-[#6b38d4]">
              {f.icon}
            </div>
            <h3 className="font-heading mt-4 text-lg font-semibold text-[#0b1c30]">{f.title}</h3>
            <p className="mt-2 text-sm text-[#45464d]">{f.desc}</p>
          </GlassCard>
        ))}
      </div>

      <div className="mt-12 text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-[#45464d]">Trusted globally by</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-8">
          {['D2C Brands', 'Shopify Stores', 'Marketing Agencies', 'E-commerce Teams'].map((name) => (
            <span key={name} className="rounded-full border border-[#e5eeff] bg-[#eff4ff] px-5 py-2 text-sm font-medium text-[#0b1c30]">
              {name}
            </span>
          ))}
        </div>
      </div>

      <SpeakerNotes>
        <ul className="list-disc space-y-1 pl-4">
          <li>Supabase RLS ensures zero cross-brand data leakage</li>
          <li>All credentials stored with AES-256 encryption — never in plain text</li>
          <li>Stripe handles PCI compliance end-to-end</li>
          <li>Full audit trail for SOC 2 readiness</li>
        </ul>
      </SpeakerNotes>

    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   9. AGENCY
   ═══════════════════════════════════════════════════════════════════════════ */

export function AgencySlide() {
  return (
    <section className="mx-auto w-full max-w-7xl px-6 py-16">
      <div className="text-center">
        <PurpleBadge>Agency Tier</PurpleBadge>
        <h1 className="font-heading mt-6 text-4xl font-bold leading-tight text-[#0b1c30] md:text-5xl">
          Manage all your brands from one dashboard.
        </h1>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2">
          <h3 className="font-heading text-xl font-bold text-[#0b1c30]">Unified Dashboard</h3>
          <p className="mt-2 text-sm text-[#45464d]">All your brands, metrics, and agents in one view.</p>
          <div className="mt-6 grid grid-cols-3 gap-4">
            <div className="rounded-2xl bg-[#eff4ff] p-4 text-center">
              <p className="font-heading text-2xl font-bold text-[#6b38d4]">4.8x</p>
              <p className="text-xs text-[#45464d]">Avg ROAS</p>
            </div>
            <div className="rounded-2xl bg-[#eff4ff] p-4 text-center">
              <p className="font-heading text-2xl font-bold text-[#6b38d4]">0.02%</p>
              <p className="text-xs text-[#45464d]">Error Rate</p>
            </div>
            <div className="rounded-2xl bg-[#eff4ff] p-4 text-center">
              <p className="font-heading text-2xl font-bold text-[#6b38d4]">$1.2M</p>
              <p className="text-xs text-[#45464d]">Managed Spend</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <Sparkles className="h-8 w-8 text-[#6b38d4]" />
          <h3 className="font-heading mt-3 text-lg font-semibold text-[#0b1c30]">Custom Agent Skills</h3>
          <p className="mt-2 text-sm text-[#45464d]">
            Build and deploy custom agent skills tailored to your agency methodology and client verticals.
          </p>
        </GlassCard>

        <GlassCard dark>
          <Monitor className="h-8 w-8 text-[#6b38d4]" />
          <h3 className="font-heading mt-3 text-lg font-semibold text-white">White-Label Ready</h3>
          <p className="mt-2 text-sm text-white/60">
            Present Growth OS as your own platform with custom branding, domain, and client portals.
          </p>
        </GlassCard>

        <GlassCard>
          <Lock className="h-8 w-8 text-[#6b38d4]" />
          <h3 className="font-heading mt-3 text-lg font-semibold text-[#0b1c30]">Granular Access Control</h3>
          <p className="mt-2 text-sm text-[#45464d]">
            Role-based permissions per brand. Clients see only their data. Team members get scoped access.
          </p>
        </GlassCard>

        <GlassCard>
          <Gauge className="h-8 w-8 text-[#6b38d4]" />
          <h3 className="font-heading mt-3 text-lg font-semibold text-[#0b1c30]">Platform-wide Monitoring</h3>
          <p className="mt-2 text-sm text-[#45464d]">
            Real-time health checks across all brands. Get alerted before issues become emergencies.
          </p>
        </GlassCard>
      </div>

      <SpeakerNotes>
        <p>The Agency tier is designed for marketing agencies managing multiple client brands. Key differentiators: white-label capability, cross-brand insights, and granular access controls.</p>
      </SpeakerNotes>

    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Slide map
   ═══════════════════════════════════════════════════════════════════════════ */

export const SLIDE_MAP: Record<string, () => React.ReactNode> = {
  problem: ProblemSlide,
  aria: AriaSlide,
  luna: LunaSlide,
  penny: PennySlide,
  seo: SeoSlide,
  pricing: PricingSlide,
  credits: CreditsSlide,
  security: SecuritySlide,
  agency: AgencySlide,
}

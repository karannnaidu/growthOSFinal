'use client'

import { useParams } from 'next/navigation'
import Image from 'next/image'
import {
  AlertTriangle,
  BarChart3,
  Database,
  Lock,
  Shield,
  Sparkles,
  Zap,
  Search,
  Globe,
  CreditCard,
  Calculator,
  Users,
  Layers,
  CheckCircle2,
  TrendingUp,
  Mail,
  Heart,
  DollarSign,
  PiggyBank,
  Eye,
  FileText,
  Key,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function GlassCard({
  children,
  className = '',
  accent,
}: {
  children: React.ReactNode
  className?: string
  accent?: string
}) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md ${className}`}
      style={accent ? { borderColor: `${accent}33` } : undefined}
    >
      {children}
    </div>
  )
}

function SlideHeading({
  label,
  title,
  accent,
}: {
  label: string
  title: string
  accent?: string
}) {
  return (
    <div className="mb-8">
      <span
        className="mb-2 inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest"
        style={{
          color: accent ?? '#60a5fa',
          backgroundColor: `${accent ?? '#60a5fa'}18`,
        }}
      >
        {label}
      </span>
      <h1 className="font-heading text-4xl font-bold leading-tight text-white md:text-5xl lg:text-6xl">
        {title}
      </h1>
    </div>
  )
}

function AgentSpotlight({
  name,
  slug,
  role,
  accent,
  capabilities,
}: {
  name: string
  slug: string
  role: string
  accent: string
  capabilities: { icon: React.ReactNode; label: string; desc: string }[]
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-10 lg:flex-row">
      {/* Agent portrait */}
      <div className="flex flex-col items-center gap-4">
        <div
          className="overflow-hidden rounded-3xl border-2 p-1"
          style={{ borderColor: accent }}
        >
          <Image
            src={`/agents/${slug}.png`}
            alt={name}
            width={280}
            height={280}
            className="rounded-2xl object-cover"
          />
        </div>
        <div className="text-center">
          <h2 className="font-heading text-3xl font-bold text-white">{name}</h2>
          <p className="mt-1 text-sm font-medium" style={{ color: accent }}>
            {role}
          </p>
        </div>
      </div>

      {/* Capabilities */}
      <div className="flex flex-1 flex-col gap-4">
        {capabilities.map((cap) => (
          <GlassCard key={cap.label} accent={accent} className="flex items-start gap-4">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${accent}20`, color: accent }}
            >
              {cap.icon}
            </div>
            <div>
              <h3 className="font-heading text-lg font-semibold text-white">{cap.label}</h3>
              <p className="mt-1 text-sm leading-relaxed text-white/60">{cap.desc}</p>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Slide definitions
// ---------------------------------------------------------------------------

function ProblemSlide() {
  const painPoints = [
    {
      icon: <AlertTriangle className="h-5 w-5" />,
      title: 'Fragmented Analytics',
      desc: 'Data scattered across 6+ platforms with no single source of truth.',
    },
    {
      icon: <BarChart3 className="h-5 w-5" />,
      title: 'Manual Reporting',
      desc: 'Hours spent stitching spreadsheets every week instead of optimizing.',
    },
    {
      icon: <Database className="h-5 w-5" />,
      title: 'Siloed Data',
      desc: 'Email, ads, social, and finance teams operate in isolation.',
    },
  ]

  return (
    <div className="mx-auto w-full max-w-4xl text-center">
      <SlideHeading label="The Problem" title="D2C Brands Are Bleeding Budget" accent="#ef4444" />
      <p className="mx-auto mb-10 max-w-2xl text-lg text-white/60">
        Brands waste <span className="font-semibold text-red-400">40% of their marketing budget</span>{' '}
        on disconnected tools that don&apos;t talk to each other.
      </p>
      <div className="grid gap-6 md:grid-cols-3">
        {painPoints.map((p) => (
          <GlassCard key={p.title} accent="#ef4444">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/15 text-red-400">
              {p.icon}
            </div>
            <h3 className="font-heading text-lg font-semibold text-white">{p.title}</h3>
            <p className="mt-2 text-sm text-white/50">{p.desc}</p>
          </GlassCard>
        ))}
      </div>
    </div>
  )
}

function AriaSlide() {
  return (
    <AgentSpotlight
      name="Aria"
      slug="aria"
      role="AI Creative Director"
      accent="#F97316"
      capabilities={[
        {
          icon: <Sparkles className="h-5 w-5" />,
          label: 'Ad Copy Generation',
          desc: 'Creates high-converting ad copy tuned to your brand voice and target persona.',
        },
        {
          icon: <FileText className="h-5 w-5" />,
          label: 'UGC Scripts',
          desc: 'Writes authentic user-generated content scripts for TikTok, Reels, and YouTube Shorts.',
        },
        {
          icon: <Eye className="h-5 w-5" />,
          label: 'Persona Review',
          desc: 'Reviews creative assets against buyer persona profiles for tone and messaging fit.',
        },
      ]}
    />
  )
}

function LunaSlide() {
  return (
    <AgentSpotlight
      name="Luna"
      slug="luna"
      role="Retention & Email Specialist"
      accent="#10B981"
      capabilities={[
        {
          icon: <Mail className="h-5 w-5" />,
          label: 'Email Flows',
          desc: 'Designs and writes welcome, abandoned cart, post-purchase, and win-back sequences.',
        },
        {
          icon: <Heart className="h-5 w-5" />,
          label: 'Churn Prevention',
          desc: 'Identifies at-risk customers and generates retention offers before they leave.',
        },
        {
          icon: <TrendingUp className="h-5 w-5" />,
          label: 'Loyalty Programs',
          desc: 'Crafts loyalty tier strategies and reward copy that drives repeat purchases.',
        },
      ]}
    />
  )
}

function PennySlide() {
  return (
    <AgentSpotlight
      name="Penny"
      slug="penny"
      role="Finance Guardian"
      accent="#059669"
      capabilities={[
        {
          icon: <DollarSign className="h-5 w-5" />,
          label: 'Billing Check',
          desc: 'Audits ad spend invoices and flags discrepancies before they compound.',
        },
        {
          icon: <Calculator className="h-5 w-5" />,
          label: 'Unit Economics',
          desc: 'Calculates CAC, LTV, and payback periods per channel with real-time data.',
        },
        {
          icon: <PiggyBank className="h-5 w-5" />,
          label: 'Cash Flow',
          desc: 'Projects marketing cash flow and recommends budget re-allocation strategies.',
        },
      ]}
    />
  )
}

function SeoSlide() {
  const accent = '#7C3AED'
  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex flex-col items-center gap-10 lg:flex-row">
        <div className="flex-1">
          <SlideHeading label="Nova Agent" title="SEO & AI Search Visibility" accent={accent} />
          <p className="mb-8 max-w-lg text-lg text-white/60">
            Dominate both traditional search and the new wave of AI-powered search engines with
            programmatic, data-driven SEO.
          </p>
          <div className="flex flex-col gap-4">
            {[
              {
                icon: <Globe className="h-5 w-5" />,
                label: 'GEO Visibility',
                desc: 'Optimize for AI Overviews, ChatGPT citations, and Perplexity answers.',
              },
              {
                icon: <Search className="h-5 w-5" />,
                label: 'Programmatic SEO',
                desc: 'Auto-generate thousands of optimized landing pages from your product data.',
              },
              {
                icon: <Key className="h-5 w-5" />,
                label: 'Keyword Strategy',
                desc: 'AI-driven keyword clustering with intent mapping and difficulty scoring.',
              },
            ].map((cap) => (
              <GlassCard key={cap.label} accent={accent} className="flex items-start gap-4">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${accent}20`, color: accent }}
                >
                  {cap.icon}
                </div>
                <div>
                  <h3 className="font-heading text-lg font-semibold text-white">{cap.label}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-white/60">{cap.desc}</p>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div
            className="flex h-40 w-40 items-center justify-center rounded-3xl"
            style={{ backgroundColor: `${accent}15` }}
          >
            <Search className="h-20 w-20" style={{ color: accent }} />
          </div>
          <span className="font-heading text-2xl font-bold text-white">Nova</span>
          <span className="text-sm font-medium" style={{ color: accent }}>
            SEO & GEO Agent
          </span>
        </div>
      </div>
    </div>
  )
}

function PricingSlide() {
  const tiers = [
    {
      name: 'Starter',
      price: 'Free',
      credits: '100 credits/mo',
      accent: '#60a5fa',
      features: ['1 brand', '3 agents', 'Basic analytics', 'Community support'],
    },
    {
      name: 'Growth',
      price: '$49',
      credits: '1,000 credits/mo',
      accent: '#F97316',
      popular: true,
      features: ['3 brands', 'All 12 agents', 'Advanced analytics', 'Priority support', 'Custom prompts'],
    },
    {
      name: 'Agency',
      price: '$199',
      credits: '5,000 credits/mo',
      accent: '#7C3AED',
      features: [
        'Unlimited brands',
        'All agents + custom',
        'White-label',
        'Dedicated support',
        'API access',
        'Cross-brand insights',
      ],
    },
  ]

  return (
    <div className="mx-auto w-full max-w-5xl text-center">
      <SlideHeading label="Pricing" title="Simple, Credit-Based Pricing" accent="#F97316" />
      <p className="mx-auto mb-10 max-w-xl text-white/60">
        Pay only for what you use. Every AI action consumes credits based on model complexity.
      </p>
      <div className="grid gap-6 md:grid-cols-3">
        {tiers.map((tier) => (
          <GlassCard
            key={tier.name}
            accent={tier.accent}
            className={`relative flex flex-col items-center ${
              tier.popular ? 'ring-1' : ''
            }`}
            {...(tier.popular ? { style: { ringColor: tier.accent } } : {})}
          >
            {tier.popular && (
              <span
                className="absolute -top-3 rounded-full px-3 py-0.5 text-xs font-bold text-white"
                style={{ backgroundColor: tier.accent }}
              >
                Most Popular
              </span>
            )}
            <h3 className="font-heading text-xl font-bold text-white">{tier.name}</h3>
            <p className="mt-2 text-3xl font-bold" style={{ color: tier.accent }}>
              {tier.price}
              {tier.price !== 'Free' && <span className="text-sm text-white/40">/mo</span>}
            </p>
            <p className="mt-1 text-xs text-white/50">{tier.credits}</p>
            <ul className="mt-6 flex flex-col gap-2 text-left text-sm">
              {tier.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-white/70">
                  <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: tier.accent }} />
                  {f}
                </li>
              ))}
            </ul>
          </GlassCard>
        ))}
      </div>
    </div>
  )
}

function CreditsSlide() {
  const accent = '#F97316'
  const tiers = [
    { tier: 'Free', model: 'Gemini Flash', cost: '0 credits', color: '#10B981' },
    { tier: 'Cheap', model: 'GPT-4o Mini', cost: '1 credit', color: '#60a5fa' },
    { tier: 'Mid', model: 'Claude Sonnet', cost: '3 credits', color: '#F97316' },
    { tier: 'Premium', model: 'Claude Opus / GPT-4o', cost: '5 credits', color: '#7C3AED' },
  ]

  const examples = [
    { workflow: 'Generate ad copy', credits: '3', model: 'Sonnet' },
    { workflow: 'Full SEO audit', credits: '5', model: 'Opus' },
    { workflow: 'Email subject lines (10x)', credits: '1', model: 'Mini' },
    { workflow: 'Churn risk analysis', credits: '3', model: 'Sonnet' },
  ]

  return (
    <div className="mx-auto w-full max-w-5xl">
      <SlideHeading label="Credit System" title="How Credits Work" accent={accent} />
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Model tiers */}
        <div>
          <h3 className="mb-4 font-heading text-lg font-semibold text-white">Model Tiers</h3>
          <div className="flex flex-col gap-3">
            {tiers.map((t) => (
              <GlassCard key={t.tier} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: t.color }}
                  />
                  <div>
                    <span className="font-medium text-white">{t.tier}</span>
                    <span className="ml-2 text-sm text-white/40">{t.model}</span>
                  </div>
                </div>
                <span className="font-heading font-bold" style={{ color: t.color }}>
                  {t.cost}
                </span>
              </GlassCard>
            ))}
          </div>
        </div>

        {/* Example workflows */}
        <div>
          <h3 className="mb-4 font-heading text-lg font-semibold text-white">Example Workflows</h3>
          <div className="flex flex-col gap-3">
            {examples.map((ex) => (
              <GlassCard key={ex.workflow} accent={accent} className="flex items-center justify-between">
                <span className="text-sm text-white/70">{ex.workflow}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/40">{ex.model}</span>
                  <span className="font-heading font-bold" style={{ color: accent }}>
                    {ex.credits}cr
                  </span>
                </div>
              </GlassCard>
            ))}
          </div>
          <GlassCard accent="#10B981" className="mt-4 text-center">
            <p className="text-sm text-white/60">
              Growth plan at <span className="font-bold text-emerald-400">$49/mo = 1,000 credits</span>
            </p>
            <p className="mt-1 text-sm text-white/60">
              Avg cost: <span className="font-bold text-white">$0.049 per action</span>
            </p>
          </GlassCard>
        </div>
      </div>
    </div>
  )
}

function SecuritySlide() {
  const accent = '#3b82f6'
  const features = [
    {
      icon: <Shield className="h-6 w-6" />,
      title: 'SOC 2 Ready',
      desc: 'Architecture built to SOC 2 Type II standards from day one.',
    },
    {
      icon: <Lock className="h-6 w-6" />,
      title: 'Row-Level Security',
      desc: 'Supabase RLS policies ensure complete data isolation per brand.',
    },
    {
      icon: <Database className="h-6 w-6" />,
      title: 'Encryption at Rest',
      desc: 'All data encrypted with AES-256 at rest and TLS 1.3 in transit.',
    },
    {
      icon: <Layers className="h-6 w-6" />,
      title: 'Data Isolation',
      desc: 'Each brand operates in a fully isolated data partition.',
    },
    {
      icon: <Globe className="h-6 w-6" />,
      title: 'GDPR Ready',
      desc: 'Built-in data export, deletion workflows, and consent management.',
    },
    {
      icon: <Zap className="h-6 w-6" />,
      title: 'Audit Logging',
      desc: 'Every agent action and data access is logged and traceable.',
    },
  ]

  return (
    <div className="mx-auto w-full max-w-5xl text-center">
      <SlideHeading label="Security & Data" title="Enterprise-Grade Security" accent={accent} />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <GlassCard key={f.title} accent={accent}>
            <div
              className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${accent}15`, color: accent }}
            >
              {f.icon}
            </div>
            <h3 className="font-heading text-lg font-semibold text-white">{f.title}</h3>
            <p className="mt-2 text-sm text-white/50">{f.desc}</p>
          </GlassCard>
        ))}
      </div>
    </div>
  )
}

function AgencySlide() {
  const accent = '#7C3AED'
  const features = [
    {
      icon: <Users className="h-5 w-5" />,
      label: 'Multi-Brand Management',
      desc: 'Manage unlimited client brands from a single dashboard with isolated data and team permissions.',
    },
    {
      icon: <TrendingUp className="h-5 w-5" />,
      label: 'Cross-Brand Pattern Recognition',
      desc: 'AI identifies winning patterns across your portfolio and applies insights to underperforming brands.',
    },
    {
      icon: <Sparkles className="h-5 w-5" />,
      label: 'Custom Agents',
      desc: 'Build and deploy custom agents tailored to your agency methodology and client verticals.',
    },
    {
      icon: <CreditCard className="h-5 w-5" />,
      label: 'White-Label Ready',
      desc: 'Present Growth OS as your own platform with custom branding, domain, and client portals.',
    },
  ]

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="text-center">
        <SlideHeading label="Agency Tier" title="Built for Agencies" accent={accent} />
        <p className="mx-auto mb-10 max-w-xl text-lg text-white/60">
          Everything in Growth, plus the tools agencies need to scale their AI-powered services.
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {features.map((f) => (
          <GlassCard key={f.label} accent={accent} className="flex items-start gap-4">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${accent}20`, color: accent }}
            >
              {f.icon}
            </div>
            <div>
              <h3 className="font-heading text-lg font-semibold text-white">{f.label}</h3>
              <p className="mt-1 text-sm leading-relaxed text-white/60">{f.desc}</p>
            </div>
          </GlassCard>
        ))}
      </div>
      <div className="mt-8 text-center">
        <GlassCard accent={accent} className="inline-block">
          <span className="font-heading text-2xl font-bold" style={{ color: accent }}>
            $199/mo
          </span>
          <span className="ml-2 text-white/50">5,000 credits included</span>
        </GlassCard>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Slide map
// ---------------------------------------------------------------------------

const SLIDE_MAP: Record<string, () => React.ReactNode> = {
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

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function SlidePage() {
  const params = useParams()
  const slideId = (params.slideId as string) ?? 'problem'
  const SlideComponent = SLIDE_MAP[slideId]

  if (!SlideComponent) {
    return (
      <div className="text-center">
        <h1 className="font-heading text-4xl font-bold text-white">Slide not found</h1>
        <p className="mt-2 text-white/50">Unknown slide: {slideId}</p>
      </div>
    )
  }

  return <SlideComponent />
}

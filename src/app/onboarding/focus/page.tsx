'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TrendingUp, Target, Search, Sparkles, ArrowLeft, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface FocusCard {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  accent: string
  premium?: boolean
}

const FOCUS_CARDS: FocusCard[] = [
  {
    id: 'grow_revenue',
    label: 'Grow Revenue',
    description: 'Scale AOV, LTV and repeat purchase rate',
    icon: <TrendingUp className="w-6 h-6" />,
    accent: '#f97316',
  },
  {
    id: 'fix_conversions',
    label: 'Fix Conversions',
    description: 'Identify and fix funnel leaks fast',
    icon: <Target className="w-6 h-6" />,
    accent: '#3b82f6',
  },
  {
    id: 'get_found',
    label: 'Get Found',
    description: 'Dominate search, ads and AI discovery',
    icon: <Search className="w-6 h-6" />,
    accent: '#8b5cf6',
  },
  {
    id: 'all_of_the_above',
    label: 'All of the Above',
    description: 'Full-stack growth — let Mia prioritise',
    icon: <Sparkles className="w-6 h-6" />,
    accent: '#6366f1',
    premium: true,
  },
]

export default function FocusPage() {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  function toggleCard(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  async function handleNext() {
    const brandId = sessionStorage.getItem('onboarding_brand_id')
    if (selected.size === 0) {
      router.push('/onboarding/platforms')
      return
    }
    setLoading(true)
    try {
      if (brandId) {
        await fetch('/api/onboarding/set-focus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandId, focusAreas: Array.from(selected) }),
        })
      }
    } catch {
      // non-blocking — continue regardless
    } finally {
      router.push('/onboarding/platforms')
    }
  }

  return (
    <div className="w-full max-w-2xl animate-slide-up">
      {/* Step badge */}
      <div className="flex justify-center mb-6">
        <span
          className="text-xs font-metric font-medium tracking-widest uppercase px-3 py-1 rounded-full border"
          style={{
            borderColor: 'oklch(1 0 0 / 15%)',
            color: 'oklch(0.65 0.02 243)',
            background: 'oklch(1 0 0 / 4%)',
          }}
        >
          Step 4 of 5
        </span>
      </div>

      {/* Heading */}
      <div className="text-center mb-10">
        <h1 className="font-heading font-bold text-3xl sm:text-4xl md:text-5xl text-foreground mb-4 tracking-tight">
          Pick Your Focus
        </h1>
        <p className="text-muted-foreground text-base max-w-lg mx-auto leading-relaxed">
          Choose what matters most right now. You can change this any time.
        </p>
      </div>

      {/* 2x2 grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {FOCUS_CARDS.map((card) => {
          const isSelected = selected.has(card.id)
          return (
            <button
              key={card.id}
              onClick={() => toggleCard(card.id)}
              className={[
                'relative text-left rounded-2xl p-6 transition-all duration-200 group',
                card.premium
                  ? 'glass-panel-elevated'
                  : 'glass-panel',
                isSelected
                  ? 'ring-2'
                  : 'hover:bg-white/5',
              ].join(' ')}
              style={{
                ...(isSelected ? { '--tw-ring-color': card.accent, boxShadow: `0 0 0 2px ${card.accent}` } : {}),
              } as React.CSSProperties}
            >
              {/* Icon */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
                style={{
                  background: `${card.accent}20`,
                  color: card.accent,
                }}
              >
                {card.icon}
              </div>

              <h3 className="font-heading font-semibold text-base text-foreground mb-1">
                {card.label}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {card.description}
              </p>

              {/* Selected check */}
              {isSelected && (
                <div
                  className="absolute top-4 right-4 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: card.accent }}
                >
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}

              {/* Select link */}
              {!isSelected && (
                <p
                  className="text-xs mt-3 font-medium"
                  style={{ color: card.accent }}
                >
                  Select Focus →
                </p>
              )}
            </button>
          )
        })}
      </div>

      {/* Mia insight banner */}
      <div
        className="glass-panel rounded-xl px-5 py-4 flex items-start gap-3 mb-8"
        style={{ borderColor: '#6366f130' }}
      >
        <div
          className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold font-heading"
          style={{ background: '#6366f120', color: '#6366f1' }}
        >
          M
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          <span className="text-foreground font-medium">Mia says:</span> Most growing D2C brands see
          the fastest wins when they pick <em>Fix Conversions</em> first — then layer on revenue
          growth once leaks are sealed.
        </p>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-4">
        <Button
          variant="outline"
          onClick={() => router.push('/onboarding/connect-store')}
          className="gap-2 border-border/50 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <Button
          onClick={handleNext}
          disabled={loading}
          className="gap-2 bg-[#6366f1] hover:bg-[#5254cc] text-white font-semibold px-8"
        >
          {loading ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              Next
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

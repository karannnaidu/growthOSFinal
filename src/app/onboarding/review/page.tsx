'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  Palette,
  Type,
  Users,
  Target,
  Package,
  RefreshCw,
  Plus,
} from 'lucide-react'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import { Button } from '@/components/ui/button'

/* ------------------------------------------------------------------ */
/*  Local BrandDna interface                                          */
/* ------------------------------------------------------------------ */

interface BrandDna {
  brand_voice: {
    formality: string
    warmth: string
    humor: string
    confidence: string
    style_notes: string
    sample_phrases: string[]
  }
  tone_adjectives: string[]
  target_audience: {
    age_range: string
    gender_skew: string
    interests: string[]
    pain_points: string[]
    income_bracket: string
    psychographic: string
  }
  positioning: {
    statement: string
    category: string
    differentiator: string
    price_positioning: string
  }
  products: {
    name: string
    description: string
    price: string | null
    image_url: string | null
    category: string
  }[]
  visual_identity: {
    primary_colors: string[]
    secondary_colors: string[]
    font_families: string[]
    logo_url: string | null
    aesthetic: string
  }
  brand_story: string | null
  key_themes: string[]
  trust_signals: string[]
  extraction_confidence: Record<string, number>
}

interface CompetitorSnapshot {
  name: string
  domain: string
  type: 'direct' | 'market_cohort'
  tagline: string
  positioning: string
  product_categories: string[]
  estimated_size: string
  why_competitor: string
  platform: string
}

/* ------------------------------------------------------------------ */
/*  Inline-editable text component                                    */
/* ------------------------------------------------------------------ */

function EditableField({
  value,
  onSave,
  multiline = true,
  className = '',
}: {
  value: string
  onSave: (v: string) => void
  multiline?: boolean
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  function startEdit() {
    setDraft(value)
    setEditing(true)
  }

  function save() {
    onSave(draft)
    setEditing(false)
  }

  function cancel() {
    setDraft(value)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={multiline ? 4 : 2}
          className="w-full rounded-lg border border-border/60 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-[#6366f1] focus:outline-none resize-none"
          autoFocus
        />
        <div className="flex gap-2">
          <Button
            size="xs"
            onClick={save}
            className="bg-[#6366f1] hover:bg-[#5254cc] text-white"
          >
            Save
          </Button>
          <Button size="xs" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <p
      onClick={startEdit}
      title="Click to edit"
      className={`cursor-pointer rounded-lg px-3 py-2 text-sm text-foreground/80 transition hover:bg-white/10 ${className}`}
    >
      {value || <span className="italic text-muted-foreground">Click to add...</span>}
    </p>
  )
}

/* ------------------------------------------------------------------ */
/*  Pill tag                                                          */
/* ------------------------------------------------------------------ */

function Pill({ children, color = '#6366f1' }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ background: `${color}22`, color }}
    >
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Color swatch                                                      */
/* ------------------------------------------------------------------ */

function ColorSwatch({ hex }: { hex: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-7 h-7 rounded-lg border border-white/10 shrink-0"
        style={{ background: hex }}
      />
      <span className="text-xs font-metric text-muted-foreground uppercase tracking-wider">
        {hex}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Section header                                                    */
/* ------------------------------------------------------------------ */

function SectionHeader({
  icon: Icon,
  iconColor,
  title,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  iconColor: string
  title: string
}) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center"
        style={{ background: `${iconColor}18` }}
      >
        <Icon className="w-4 h-4" style={{ color: iconColor }} />
      </div>
      <h2 className="font-heading font-semibold text-base text-foreground">{title}</h2>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Add product card                                                  */
/* ------------------------------------------------------------------ */

function AddProductCard({ onAdd }: { onAdd: (p: BrandDna['products'][0]) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [category, setCategory] = useState('')

  function handleSubmit() {
    if (!name.trim()) return
    onAdd({
      name: name.trim(),
      description: '',
      price: price.trim() || null,
      image_url: null,
      category: category.trim() || 'General',
    })
    setName('')
    setPrice('')
    setCategory('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl border-2 border-dashed border-white/10 hover:border-[#0d9488]/40 flex flex-col items-center justify-center gap-2 min-h-[200px] transition-colors group"
      >
        <Plus className="w-6 h-6 text-muted-foreground/40 group-hover:text-[#0d9488] transition-colors" />
        <span className="text-xs text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
          Add Product
        </span>
      </button>
    )
  }

  return (
    <div className="rounded-xl bg-white/5 border border-border/40 p-3 flex flex-col gap-2.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Product name *"
        autoFocus
        className="w-full rounded-lg bg-white/5 border border-border/40 px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-[#0d9488] focus:outline-none"
      />
      <input
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="Price (e.g. $29.99)"
        className="w-full rounded-lg bg-white/5 border border-border/40 px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-[#0d9488] focus:outline-none"
      />
      <input
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        placeholder="Category"
        className="w-full rounded-lg bg-white/5 border border-border/40 px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-[#0d9488] focus:outline-none"
      />
      <div className="flex gap-2 mt-1">
        <Button size="xs" onClick={handleSubmit} className="bg-[#0d9488] hover:bg-[#0d9488]/80 text-white">
          Add
        </Button>
        <Button size="xs" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main page                                                         */
/* ------------------------------------------------------------------ */

export default function ReviewPage() {
  const router = useRouter()
  const [dna, setDna] = useState<BrandDna | null>(null)
  const [competitors, setCompetitors] = useState<CompetitorSnapshot[]>([])

  /* ---- Load from sessionStorage ---------------------------------- */
  useEffect(() => {
    const raw = sessionStorage.getItem('onboarding_brand_dna')
    if (!raw) {
      router.replace('/onboarding/connect-store')
      return
    }
    try {
      setDna(JSON.parse(raw) as BrandDna)
    } catch {
      router.replace('/onboarding/connect-store')
    }
    const compRaw = sessionStorage.getItem('onboarding_competitors')
    if (compRaw) {
      try { setCompetitors(JSON.parse(compRaw)) } catch { /* skip */ }
    }
  }, [router])

  /* ---- Persist helper -------------------------------------------- */
  const persist = useCallback((updated: BrandDna) => {
    setDna(updated)
    sessionStorage.setItem('onboarding_brand_dna', JSON.stringify(updated))
  }, [])

  /* ---- Navigation handlers --------------------------------------- */
  function handleBack() {
    router.push('/onboarding/connect-store')
  }

  function handleRescan() {
    sessionStorage.removeItem('onboarding_brand_dna')
    router.push('/onboarding/extraction')
  }

  function handleContinue() {
    router.push('/onboarding/focus')
  }

  /* ---- Confidence score ------------------------------------------ */
  const avgConfidence =
    dna && Object.keys(dna.extraction_confidence).length > 0
      ? Math.round(
          Object.values(dna.extraction_confidence).reduce((a, b) => a + b, 0) /
            Object.values(dna.extraction_confidence).length
        )
      : 0

  if (!dna) return null

  return (
    <div className="w-full max-w-5xl animate-slide-up">
      {/* ---- Step badge ------------------------------------------- */}
      <div className="flex justify-center mb-6">
        <span
          className="text-xs font-metric font-medium tracking-widest uppercase px-3 py-1 rounded-full border"
          style={{
            borderColor: 'oklch(1 0 0 / 15%)',
            color: 'oklch(0.65 0.02 243)',
            background: 'oklch(1 0 0 / 4%)',
          }}
        >
          Step 2 of 5 &mdash; Review
        </span>
      </div>

      {/* ---- Heading with Mia avatar + confidence ----------------- */}
      <div className="text-center mb-10">
        <div className="flex items-center justify-center gap-3 mb-4">
          <AgentAvatar agentId="mia" size="md" />
          <h1 className="font-heading font-bold text-3xl sm:text-4xl text-foreground tracking-tight">
            Your Brand DNA
          </h1>
        </div>
        <p className="text-muted-foreground text-base max-w-lg mx-auto leading-relaxed">
          Mia extracted this from your store. Click any text to refine it.
        </p>
        {avgConfidence > 0 && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1"
            style={{
              borderColor: 'oklch(1 0 0 / 12%)',
              background: 'oklch(1 0 0 / 4%)',
            }}
          >
            <span className="text-xs text-muted-foreground">Extraction confidence</span>
            <span className="text-sm font-metric font-semibold text-[#6366f1]">{avgConfidence}%</span>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/*  2-column grid                                               */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* ---- 1. Brand Voice ------------------------------------- */}
        <div className="glass-panel rounded-2xl p-5 sm:p-6">
          <SectionHeader icon={Type} iconColor="#6366f1" title="Brand Voice" />

          {/* 2x2 metric grid */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {(['formality', 'warmth', 'humor', 'confidence'] as const).map((key) => (
              <div key={key} className="rounded-xl bg-white/5 px-3 py-2.5">
                <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">
                  {key}
                </span>
                <span className="text-sm font-metric font-semibold text-foreground">
                  {dna.brand_voice[key]}
                </span>
              </div>
            ))}
          </div>

          {/* Editable style notes */}
          <div className="mb-4">
            <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-1 px-1">
              Style Notes
            </span>
            <EditableField
              value={dna.brand_voice.style_notes}
              onSave={(v) =>
                persist({ ...dna, brand_voice: { ...dna.brand_voice, style_notes: v } })
              }
            />
          </div>

          {/* Tone adjectives pills */}
          {dna.tone_adjectives.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {dna.tone_adjectives.map((adj) => (
                <Pill key={adj} color="#6366f1">
                  {adj}
                </Pill>
              ))}
            </div>
          )}
        </div>

        {/* ---- 2. Visual Identity --------------------------------- */}
        <div className="glass-panel rounded-2xl p-5 sm:p-6">
          <SectionHeader icon={Palette} iconColor="#f97316" title="Visual Identity" />

          {/* Colors */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            {dna.visual_identity.primary_colors.length > 0 && (
              <div>
                <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                  Primary
                </span>
                <div className="space-y-2">
                  {dna.visual_identity.primary_colors.map((c) => (
                    <ColorSwatch key={c} hex={c} />
                  ))}
                </div>
              </div>
            )}
            {dna.visual_identity.secondary_colors.length > 0 && (
              <div>
                <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                  Secondary
                </span>
                <div className="space-y-2">
                  {dna.visual_identity.secondary_colors.map((c) => (
                    <ColorSwatch key={c} hex={c} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Font families */}
          {dna.visual_identity.font_families.length > 0 && (
            <div className="mb-4">
              <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                Fonts
              </span>
              <div className="flex flex-wrap gap-1.5">
                {dna.visual_identity.font_families.map((f) => (
                  <Pill key={f} color="#f97316">
                    {f}
                  </Pill>
                ))}
              </div>
            </div>
          )}

          {/* Aesthetic */}
          {dna.visual_identity.aesthetic && (
            <div className="rounded-xl bg-white/5 px-3 py-2.5">
              <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">
                Aesthetic
              </span>
              <span className="text-sm text-foreground/80">{dna.visual_identity.aesthetic}</span>
            </div>
          )}
        </div>

        {/* ---- 3. Positioning ------------------------------------- */}
        <div className="glass-panel rounded-2xl p-5 sm:p-6">
          <SectionHeader icon={Target} iconColor="#10b981" title="Positioning" />

          {/* Editable positioning statement */}
          <div className="mb-4 rounded-xl bg-white/5 px-4 py-3">
            <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
              Positioning Statement
            </span>
            <EditableField
              value={dna.positioning.statement}
              className="italic"
              onSave={(v) =>
                persist({ ...dna, positioning: { ...dna.positioning, statement: v } })
              }
            />
          </div>

          {/* Category + Price grid */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl bg-white/5 px-3 py-2.5">
              <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">
                Category
              </span>
              <span className="text-sm font-metric text-foreground">{dna.positioning.category}</span>
            </div>
            <div className="rounded-xl bg-white/5 px-3 py-2.5">
              <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">
                Price Positioning
              </span>
              <span className="text-sm font-metric text-foreground">{dna.positioning.price_positioning}</span>
            </div>
          </div>

          {/* Differentiator */}
          {dna.positioning.differentiator && (
            <div className="rounded-xl bg-white/5 px-3 py-2.5">
              <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">
                Differentiator
              </span>
              <span className="text-sm text-foreground/80">{dna.positioning.differentiator}</span>
            </div>
          )}
        </div>

        {/* ---- 4. Target Audience --------------------------------- */}
        <div className="glass-panel rounded-2xl p-5 sm:p-6">
          <SectionHeader icon={Users} iconColor="#8b5cf6" title="Target Audience" />

          {/* Demographic grid */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl bg-white/5 px-3 py-2.5">
              <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">
                Age Range
              </span>
              <span className="text-sm font-metric font-semibold text-foreground">
                {dna.target_audience.age_range}
              </span>
            </div>
            <div className="rounded-xl bg-white/5 px-3 py-2.5">
              <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">
                Gender Skew
              </span>
              <span className="text-sm font-metric font-semibold text-foreground">
                {dna.target_audience.gender_skew}
              </span>
            </div>
            <div className="rounded-xl bg-white/5 px-3 py-2.5">
              <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">
                Income
              </span>
              <span className="text-sm font-metric font-semibold text-foreground">
                {dna.target_audience.income_bracket}
              </span>
            </div>
          </div>

          {/* Psychographic */}
          {dna.target_audience.psychographic && (
            <div className="rounded-xl bg-white/5 px-3 py-2.5 mb-4">
              <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">
                Psychographic
              </span>
              <span className="text-sm text-foreground/80">{dna.target_audience.psychographic}</span>
            </div>
          )}

          {/* Interests pills */}
          {dna.target_audience.interests.length > 0 && (
            <div>
              <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-2 px-1">
                Interests
              </span>
              <div className="flex flex-wrap gap-1.5">
                {dna.target_audience.interests.map((interest) => (
                  <Pill key={interest} color="#8b5cf6">
                    {interest}
                  </Pill>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/*  Products (full-width below grid)                            */}
      {/* ============================================================ */}
      <div className="glass-panel rounded-2xl p-5 sm:p-6 mb-5">
        <SectionHeader icon={Package} iconColor="#0d9488" title="Products" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {dna.products.map((product, idx) => (
            <div
              key={product.name + idx}
              className="rounded-xl bg-white/5 overflow-hidden flex flex-col group relative"
            >
              {product.image_url ? (
                <div className="aspect-square bg-white/5 relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="aspect-square bg-white/5 flex items-center justify-center">
                  <Package className="w-8 h-8 text-muted-foreground/30" />
                </div>
              )}
              <div className="p-3 flex-1 flex flex-col">
                <span className="text-sm font-medium text-foreground line-clamp-2 mb-1">
                  {product.name}
                </span>
                {product.price && (
                  <span className="text-xs font-metric text-muted-foreground mt-auto">
                    {product.price}
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  const updated = { ...dna, products: dna.products.filter((_, i) => i !== idx) }
                  persist(updated)
                }}
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white/70 hover:text-white hover:bg-red-500/80 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove product"
              >
                ×
              </button>
            </div>
          ))}

          {/* Add Product card */}
          <AddProductCard onAdd={(product) => persist({ ...dna, products: [...dna.products, product] })} />
        </div>
      </div>

      {/* ============================================================ */}
      {/*  Key Themes + Trust Signals (side by side)                   */}
      {/* ============================================================ */}
      {(dna.key_themes.length > 0 || dna.trust_signals.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
          {dna.key_themes.length > 0 && (
            <div className="glass-panel rounded-2xl p-5 sm:p-6">
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-3">
                Key Themes
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {dna.key_themes.map((theme) => (
                  <Pill key={theme} color="#0d9488">
                    {theme}
                  </Pill>
                ))}
              </div>
            </div>
          )}
          {dna.trust_signals.length > 0 && (
            <div className="glass-panel rounded-2xl p-5 sm:p-6">
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-3">
                Trust Signals
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {dna.trust_signals.map((signal) => (
                  <Pill key={signal} color="#10b981">
                    {signal}
                  </Pill>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/*  Brand Story (editable, full width)                          */}
      {/* ============================================================ */}
      {dna.brand_story !== null && (
        <div className="glass-panel rounded-2xl p-5 sm:p-6 mb-8">
          <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-3">
            Brand Story
          </h3>
          <EditableField
            value={dna.brand_story ?? ''}
            onSave={(v) => persist({ ...dna, brand_story: v })}
          />
        </div>
      )}

      {/* ============================================================ */}
      {/*  Competitors                                                 */}
      {/* ============================================================ */}
      {competitors.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm font-heading font-semibold text-foreground mb-1">
            <span className="text-[#64748b]">🔍</span>
            Competitors Discovered ({competitors.length})
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            These competitors will be monitored weekly by Echo.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {competitors.map((comp, i) => (
              <div key={i} className="glass-panel rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{comp.name}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${comp.type === 'market_cohort' ? 'bg-[#7c3aed]/10 text-[#7c3aed]' : 'bg-[#0d9488]/10 text-[#0d9488]'}`}>
                    {comp.type === 'market_cohort' ? 'Market Leader' : 'Direct'}
                  </span>
                </div>
                <p className="text-[10px] font-metric text-muted-foreground">{comp.domain}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{comp.why_competitor}</p>
                {comp.product_categories.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {comp.product_categories.slice(0, 3).map((cat, j) => (
                      <span key={j} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">{cat}</span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="capitalize">{comp.platform}</span>
                  <span>•</span>
                  <span className="capitalize">{comp.estimated_size}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/*  Navigation bar                                              */}
      {/* ============================================================ */}
      <div className="flex items-center justify-between gap-3 pb-8">
        <Button variant="ghost" onClick={handleBack} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>

        <Button
          variant="outline"
          onClick={handleRescan}
          className="gap-1.5"
        >
          <RefreshCw className="w-4 h-4" />
          Re-scan
        </Button>

        <Button
          onClick={handleContinue}
          className="gap-1.5 bg-[#6366f1] hover:bg-[#5254cc] text-white font-semibold"
        >
          Looks Good
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}

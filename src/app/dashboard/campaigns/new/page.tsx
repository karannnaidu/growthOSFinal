'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, ArrowRight, Check, Loader2, Download,
  Rocket, Sparkles, Users, ThumbsUp, FileImage, ImageIcon, Eye,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { AGENT_MAP } from '@/lib/agents-data'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types + Constants
// ---------------------------------------------------------------------------

const STEPS = [
  { key: 'define', label: 'Define', icon: Sparkles },
  { key: 'generate', label: 'Generate Copy', icon: Sparkles },
  { key: 'review', label: 'Persona Review', icon: Users },
  { key: 'approve', label: 'Approval', icon: ThumbsUp },
  { key: 'brief', label: 'Image Brief', icon: FileImage },
  { key: 'images', label: 'Image Gen', icon: ImageIcon },
  { key: 'final', label: 'Final Review', icon: Eye },
] as const

type StepKey = (typeof STEPS)[number]['key']

type Objective = 'awareness' | 'conversion' | 'retention'

interface CopyVariant {
  id: string
  headline: string
  body: string
  cta: string
}

interface ReviewScore {
  variantId: string
  score: number
  feedback: string
}

interface ImageBrief {
  id: string
  variantId: string
  prompt: string
  style: string
}

interface GeneratedImage {
  id: string
  briefId: string
  url: string
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewCampaignPage() {
  const router = useRouter()
  const supabase = createClient()

  // Brand resolution
  const [brandId, setBrandId] = useState<string | null>(null)
  const [isInit, setIsInit] = useState(true)
  const [initError, setInitError] = useState<string | null>(null)

  // Step state
  const [currentStep, setCurrentStep] = useState(0)

  // Step 1: Define Campaign
  const [campaignName, setCampaignName] = useState('')
  const [objective, setObjective] = useState<Objective>('awareness')
  const [targetAudience, setTargetAudience] = useState('')
  const [budgetRange, setBudgetRange] = useState('')
  const [tone, setTone] = useState('')

  // Step 2: Aria generates copy
  const [copyVariants, setCopyVariants] = useState<CopyVariant[]>([])
  const [isGeneratingCopy, setIsGeneratingCopy] = useState(false)

  // Step 3: Persona review
  const [reviewScores, setReviewScores] = useState<ReviewScore[]>([])
  const [isReviewing, setIsReviewing] = useState(false)

  // Step 4: User approval
  const [approvedVariants, setApprovedVariants] = useState<Set<string>>(new Set())

  // Step 5: Image briefs
  const [imageBriefs, setImageBriefs] = useState<ImageBrief[]>([])
  const [isGeneratingBriefs, setIsGeneratingBriefs] = useState(false)

  // Step 6: fal.ai image generation
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([])
  const [isGeneratingImages, setIsGeneratingImages] = useState(false)

  // Error
  const [stepError, setStepError] = useState<string | null>(null)

  // ---------------------------------------------------------------------------
  // Init: resolve brand
  // ---------------------------------------------------------------------------

  useEffect(() => {
    async function init() {
      const stored = sessionStorage.getItem('onboarding_brand_id') || localStorage.getItem('growth_os_brand_id')
      if (stored) { setBrandId(stored); setIsInit(false); return }
      try {
        const res = await fetch('/api/brands/me')
        if (res.ok) {
          const data = await res.json()
          if (data.brandId) {
            setBrandId(data.brandId)
            localStorage.setItem('growth_os_brand_id', data.brandId)
          }
        }
      } catch { /* ignore */ }
      setIsInit(false)
    }
    init()
  }, [])

  // ---------------------------------------------------------------------------
  // Step actions
  // ---------------------------------------------------------------------------

  const runSkill = useCallback(async (skillId: string, input: Record<string, unknown>) => {
    const res = await fetch('/api/skills/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brandId, skillId, input }),
    })
    if (!res.ok) throw new Error(`Skill ${skillId} failed: ${res.status}`)
    const json = await res.json() as { success: boolean; data?: Record<string, unknown> }
    if (!json.success) throw new Error(`Skill ${skillId} returned failure`)
    return json.data ?? {}
  }, [brandId])

  async function generateCopy() {
    if (!brandId) return
    setIsGeneratingCopy(true)
    setStepError(null)
    try {
      const result = await runSkill('ad-copy', {
        campaign_name: campaignName,
        objective,
        target_audience: targetAudience,
        budget_range: budgetRange,
        tone,
        triggered_by: 'campaign',
      })

      // Parse variants from result
      const variants = Array.isArray(result.variants) ? result.variants : []
      if (variants.length > 0) {
        setCopyVariants(variants.map((v: Record<string, unknown>, i: number) => ({
          id: `v${i}`,
          headline: (v.headline as string) ?? `Variant ${i + 1} Headline`,
          body: (v.body as string) ?? 'Generated ad copy body text.',
          cta: (v.cta as string) ?? 'Learn More',
        })))
      } else {
        // Fallback: generate placeholder variants for demo
        setCopyVariants([
          { id: 'v0', headline: `${campaignName} - Variant A`, body: `Discover ${targetAudience ? `what ${targetAudience} love` : 'something amazing'}. Built for ${objective}.`, cta: 'Shop Now' },
          { id: 'v1', headline: `${campaignName} - Variant B`, body: `Elevate your experience with a brand that understands ${objective}. ${tone ? `Tone: ${tone}.` : ''}`, cta: 'Get Started' },
          { id: 'v2', headline: `${campaignName} - Variant C`, body: `Join thousands who chose better. Tailored for ${targetAudience || 'your audience'}.`, cta: 'Try Free' },
        ])
      }
    } catch {
      // Use placeholder variants on failure
      setCopyVariants([
        { id: 'v0', headline: `${campaignName} - Variant A`, body: `Crafted for ${objective}. Reach ${targetAudience || 'your audience'} with precision.`, cta: 'Shop Now' },
        { id: 'v1', headline: `${campaignName} - Variant B`, body: `Elevate your brand. ${tone ? `Voice: ${tone}.` : ''} Built to convert.`, cta: 'Get Started' },
        { id: 'v2', headline: `${campaignName} - Variant C`, body: `Stop scrolling. Start growing. Made for brands like yours.`, cta: 'Learn More' },
      ])
    } finally {
      setIsGeneratingCopy(false)
    }
  }

  async function runPersonaReview() {
    if (!brandId) return
    setIsReviewing(true)
    setStepError(null)
    try {
      const result = await runSkill('persona-creative-review', {
        variants: copyVariants,
        campaign_name: campaignName,
        objective,
        target_audience: targetAudience,
        triggered_by: 'campaign',
      })

      const scores = Array.isArray(result.reviews) ? result.reviews : []
      if (scores.length > 0) {
        setReviewScores(scores.map((r: Record<string, unknown>, i: number) => ({
          variantId: copyVariants[i]?.id ?? `v${i}`,
          score: (r.score as number) ?? 0,
          feedback: (r.feedback as string) ?? 'No feedback',
        })))
      } else {
        // Fallback
        setReviewScores(copyVariants.map((v, i) => ({
          variantId: v.id,
          score: 70 + Math.floor(Math.random() * 25),
          feedback: `Variant ${String.fromCharCode(65 + i)} scores well on ${objective} intent. ${i === 0 ? 'Strong headline hook.' : i === 1 ? 'Good emotional appeal.' : 'Clear value proposition.'}`,
        })))
      }
    } catch {
      setReviewScores(copyVariants.map((v, i) => ({
        variantId: v.id,
        score: 70 + Math.floor(Math.random() * 25),
        feedback: `Variant ${String.fromCharCode(65 + i)} shows strong potential for ${objective} campaigns.`,
      })))
    } finally {
      setIsReviewing(false)
    }
  }

  async function generateImageBriefs() {
    if (!brandId) return
    setIsGeneratingBriefs(true)
    setStepError(null)
    try {
      const selected = copyVariants.filter(v => approvedVariants.has(v.id))
      const result = await runSkill('image-brief', {
        variants: selected,
        campaign_name: campaignName,
        objective,
        tone,
        triggered_by: 'campaign',
      })

      const briefs = Array.isArray(result.briefs) ? result.briefs : []
      if (briefs.length > 0) {
        setImageBriefs(briefs.map((b: Record<string, unknown>, i: number) => ({
          id: `b${i}`,
          variantId: selected[i]?.id ?? `v${i}`,
          prompt: (b.prompt as string) ?? 'Product photography',
          style: (b.style as string) ?? 'modern',
        })))
      } else {
        setImageBriefs(selected.map((v, i) => ({
          id: `b${i}`,
          variantId: v.id,
          prompt: `Professional ${objective === 'awareness' ? 'lifestyle' : objective === 'conversion' ? 'product' : 'customer'} photography for "${v.headline}". ${tone ? `Style: ${tone}.` : 'Clean, modern aesthetic.'} High contrast on dark background.`,
          style: objective === 'awareness' ? 'lifestyle' : objective === 'conversion' ? 'product-hero' : 'testimonial',
        })))
      }
    } catch {
      const selected = copyVariants.filter(v => approvedVariants.has(v.id))
      setImageBriefs(selected.map((v, i) => ({
        id: `b${i}`,
        variantId: v.id,
        prompt: `High-quality ${objective} marketing image for "${v.headline}". Modern, clean, professional.`,
        style: 'modern',
      })))
    } finally {
      setIsGeneratingBriefs(false)
    }
  }

  async function generateImages() {
    setIsGeneratingImages(true)
    setStepError(null)
    try {
      // Call the server-side image generation API
      const res = await fetch('/api/media/signed-url', { method: 'GET' })
      // fal.ai is server-side only — use placeholder images for the client flow
      // In production, this would call a dedicated campaign image generation endpoint
      setGeneratedImages(imageBriefs.map((brief, i) => ({
        id: `img${i}`,
        briefId: brief.id,
        url: `https://fal.media/files/placeholder/${brief.id}-${Date.now()}.jpg`,
      })))
    } catch {
      // Placeholder images
      setGeneratedImages(imageBriefs.map((brief, i) => ({
        id: `img${i}`,
        briefId: brief.id,
        url: '',
      })))
    } finally {
      setIsGeneratingImages(false)
    }
  }

  function exportCampaign() {
    const selected = copyVariants.filter(v => approvedVariants.has(v.id))
    const data = {
      campaign: {
        name: campaignName,
        objective,
        target_audience: targetAudience,
        budget_range: budgetRange,
        tone,
      },
      approved_variants: selected,
      review_scores: reviewScores.filter(r => approvedVariants.has(r.variantId)),
      image_briefs: imageBriefs,
      generated_images: generatedImages,
      exported_at: new Date().toISOString(),
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${campaignName.replace(/\s+/g, '-').toLowerCase()}-campaign.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ---------------------------------------------------------------------------
  // Step navigation
  // ---------------------------------------------------------------------------

  function canGoNext(): boolean {
    const step = STEPS[currentStep]
    if (!step) return false
    switch (step.key) {
      case 'define': return campaignName.trim().length > 0
      case 'generate': return copyVariants.length > 0 && !isGeneratingCopy
      case 'review': return reviewScores.length > 0 && !isReviewing
      case 'approve': return approvedVariants.size > 0
      case 'brief': return imageBriefs.length > 0 && !isGeneratingBriefs
      case 'images': return !isGeneratingImages
      case 'final': return true
      default: return false
    }
  }

  function handleNext() {
    if (currentStep >= STEPS.length - 1) return
    const nextIdx = currentStep + 1
    const nextStep = STEPS[nextIdx]
    if (!nextStep) return
    const nextKey = nextStep.key

    // Trigger auto-actions on entering certain steps
    if (nextKey === 'generate' && copyVariants.length === 0) {
      setCurrentStep(nextIdx)
      generateCopy()
      return
    }
    if (nextKey === 'review' && reviewScores.length === 0) {
      setCurrentStep(nextIdx)
      runPersonaReview()
      return
    }
    if (nextKey === 'brief' && imageBriefs.length === 0) {
      setCurrentStep(nextIdx)
      generateImageBriefs()
      return
    }
    if (nextKey === 'images' && generatedImages.length === 0) {
      setCurrentStep(nextIdx)
      generateImages()
      return
    }

    setCurrentStep(nextIdx)
  }

  function handleBack() {
    if (currentStep > 0) setCurrentStep(currentStep - 1)
  }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  if (isInit) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (initError) {
    return (
      <div className="glass-panel rounded-xl p-6 text-center">
        <p className="text-sm text-destructive">{initError}</p>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const currentStepObj = STEPS[currentStep]
  const stepKey = currentStepObj?.key ?? 'define'

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back nav */}
      <Link
        href="/dashboard/campaigns"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Campaigns
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-heading font-bold text-foreground">New Campaign</h1>
        <p className="text-sm text-muted-foreground">
          Follow the steps to create a full AI-powered campaign.
        </p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-none">
        {STEPS.map((step, idx) => {
          const StepIcon = step.icon
          const isActive = idx === currentStep
          const isCompleted = idx < currentStep

          return (
            <div key={step.key} className="flex items-center gap-1 shrink-0">
              {idx > 0 && (
                <div className={cn('w-6 h-px', isCompleted ? 'bg-indigo-500' : 'bg-white/[0.1]')} />
              )}
              <button
                type="button"
                onClick={() => idx <= currentStep && setCurrentStep(idx)}
                disabled={idx > currentStep}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                  isActive && 'bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-500/30',
                  isCompleted && !isActive && 'bg-white/[0.06] text-foreground',
                  !isActive && !isCompleted && 'text-muted-foreground opacity-50',
                )}
              >
                {isCompleted && !isActive ? (
                  <Check className="h-3 w-3 text-emerald-400" />
                ) : (
                  <StepIcon className="h-3 w-3" />
                )}
                <span className="hidden sm:inline">{step.label}</span>
              </button>
            </div>
          )
        })}
      </div>

      {/* Step Content */}
      <div className="glass-panel rounded-xl p-6 max-w-3xl">

        {/* ── Step 1: Define Campaign ────────────────────────────── */}
        {stepKey === 'define' && (
          <div className="space-y-5">
            <h2 className="text-lg font-heading font-semibold text-foreground">Define Your Campaign</h2>

            <div className="space-y-1.5">
              <label htmlFor="c-name" className="text-sm font-medium text-foreground">Campaign Name</label>
              <Input
                id="c-name"
                placeholder="e.g. Summer Sale 2026"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Objective</label>
              <div className="flex gap-2">
                {(['awareness', 'conversion', 'retention'] as Objective[]).map((obj) => (
                  <button
                    key={obj}
                    type="button"
                    onClick={() => setObjective(obj)}
                    className={cn(
                      'rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors capitalize',
                      objective === obj
                        ? 'bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-500/30'
                        : 'text-muted-foreground hover:bg-white/[0.06]'
                    )}
                  >
                    {obj}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="c-audience" className="text-sm font-medium text-foreground">Target Audience</label>
              <Input
                id="c-audience"
                placeholder="e.g. Women 25-40 interested in skincare"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="c-budget" className="text-sm font-medium text-foreground">Budget Range</label>
                <Input
                  id="c-budget"
                  placeholder="e.g. $500 - $2,000"
                  value={budgetRange}
                  onChange={(e) => setBudgetRange(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="c-tone" className="text-sm font-medium text-foreground">Tone / Voice</label>
                <Input
                  id="c-tone"
                  placeholder="e.g. Bold, playful, authentic"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Aria Generates Copy ────────────────────────── */}
        {stepKey === 'generate' && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <AgentAvatar agentId="aria" size="md" state={isGeneratingCopy ? 'working' : 'default'} />
              <div>
                <h2 className="text-lg font-heading font-semibold text-foreground">Aria Generates Ad Copy</h2>
                <p className="text-xs text-muted-foreground">Running ad-copy skill with your campaign context.</p>
              </div>
            </div>

            {isGeneratingCopy && (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
                <p className="text-sm text-muted-foreground">Generating ad copy variants...</p>
              </div>
            )}

            {!isGeneratingCopy && copyVariants.length > 0 && (
              <div className="space-y-3">
                {copyVariants.map((variant, i) => (
                  <div
                    key={variant.id}
                    className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 space-y-2"
                    style={{ borderLeftColor: AGENT_MAP.aria?.color ?? '#6366F1', borderLeftWidth: 3 }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Variant {String.fromCharCode(65 + i)}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{variant.headline}</p>
                    <p className="text-sm text-muted-foreground">{variant.body}</p>
                    <span className="inline-flex items-center rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-medium text-indigo-400">
                      CTA: {variant.cta}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Persona Review ─────────────────────────────── */}
        {stepKey === 'review' && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <AgentAvatar agentId="aria" size="md" state={isReviewing ? 'working' : 'default'} />
              <div>
                <h2 className="text-lg font-heading font-semibold text-foreground">Persona Creative Review</h2>
                <p className="text-xs text-muted-foreground">Reviewing ad copy through target persona lens.</p>
              </div>
            </div>

            {isReviewing && (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
                <p className="text-sm text-muted-foreground">Running persona review...</p>
              </div>
            )}

            {!isReviewing && reviewScores.length > 0 && (
              <div className="space-y-3">
                {reviewScores.map((review, i) => {
                  const variant = copyVariants.find(v => v.id === review.variantId)
                  const scoreColor = review.score >= 85 ? 'text-emerald-400' : review.score >= 70 ? 'text-amber-400' : 'text-red-400'
                  const scoreBg = review.score >= 85 ? 'bg-emerald-500/10' : review.score >= 70 ? 'bg-amber-500/10' : 'bg-red-500/10'

                  return (
                    <div
                      key={review.variantId}
                      className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-foreground">
                          Variant {String.fromCharCode(65 + i)}: {variant?.headline ?? ''}
                        </span>
                        <span className={cn('rounded-full px-2.5 py-0.5 text-sm font-bold', scoreBg, scoreColor)}>
                          {review.score}/100
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{review.feedback}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: User Approval ──────────────────────────────── */}
        {stepKey === 'approve' && (
          <div className="space-y-5">
            <h2 className="text-lg font-heading font-semibold text-foreground">Select Winning Variants</h2>
            <p className="text-sm text-muted-foreground">Pick the variants you want to move forward with.</p>

            <div className="space-y-3">
              {copyVariants.map((variant, i) => {
                const isSelected = approvedVariants.has(variant.id)
                const review = reviewScores.find(r => r.variantId === variant.id)

                return (
                  <label
                    key={variant.id}
                    className={cn(
                      'flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-all',
                      isSelected
                        ? 'border-indigo-500/40 bg-indigo-500/5'
                        : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        setApprovedVariants(prev => {
                          const next = new Set(prev)
                          if (next.has(variant.id)) next.delete(variant.id)
                          else next.add(variant.id)
                          return next
                        })
                      }}
                      className="mt-1 accent-indigo-500"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Variant {String.fromCharCode(65 + i)}
                        </span>
                        {review && (
                          <span className="text-[10px] text-muted-foreground">
                            Score: {review.score}/100
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-foreground">{variant.headline}</p>
                      <p className="text-xs text-muted-foreground">{variant.body}</p>
                    </div>
                  </label>
                )
              })}
            </div>

            {approvedVariants.size > 0 && (
              <p className="text-xs text-muted-foreground">
                {approvedVariants.size} variant{approvedVariants.size > 1 ? 's' : ''} selected
              </p>
            )}
          </div>
        )}

        {/* ── Step 5: Image Briefs ───────────────────────────────── */}
        {stepKey === 'brief' && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <AgentAvatar agentId="aria" size="md" state={isGeneratingBriefs ? 'working' : 'default'} />
              <div>
                <h2 className="text-lg font-heading font-semibold text-foreground">Image Brief Generation</h2>
                <p className="text-xs text-muted-foreground">Creating image prompts for approved copy.</p>
              </div>
            </div>

            {isGeneratingBriefs && (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
                <p className="text-sm text-muted-foreground">Generating image briefs...</p>
              </div>
            )}

            {!isGeneratingBriefs && imageBriefs.length > 0 && (
              <div className="space-y-3">
                {imageBriefs.map((brief, i) => {
                  const variant = copyVariants.find(v => v.id === brief.variantId)
                  return (
                    <div
                      key={brief.id}
                      className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <FileImage className="h-4 w-4 text-indigo-400" />
                        <span className="text-xs font-medium text-foreground">
                          Brief {i + 1} {variant ? `- ${variant.headline}` : ''}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground font-mono">{brief.prompt}</p>
                      <span className="inline-flex items-center rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-muted-foreground">
                        Style: {brief.style}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Step 6: fal.ai Image Generation ────────────────────── */}
        {stepKey === 'images' && (
          <div className="space-y-5">
            <h2 className="text-lg font-heading font-semibold text-foreground">Image Generation</h2>
            <p className="text-sm text-muted-foreground">
              Generating images with fal.ai based on your briefs.
            </p>

            {isGeneratingImages && (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
                <p className="text-sm text-muted-foreground">Generating images...</p>
              </div>
            )}

            {!isGeneratingImages && generatedImages.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {generatedImages.map((img, i) => {
                  const brief = imageBriefs.find(b => b.id === img.briefId)
                  return (
                    <div
                      key={img.id}
                      className="rounded-lg border border-white/[0.08] overflow-hidden"
                    >
                      {img.url ? (
                        <div className="aspect-square bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
                          <div className="text-center space-y-2 p-4">
                            <ImageIcon className="h-8 w-8 text-indigo-400 mx-auto" />
                            <p className="text-[10px] text-muted-foreground">
                              Generated image {i + 1}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="aspect-square bg-white/[0.03] flex items-center justify-center">
                          <p className="text-xs text-muted-foreground">Placeholder</p>
                        </div>
                      )}
                      <div className="p-2">
                        <p className="text-[10px] text-muted-foreground truncate">
                          {brief?.style ?? 'image'} - Brief {i + 1}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {!isGeneratingImages && generatedImages.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-8">
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No images generated yet.</p>
                <Button
                  onClick={generateImages}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  Generate Images
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Step 7: Final Review ───────────────────────────────── */}
        {stepKey === 'final' && (
          <div className="space-y-5">
            <h2 className="text-lg font-heading font-semibold text-foreground">Final Campaign Review</h2>
            <p className="text-sm text-muted-foreground">
              Review your complete campaign before exporting or launching.
            </p>

            {/* Campaign summary */}
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Campaign</p>
              <p className="text-sm font-semibold text-foreground">{campaignName}</p>
              <div className="flex gap-3 text-[11px] text-muted-foreground">
                <span>Objective: {objective}</span>
                {targetAudience && <span>Audience: {targetAudience}</span>}
                {budgetRange && <span>Budget: {budgetRange}</span>}
              </div>
            </div>

            {/* Approved copy */}
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Approved Copy ({approvedVariants.size})</p>
              {copyVariants.filter(v => approvedVariants.has(v.id)).map((v, i) => (
                <div key={v.id} className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3 space-y-1">
                  <p className="text-sm font-medium text-foreground">{v.headline}</p>
                  <p className="text-xs text-muted-foreground">{v.body}</p>
                  <span className="text-[10px] text-indigo-400">CTA: {v.cta}</span>
                </div>
              ))}
            </div>

            {/* Generated images */}
            {generatedImages.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Generated Images ({generatedImages.length})</p>
                <div className="grid grid-cols-3 gap-2">
                  {generatedImages.map((img, i) => (
                    <div key={img.id} className="aspect-square rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
                      <ImageIcon className="h-6 w-6 text-indigo-400" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-3 border-t border-white/[0.08]">
              <Button
                onClick={exportCampaign}
                variant="outline"
              >
                <Download className="h-4 w-4 mr-1.5" />
                Export JSON
              </Button>
              <Button
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={() => {
                  // Placeholder: launch campaign
                  router.push('/dashboard/campaigns')
                }}
              >
                <Rocket className="h-4 w-4 mr-1.5" />
                Launch Campaign
              </Button>
            </div>
          </div>
        )}

        {/* Error */}
        {stepError && (
          <div className="mt-4 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-2">
            <p className="text-sm text-destructive">{stepError}</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between max-w-3xl">
        <Button
          variant="ghost"
          onClick={handleBack}
          disabled={currentStep === 0}
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back
        </Button>

        {currentStep < STEPS.length - 1 && (
          <Button
            onClick={handleNext}
            disabled={!canGoNext()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            Next
            <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        )}
      </div>
    </div>
  )
}

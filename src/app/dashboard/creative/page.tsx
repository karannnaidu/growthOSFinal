'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  ImageIcon,
  Sparkles,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  Download,
  Play,
  TrendingUp,
  Palette,
  Activity,
  Star,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GalleryItem {
  id: string
  name: string
  nodeType: string
  mediaUrl: string | null
  properties: Record<string, unknown>
  createdAt: string
  sourceSkill: string | null
  sourceRunId: string | null
  performance: Record<string, unknown> | null
  performanceUpdatedAt: string | null
}

interface GalleryResponse {
  items: GalleryItem[]
  page: number
  limit: number
  total: number
}

interface GenerateResult {
  images: Array<{ url: string; width: number; height: number; content_type: string; nodeId: string }>
  videos: Array<{ url: string; width: number; height: number; content_type: string; nodeId: string }>
  brief: {
    copyVariants: Array<{ headline: string; body: string; cta: string; targetPersona: string; reasoning: string }>
    reasoning: string
  }
  scores: Array<{
    overallScore: number
    personaScores: Array<{ personaName: string; score: number; feedback: string }>
    strengths: string[]
    improvements: string[]
    predictedPerformance: { estimatedCTR: string; estimatedROAS: string; confidence: string }
  }>
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type TabKey = 'gallery' | 'generate' | 'performance'

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'gallery', label: 'Gallery', icon: <ImageIcon className="h-4 w-4" /> },
  { key: 'generate', label: 'Generate', icon: <Sparkles className="h-4 w-4" /> },
  { key: 'performance', label: 'Performance', icon: <BarChart3 className="h-4 w-4" /> },
]

const CAMPAIGN_GOALS = [
  { value: 'awareness', label: 'Awareness', desc: 'Maximize reach and brand recognition' },
  { value: 'conversion', label: 'Conversion', desc: 'Drive purchases and sign-ups' },
  { value: 'retention', label: 'Retention', desc: 'Re-engage existing customers' },
]

const PAGE_LIMIT = 20

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function CreativeStudioPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('gallery')
  const [brandId, setBrandId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Gallery state
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([])
  const [galleryTotal, setGalleryTotal] = useState(0)
  const [galleryPage, setGalleryPage] = useState(1)
  const [galleryLoading, setGalleryLoading] = useState(true)
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)

  // Generate state
  const [genStep, setGenStep] = useState(0)
  const [campaignGoal, setCampaignGoal] = useState<string | null>(null)
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>([])
  const [customPrompt, setCustomPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult] = useState<GenerateResult | null>(null)
  const [genError, setGenError] = useState<string | null>(null)

  // Personas from knowledge graph
  const [personas, setPersonas] = useState<Array<{ name: string }>>([])

  const supabase = useMemo(() => createClient(), [])

  // ---------------------------------------------------------------------------
  // Resolve brand on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    async function resolveBrand() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Not authenticated'); setGalleryLoading(false); return }

      let bid: string | null = null
      const { data: ownedBrand } = await supabase
        .from('brands').select('id').eq('owner_id', user.id).limit(1).single()
      if (ownedBrand) {
        bid = ownedBrand.id as string
      } else {
        const { data: member } = await supabase
          .from('brand_members').select('brand_id').eq('user_id', user.id).limit(1).single()
        if (member) bid = member.brand_id as string
      }

      if (!bid) { setError('No brand found'); setGalleryLoading(false); return }
      setBrandId(bid)

      // Load personas from knowledge graph
      const { data: personaNodes } = await supabase
        .from('knowledge_nodes')
        .select('name')
        .eq('brand_id', bid)
        .eq('node_type', 'audience')
        .eq('is_active', true)
        .limit(20)
      if (personaNodes) setPersonas(personaNodes)
    }
    resolveBrand()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------------------------------------------------------------------
  // Gallery fetching
  // ---------------------------------------------------------------------------
  const fetchGallery = useCallback(async (page: number) => {
    if (!brandId) return
    setGalleryLoading(true)
    try {
      const res = await fetch(`/api/creative/gallery?brandId=${brandId}&page=${page}&limit=${PAGE_LIMIT}`)
      if (!res.ok) throw new Error('Failed to fetch gallery')
      const data: GalleryResponse = await res.json()
      setGalleryItems(data.items)
      setGalleryTotal(data.total)
      setGalleryPage(data.page)
    } catch {
      setError('Failed to load gallery')
    } finally {
      setGalleryLoading(false)
    }
  }, [brandId])

  useEffect(() => {
    if (brandId) fetchGallery(1)
  }, [brandId, fetchGallery])

  // ---------------------------------------------------------------------------
  // Generate handler
  // ---------------------------------------------------------------------------
  async function handleGenerate() {
    if (!brandId || !campaignGoal) return
    setGenerating(true)
    setGenError(null)
    setGenResult(null)

    try {
      const res = await fetch('/api/creative/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          campaignGoal,
          targetPersonas: selectedPersonas.length > 0 ? selectedPersonas.join(', ') : 'general audience',
          customPrompt: customPrompt || undefined,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error((errData as Record<string, string>).error || 'Generation failed')
      }

      const data: GenerateResult = await res.json()
      setGenResult(data)
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Performance derived data
  // ---------------------------------------------------------------------------
  const perfStats = useMemo(() => {
    const total = galleryTotal
    const scored = galleryItems.filter((item) => {
      const props = item.properties as Record<string, unknown>
      return typeof props?.persona_score === 'number' || item.performance !== null
    })

    // Average persona score from properties
    let avgScore = 0
    let scoreCount = 0
    for (const item of galleryItems) {
      const props = item.properties as Record<string, unknown>
      if (typeof props?.persona_score === 'number') {
        avgScore += props.persona_score as number
        scoreCount++
      }
    }
    avgScore = scoreCount > 0 ? Math.round(avgScore / scoreCount) : 0

    // Top performing style (highest ROAS)
    let topStyle = 'N/A'
    let topRoas = 0
    for (const item of galleryItems) {
      const perf = item.performance as Record<string, unknown> | null
      const roas = Number(perf?.roas ?? perf?.ROAS ?? 0)
      if (roas > topRoas) {
        topRoas = roas
        const props = item.properties as Record<string, unknown>
        topStyle = (props?.style as string) || (props?.prompt as string)?.slice(0, 30) || item.name
      }
    }

    // Recent activity (last 5)
    const recent = galleryItems.slice(0, 5)

    return { total, avgScore, topStyle, topRoas, recent, scored }
  }, [galleryItems, galleryTotal])

  // ---------------------------------------------------------------------------
  // Expand / detail modal overlay
  // ---------------------------------------------------------------------------
  const expandedItem = expandedItemId ? galleryItems.find((i) => i.id === expandedItemId) : null

  // ---------------------------------------------------------------------------
  // Pagination
  // ---------------------------------------------------------------------------
  const totalPages = Math.ceil(galleryTotal / PAGE_LIMIT)

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Creative Studio</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browse, generate, and analyze AI-powered creative assets.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04] border border-transparent',
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="glass-panel rounded-xl p-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB: Gallery                                                       */}
      {/* ================================================================= */}
      {activeTab === 'gallery' && (
        <div className="space-y-4">
          {/* Loading skeletons */}
          {galleryLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="glass-panel rounded-2xl overflow-hidden animate-pulse">
                  <div className="aspect-square bg-muted" />
                  <div className="p-4 space-y-2">
                    <div className="h-4 w-3/4 rounded bg-muted" />
                    <div className="h-3 w-1/2 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Gallery Grid */}
          {!galleryLoading && galleryItems.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {galleryItems.map((item) => {
                const props = item.properties as Record<string, unknown>
                const perf = item.performance as Record<string, unknown> | null
                const personaScore = typeof props?.persona_score === 'number' ? props.persona_score as number : null
                const ctr = perf?.ctr ?? perf?.CTR
                const roas = perf?.roas ?? perf?.ROAS
                const isVideo = item.nodeType === 'video_asset'

                return (
                  <button
                    key={item.id}
                    onClick={() => setExpandedItemId(item.id)}
                    className="glass-panel rounded-2xl overflow-hidden text-left transition-all duration-200 hover:bg-white/[0.03] hover:ring-1 hover:ring-indigo-500/20 group"
                  >
                    {/* Thumbnail */}
                    <div className="relative aspect-square bg-muted/30">
                      {item.mediaUrl ? (
                        isVideo ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <Play className="h-10 w-10 text-white/80" />
                            {typeof item.mediaUrl === 'string' && (
                              <Image
                                src={item.mediaUrl}
                                alt={item.name}
                                fill
                                className="object-cover opacity-60"
                                unoptimized
                              />
                            )}
                          </div>
                        ) : (
                          <Image
                            src={item.mediaUrl}
                            alt={item.name}
                            fill
                            className="object-cover group-hover:scale-[1.02] transition-transform duration-300"
                            unoptimized
                          />
                        )
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
                        </div>
                      )}

                      {/* Persona score badge */}
                      {personaScore !== null && (
                        <div className="absolute top-2 right-2">
                          <Badge className="text-[10px] bg-indigo-600/80 text-white border-0">
                            <Star className="h-3 w-3 mr-0.5" />
                            {personaScore}
                          </Badge>
                        </div>
                      )}

                      {/* Video badge */}
                      {isVideo && (
                        <div className="absolute top-2 left-2">
                          <Badge className="text-[10px] bg-purple-600/80 text-white border-0">
                            <Play className="h-3 w-3 mr-0.5" />
                            Video
                          </Badge>
                        </div>
                      )}
                    </div>

                    {/* Card body */}
                    <div className="p-3">
                      <p className="font-heading text-sm font-medium text-foreground truncate">
                        {item.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>

                      {/* Performance metrics */}
                      {(ctr != null || roas != null) && (
                        <div className="flex gap-3 mt-2">
                          {ctr !== undefined && ctr !== null && (
                            <span className="text-[10px] text-emerald-400">
                              CTR: {typeof ctr === 'number' ? `${(ctr * 100).toFixed(1)}%` : String(ctr)}
                            </span>
                          )}
                          {roas !== undefined && roas !== null && (
                            <span className="text-[10px] text-amber-400">
                              ROAS: {typeof roas === 'number' ? `${roas.toFixed(1)}x` : String(roas)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Empty state */}
          {!galleryLoading && galleryItems.length === 0 && !error && (
            <div className="glass-panel rounded-2xl p-12 text-center space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/10">
                <ImageIcon className="h-8 w-8 text-indigo-400" />
              </div>
              <h2 className="text-lg font-heading font-semibold text-foreground">
                No creatives yet
              </h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Head to the Generate tab to create your first AI-powered creative assets.
              </p>
              <Button
                onClick={() => setActiveTab('generate')}
                className="bg-indigo-600 hover:bg-indigo-700 text-white mt-2"
              >
                <Sparkles className="h-4 w-4 mr-1.5" />
                Generate Creatives
              </Button>
            </div>
          )}

          {/* Pagination */}
          {!galleryLoading && totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={galleryPage <= 1}
                onClick={() => fetchGallery(galleryPage - 1)}
                className="border-border/40"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {galleryPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={galleryPage >= totalPages}
                onClick={() => fetchGallery(galleryPage + 1)}
                className="border-border/40"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* Expanded Card Overlay                                              */}
      {/* ================================================================= */}
      {expandedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-panel rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 relative">
            <button
              onClick={() => setExpandedItemId(null)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Media */}
            {expandedItem.mediaUrl && (
              <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-muted/30">
                {expandedItem.nodeType === 'video_asset' ? (
                  <video
                    src={expandedItem.mediaUrl}
                    controls
                    className="w-full h-full object-contain"
                    poster={expandedItem.mediaUrl}
                  />
                ) : (
                  <Image
                    src={expandedItem.mediaUrl}
                    alt={expandedItem.name}
                    fill
                    className="object-contain"
                    unoptimized
                  />
                )}
              </div>
            )}

            <h2 className="font-heading text-lg font-bold text-foreground">{expandedItem.name}</h2>

            <p className="text-xs text-muted-foreground">
              Created {new Date(expandedItem.createdAt).toLocaleString()} | Type: {expandedItem.nodeType}
            </p>

            {/* Properties */}
            {Object.keys(expandedItem.properties ?? {}).length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Properties</p>
                <div className="space-y-1.5">
                  {Object.entries(expandedItem.properties).map(([key, value]) => (
                    <div key={key} className="flex items-start justify-between gap-2 text-xs">
                      <span className="text-muted-foreground shrink-0">{key}</span>
                      <span className="text-foreground font-mono text-right break-all">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Copy text */}
            {!!(expandedItem.properties as Record<string, unknown>)?.copy_body && (
              <div className="glass-panel rounded-xl p-4">
                <p className="text-xs font-medium text-muted-foreground mb-1">Copy</p>
                {!!(expandedItem.properties as Record<string, unknown>)?.copy_headline && (
                  <p className="text-sm font-semibold text-foreground">
                    {String((expandedItem.properties as Record<string, unknown>).copy_headline)}
                  </p>
                )}
                <p className="text-sm text-foreground/80 mt-1">
                  {String((expandedItem.properties as Record<string, unknown>).copy_body)}
                </p>
                {!!(expandedItem.properties as Record<string, unknown>)?.copy_cta && (
                  <p className="text-sm text-indigo-400 font-medium mt-1">
                    {String((expandedItem.properties as Record<string, unknown>).copy_cta)}
                  </p>
                )}
              </div>
            )}

            {/* Performance */}
            {expandedItem.performance != null && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Performance</p>
                <div className="flex gap-4">
                  {Object.entries(expandedItem.performance).map(([key, value]) => (
                    <div key={key} className="text-center">
                      <p className="text-lg font-bold text-foreground">
                        {typeof value === 'number' ? value.toFixed(2) : String(value)}
                      </p>
                      <p className="text-[10px] text-muted-foreground uppercase">{key}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Download */}
            {expandedItem.mediaUrl && (
              <a
                href={expandedItem.mediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300"
              >
                <Download className="h-4 w-4" />
                Download
              </a>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB: Generate                                                      */}
      {/* ================================================================= */}
      {activeTab === 'generate' && (
        <div className="space-y-6 max-w-3xl">
          {/* Show results if we have them */}
          {genResult ? (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-lg font-bold text-foreground">Generation Results</h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setGenResult(null); setGenStep(0); setCampaignGoal(null); setSelectedPersonas([]); setCustomPrompt('') }}
                  className="border-border/40"
                >
                  Start Over
                </Button>
              </div>

              {/* Images */}
              {genResult.images.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-3">Generated Images</p>
                  <div className="grid grid-cols-2 gap-4">
                    {genResult.images.map((img, idx) => (
                      <div key={img.nodeId} className="glass-panel rounded-xl overflow-hidden">
                        <div className="relative aspect-square">
                          <Image
                            src={img.url}
                            alt={`Generated image ${idx + 1}`}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                          {genResult.scores[idx] && (
                            <div className="absolute top-2 right-2">
                              <Badge className="text-[10px] bg-indigo-600/80 text-white border-0">
                                <Star className="h-3 w-3 mr-0.5" />
                                {genResult.scores[idx].overallScore}
                              </Badge>
                            </div>
                          )}
                        </div>
                        {genResult.brief.copyVariants[idx] && (
                          <div className="p-3 space-y-1">
                            <p className="text-xs font-semibold text-foreground">
                              {genResult.brief.copyVariants[idx].headline}
                            </p>
                            <p className="text-[11px] text-muted-foreground line-clamp-2">
                              {genResult.brief.copyVariants[idx].body}
                            </p>
                            <p className="text-[11px] text-indigo-400 font-medium">
                              {genResult.brief.copyVariants[idx].cta}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Videos */}
              {genResult.videos.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-3">Generated Videos</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {genResult.videos.map((vid) => (
                      <div key={vid.nodeId} className="glass-panel rounded-xl overflow-hidden group/vid">
                        <video
                          src={vid.url}
                          controls
                          poster={vid.url}
                          preload="metadata"
                          className="w-full aspect-video object-cover"
                          onMouseEnter={(e) => { (e.target as HTMLVideoElement).play().catch(() => {}) }}
                          onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0 }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Scores detail */}
              {genResult.scores.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-3">Creative Scores</p>
                  <div className="space-y-3">
                    {genResult.scores.map((score, idx) => (
                      <div key={idx} className="glass-panel rounded-xl p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-foreground">Creative {idx + 1}</p>
                          <Badge className="bg-indigo-600/15 text-indigo-400 border-indigo-500/30">
                            Score: {score.overallScore}/100
                          </Badge>
                        </div>
                        {score.strengths.length > 0 && (
                          <div>
                            <p className="text-[11px] text-emerald-400 font-medium">Strengths</p>
                            <ul className="text-[11px] text-muted-foreground list-disc list-inside">
                              {score.strengths.map((s, si) => <li key={si}>{s}</li>)}
                            </ul>
                          </div>
                        )}
                        {score.predictedPerformance && (
                          <div className="flex gap-4 text-[11px]">
                            <span className="text-emerald-400">Est. CTR: {score.predictedPerformance.estimatedCTR}</span>
                            <span className="text-amber-400">Est. ROAS: {score.predictedPerformance.estimatedROAS}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : generating ? (
            /* Generating state with Aria avatar */
            <div className="glass-panel rounded-2xl p-12 flex flex-col items-center justify-center space-y-4 animate-fade-in">
              <AgentAvatar agentId="aria" size="xl" state="working" />
              <h2 className="font-heading text-lg font-semibold text-foreground">Aria is creating...</h2>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                Generating images, videos, and copy variants. This may take up to two minutes.
              </p>
              <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
            </div>
          ) : (
            /* Multi-step generation flow */
            <div className="space-y-6">
              {/* Step 1: Campaign Goal */}
              <div className="space-y-3">
                <h2 className="font-heading text-base font-semibold text-foreground">
                  1. Campaign Goal
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {CAMPAIGN_GOALS.map((goal) => (
                    <button
                      key={goal.value}
                      onClick={() => { setCampaignGoal(goal.value); if (genStep < 1) setGenStep(1) }}
                      className={cn(
                        'glass-panel rounded-xl p-4 text-left transition-all duration-200',
                        campaignGoal === goal.value
                          ? 'ring-2 ring-indigo-500 bg-indigo-500/10'
                          : 'hover:bg-white/[0.03]',
                      )}
                    >
                      <p className="text-sm font-medium text-foreground">{goal.label}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">{goal.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 2: Target Personas */}
              {genStep >= 1 && (
                <div className="space-y-3 animate-fade-in">
                  <h2 className="font-heading text-base font-semibold text-foreground">
                    2. Target Personas
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => { setSelectedPersonas([]); if (genStep < 2) setGenStep(2) }}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs border transition-colors',
                        selectedPersonas.length === 0
                          ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
                          : 'border-border/40 text-muted-foreground hover:text-foreground',
                      )}
                    >
                      General Audience
                    </button>
                    {personas.map((p) => (
                      <button
                        key={p.name}
                        onClick={() => {
                          setSelectedPersonas((prev) =>
                            prev.includes(p.name) ? prev.filter((n) => n !== p.name) : [...prev, p.name],
                          )
                          if (genStep < 2) setGenStep(2)
                        }}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-xs border transition-colors',
                          selectedPersonas.includes(p.name)
                            ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
                            : 'border-border/40 text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 3: Knowledge Context Preview */}
              {genStep >= 2 && (
                <div className="space-y-3 animate-fade-in">
                  <h2 className="font-heading text-base font-semibold text-foreground">
                    3. Knowledge Context Preview
                  </h2>
                  <div className="glass-panel rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Top creatives from gallery will inform generation ({Math.min(galleryItems.length, 5)} available)</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Palette className="h-3.5 w-3.5 text-purple-400" />
                      <span>Brand colors and guidelines from knowledge graph</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Activity className="h-3.5 w-3.5 text-blue-400" />
                      <span>
                        Target: {selectedPersonas.length > 0 ? selectedPersonas.join(', ') : 'General Audience'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Custom Prompt */}
              {genStep >= 2 && (
                <div className="space-y-3 animate-fade-in">
                  <h2 className="font-heading text-base font-semibold text-foreground">
                    4. Custom Prompt <span className="text-muted-foreground font-normal">(optional)</span>
                  </h2>
                  <textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="Add specific instructions for the creative generation..."
                    rows={3}
                    className="w-full rounded-xl bg-transparent border border-border/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none"
                  />
                </div>
              )}

              {/* Step 5: Generate button */}
              {genStep >= 2 && (
                <div className="animate-fade-in">
                  {genError && (
                    <p className="text-sm text-destructive mb-3">{genError}</p>
                  )}
                  <Button
                    onClick={handleGenerate}
                    disabled={!campaignGoal}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    <Sparkles className="h-4 w-4 mr-1.5" />
                    Generate Creatives
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB: Performance                                                   */}
      {/* ================================================================= */}
      {activeTab === 'performance' && (
        <div className="space-y-6 animate-fade-in">
          {/* Stats cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="glass-panel rounded-xl p-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Creatives</p>
              <p className="font-heading text-3xl font-bold text-foreground mt-1">{perfStats.total}</p>
            </div>
            <div className="glass-panel rounded-xl p-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Avg Persona Score</p>
              <p className="font-heading text-3xl font-bold text-foreground mt-1">
                {perfStats.avgScore > 0 ? perfStats.avgScore : '--'}
              </p>
            </div>
            <div className="glass-panel rounded-xl p-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Top Performing Style</p>
              <p className="font-heading text-lg font-bold text-foreground mt-1 truncate">
                {perfStats.topRoas > 0 ? perfStats.topStyle : '--'}
              </p>
              {perfStats.topRoas > 0 && (
                <p className="text-[11px] text-amber-400 mt-0.5">ROAS: {perfStats.topRoas.toFixed(1)}x</p>
              )}
            </div>
          </div>

          {/* Recent Activity */}
          <div>
            <h2 className="font-heading text-base font-semibold text-foreground mb-3">Recent Activity</h2>
            {perfStats.recent.length > 0 ? (
              <div className="space-y-2">
                {perfStats.recent.map((item) => {
                  const props = item.properties as Record<string, unknown>
                  const personaScore = typeof props?.persona_score === 'number' ? props.persona_score as number : null
                  return (
                    <div
                      key={item.id}
                      className="glass-panel rounded-xl p-4 flex items-center gap-4"
                    >
                      <div className="h-10 w-10 shrink-0 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                        {item.nodeType === 'video_asset' ? (
                          <Play className="h-5 w-5 text-indigo-400" />
                        ) : (
                          <ImageIcon className="h-5 w-5 text-indigo-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                      {personaScore !== null && (
                        <Badge className="bg-indigo-600/15 text-indigo-400 border-indigo-500/30 text-[10px]">
                          <Star className="h-3 w-3 mr-0.5" />
                          {personaScore}
                        </Badge>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="glass-panel rounded-xl p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No creatives yet. Generate some to see performance data.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Plus,
  Megaphone,
  Calendar,
  DollarSign,
  Globe,
  Pause,
  Play,
  Loader2,
  Zap,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Campaign {
  id: string
  name: string
  status: 'draft' | 'active' | 'paused' | 'failed' | 'completed'
  platform: string | null
  daily_budget: number | null
  launched_at: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Status badge config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  string,
  { bg: string; text: string; dot: string; label: string }
> = {
  draft: {
    bg: 'bg-white/[0.08]',
    text: 'text-muted-foreground',
    dot: 'bg-muted-foreground',
    label: 'Draft',
  },
  active: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    dot: 'bg-emerald-400',
    label: 'Active',
  },
  paused: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    dot: 'bg-amber-400',
    label: 'Paused',
  },
  failed: {
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    dot: 'bg-red-400',
    label: 'Failed',
  },
  completed: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    dot: 'bg-blue-400',
    label: 'Completed',
  },
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface QuickResult {
  success: boolean
  partialFailure?: boolean
  campaignName?: string
  copyRunId?: string
  imageRunId?: string
  targetingRunId?: string
  creditsUsed?: number
  failures?: Array<{ skill: string; status: string; error: string }>
  error?: string
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [quickRunning, setQuickRunning] = useState(false)
  const [quickResult, setQuickResult] = useState<QuickResult | null>(null)

  // Resolve brand id, then fetch campaigns via API (bypasses RLS)
  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    // Resolve brand
    let brandId: string | null = null
    const stored =
      sessionStorage.getItem('onboarding_brand_id') ||
      localStorage.getItem('growth_os_brand_id')
    if (stored) {
      brandId = stored
    } else {
      try {
        const res = await fetch('/api/brands/me')
        if (res.ok) {
          const data = await res.json()
          if (data.brandId) {
            brandId = data.brandId
            localStorage.setItem('growth_os_brand_id', data.brandId)
          }
        }
      } catch {
        /* ignore */
      }
    }

    if (!brandId) {
      setError('No brand found')
      setIsLoading(false)
      return
    }

    try {
      const res = await fetch(`/api/campaigns/list?brandId=${brandId}`)
      if (!res.ok) throw new Error('Failed to load campaigns')
      const { campaigns: data } = await res.json() as { campaigns: Campaign[] }
      setCampaigns(data)
    } catch {
      setError('Failed to load campaigns')
    } finally {
      setIsLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Pause / Resume quick actions
  async function handlePause(id: string) {
    setActionLoading(id + ':pause')
    try {
      const res = await fetch(`/api/campaigns/${id}/pause`, { method: 'POST' })
      if (res.ok) {
        setCampaigns((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: 'paused' } : c))
        )
      }
    } finally {
      setActionLoading(null)
    }
  }

  async function handleResume(id: string) {
    setActionLoading(id + ':resume')
    try {
      const res = await fetch(`/api/campaigns/${id}/resume`, { method: 'POST' })
      if (res.ok) {
        setCampaigns((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: 'active' } : c))
        )
      }
    } finally {
      setActionLoading(null)
    }
  }

  async function handleQuickGenerate() {
    setQuickRunning(true)
    setQuickResult(null)

    const brandId =
      sessionStorage.getItem('onboarding_brand_id') ||
      localStorage.getItem('growth_os_brand_id')
    if (!brandId) {
      setQuickResult({ success: false, error: 'No brand found' })
      setQuickRunning(false)
      return
    }

    try {
      const res = await fetch('/api/mia/auto-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, objective: 'conversion' }),
      })
      const data = (await res.json()) as QuickResult
      setQuickResult(data)
    } catch (err) {
      setQuickResult({
        success: false,
        error: err instanceof Error ? err.message : 'Request failed',
      })
    } finally {
      setQuickRunning(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-heading font-bold text-foreground">
            Campaigns
          </h1>
          <p className="text-sm text-muted-foreground">
            Create and manage AI-powered marketing campaigns.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="border-amber-400/40 text-amber-200 hover:bg-amber-500/10 hover:text-amber-100"
            onClick={handleQuickGenerate}
            disabled={quickRunning}
            title="Mia chains ad-copy → image-brief → audience-targeting"
          >
            {quickRunning ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-1.5" />
            )}
            {quickRunning ? 'Generating...' : 'Quick Generate (Mia)'}
          </Button>
          <Link href="/dashboard/campaigns/new">
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <Plus className="h-4 w-4 mr-1.5" />
              New Campaign
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick-generate result */}
      {quickResult && (
        <div
          className={cn(
            'glass-panel rounded-xl p-4 border',
            quickResult.success && !quickResult.partialFailure
              ? 'border-emerald-500/30 bg-emerald-500/[0.04]'
              : quickResult.partialFailure
                ? 'border-amber-500/30 bg-amber-500/[0.04]'
                : 'border-red-500/30 bg-red-500/[0.04]',
          )}
        >
          <div className="flex items-start gap-3">
            {quickResult.success && !quickResult.partialFailure ? (
              <Zap className="h-4 w-4 mt-0.5 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle
                className={cn(
                  'h-4 w-4 mt-0.5 shrink-0',
                  quickResult.partialFailure ? 'text-amber-400' : 'text-red-400',
                )}
              />
            )}
            <div className="flex-1 min-w-0 space-y-2">
              <p className="text-sm font-medium text-foreground">
                {quickResult.success && !quickResult.partialFailure
                  ? `Generated: ${quickResult.campaignName ?? 'campaign'}`
                  : quickResult.partialFailure
                    ? 'Partial success'
                    : 'Generation failed'}
              </p>
              {quickResult.creditsUsed != null && quickResult.creditsUsed > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {quickResult.creditsUsed} credits used
                </p>
              )}
              {quickResult.error && (
                <p className="text-[11px] text-red-300">{quickResult.error}</p>
              )}
              {quickResult.failures && quickResult.failures.length > 0 && (
                <ul className="text-[11px] text-amber-200/80 space-y-0.5">
                  {quickResult.failures.map((f) => (
                    <li key={f.skill}>
                      <span className="font-mono">{f.skill}</span>: {f.error}
                    </li>
                  ))}
                </ul>
              )}
              {(quickResult.copyRunId || quickResult.imageRunId || quickResult.targetingRunId) && (
                <div className="flex gap-3 text-[11px] text-muted-foreground flex-wrap">
                  {quickResult.copyRunId && (
                    <Link href={`/dashboard/runs/${quickResult.copyRunId}`} className="hover:text-foreground underline underline-offset-2">
                      View copy run
                    </Link>
                  )}
                  {quickResult.imageRunId && (
                    <Link href={`/dashboard/runs/${quickResult.imageRunId}`} className="hover:text-foreground underline underline-offset-2">
                      View image brief
                    </Link>
                  )}
                  {quickResult.targetingRunId && (
                    <Link href={`/dashboard/runs/${quickResult.targetingRunId}`} className="hover:text-foreground underline underline-offset-2">
                      View targeting
                    </Link>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={() => setQuickResult(null)}
              className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="glass-panel rounded-xl h-20 animate-pulse"
              aria-hidden="true"
            />
          ))}
        </div>
      )}

      {/* Error */}
      {!isLoading && error && (
        <div className="glass-panel rounded-xl p-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && campaigns.length === 0 && (
        <div className="glass-panel rounded-xl p-12 text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/10">
            <Megaphone className="h-8 w-8 text-indigo-400" />
          </div>
          <h2 className="text-lg font-heading font-semibold text-foreground">
            No campaigns yet
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Create your first campaign and let your AI agent team generate copy,
            creative briefs, and launch ads on Meta.
          </p>
          <Link href="/dashboard/campaigns/new">
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white mt-2">
              <Plus className="h-4 w-4 mr-1.5" />
              Create First Campaign
            </Button>
          </Link>
        </div>
      )}

      {/* Campaign list */}
      {!isLoading && !error && campaigns.length > 0 && (
        <div className="space-y-3">
          {campaigns.map((campaign) => {
            const cfgRaw = STATUS_CONFIG[campaign.status]
            const cfg = cfgRaw ?? {
              bg: 'bg-white/[0.08]',
              text: 'text-muted-foreground',
              dot: 'bg-muted-foreground',
              label: 'Draft',
            }
            const dateLabel = campaign.launched_at
              ? new Date(campaign.launched_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : new Date(campaign.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
            const isPausing = actionLoading === campaign.id + ':pause'
            const isResuming = actionLoading === campaign.id + ':resume'

            return (
              <div
                key={campaign.id}
                className="glass-panel rounded-xl p-4 flex items-center gap-4 hover:bg-white/[0.03] transition-colors"
              >
                {/* Icon */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10">
                  <Megaphone className="h-5 w-5 text-indigo-400" />
                </div>

                {/* Info — links to detail page */}
                <Link
                  href={`/dashboard/campaigns/${campaign.id}`}
                  className="flex-1 min-w-0 group"
                >
                  <p className="text-sm font-medium text-foreground truncate group-hover:text-indigo-300 transition-colors">
                    {campaign.name}
                  </p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {dateLabel}
                    </span>
                    {campaign.platform && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Globe className="h-3 w-3" />
                        {campaign.platform}
                      </span>
                    )}
                    {campaign.daily_budget != null && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <DollarSign className="h-3 w-3" />
                        {campaign.daily_budget.toLocaleString('en-US', {
                          style: 'currency',
                          currency: 'USD',
                          maximumFractionDigits: 0,
                        })}
                        /day
                      </span>
                    )}
                  </div>
                </Link>

                {/* Status badge */}
                <span
                  className={cn(
                    'shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium',
                    cfg.bg,
                    cfg.text,
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
                  {cfg.label}
                </span>

                {/* Quick actions */}
                {campaign.status === 'active' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 h-8 px-2.5 text-xs text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10"
                    onClick={() => handlePause(campaign.id)}
                    disabled={isPausing}
                    title="Pause campaign"
                  >
                    {isPausing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <Pause className="h-3.5 w-3.5 mr-1" />
                        Pause
                      </>
                    )}
                  </Button>
                )}
                {campaign.status === 'paused' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 h-8 px-2.5 text-xs text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10"
                    onClick={() => handleResume(campaign.id)}
                    disabled={isResuming}
                    title="Resume campaign"
                  >
                    {isResuming ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 mr-1" />
                        Resume
                      </>
                    )}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

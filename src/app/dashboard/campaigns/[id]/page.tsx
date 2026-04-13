'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeft,
  Pause,
  Play,
  Loader2,
  Megaphone,
  Calendar,
  DollarSign,
  Globe,
  Users,
  ImageIcon,
  Clock,
  TrendingUp,
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
  objective: string | null
  platform: string | null
  daily_budget: number | null
  meta_campaign_id: string | null
  meta_adset_ids: string[] | null
  meta_ad_ids: string[] | null
  launched_at: string | null
  learning_ends_at: string | null
  last_optimized_at: string | null
  optimization_log: OptimizationLogEntry[] | null
  creatives: unknown[] | null
  audience_tiers: unknown[] | null
}

interface OptimizationLogEntry {
  timestamp: string
  description: string
  action?: string
}

interface AdSetPerf {
  id: string
  name: string
  spend: string
  impressions: string
  clicks: string
  ctr: string
  cpc: string
}

interface AdPerf {
  id: string
  name: string
  spend: string
  impressions: string
  clicks: string
  ctr: string
  cpc: string
}

interface Performance {
  campaignId: string
  spend: string
  impressions: string
  clicks: string
  ctr: string
  cpc: string
  adSets: AdSetPerf[]
  ads: AdPerf[]
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  draft:     { bg: 'bg-white/[0.08]',      text: 'text-muted-foreground', dot: 'bg-muted-foreground', label: 'Draft' },
  active:    { bg: 'bg-emerald-500/10',    text: 'text-emerald-400',      dot: 'bg-emerald-400',      label: 'Active' },
  paused:    { bg: 'bg-amber-500/10',      text: 'text-amber-400',        dot: 'bg-amber-400',        label: 'Paused' },
  failed:    { bg: 'bg-red-500/10',        text: 'text-red-400',          dot: 'bg-red-400',          label: 'Failed' },
  completed: { bg: 'bg-blue-500/10',       text: 'text-blue-400',         dot: 'bg-blue-400',         label: 'Completed' },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNum(raw: string | number): string {
  const n = typeof raw === 'string' ? parseFloat(raw) : raw
  if (isNaN(n)) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function formatSpend(raw: string | number): string {
  const n = typeof raw === 'string' ? parseFloat(raw) : raw
  if (isNaN(n)) return '$0.00'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysRemaining(iso: string | null): number | null {
  if (!iso) return null
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return null
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="glass-panel rounded-2xl p-5 flex flex-col gap-1">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-metric text-2xl font-bold text-foreground leading-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function PerfTable({
  title,
  rows,
}: {
  title: string
  rows: Array<{ id: string; name: string; spend: string; impressions: string; clicks: string; ctr: string }>
}) {
  if (rows.length === 0) return null
  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-white/[0.06]">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.04]">
              <th className="text-left px-5 py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Name</th>
              <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Spend</th>
              <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Impressions</th>
              <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Clicks</th>
              <th className="text-right px-5 py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">CTR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.id}
                className={cn(
                  'transition-colors hover:bg-white/[0.02]',
                  i < rows.length - 1 && 'border-b border-white/[0.04]',
                )}
              >
                <td className="px-5 py-3 text-foreground font-medium truncate max-w-[200px]">{row.name}</td>
                <td className="px-4 py-3 text-right text-muted-foreground font-mono">{formatSpend(row.spend)}</td>
                <td className="px-4 py-3 text-right text-muted-foreground font-mono">{formatNum(row.impressions)}</td>
                <td className="px-4 py-3 text-right text-muted-foreground font-mono">{formatNum(row.clicks)}</td>
                <td className="px-5 py-3 text-right text-muted-foreground font-mono">{parseFloat(row.ctr).toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function Skeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="h-8 w-64 glass-panel rounded-xl animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass-panel rounded-2xl h-24 animate-pulse" />
        ))}
      </div>
      <div className="glass-panel rounded-2xl h-48 animate-pulse" />
      <div className="glass-panel rounded-2xl h-48 animate-pulse" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CampaignDetailPage() {
  const params = useParams()
  const id = params.id as string

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [performance, setPerformance] = useState<Performance | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<'pause' | 'resume' | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${id}/performance`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as { success: boolean; campaign: Campaign; performance: Performance }
      setCampaign(data.campaign)
      setPerformance(data.performance)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load campaign')
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  async function handlePause() {
    if (!campaign) return
    setActionLoading('pause')
    try {
      const res = await fetch(`/api/campaigns/${id}/pause`, { method: 'POST' })
      if (res.ok) {
        setCampaign((prev) => prev ? { ...prev, status: 'paused' } : prev)
      }
    } finally {
      setActionLoading(null)
    }
  }

  async function handleResume() {
    if (!campaign) return
    setActionLoading('resume')
    try {
      const res = await fetch(`/api/campaigns/${id}/resume`, { method: 'POST' })
      if (res.ok) {
        setCampaign((prev) => prev ? { ...prev, status: 'active' } : prev)
      }
    } finally {
      setActionLoading(null)
    }
  }

  if (isLoading) return <Skeleton />

  if (error) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Link href="/dashboard/campaigns">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground -ml-2">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Campaigns
          </Button>
        </Link>
        <div className="glass-panel rounded-2xl p-10 text-center">
          <p className="text-sm text-destructive mb-4">{error}</p>
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      </div>
    )
  }

  if (!campaign) return null

  const statusCfg = STATUS_CONFIG[campaign.status] ?? STATUS_CONFIG['draft']!
  const learningDays = daysRemaining(campaign.learning_ends_at)
  const optimizationLog: OptimizationLogEntry[] = Array.isArray(campaign.optimization_log)
    ? campaign.optimization_log
    : []
  const creativeCount = Array.isArray(campaign.creatives) ? campaign.creatives.length : 0
  const audienceTiers = Array.isArray(campaign.audience_tiers) ? campaign.audience_tiers : []

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Back + Action bar ── */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/campaigns">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground -ml-2">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Campaigns
          </Button>
        </Link>
        <div className="flex-1" />
        {campaign.status === 'active' && (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10"
            onClick={() => void handlePause()}
            disabled={actionLoading !== null}
          >
            {actionLoading === 'pause' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <Pause className="h-3.5 w-3.5 mr-1.5" />
            )}
            Pause Campaign
          </Button>
        )}
        {campaign.status === 'paused' && (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10"
            onClick={() => void handleResume()}
            disabled={actionLoading !== null}
          >
            {actionLoading === 'resume' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <Play className="h-3.5 w-3.5 mr-1.5" />
            )}
            Resume Campaign
          </Button>
        )}
      </div>

      {/* ── Header ── */}
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10">
            <Megaphone className="h-6 w-6 text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <h1 className="text-xl font-heading font-bold text-foreground leading-tight">
              {campaign.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              {/* Status */}
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium',
                  statusCfg.bg,
                  statusCfg.text,
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', statusCfg.dot)} />
                {statusCfg.label}
              </span>

              {/* Objective */}
              {campaign.objective && (
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-indigo-500/10 text-indigo-400">
                  <TrendingUp className="h-3 w-3" />
                  {campaign.objective}
                </span>
              )}

              {/* Platform */}
              {campaign.platform && (
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-white/[0.06] text-muted-foreground">
                  <Globe className="h-3 w-3" />
                  {campaign.platform}
                </span>
              )}

              {/* Launched date */}
              {campaign.launched_at && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  Launched {formatDate(campaign.launched_at)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: metrics + tables + timeline */}
        <div className="xl:col-span-8 space-y-6">

          {/* Metric cards */}
          {performance ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard label="Spend" value={formatSpend(performance.spend)} />
              <MetricCard label="Impressions" value={formatNum(performance.impressions)} />
              <MetricCard label="Clicks" value={formatNum(performance.clicks)} />
              <MetricCard
                label="CTR"
                value={`${parseFloat(performance.ctr).toFixed(2)}%`}
                sub={`CPC ${formatSpend(performance.cpc)}`}
              />
            </div>
          ) : (
            <div className="glass-panel rounded-2xl p-5 text-center">
              <p className="text-sm text-muted-foreground">
                Performance data unavailable — campaign may not have Meta data yet.
              </p>
            </div>
          )}

          {/* Ad Set table */}
          {performance && performance.adSets.length > 0 && (
            <PerfTable title="Ad Set Performance" rows={performance.adSets} />
          )}

          {/* Ad table */}
          {performance && performance.ads.length > 0 && (
            <PerfTable title="Ad Performance" rows={performance.ads} />
          )}

          {/* Optimization history */}
          {optimizationLog.length > 0 && (
            <div className="glass-panel rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-white/[0.06]">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Optimization History
                </p>
              </div>
              <div className="p-5 space-y-0">
                {optimizationLog.map((entry, i) => (
                  <div key={i} className="relative flex gap-4">
                    {/* Timeline line */}
                    {i < optimizationLog.length - 1 && (
                      <div className="absolute left-[7px] top-5 bottom-0 w-px bg-white/[0.06]" />
                    )}
                    <div className="shrink-0 mt-1">
                      <div className="h-3.5 w-3.5 rounded-full border-2 border-indigo-500/50 bg-background" />
                    </div>
                    <div className="flex-1 pb-5">
                      <p className="text-sm text-foreground leading-snug">{entry.description}</p>
                      {entry.action && (
                        <p className="text-[11px] text-indigo-400 mt-0.5 font-medium">{entry.action}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {entry.timestamp ? timeAgo(entry.timestamp) : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: campaign details sidebar */}
        <div className="xl:col-span-4 space-y-4">
          <div className="glass-panel rounded-2xl p-5 space-y-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Campaign Details
            </p>

            {/* Daily budget */}
            {campaign.daily_budget != null && (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <DollarSign className="h-3.5 w-3.5" />
                  Daily Budget
                </span>
                <span className="font-mono text-foreground">
                  {campaign.daily_budget.toLocaleString('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    maximumFractionDigits: 0,
                  })}
                </span>
              </div>
            )}

            {/* Learning status */}
            {learningDays !== null && (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  Learning Period
                </span>
                <span className="text-amber-400 font-medium text-xs">
                  {learningDays}d remaining
                </span>
              </div>
            )}
            {campaign.learning_ends_at && learningDays === null && (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  Learning Period
                </span>
                <span className="text-emerald-400 font-medium text-xs">Complete</span>
              </div>
            )}

            {/* Last optimized */}
            {campaign.last_optimized_at && (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Last Optimized
                </span>
                <span className="text-xs text-muted-foreground font-mono">
                  {timeAgo(campaign.last_optimized_at)}
                </span>
              </div>
            )}

            {/* Audience tiers */}
            {audienceTiers.length > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  Audience Tiers
                </span>
                <span className="font-mono text-foreground">{audienceTiers.length}</span>
              </div>
            )}

            {/* Creative count */}
            {creativeCount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <ImageIcon className="h-3.5 w-3.5" />
                  Creatives
                </span>
                <span className="font-mono text-foreground">{creativeCount}</span>
              </div>
            )}

            {/* Launched */}
            {campaign.launched_at && (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  Launched
                </span>
                <span className="text-xs text-muted-foreground font-mono">
                  {formatDate(campaign.launched_at)}
                </span>
              </div>
            )}
          </div>

          {/* Ad / AdSet ID counts */}
          {(campaign.meta_adset_ids?.length || campaign.meta_ad_ids?.length) ? (
            <div className="glass-panel rounded-2xl p-5 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Meta IDs
              </p>
              {campaign.meta_campaign_id && (
                <div className="text-xs">
                  <p className="text-muted-foreground mb-0.5">Campaign</p>
                  <p className="font-mono text-foreground truncate">{campaign.meta_campaign_id}</p>
                </div>
              )}
              {campaign.meta_adset_ids && campaign.meta_adset_ids.length > 0 && (
                <div className="text-xs">
                  <p className="text-muted-foreground">{campaign.meta_adset_ids.length} Ad Set{campaign.meta_adset_ids.length !== 1 ? 's' : ''}</p>
                </div>
              )}
              {campaign.meta_ad_ids && campaign.meta_ad_ids.length > 0 && (
                <div className="text-xs">
                  <p className="text-muted-foreground">{campaign.meta_ad_ids.length} Ad{campaign.meta_ad_ids.length !== 1 ? 's' : ''}</p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

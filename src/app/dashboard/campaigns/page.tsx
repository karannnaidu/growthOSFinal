'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, Loader2, Megaphone, Calendar, Layers, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { AGENT_MAP } from '@/lib/agents-data'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Campaign {
  id: string
  name: string
  status: 'draft' | 'generating' | 'reviewing' | 'complete'
  created_at: string
  agent_chain: string[]
  assets_count: number
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-white/[0.08]', text: 'text-muted-foreground', label: 'Draft' },
  generating: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Generating' },
  reviewing: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Reviewing' },
  complete: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Complete' },
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      setError(null)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Not authenticated'); setIsLoading(false); return }

      // Resolve brand
      let brandId: string | null = null
      const { data: ownedBrand } = await supabase
        .from('brands').select('id').eq('owner_id', user.id).limit(1).single()
      if (ownedBrand) {
        brandId = ownedBrand.id as string
      } else {
        const { data: member } = await supabase
          .from('brand_members').select('brand_id').eq('user_id', user.id).limit(1).single()
        if (member) brandId = member.brand_id as string
      }

      if (!brandId) { setError('No brand found'); setIsLoading(false); return }

      // Fetch skill_runs with triggered_by = 'campaign'
      const { data: runs, error: fetchErr } = await supabase
        .from('skill_runs')
        .select('id, created_at, input, output, status')
        .eq('brand_id', brandId)
        .eq('triggered_by', 'campaign')
        .order('created_at', { ascending: false })
        .limit(50)

      if (fetchErr) {
        setError('Failed to load campaigns')
        setIsLoading(false)
        return
      }

      // Map runs to campaign rows
      const mapped: Campaign[] = (runs ?? []).map((run: Record<string, unknown>) => {
        const input = (run.input ?? {}) as Record<string, unknown>
        const output = (run.output ?? {}) as Record<string, unknown>
        const agentChain = Array.isArray(input.agent_chain) ? input.agent_chain as string[] : ['aria']
        const assetsCount = typeof output.assets_count === 'number' ? output.assets_count : 0

        let status: Campaign['status'] = 'draft'
        if (run.status === 'completed') status = 'complete'
        else if (run.status === 'running') status = 'generating'
        else if (run.status === 'review') status = 'reviewing'

        return {
          id: run.id as string,
          name: (input.campaign_name as string) ?? `Campaign ${(run.id as string).slice(0, 8)}`,
          status,
          created_at: run.created_at as string,
          agent_chain: agentChain,
          assets_count: assetsCount,
        }
      })

      setCampaigns(mapped)
      setIsLoading(false)
    }

    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-heading font-bold text-foreground">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            Create and manage AI-powered marketing campaigns.
          </p>
        </div>
        <Link href="/dashboard/campaigns/new">
          <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
            <Plus className="h-4 w-4 mr-1.5" />
            New Campaign
          </Button>
        </Link>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-panel rounded-xl h-20 animate-pulse" aria-hidden="true" />
          ))}
        </div>
      )}

      {/* Error */}
      {!isLoading && error && (
        <div className="glass-panel rounded-xl p-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && campaigns.length === 0 && (
        <div className="glass-panel rounded-xl p-12 text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/10">
            <Megaphone className="h-8 w-8 text-indigo-400" />
          </div>
          <h2 className="text-lg font-heading font-semibold text-foreground">
            No campaigns yet
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Create your first campaign and let your AI agent team generate copy, creative briefs, and images.
          </p>
          <Link href="/dashboard/campaigns/new">
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white mt-2">
              <Plus className="h-4 w-4 mr-1.5" />
              Create First Campaign
            </Button>
          </Link>
        </div>
      )}

      {/* Campaign List */}
      {!isLoading && !error && campaigns.length > 0 && (
        <div className="space-y-3">
          {campaigns.map((campaign) => {
            const statusStyle = STATUS_STYLES[campaign.status] ?? { bg: 'bg-white/[0.08]', text: 'text-muted-foreground', label: 'Draft' }
            const dateStr = new Date(campaign.created_at).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
            })

            return (
              <div
                key={campaign.id}
                className="glass-panel rounded-xl p-4 flex items-center gap-4 hover:bg-white/[0.03] transition-colors"
              >
                {/* Campaign icon */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10">
                  <Megaphone className="h-5 w-5 text-indigo-400" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{campaign.name}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {dateStr}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <FileText className="h-3 w-3" />
                      {campaign.assets_count} asset{campaign.assets_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Agent chain */}
                <div className="hidden sm:flex items-center -space-x-1.5">
                  {campaign.agent_chain.slice(0, 4).map((agentId, i) => (
                    <AgentAvatar key={`${agentId}-${i}`} agentId={agentId} size="sm" className="!w-6 !h-6 ring-1 ring-background" />
                  ))}
                  {campaign.agent_chain.length > 4 && (
                    <span className="text-[10px] text-muted-foreground ml-1.5">
                      +{campaign.agent_chain.length - 4}
                    </span>
                  )}
                </div>

                {/* Status badge */}
                <span
                  className={cn(
                    'shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium',
                    statusStyle.bg,
                    statusStyle.text,
                  )}
                >
                  {statusStyle.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

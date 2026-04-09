'use client'

import { useState, useEffect, useMemo } from 'react'
import { Search, Play, Loader2, Zap, ChevronDown, ChevronUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { AGENT_MAP } from '@/lib/agents-data'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkillPublic {
  id: string
  name: string
  agent: string
  category: string
  complexity: 'free' | 'cheap' | 'mid' | 'premium'
  credits: number
  mcpTools: string[]
  chainsTo: string[]
  schedule?: string
  sections: {
    systemPrompt: string
    whenToRun?: string
    inputsRequired?: string
    workflow?: string
    outputFormat?: string
    autoChain?: string
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIER_COLORS: Record<string, string> = {
  free: '#10b981',
  cheap: '#3b82f6',
  mid: '#f59e0b',
  premium: '#e11d48',
}

const TIER_OPTIONS = ['All', 'Free', 'Cheap', 'Mid', 'Premium'] as const

const CATEGORY_OPTIONS = [
  'All',
  'acquisition',
  'creative',
  'customer-intel',
  'diagnosis',
  'finance',
  'growth',
  'ops',
  'optimization',
  'retention',
] as const

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillPublic[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('All')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null)
  const [runningSkill, setRunningSkill] = useState<string | null>(null)
  const [brandId, setBrandId] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      setError(null)

      // Resolve brand for run button
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Not authenticated'); setIsLoading(false); return }

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
      if (!bid) { setError('No brand found'); setIsLoading(false); return }
      setBrandId(bid)

      // Fetch all skills
      const res = await fetch('/api/skills')
      if (!res.ok) { setError('Failed to load skills'); setIsLoading(false); return }

      const json = await res.json() as { success: boolean; data?: SkillPublic[] }
      setSkills(json.data ?? [])
      setIsLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    let list = skills

    // Category filter
    if (categoryFilter !== 'All') {
      list = list.filter((s) => s.category === categoryFilter)
    }

    // Tier filter
    if (tierFilter !== 'All') {
      list = list.filter((s) => s.complexity === tierFilter.toLowerCase())
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          s.agent.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q),
      )
    }

    return list
  }, [skills, search, tierFilter, categoryFilter])

  async function handleRun(skillId: string) {
    if (!brandId || runningSkill) return
    setRunningSkill(skillId)
    try {
      await fetch('/api/skills/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ skillId, brandId }),
      })
    } catch {
      // silent
    } finally {
      setRunningSkill(null)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-heading font-bold text-foreground">Skills</h1>
        <p className="text-sm text-muted-foreground">
          Browse and run all {skills.length} skills across your agent team.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Category dropdown */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-8 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 text-xs text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Filter by category"
        >
          {CATEGORY_OPTIONS.map((cat) => (
            <option key={cat} value={cat}>
              {cat === 'All' ? 'All Categories' : cat.charAt(0).toUpperCase() + cat.slice(1).replace('-', ' ')}
            </option>
          ))}
        </select>

        {/* Tier filter pills */}
        <div className="flex items-center gap-1">
          {TIER_OPTIONS.map((tier) => (
            <button
              key={tier}
              type="button"
              onClick={() => setTierFilter(tier)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                tierFilter === tier
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {tier}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Search skills..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search skills"
          />
        </div>
      </div>

      {/* States */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="glass-panel rounded-xl h-44 animate-pulse" aria-hidden="true" />
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="glass-panel rounded-xl p-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <div className="glass-panel rounded-xl p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {search || tierFilter !== 'All' || categoryFilter !== 'All'
              ? 'No skills match your filters.'
              : 'No skills available.'}
          </p>
        </div>
      )}

      {/* Skills grid */}
      {!isLoading && !error && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((skill) => {
            const agentCfg = AGENT_MAP[skill.agent]
            const agentColor = agentCfg?.color ?? '#6366F1'
            const tierColor = TIER_COLORS[skill.complexity] ?? '#3b82f6'
            const tierLabel = skill.complexity.charAt(0).toUpperCase() + skill.complexity.slice(1)
            const isExpanded = expandedSkill === skill.id
            const isRunning = runningSkill === skill.id

            return (
              <div
                key={skill.id}
                className="glass-panel rounded-xl overflow-hidden transition-all duration-200 hover:shadow-md"
              >
                {/* Agent color accent bar */}
                <div className="h-1 w-full" style={{ background: agentColor }} />

                <div className="p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                        style={{ background: `${agentColor}18` }}
                      >
                        <Zap className="h-3.5 w-3.5" style={{ color: agentColor }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{skill.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{skill.id}</p>
                      </div>
                    </div>

                    {/* Tier badge */}
                    <span
                      className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{ background: `${tierColor}18`, color: tierColor }}
                    >
                      {tierLabel}
                    </span>
                  </div>

                  {/* Agent badge + credits */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <AgentAvatar agentId={skill.agent} size="sm" className="!w-4 !h-4" />
                      <span className="text-[10px] text-muted-foreground">{agentCfg?.name ?? skill.agent}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {skill.credits} credit{skill.credits !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={isRunning}
                      onClick={() => handleRun(skill.id)}
                      className="flex-1"
                      aria-label={`Run ${skill.name}`}
                    >
                      {isRunning ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Play className="h-3 w-3 mr-1" />
                      )}
                      {isRunning ? 'Running...' : 'Run'}
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => setExpandedSkill(isExpanded ? null : skill.id)}
                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </Button>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 space-y-2 animate-fade-in">
                      {skill.sections.workflow && (
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Workflow</p>
                          <p className="text-[11px] text-muted-foreground whitespace-pre-wrap line-clamp-6">
                            {skill.sections.workflow}
                          </p>
                        </div>
                      )}
                      {skill.chainsTo.length > 0 && (
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Chains to</p>
                          <div className="flex flex-wrap gap-1">
                            {skill.chainsTo.map((id) => (
                              <span
                                key={id}
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] bg-white/[0.06] text-muted-foreground"
                              >
                                {id}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {skill.mcpTools.length > 0 && (
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">MCP Tools</p>
                          <p className="text-[10px] text-muted-foreground font-mono">
                            {skill.mcpTools.join(', ')}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

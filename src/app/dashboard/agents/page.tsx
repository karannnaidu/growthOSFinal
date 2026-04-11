'use client'

import { useState, useEffect, useMemo } from 'react'
import { Search } from 'lucide-react'
import { AgentCard, type AgentCardData } from '@/components/agents/agent-card'
import { AGENT_CATEGORIES } from '@/lib/agents-data'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Category tabs
// ---------------------------------------------------------------------------

const ALL_TAB = 'All'
const TABS = [ALL_TAB, ...Object.keys(AGENT_CATEGORIES)]

/** Reverse lookup: agentId -> category name */
const agentCategoryMap: Record<string, string> = {}
for (const [cat, ids] of Object.entries(AGENT_CATEGORIES)) {
  for (const id of ids) {
    agentCategoryMap[id] = cat
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentCardData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState(ALL_TAB)

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      setError(null)

      // 1. Resolve brand
      let brandId: string | null = null
      const stored = sessionStorage.getItem('onboarding_brand_id') || localStorage.getItem('growth_os_brand_id')
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
        } catch { /* ignore */ }
      }

      if (!brandId) { setError('No brand found'); setIsLoading(false); return }

      // 2. Fetch agents from API
      const res = await fetch(`/api/agents?brandId=${brandId}`)
      if (!res.ok) { setError('Failed to load agents'); setIsLoading(false); return }

      const json = await res.json() as { agents: AgentCardData[] }
      setAgents(json.agents ?? [])
      setIsLoading(false)
    }

    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    let list = agents

    // Category filter
    if (activeTab !== ALL_TAB) {
      const allowedIds = new Set(AGENT_CATEGORIES[activeTab] ?? [])
      // Mia (manager) appears in every tab
      list = list.filter((a) => allowedIds.has(a.id) || a.id === 'mia')
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.role.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q),
      )
    }

    return list
  }, [agents, search, activeTab])

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-heading font-bold text-foreground">Agents</h1>
        <p className="text-sm text-muted-foreground">
          Your AI marketing team — each agent specializes in a different growth discipline.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
              activeTab === tab
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search
          className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
          aria-hidden="true"
        />
        <Input
          type="search"
          placeholder="Search by name or role..."
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search agents"
        />
      </div>

      {/* States */}
      {isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="glass-panel rounded-xl h-44 animate-pulse"
              aria-hidden="true"
            />
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
            {search ? 'No agents match your search.' : 'No agents available in this category.'}
          </p>
        </div>
      )}

      {!isLoading && !error && filtered.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {filtered.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  )
}

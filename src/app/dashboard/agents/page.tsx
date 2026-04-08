'use client'

import { useState, useEffect, useMemo } from 'react'
import { Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { AgentCard, type AgentCardData } from '@/components/agents/agent-card'
import { Input } from '@/components/ui/input'

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentCardData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const supabase = createClient()

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      setError(null)

      // 1. Resolve brand
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Not authenticated'); setIsLoading(false); return }

      let brandId: string | null = null
      const { data: ownedBrand } = await supabase
        .from('brands')
        .select('id')
        .eq('owner_id', user.id)
        .limit(1)
        .single()

      if (ownedBrand) {
        brandId = ownedBrand.id as string
      } else {
        const { data: member } = await supabase
          .from('brand_members')
          .select('brand_id')
          .eq('user_id', user.id)
          .limit(1)
          .single()
        if (member) brandId = member.brand_id as string
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
    if (!search.trim()) return agents
    const q = search.toLowerCase()
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.role.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q),
    )
  }, [agents, search])

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-heading font-bold text-foreground">Agents</h1>
        <p className="text-sm text-muted-foreground">
          Your AI marketing team — each agent specializes in a different growth discipline.
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search
          className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
          aria-hidden="true"
        />
        <Input
          type="search"
          placeholder="Search by name or role…"
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
            {search ? 'No agents match your search.' : 'No agents available yet.'}
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

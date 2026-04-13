'use client'

import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, X, ChevronDown, ChevronUp } from 'lucide-react'

const NODE_TYPES = ['all', 'product', 'audience', 'insight', 'metric', 'competitor', 'campaign', 'channel']

const TYPE_COLORS: Record<string, string> = {
  product: '#10b981',
  audience: '#3b82f6',
  insight: '#f97316',
  metric: '#8b5cf6',
  competitor: '#e11d48',
  campaign: '#6366f1',
  channel: '#0d9488',
}

interface KnowledgeNode {
  id: string
  name: string
  node_type: string
  properties: Record<string, unknown> | null
  updated_at: string
  brand_id: string
}

interface KnowledgeEdge {
  id: string
  source_id: string
  target_id: string
  relation: string
}

export default function KnowledgeBrowserPage() {
  const [nodes, setNodes] = useState<KnowledgeNode[]>([])
  const [edges, setEdges] = useState<KnowledgeEdge[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      // Resolve brand ID from storage or API
      let brandId: string | null =
        sessionStorage.getItem('onboarding_brand_id') || localStorage.getItem('growth_os_brand_id')

      if (!brandId) {
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

      if (!brandId) {
        setLoading(false)
        return
      }

      try {
        const res = await fetch(`/api/knowledge/browser?brandId=${brandId}`)
        if (res.ok) {
          const data = await res.json()
          setNodes(data.nodes ?? [])
          setEdges(data.edges ?? [])
        }
      } catch { /* ignore */ }

      setLoading(false)
    }

    fetchData()
  }, [])

  const filtered = useMemo(
    () =>
      nodes.filter((node) => {
        const matchesType = filterType === 'all' || node.node_type === filterType
        const matchesSearch = !search || node.name.toLowerCase().includes(search.toLowerCase())
        return matchesType && matchesSearch
      }),
    [nodes, filterType, search],
  )

  function getRelatedEdges(nodeId: string) {
    return edges.filter((e) => e.source_id === nodeId || e.target_id === nodeId)
  }

  function getNodeName(nodeId: string) {
    return nodes.find((n) => n.id === nodeId)?.name ?? nodeId.slice(0, 8)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">
          Knowledge Browser
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Explore your brand knowledge graph nodes and relationships.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search nodes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-transparent border-border/60"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {NODE_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors capitalize ${
                filterType === type
                  ? 'bg-[#6366f1]/15 text-[#6366f1] border-[#6366f1]/30'
                  : 'border-border/40 text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <p className="text-xs text-muted-foreground">
        {filtered.length} node{filtered.length !== 1 ? 's' : ''} found
      </p>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass-panel rounded-2xl p-5 animate-pulse space-y-3">
              <div className="h-5 w-32 rounded bg-muted" />
              <div className="h-4 w-20 rounded bg-muted" />
              <div className="h-3 w-24 rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {/* Grid */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((node) => {
            const isExpanded = expandedId === node.id
            const relatedEdges = isExpanded ? getRelatedEdges(node.id) : []
            const color = TYPE_COLORS[node.node_type] ?? '#6366f1'

            return (
              <div
                key={node.id}
                className="glass-panel rounded-2xl p-5 transition-all duration-200 hover:bg-white/[0.03]"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-heading font-semibold text-sm text-foreground leading-tight">
                    {node.name}
                  </h3>
                  <Badge
                    className="text-[10px] shrink-0 capitalize"
                    style={{
                      background: `${color}20`,
                      color,
                      borderColor: `${color}30`,
                    }}
                  >
                    {node.node_type}
                  </Badge>
                </div>

                <p className="text-xs text-muted-foreground mb-3">
                  Updated {new Date(node.updated_at).toLocaleDateString()}
                </p>

                <button
                  onClick={() => setExpandedId(isExpanded ? null : node.id)}
                  className="text-xs text-[#6366f1] hover:text-[#4f52d4] flex items-center gap-1 transition-colors"
                >
                  {isExpanded ? (
                    <>Collapse <ChevronUp className="w-3 h-3" /></>
                  ) : (
                    <>Expand <ChevronDown className="w-3 h-3" /></>
                  )}
                </button>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-border/30 space-y-3 animate-fade-in">
                    {/* Properties */}
                    {node.properties && Object.keys(node.properties).length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">Properties</p>
                        <div className="space-y-1">
                          {Object.entries(node.properties).map(([key, value]) => (
                            <div key={key} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">{key}</span>
                              <span className="text-foreground font-mono">
                                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Edges */}
                    {relatedEdges.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">
                          Relationships ({relatedEdges.length})
                        </p>
                        <div className="space-y-1">
                          {relatedEdges.slice(0, 10).map((edge) => {
                            const otherNodeId = edge.source_id === node.id ? edge.target_id : edge.source_id
                            const direction = edge.source_id === node.id ? '->' : '<-'
                            return (
                              <div key={edge.id} className="text-xs text-muted-foreground flex items-center gap-1">
                                <span className="text-[#6366f1] font-mono">{direction}</span>
                                <span className="text-foreground/70">{edge.relation}</span>
                                <span className="text-foreground font-medium">{getNodeName(otherNodeId)}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {relatedEdges.length === 0 && (!node.properties || Object.keys(node.properties).length === 0) && (
                      <p className="text-xs text-muted-foreground italic">No additional data available.</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="glass-panel rounded-2xl p-12 text-center">
          <p className="text-muted-foreground text-sm">
            No knowledge nodes found. Run skills to build your knowledge graph.
          </p>
        </div>
      )}
    </div>
  )
}

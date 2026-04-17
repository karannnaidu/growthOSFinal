'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Brain, Trash2 } from 'lucide-react'

interface MiaMemory {
  id: string
  kind: 'preference' | 'decision' | 'context_fact' | 'avoid'
  content: string
  confidence: number
  created_at: string
}

const KIND_COLORS: Record<MiaMemory['kind'], string> = {
  preference: '#6366f1',
  decision: '#10b981',
  context_fact: '#f59e0b',
  avoid: '#ef4444',
}

export default function MiaMemoryPage() {
  const [brandId, setBrandId] = useState<string | null>(null)
  const [memories, setMemories] = useState<MiaMemory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch('/api/brands/me')
        if (res.ok) {
          const data = await res.json()
          if (data.brandId) setBrandId(data.brandId)
        }
      } catch { /* ignore */ }
    }
    init()
  }, [])

  useEffect(() => {
    if (!brandId) return
    async function load() {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/mia/memory?brandId=${brandId}`)
        if (res.ok) {
          const data = await res.json()
          setMemories(data.memories ?? [])
        }
      } finally { setIsLoading(false) }
    }
    load()
  }, [brandId])

  async function handleDelete(memoryId: string) {
    if (!brandId || deletingId) return
    setDeletingId(memoryId)
    setDeleteError(null)
    try {
      const res = await fetch('/api/mia/memory', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, memoryId }),
      })
      if (res.ok) {
        setMemories((prev) => prev.filter((m) => m.id !== memoryId))
      } else {
        setDeleteError("Couldn't delete that memory. Try again.")
      }
    } catch {
      setDeleteError("Couldn't delete that memory. Try again.")
    } finally { setDeletingId(null) }
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-white/[0.04]" />
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-[#6366f1]/15 flex items-center justify-center">
          <Brain className="w-4 h-4 text-[#6366f1]" />
        </div>
        <div>
          <h2 className="font-heading font-semibold text-lg text-foreground">Mia&apos;s Memory</h2>
          <p className="text-xs text-muted-foreground">Durable facts Mia remembers about you and the brand, across sessions.</p>
        </div>
      </div>

      {deleteError && (
        <div
          role="alert"
          className="rounded-lg border border-[#ef4444]/30 bg-[#ef4444]/10 px-3 py-2 text-xs text-[#ef4444]"
        >
          {deleteError}
        </div>
      )}

      {memories.length === 0 ? (
        <Card className="glass-panel">
          <CardContent className="py-10 text-center">
            <Brain className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No memories yet. Tell Mia about your preferences or constraints in chat — she&apos;ll remember them here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {memories.map((m) => (
            <Card key={m.id} className="glass-panel">
              <CardContent className="py-3 px-4 flex items-start gap-3">
                <span
                  className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 mt-0.5"
                  style={{ background: `${KIND_COLORS[m.kind]}22`, color: KIND_COLORS[m.kind] }}
                >
                  {m.kind}
                </span>
                <p className="flex-1 text-sm text-foreground/90">{m.content}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(m.id)}
                  disabled={deletingId === m.id}
                  aria-label={`Delete memory: ${m.content.slice(0, 60)}`}
                  className="shrink-0 text-muted-foreground hover:text-[#ef4444]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

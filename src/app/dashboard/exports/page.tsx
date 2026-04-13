'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Download, FileJson, CheckSquare, Square } from 'lucide-react'

interface SkillRun {
  id: string
  skill_name: string
  agent: string
  status: string
  created_at: string
  output: Record<string, unknown> | null
  credits_used: number
}

export default function ExportsPage() {
  const [runs, setRuns] = useState<SkillRun[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function fetchRuns() {
      try {
        // 1. Resolve brand ID via API (bypasses RLS)
        let brandId: string | null =
          sessionStorage.getItem('onboarding_brand_id') ||
          localStorage.getItem('growth_os_brand_id')

        if (!brandId) {
          const res = await fetch('/api/brands/me')
          if (res.ok) {
            const data = await res.json()
            if (data.brandId) {
              brandId = data.brandId as string
              localStorage.setItem('growth_os_brand_id', brandId)
              sessionStorage.setItem('onboarding_brand_id', brandId)
            }
          }
        }

        if (!brandId) {
          setLoading(false)
          return
        }

        // 2. Fetch skill runs through API route (bypasses RLS circular dependency)
        const res = await fetch(`/api/exports/runs?brandId=${brandId}`)
        if (res.ok) {
          const data = await res.json()
          setRuns((data.runs ?? []) as SkillRun[])
        }
      } catch (err) {
        console.error('[ExportsPage] fetchRuns error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchRuns()
  }, [])

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function exportSingle(run: SkillRun) {
    const blob = new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${run.skill_name}-${run.id.slice(0, 8)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function generateReport() {
    const selectedRuns = runs.filter((r) => selected.has(r.id))
    const report = {
      generated_at: new Date().toISOString(),
      total_runs: selectedRuns.length,
      total_credits: selectedRuns.reduce((sum, r) => sum + (r.credits_used || 0), 0),
      runs: selectedRuns,
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `growth-os-report-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">
            Exports
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Download individual skill runs or generate combined reports.
          </p>
        </div>
        {selected.size > 0 && (
          <Button
            onClick={generateReport}
            className="gap-2 bg-[#6366f1] hover:bg-[#4f52d4] text-white font-semibold"
          >
            <FileJson className="w-4 h-4" />
            Generate Report ({selected.size})
          </Button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="glass-panel rounded-xl p-4 animate-pulse">
              <div className="h-5 w-48 rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {/* Runs list */}
      {!loading && runs.length > 0 && (
        <div className="space-y-3">
          {runs.map((run) => {
            const isSelected = selected.has(run.id)
            return (
              <div
                key={run.id}
                className={`glass-panel rounded-xl p-4 flex items-center gap-4 transition-all duration-200 ${
                  isSelected ? 'ring-1 ring-[#6366f1]/40' : ''
                }`}
              >
                {/* Select checkbox */}
                <button
                  onClick={() => toggleSelect(run.id)}
                  className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  {isSelected ? (
                    <CheckSquare className="w-5 h-5 text-[#6366f1]" />
                  ) : (
                    <Square className="w-5 h-5" />
                  )}
                </button>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-heading font-semibold text-sm text-foreground">
                      {run.skill_name}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px]"
                    >
                      {run.agent}
                    </Badge>
                    <Badge
                      className={
                        run.status === 'completed'
                          ? 'bg-[#10b981]/15 text-[#10b981] border-[#10b981]/30 text-[10px]'
                          : 'bg-[#f97316]/15 text-[#f97316] border-[#f97316]/30 text-[10px]'
                      }
                    >
                      {run.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(run.created_at).toLocaleString()} &middot; {run.credits_used} credits
                  </p>
                </div>

                {/* Export button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportSingle(run)}
                  className="gap-1.5 border-border/60 shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export
                </Button>
              </div>
            )
          })}
        </div>
      )}

      {!loading && runs.length === 0 && (
        <div className="glass-panel rounded-2xl p-12 text-center">
          <FileJson className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">
            No skill runs yet. Run some skills to see exportable data here.
          </p>
        </div>
      )}
    </div>
  )
}

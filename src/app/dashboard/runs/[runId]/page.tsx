'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Download, Play, Clock, Cpu, Zap } from 'lucide-react'

interface SkillRun {
  id: string
  skill_name: string
  agent: string
  model_used: string
  tier: string
  credits_used: number
  duration_ms: number
  triggered_by: string
  created_at: string
  status: string
  output: Record<string, unknown> | null
  input: Record<string, unknown> | null
}

export default function SkillRunDetailPage() {
  const params = useParams()
  const router = useRouter()
  const runId = params.runId as string

  const [run, setRun] = useState<SkillRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rerunning, setRerunning] = useState(false)

  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    async function fetchRun() {
      const { data, error: fetchError } = await supabase
        .from('skill_runs')
        .select('*')
        .eq('id', runId)
        .single()

      if (fetchError) {
        setError(fetchError.message)
      } else {
        setRun(data as SkillRun)
      }
      setLoading(false)
    }
    fetchRun()
  }, [runId, supabase])

  async function handleRerun() {
    if (!run) return
    setRerunning(true)
    try {
      const res = await fetch('/api/skills/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillName: run.skill_name,
          agent: run.agent,
          input: run.input,
        }),
      })
      const data = await res.json()
      if (data.runId) {
        router.push(`/dashboard/runs/${data.runId}`)
      }
    } catch {
      // non-blocking
    } finally {
      setRerunning(false)
    }
  }

  function handleExport() {
    if (!run) return
    const blob = new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `skill-run-${run.id.slice(0, 8)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="glass-panel rounded-2xl p-6 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-5 rounded bg-muted" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !run) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
        <div className="glass-panel rounded-2xl p-8 text-center">
          <p className="text-destructive text-sm">{error ?? 'Skill run not found.'}</p>
        </div>
      </div>
    )
  }

  const metaRows = [
    { label: 'Skill', value: run.skill_name, icon: <Zap className="w-4 h-4 text-[#6366f1]" /> },
    { label: 'Agent', value: run.agent },
    { label: 'Model', value: run.model_used, icon: <Cpu className="w-4 h-4 text-[#8b5cf6]" /> },
    { label: 'Tier', value: run.tier },
    { label: 'Credits Used', value: String(run.credits_used) },
    { label: 'Duration', value: run.duration_ms ? `${run.duration_ms}ms` : '-', icon: <Clock className="w-4 h-4 text-[#f97316]" /> },
    { label: 'Triggered By', value: run.triggered_by },
    { label: 'Created At', value: new Date(run.created_at).toLocaleString() },
    { label: 'Status', value: run.status },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">
              {run.skill_name}
            </h1>
            <p className="text-sm text-muted-foreground font-mono">
              {run.id}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="gap-2 border-border/60"
          >
            <Download className="w-4 h-4" />
            Export JSON
          </Button>
          <Button
            size="sm"
            onClick={handleRerun}
            disabled={rerunning}
            className="gap-2 bg-[#6366f1] hover:bg-[#4f52d4] text-white"
          >
            <Play className="w-4 h-4" />
            {rerunning ? 'Re-running...' : 'Re-run'}
          </Button>
        </div>
      </div>

      {/* Status badge */}
      <Badge
        className={
          run.status === 'completed'
            ? 'bg-[#10b981]/15 text-[#10b981] border-[#10b981]/30'
            : run.status === 'failed'
              ? 'bg-destructive/15 text-destructive border-destructive/30'
              : 'bg-[#f97316]/15 text-[#f97316] border-[#f97316]/30'
        }
      >
        {run.status}
      </Badge>

      {/* Metadata table */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border/30">
          <h2 className="font-heading font-semibold text-sm text-foreground">
            Run Metadata
          </h2>
        </div>
        <div className="divide-y divide-border/20">
          {metaRows.map(({ label, value, icon }) => (
            <div key={label} className="flex items-center justify-between px-6 py-3">
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                {icon}
                {label}
              </span>
              <span className="text-sm text-foreground font-medium">
                {value || '-'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Output */}
      {run.output && (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border/30">
            <h2 className="font-heading font-semibold text-sm text-foreground">
              Output
            </h2>
          </div>
          <div className="p-6">
            <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap break-words bg-black/20 rounded-xl p-4 max-h-96 overflow-y-auto">
              {JSON.stringify(run.output, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Input */}
      {run.input && (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border/30">
            <h2 className="font-heading font-semibold text-sm text-foreground">
              Input
            </h2>
          </div>
          <div className="p-6">
            <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap break-words bg-black/20 rounded-xl p-4 max-h-96 overflow-y-auto">
              {JSON.stringify(run.input, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

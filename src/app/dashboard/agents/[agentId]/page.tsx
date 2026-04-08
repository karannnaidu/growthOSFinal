'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Play, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentConfig {
  id: string
  name: string
  role: string
  color: string
  description: string
  skills: string[]
  is_manager: boolean
  schedule: string | null
}

interface SkillRun {
  id: string
  skill_name: string
  status: 'completed' | 'failed' | 'running'
  output: Record<string, unknown> | string | null
  model_used: string | null
  credits_used: number | null
  duration_ms: number | null
  created_at: string
  triggered_by: string | null
  error: string | null
}

interface BrandAgentConfig {
  enabled: boolean
  autoApprove: boolean
  revealed: boolean
}

// ---------------------------------------------------------------------------
// Complexity map — matches skill-loader.ts
// ---------------------------------------------------------------------------

const COMPLEXITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  free:    { label: 'Free',    color: '#10b981', bg: '#10b98118' },
  cheap:   { label: 'Cheap',   color: '#3b82f6', bg: '#3b82f618' },
  mid:     { label: 'Mid',     color: '#f59e0b', bg: '#f59e0b18' },
  premium: { label: 'Premium', color: '#e11d48', bg: '#e11d4818' },
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    completed: { label: 'Completed', color: '#10b981', bg: '#10b98118' },
    failed:    { label: 'Failed',    color: '#e11d48', bg: '#e11d4818' },
    running:   { label: 'Running',   color: '#f59e0b', bg: '#f59e0b18' },
  }
  const s = map[status] ?? { label: status, color: '#64748b', bg: '#64748b18' }
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ color: s.color, background: s.bg }}
    >
      {s.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Format duration
// ---------------------------------------------------------------------------

function formatDuration(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// ---------------------------------------------------------------------------
// Format time
// ---------------------------------------------------------------------------

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
// Toggle switch
// ---------------------------------------------------------------------------

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none',
        checked ? 'bg-[#6366f1]' : 'bg-white/20',
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200',
          checked ? 'translate-x-4' : 'translate-x-0',
        )}
      />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AgentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const agentId = params.agentId as string

  const [agent, setAgent] = useState<AgentConfig | null>(null)
  const [recentRuns, setRecentRuns] = useState<SkillRun[]>([])
  const [agentCfg, setAgentCfg] = useState<BrandAgentConfig>({
    enabled: true,
    autoApprove: false,
    revealed: true,
  })
  const [brandId, setBrandId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Per-skill run state
  const [runningSkill, setRunningSkill] = useState<string | null>(null)
  const [skillRunResult, setSkillRunResult] = useState<Record<string, string>>({})

  // Expanded run rows
  const [expandedRun, setExpandedRun] = useState<string | null>(null)

  // Config saving
  const [isSavingConfig, setIsSavingConfig] = useState(false)

  const supabase = createClient()

  // ---------------------------------------------------------------------------
  // Load data
  // ---------------------------------------------------------------------------

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      setError(null)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Not authenticated'); setIsLoading(false); return }

      // Resolve brand
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

      const res = await fetch(`/api/agents/${agentId}?brandId=${bid}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        setError(body.error ?? 'Failed to load agent')
        setIsLoading(false)
        return
      }

      const json = await res.json() as {
        agent: AgentConfig
        recentRuns: SkillRun[]
        config: BrandAgentConfig
      }
      setAgent(json.agent)
      setRecentRuns(json.recentRuns ?? [])
      setAgentCfg(json.config)
      setIsLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId])

  // ---------------------------------------------------------------------------
  // Run a skill
  // ---------------------------------------------------------------------------

  const handleRunSkill = useCallback(async (skillId: string) => {
    if (!brandId || runningSkill) return
    setRunningSkill(skillId)
    setSkillRunResult((prev) => ({ ...prev, [skillId]: '' }))

    try {
      const res = await fetch('/api/skills/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ skillId, brandId }),
      })
      const json = await res.json() as { success: boolean; data?: { status: string }; error?: { message: string } }
      if (!res.ok || !json.success) {
        setSkillRunResult((prev) => ({ ...prev, [skillId]: json.error?.message ?? 'Run failed' }))
      } else {
        setSkillRunResult((prev) => ({ ...prev, [skillId]: json.data?.status === 'completed' ? 'Done' : 'Ran' }))
      }
    } catch {
      setSkillRunResult((prev) => ({ ...prev, [skillId]: 'Error' }))
    } finally {
      setRunningSkill(null)
    }
  }, [brandId, runningSkill])

  // ---------------------------------------------------------------------------
  // Update config
  // ---------------------------------------------------------------------------

  async function updateConfig(patch: Partial<BrandAgentConfig>) {
    if (!brandId) return
    const next = { ...agentCfg, ...patch }
    setAgentCfg(next)
    setIsSavingConfig(true)
    await fetch(`/api/agents/${agentId}/config`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        brandId,
        enabled: next.enabled,
        autoApprove: next.autoApprove,
      }),
    })
    setIsSavingConfig(false)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        {/* Skeleton header */}
        <div className="glass-panel rounded-xl h-32 animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4">
            <div className="glass-panel rounded-xl h-64 animate-pulse" />
            <div className="glass-panel rounded-xl h-32 animate-pulse" />
          </div>
          <div className="lg:col-span-2 glass-panel rounded-xl h-64 animate-pulse" />
        </div>
      </div>
    )
  }

  if (error || !agent) {
    return (
      <div className="glass-panel rounded-xl p-10 text-center space-y-4 animate-fade-in">
        <p className="text-sm text-destructive">{error ?? 'Agent not found'}</p>
        <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/agents')}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Agents
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Back link */}
      <button
        type="button"
        onClick={() => router.push('/dashboard/agents')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        All Agents
      </button>

      {/* Profile Header */}
      <div
        className="glass-panel p-6 flex items-start gap-5 rounded-xl"
        style={{ borderTop: `3px solid ${agent.color}` }}
      >
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold text-white"
          style={{ background: agent.color }}
          aria-hidden="true"
        >
          {agent.name[0]}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-heading font-bold text-foreground">{agent.name}</h1>
          <p className="text-muted-foreground text-sm">{agent.role}</p>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{agent.description}</p>
          {agent.schedule && (
            <p className="mt-2 text-xs text-muted-foreground opacity-60">
              Scheduled: <code className="font-mono">{agent.schedule}</code>
            </p>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Skills + Config */}
        <div className="lg:col-span-1 space-y-6">
          {/* Skills */}
          <div className="glass-panel rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06]">
              <h2 className="text-sm font-heading font-semibold text-foreground">
                Skills
                <span
                  className="ml-2 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                  style={{ background: `${agent.color}18`, color: agent.color }}
                >
                  {agent.skills.length}
                </span>
              </h2>
            </div>
            <ul className="divide-y divide-white/[0.04]">
              {agent.skills.map((skillId) => {
                const isRunning = runningSkill === skillId
                const result = skillRunResult[skillId]
                return (
                  <li key={skillId} className="flex items-center justify-between px-4 py-3 gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate">{skillId}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {result && (
                        <span
                          className={cn(
                            'text-[10px]',
                            result === 'Done' || result === 'Ran'
                              ? 'text-[#10b981]'
                              : 'text-destructive',
                          )}
                        >
                          {result}
                        </span>
                      )}
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={isRunning || !!runningSkill || !agentCfg.enabled}
                        onClick={() => handleRunSkill(skillId)}
                        aria-label={`Run ${skillId}`}
                      >
                        {isRunning ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Play className="h-3 w-3" />
                        )}
                        {isRunning ? 'Running' : 'Run'}
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* Config toggles */}
          <div className="glass-panel rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <h2 className="text-sm font-heading font-semibold text-foreground">Configuration</h2>
              {isSavingConfig && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="divide-y divide-white/[0.04]">
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-xs font-medium text-foreground">Enabled</p>
                  <p className="text-[10px] text-muted-foreground">Allow this agent to run skills</p>
                </div>
                <Toggle
                  label="Enable agent"
                  checked={agentCfg.enabled}
                  onChange={(v) => updateConfig({ enabled: v })}
                />
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-xs font-medium text-foreground">Auto-approve</p>
                  <p className="text-[10px] text-muted-foreground">Skip review for scheduled runs</p>
                </div>
                <Toggle
                  label="Auto-approve skill runs"
                  checked={agentCfg.autoApprove}
                  onChange={(v) => updateConfig({ autoApprove: v })}
                  disabled={!agentCfg.enabled}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right column: Recent runs */}
        <div className="lg:col-span-2">
          <div className="glass-panel rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06]">
              <h2 className="text-sm font-heading font-semibold text-foreground">Recent Runs</h2>
            </div>

            {recentRuns.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-xs text-muted-foreground">
                  No skill runs yet for this agent.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {recentRuns.map((run) => {
                  const isExpanded = expandedRun === run.id
                  return (
                    <div key={run.id} className="px-4 py-3">
                      {/* Row */}
                      <button
                        type="button"
                        className="w-full flex items-center gap-3 text-left"
                        onClick={() => setExpandedRun(isExpanded ? null : run.id)}
                        aria-expanded={isExpanded}
                      >
                        <div className="min-w-0 flex-1 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 items-center">
                          {/* Skill name */}
                          <p className="text-xs font-medium text-foreground truncate col-span-2 sm:col-span-1">
                            {run.skill_name ?? run.id}
                          </p>
                          {/* Status */}
                          <div className="flex items-center">
                            <StatusBadge status={run.status} />
                          </div>
                          {/* Model + credits */}
                          <p className="text-[10px] text-muted-foreground hidden sm:block truncate">
                            {run.model_used ?? '—'}
                            {run.credits_used != null && ` · ${run.credits_used}cr`}
                          </p>
                          {/* Time */}
                          <p className="text-[10px] text-muted-foreground hidden sm:block">
                            {formatDuration(run.duration_ms)} · {timeAgo(run.created_at)}
                          </p>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                      </button>

                      {/* Expanded output */}
                      {isExpanded && (
                        <div className="mt-3 rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
                          {run.error ? (
                            <p className="text-xs text-destructive font-mono break-all">{run.error}</p>
                          ) : (
                            <pre className="text-[10px] text-muted-foreground font-mono whitespace-pre-wrap break-all line-clamp-[20] overflow-auto max-h-60">
                              {run.output
                                ? JSON.stringify(run.output, null, 2).slice(0, 2000)
                                : 'No output'}
                            </pre>
                          )}
                          <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground border-t border-white/[0.06] pt-2">
                            {run.model_used && <span>Model: {run.model_used}</span>}
                            {run.credits_used != null && <span>Credits: {run.credits_used}</span>}
                            {run.duration_ms != null && <span>Duration: {formatDuration(run.duration_ms)}</span>}
                            {run.triggered_by && <span>By: {run.triggered_by}</span>}
                            <span>{new Date(run.created_at).toLocaleString()}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

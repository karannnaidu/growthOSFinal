'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AgentHero } from '@/components/agents/agent-hero'
import { SkillCard } from '@/components/agents/skill-card'
import { AgentOutput } from '@/components/agents/agent-output'
import { MiaControl } from '@/components/agents/mia-control'
import { AgentActivity } from '@/components/agents/agent-activity'
import type { AgentConfig } from '@/lib/agents-data'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkillRun {
  id: string
  skill_id: string
  status: 'completed' | 'failed' | 'running'
  output: Record<string, unknown> | string | null
  model_used: string | null
  credits_used: number | null
  duration_ms: number | null
  created_at: string
  triggered_by: string | null
  error_message: string | null
}

interface BrandAgentConfig {
  enabled: boolean
  autoApprove: boolean
  revealed: boolean
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
// Format helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number | null): string {
  if (ms == null) return '\u2014'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
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

  // Config saving + config panel visibility
  const [isSavingConfig, setIsSavingConfig] = useState(false)
  const [showConfig, setShowConfig] = useState(false)

  // Setup state
  const [setupState, setSetupState] = useState<{
    hasSetup: boolean
    state: 'inactive' | 'collecting' | 'ready'
    status: Array<{ key: string; label: string; type: string; required: boolean; met: boolean; value?: unknown }>
    chatPrompt: string | null
    allRequiredMet: boolean
  } | null>(null)

  // Setup form state
  const [setupValues, setSetupValues] = useState<Record<string, string>>({})
  const [savingSetup, setSavingSetup] = useState(false)

  // Mia's latest decision for this agent
  const [latestMiaDecision, setLatestMiaDecision] = useState<{ decision: string; reasoning: string } | null>(null)

  const supabase = createClient()

  // ---------------------------------------------------------------------------
  // Load data
  // ---------------------------------------------------------------------------

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      setError(null)

      // Resolve brand
      let bid: string | null = null
      const stored = sessionStorage.getItem('onboarding_brand_id') || localStorage.getItem('growth_os_brand_id')
      if (stored) {
        bid = stored
      } else {
        try {
          const res = await fetch('/api/brands/me')
          if (res.ok) {
            const data = await res.json()
            if (data.brandId) {
              bid = data.brandId
              localStorage.setItem('growth_os_brand_id', data.brandId)
            }
          }
        } catch { /* ignore */ }
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
  // Fetch setup state
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!brandId || !agentId) return
    fetch(`/api/agents/${agentId}/setup?brandId=${brandId}`)
      .then(r => r.json())
      .then(data => setSetupState(data))
      .catch(() => {})
  }, [brandId, agentId])

  // ---------------------------------------------------------------------------
  // Fetch Mia's latest decision for this agent
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!brandId || !agentId) return
    fetch(`/api/dashboard/context?brandId=${brandId}`)
      .then(r => r.json())
      .then(ctx => {
        const decision = (ctx.miaDecisions as Array<{ decision: string; reasoning: string; target_agent?: string }>)
          ?.find(d => d.target_agent === agentId)
        if (decision) setLatestMiaDecision(decision)
      })
      .catch(() => {})
  }, [brandId, agentId])

  // ---------------------------------------------------------------------------
  // Save setup data
  // ---------------------------------------------------------------------------

  async function handleSaveSetupData() {
    if (!brandId) return
    setSavingSetup(true)
    try {
      const entries = Object.entries(setupValues)
        .filter(([, v]) => v.trim())
        .map(([key, value]) => ({ key, value }))

      const res = await fetch(`/api/agents/${agentId}/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, entries }),
      })
      if (res.ok) {
        const updated = await res.json()
        setSetupState(prev => prev ? { ...prev, ...updated } : null)
        setSetupValues({})
      }
    } finally {
      setSavingSetup(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Run a skill
  // ---------------------------------------------------------------------------

  // Refetch recent runs for this agent
  const refreshRuns = useCallback(async () => {
    if (!brandId) return
    try {
      const res = await fetch(`/api/agents/${agentId}?brandId=${brandId}`)
      if (res.ok) {
        const json = await res.json() as { recentRuns: SkillRun[] }
        setRecentRuns(json.recentRuns ?? [])
      }
    } catch { /* ignore */ }
  }, [agentId, brandId])

  const handleRunSkill = useCallback((skillId: string) => {
    if (!brandId || runningSkill) return
    setRunningSkill(skillId)
    setSkillRunResult((prev) => ({ ...prev, [skillId]: '' }))
    // AgentActivity component handles the actual SSE execution
    // Completion is signalled via the onComplete callback from AgentActivity
  }, [brandId, runningSkill])

  const handleSkillComplete = useCallback(() => {
    setRunningSkill(null)
    refreshRuns()
  }, [refreshRuns])

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
  // Derive latest status from recent runs
  // ---------------------------------------------------------------------------

  const latestStatus = recentRuns[0]?.status ?? 'idle'

  // Latest output from most recent completed run
  const latestCompletedRun = recentRuns.find((r) => r.status === 'completed')

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="glass-panel rounded-xl h-40 animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="glass-panel rounded-xl h-48 animate-pulse" />
            <div className="glass-panel rounded-xl h-32 animate-pulse" />
          </div>
          <div className="space-y-4">
            <div className="glass-panel rounded-xl h-48 animate-pulse" />
          </div>
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
    <div className="space-y-6 animate-fade-in">
      {/* Back link */}
      <button
        type="button"
        onClick={() => router.push('/dashboard/agents')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        All Agents
      </button>

      {/* Hero */}
      <AgentHero
        agent={agent}
        status={latestStatus}
        onConfigure={() => setShowConfig((v) => !v)}
      />

      {/* Config panel (toggled by Configure button) */}
      {showConfig && (
        <div className="glass-panel rounded-xl overflow-hidden animate-fade-in">
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
      )}

      {/* Setup state determines the view */}
      {setupState && setupState.hasSetup && setupState.state !== 'ready' ? (
        // SETUP MODE
        <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-[#f97316]" />
            <h3 className="font-heading font-semibold text-sm text-foreground">Setup Required</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            {agent.name} needs some information before it can start working.
          </p>

          {/* Requirements checklist */}
          <div className="space-y-3">
            {setupState.status.map((req) => (
              <div key={req.key} className="flex items-start gap-3 rounded-lg bg-white/5 p-3">
                <span className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                  req.met ? 'bg-[#10b981]/20 text-[#10b981]' : 'bg-white/10 text-muted-foreground'
                }`}>
                  {req.met ? '\u2713' : '\u25CB'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{req.label}</p>
                  {req.type === 'connection' && !req.met && (
                    <a href="/dashboard/settings/platforms" className="text-xs text-[#6366f1] hover:underline">
                      Connect in Settings &rarr;
                    </a>
                  )}
                  {req.type !== 'connection' && !req.met && (
                    <input
                      type={req.type === 'number' ? 'number' : 'text'}
                      value={setupValues[req.key] ?? ''}
                      onChange={(e) => setSetupValues(prev => ({ ...prev, [req.key]: e.target.value }))}
                      placeholder={`Enter ${req.label.toLowerCase()}`}
                      className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-[#6366f1]/40 focus:outline-none"
                    />
                  )}
                  {req.met && req.value != null && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {typeof req.value === 'object' ? JSON.stringify((req.value as Record<string, unknown>).value ?? req.value) : String(req.value)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Save button */}
          {Object.values(setupValues).some(v => v.trim()) && (
            <button
              onClick={handleSaveSetupData}
              disabled={savingSetup}
              className="rounded-lg bg-[#6366f1] px-4 py-2 text-sm font-medium text-white hover:bg-[#6366f1]/80 disabled:opacity-50"
            >
              {savingSetup ? 'Saving...' : 'Save & Continue'}
            </button>
          )}

          {/* Chat option */}
          {setupState.chatPrompt && (
            <div className="pt-2 border-t border-white/[0.06]">
              <a
                href={`/dashboard/chat?agent=${agentId}`}
                className="text-xs text-[#6366f1] hover:underline flex items-center gap-1"
              >
                Or chat with {agent.name} to provide data conversationally
              </a>
            </div>
          )}
        </div>
      ) : null}

      {/* Active / no-setup content */}
      {(!setupState || !setupState.hasSetup || setupState.state === 'ready') && (
        <>
          {/* Mia's latest decision */}
          {latestMiaDecision && (
            <div className="glass-panel rounded-2xl p-5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Mia&apos;s Latest</p>
              <p className="text-sm text-foreground/80">{latestMiaDecision.reasoning}</p>
              <span className={`inline-block mt-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                latestMiaDecision.decision === 'auto_run' ? 'bg-[#10b981]/15 text-[#10b981]' :
                latestMiaDecision.decision === 'blocked' ? 'bg-[#ef4444]/15 text-[#ef4444]' :
                latestMiaDecision.decision === 'needs_review' ? 'bg-[#f97316]/15 text-[#f97316]' :
                'bg-white/10 text-muted-foreground'
              }`}>
                {latestMiaDecision.decision.replace('_', ' ')}
              </span>
              {/* Missing platforms — show connect buttons */}
              {latestMiaDecision.reasoning?.includes('Missing platform') && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {latestMiaDecision.reasoning.includes('shopify') && (
                    <a href="/dashboard/settings/platforms" className="text-[10px] bg-[#96bf48]/15 text-[#96bf48] rounded-full px-3 py-1 hover:bg-[#96bf48]/25 transition-colors">
                      Connect Shopify →
                    </a>
                  )}
                  {latestMiaDecision.reasoning.includes('ga4') && (
                    <a href="/dashboard/settings/platforms" className="text-[10px] bg-[#4285f4]/15 text-[#4285f4] rounded-full px-3 py-1 hover:bg-[#4285f4]/25 transition-colors">
                      Connect Google Analytics →
                    </a>
                  )}
                  {latestMiaDecision.reasoning.includes('meta') && (
                    <a href="/dashboard/settings/platforms" className="text-[10px] bg-[#1877f2]/15 text-[#1877f2] rounded-full px-3 py-1 hover:bg-[#1877f2]/25 transition-colors">
                      Connect Meta Ads →
                    </a>
                  )}
                  {latestMiaDecision.reasoning.includes('klaviyo') && (
                    <a href="/dashboard/settings/platforms" className="text-[10px] bg-[#1b4f72]/15 text-[#1b4f72] rounded-full px-3 py-1 hover:bg-[#1b4f72]/25 transition-colors">
                      Connect Klaviyo →
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Main content: 2-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Skills grid + Recent output */}
            <div className="lg:col-span-2 space-y-6">
              {/* Skills grid */}
              <div className="space-y-3">
                <h2 className="text-sm font-heading font-semibold text-foreground flex items-center gap-2">
                  Skills
                  <span
                    className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ background: `${agent.color}18`, color: agent.color }}
                  >
                    {agent.skills.length}
                  </span>
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {agent.skills.map((skillId) => {
                    const lastRunForSkill = recentRuns.find((r) => r.skill_id === skillId)
                    return (
                      <SkillCard
                        key={skillId}
                        skillId={skillId}
                        agentColor={agent.color}
                        lastRun={lastRunForSkill ? timeAgo(lastRunForSkill.created_at) : undefined}
                        isRunning={runningSkill === skillId}
                        onRun={() => handleRunSkill(skillId)}
                      />
                    )
                  })}
                </div>
                {/* Skill run results */}
                {Object.entries(skillRunResult).some(([, v]) => v) && (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(skillRunResult)
                      .filter(([, v]) => v)
                      .map(([skillId, result]) => (
                        <span
                          key={skillId}
                          className={cn(
                            'text-[10px] px-2 py-0.5 rounded-full',
                            result === 'Done' || result === 'Ran'
                              ? 'bg-[#10b98118] text-[#10b981]'
                              : 'bg-[#e11d4818] text-destructive',
                          )}
                        >
                          {skillId}: {result}
                        </span>
                      ))}
                  </div>
                )}
              </div>

              {/* Live activity terminal when skill is running */}
              {runningSkill && brandId && (
                <AgentActivity brandId={brandId} agentId={agentId} skillId={runningSkill} onComplete={handleSkillComplete} />
              )}

              {/* Recent output */}
              <div className="glass-panel rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-white/[0.06]">
                  <h2 className="text-sm font-heading font-semibold text-foreground">Latest Output</h2>
                </div>
                <div className="p-4">
                  <AgentOutput
                    agentId={agent.id}
                    output={latestCompletedRun?.output ?? null}
                  />
                </div>
              </div>

              {/* Recent runs history */}
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
                          <button
                            type="button"
                            className="w-full flex items-center gap-3 text-left"
                            onClick={() => setExpandedRun(isExpanded ? null : run.id)}
                            aria-expanded={isExpanded}
                          >
                            <div className="min-w-0 flex-1 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 items-center">
                              <p className="text-xs font-medium text-foreground truncate col-span-2 sm:col-span-1">
                                {run.skill_id ?? run.id}
                              </p>
                              <div className="flex items-center">
                                <StatusBadge status={run.status} />
                              </div>
                              <p className="text-[10px] text-muted-foreground hidden sm:block truncate">
                                {run.model_used ?? '\u2014'}
                                {run.credits_used != null && ` \u00b7 ${run.credits_used}cr`}
                              </p>
                              <p className="text-[10px] text-muted-foreground hidden sm:block">
                                {formatDuration(run.duration_ms)} \u00b7 {timeAgo(run.created_at)}
                              </p>
                            </div>
                            {isExpanded ? (
                              <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                          </button>

                          {isExpanded && (
                            <div className="mt-3 rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
                              {run.error_message ? (
                                <p className="text-xs text-destructive font-mono break-all">{run.error_message}</p>
                              ) : (
                                <AgentOutput agentId={agent.id} output={run.output} />
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

            {/* Right column: Mia control */}
            <div className="lg:col-span-1 space-y-6">
              <MiaControl
                agentId={agent.id}
                agentName={agent.name}
                brandId={brandId ?? ''}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

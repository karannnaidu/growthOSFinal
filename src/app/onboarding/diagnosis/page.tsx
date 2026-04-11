'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, ArrowLeft, ArrowRight, AlertTriangle, CheckCircle2, Zap, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AgentAvatar } from '@/components/agents/agent-avatar'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LogLine {
  ts: string
  msg: string
  level: 'info' | 'warn' | 'ok' | 'error'
}

interface Finding {
  label: string
  detail: string
  level: 'ok' | 'warn' | 'error'
  score?: string
}

interface DiagnosisResult {
  summary: string
  findings: Finding[]
  scores: { label: string; value: number }[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ts() {
  return new Date().toLocaleTimeString('en-US', { hour12: false })
}

/** Parse the skill run output into structured findings */
function parseSkillOutput(output: Record<string, unknown>): DiagnosisResult {
  // The health-check skill returns JSON with varying shapes — extract what we can
  const summary =
    (output.summary as string) ||
    (output.executive_summary as string) ||
    (output.content as string)?.slice(0, 300) ||
    'Diagnosis complete. Review findings below.'

  const findings: Finding[] = []
  const scores: { label: string; value: number }[] = []

  // Try to extract structured findings
  const rawFindings = (output.findings || output.issues || output.recommendations || []) as Record<string, unknown>[]
  if (Array.isArray(rawFindings)) {
    for (const f of rawFindings.slice(0, 6)) {
      findings.push({
        label: (f.title || f.label || f.name || 'Finding') as string,
        detail: (f.detail || f.description || f.message || '') as string,
        level: f.severity === 'high' || f.severity === 'critical' ? 'error'
          : f.severity === 'medium' || f.severity === 'warning' ? 'warn' : 'ok',
        score: f.score != null ? String(f.score) : undefined,
      })
    }
  }

  // Try to extract scores
  const rawScores = (output.scores || output.metrics || {}) as Record<string, unknown>
  if (typeof rawScores === 'object' && !Array.isArray(rawScores)) {
    for (const [key, val] of Object.entries(rawScores)) {
      if (typeof val === 'number') {
        scores.push({ label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), value: val })
      }
    }
  }

  // If the LLM returned flat key/value scores at top level
  for (const key of ['data_integrity', 'brand_coherence', 'channel_health', 'overall_score', 'health_score']) {
    if (typeof output[key] === 'number') {
      scores.push({ label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), value: output[key] as number })
    }
  }

  return { summary, findings: findings.slice(0, 6), scores: scores.slice(0, 4) }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DiagnosisPage() {
  const router = useRouter()
  const [logs, setLogs] = useState<LogLine[]>([])
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<'no-brand' | 'running' | 'done' | 'error'>('running')
  const [result, setResult] = useState<DiagnosisResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const hasStarted = useRef(false)

  const addLog = useCallback((msg: string, level: LogLine['level'] = 'info') => {
    setLogs(prev => [...prev, { ts: ts(), msg, level }])
  }, [])

  // Poll skill run status
  const pollRun = useCallback(async (brandId: string, runId: string) => {
    const maxAttempts = 60 // 2 minutes at 2s intervals
    let attempts = 0

    const poll = async () => {
      attempts++
      try {
        const res = await fetch(`/api/skills/runs?brandId=${brandId}&limit=1`)
        if (!res.ok) throw new Error(`Status ${res.status}`)
        const data = await res.json()
        const runs = data.data?.runs || []
        const run = runs.find((r: Record<string, unknown>) => r.id === runId) || runs[0]

        if (!run) {
          if (attempts < maxAttempts) {
            setTimeout(poll, 2000)
          }
          return
        }

        if (run.status === 'completed') {
          setProgress(100)
          addLog('Health check complete.', 'ok')
          addLog(`Model: ${run.model_used} | Duration: ${run.duration_ms}ms | Credits: ${run.credits_used}`, 'info')

          const parsed = parseSkillOutput(run.output as Record<string, unknown>)
          setResult(parsed)
          setStatus('done')
        } else if (run.status === 'failed') {
          addLog(`Diagnosis failed: ${run.error_message || 'Unknown error'}`, 'error')
          setErrorMsg(run.error_message || 'The health check encountered an error.')
          setStatus('error')
        } else {
          // Still running
          setProgress(Math.min(90, 10 + attempts * 3))
          if (attempts % 5 === 0) {
            addLog('Still processing…', 'info')
          }
          if (attempts < maxAttempts) {
            setTimeout(poll, 2000)
          } else {
            addLog('Timed out waiting for results.', 'error')
            setErrorMsg('Diagnosis timed out. Check the Runs page for results.')
            setStatus('error')
          }
        }
      } catch {
        if (attempts < maxAttempts) {
          setTimeout(poll, 3000)
        }
      }
    }

    setTimeout(poll, 2000)
  }, [addLog])

  useEffect(() => {
    if (hasStarted.current) return
    hasStarted.current = true

    const brandId = sessionStorage.getItem('onboarding_brand_id')

    if (!brandId) {
      setStatus('no-brand')
      return
    }

    // Start the real diagnosis
    addLog('Initialising Scout health-check…', 'info')
    setProgress(5)

    fetch('/api/onboarding/diagnose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) {
          addLog(`Error: ${d.error}`, 'error')
          setErrorMsg(d.error)
          setStatus('error')
          return
        }

        addLog('Diagnosis request sent to Scout.', 'ok')
        setProgress(15)
        addLog('Connecting to store data sources…', 'info')

        if (d.skillRunId) {
          addLog(`Run ID: ${d.skillRunId.slice(0, 8)}…`, 'info')
          setProgress(25)
          addLog('Waiting for AI analysis…', 'info')
          pollRun(brandId, d.skillRunId)
        } else {
          // No skill run ID — engine may be unavailable
          addLog('Skill engine returned no run ID.', 'warn')
          addLog('The skill engine may not be configured yet.', 'warn')
          setErrorMsg('Could not start diagnosis. Ensure AI keys are configured in Settings.')
          setStatus('error')
        }
      })
      .catch(err => {
        addLog(`Network error: ${err.message}`, 'error')
        setErrorMsg('Failed to reach the diagnosis API.')
        setStatus('error')
      })
  }, [addLog, pollRun])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // ---------------------------------------------------------------------------
  // No brand — skipped onboarding
  // ---------------------------------------------------------------------------

  if (status === 'no-brand') {
    return (
      <div className="w-full max-w-2xl animate-slide-up text-center">
        <div className="flex justify-center mb-6">
          <div style={{ filter: 'drop-shadow(0 0 15px rgba(99,102,241,0.3))' }}>
            <AgentAvatar agentId="mia" size="lg" />
          </div>
        </div>
        <h1 className="font-heading font-bold text-3xl sm:text-4xl text-foreground mb-4 tracking-tight">
          No Store Connected
        </h1>
        <p className="text-muted-foreground text-base max-w-md mx-auto leading-relaxed mb-8">
          Mia needs a connected store to run a real diagnosis. Connect your Shopify store first, then Scout can analyse your actual data.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            onClick={() => router.push('/onboarding/connect-store')}
            className="gap-2 border-border/50 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Connect Store
          </Button>
          <Button
            onClick={() => router.push('/dashboard')}
            className="gap-2 bg-[#6366f1] hover:bg-[#5254cc] text-white font-semibold px-8"
          >
            Skip to Dashboard
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Running / Done / Error states
  // ---------------------------------------------------------------------------

  return (
    <div className="w-full max-w-4xl animate-slide-up">
      {/* Step badge */}
      <div className="flex justify-center mb-6">
        <span
          className="text-xs font-metric font-medium tracking-widest uppercase px-3 py-1 rounded-full border"
          style={{
            borderColor: 'oklch(1 0 0 / 15%)',
            color: 'oklch(0.65 0.02 243)',
            background: 'oklch(1 0 0 / 4%)',
          }}
        >
          Step 4 of 4
        </span>
      </div>

      {/* Heading with Mia avatar */}
      <div className="text-center mb-10">
        <div className="flex justify-center mb-4">
          <div style={{ filter: 'drop-shadow(0 0 15px rgba(99,102,241,0.3))' }}>
            <AgentAvatar agentId="mia" size="lg" state={status === 'running' ? 'working' : 'default'} />
          </div>
        </div>
        <h1 className="font-heading font-bold text-3xl sm:text-4xl md:text-5xl text-foreground mb-4 tracking-tight">
          {status === 'error' ? 'Diagnosis Issue' : "Mia\u2019s First Diagnosis"}
        </h1>
        <p className="text-muted-foreground text-base max-w-lg mx-auto leading-relaxed">
          {status === 'running'
            ? 'Scout is running your initial brand health check.'
            : status === 'done'
              ? 'Your diagnosis is ready.'
              : 'Something went wrong during the health check.'}
        </p>
      </div>

      {/* Split layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Left: Mia status + terminal */}
        <div className="glass-panel rounded-2xl p-6 space-y-4">
          {/* Agent header */}
          <div className="flex items-center gap-3">
            <AgentAvatar agentId="scout" size="sm" state={status === 'running' ? 'working' : 'default'} />
            <div>
              <p className="font-heading font-semibold text-sm text-foreground">Scout Diagnostician</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {status === 'running' ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#f97316] animate-pulse" />
                    Running health-check…
                  </>
                ) : status === 'done' ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
                    Diagnosis complete
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    Failed
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>Health check progress</span>
              <span className="font-metric">{progress}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progress}%`,
                  background: status === 'error'
                    ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                    : 'linear-gradient(90deg, #6366f1, #0d9488)',
                }}
              />
            </div>
          </div>

          {/* Terminal */}
          <div
            className="rounded-xl p-4 font-mono text-xs space-y-1.5 max-h-48 overflow-y-auto"
            style={{ background: 'oklch(0.12 0.03 243)', color: '#94a3b8' }}
          >
            {logs.map((line, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-[#475569] flex-shrink-0">{line.ts}</span>
                <span
                  className={
                    line.level === 'ok'
                      ? 'text-[#10b981]'
                      : line.level === 'warn'
                        ? 'text-[#f97316]'
                        : line.level === 'error'
                          ? 'text-red-400'
                          : 'text-[#94a3b8]'
                  }
                >
                  {line.msg}
                </span>
              </div>
            ))}
            {status === 'running' && (
              <div className="flex gap-2">
                <span className="text-[#475569]" suppressHydrationWarning>{ts()}</span>
                <span className="text-[#6366f1] animate-pulse">█</span>
              </div>
            )}
            <div ref={logsEndRef} />
          </div>
        </div>

        {/* Right: Results */}
        <div className="space-y-4">
          {/* Summary */}
          <div className="glass-panel rounded-2xl p-6">
            <div className="flex items-start gap-3 mb-4">
              {status === 'error' ? (
                <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
              ) : (
                <Sparkles className="w-5 h-5 text-[#6366f1] mt-0.5 flex-shrink-0" />
              )}
              <div>
                <p className="font-heading font-semibold text-sm text-foreground mb-1">
                  {status === 'error' ? 'Error' : status === 'done' ? 'Summary' : 'Analysing…'}
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {status === 'error'
                    ? errorMsg
                    : status === 'done' && result
                      ? result.summary
                      : 'Mia is waiting for Scout to finish analysing your store data…'}
                </p>
              </div>
            </div>
          </div>

          {/* Real findings */}
          {status === 'done' && result && result.findings.length > 0 && (
            <div className="space-y-3 animate-fade-in">
              {result.findings.map((f, i) => (
                <div key={i} className="glass-panel rounded-xl p-4 flex items-start gap-3">
                  {f.level === 'ok' ? (
                    <CheckCircle2 className="w-4 h-4 text-[#10b981] mt-0.5 flex-shrink-0" />
                  ) : f.level === 'error' ? (
                    <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-[#f97316] mt-0.5 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{f.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{f.detail}</p>
                  </div>
                  {f.score && (
                    <span
                      className="ml-auto text-xs font-metric font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{
                        background: f.level === 'ok' ? '#10b98120' : f.level === 'error' ? '#ef444420' : '#f9731620',
                        color: f.level === 'ok' ? '#10b981' : f.level === 'error' ? '#ef4444' : '#f97316',
                      }}
                    >
                      {f.score}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Real scores */}
          {status === 'done' && result && result.scores.length > 0 && (
            <div className={`grid gap-3 animate-fade-in ${result.scores.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {result.scores.map((s, i) => (
                <div key={i} className="glass-panel rounded-xl p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Zap className="w-3.5 h-3.5 text-[#6366f1]" />
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                  </div>
                  <p className="font-metric font-bold text-lg text-foreground">
                    {s.value}<span className="text-xs text-muted-foreground font-normal">/100</span>
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Running state placeholder */}
          {status === 'running' && (
            <div className="glass-panel rounded-xl p-6 flex items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Waiting for results…</span>
            </div>
          )}

          {/* Error retry */}
          {status === 'error' && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
                className="gap-2 border-border/50 text-muted-foreground hover:text-foreground"
              >
                Retry Diagnosis
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-4">
        <Button
          variant="outline"
          onClick={() => router.push('/onboarding/platforms')}
          className="gap-2 border-border/50 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <Button
          onClick={() => router.push('/dashboard')}
          disabled={status === 'running'}
          className="gap-2 bg-[#6366f1] hover:bg-[#5254cc] text-white font-semibold px-8 disabled:opacity-50"
        >
          {status === 'running' ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Analysing…
            </>
          ) : (
            <>
              Go to Dashboard
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

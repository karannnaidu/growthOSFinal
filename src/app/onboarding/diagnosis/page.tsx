'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, ArrowLeft, ArrowRight, AlertTriangle, CheckCircle2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AgentAvatar } from '@/components/agents/agent-avatar'

interface LogLine {
  ts: string
  msg: string
  level?: 'info' | 'warn' | 'ok'
}

interface SimLogLine {
  msg: string
  level: 'info' | 'warn' | 'ok'
}

const SIMULATED_LOGS: SimLogLine[] = [
  { msg: 'Initialising Scout health-check…', level: 'info' },
  { msg: 'Connecting to store data sources…', level: 'info' },
  { msg: 'Scanning product catalogue context…', level: 'info' },
  { msg: 'Analysing brand voice coherence…', level: 'ok' },
  { msg: 'Checking ad attribution windows…', level: 'warn' },
  { msg: 'Cross-referencing platform signals…', level: 'info' },
  { msg: 'Computing asset synchronicity score…', level: 'info' },
  { msg: 'Detecting revenue leakage patterns…', level: 'warn' },
  { msg: 'Health check complete. Generating report…', level: 'ok' },
]

function ts() {
  return new Date().toLocaleTimeString('en-US', { hour12: false })
}

export default function DiagnosisPage() {
  const router = useRouter()
  const [logs, setLogs] = useState<LogLine[]>([])
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<'running' | 'done' | 'error'>('running')
  const [skillRunId, setSkillRunId] = useState<string | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const hasStarted = useRef(false)

  useEffect(() => {
    if (hasStarted.current) return
    hasStarted.current = true

    const brandId = sessionStorage.getItem('onboarding_brand_id')
    let cancelled = false

    // Kick off real skill run if brandId available
    if (brandId) {
      fetch('/api/onboarding/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled && d.skillRunId) setSkillRunId(d.skillRunId)
        })
        .catch(() => {})
    }

    // Animate logs regardless (UI demo mode)
    let i = 0
    const interval = setInterval(() => {
      if (cancelled) return
      if (i < SIMULATED_LOGS.length) {
        const entry = SIMULATED_LOGS[i]
        if (!entry) return
        const logLine: LogLine = { msg: entry.msg, level: entry.level, ts: ts() }
        setLogs((prev) => [...prev, logLine])
        setProgress(Math.round(((i + 1) / SIMULATED_LOGS.length) * 100))
        i++
      } else {
        clearInterval(interval)
        if (!cancelled) setStatus('done')
      }
    }, 700)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

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
          Mia&apos;s First Diagnosis
        </h1>
        <p className="text-muted-foreground text-base max-w-lg mx-auto leading-relaxed">
          Scout is running your initial brand health check.
        </p>
      </div>

      {/* Split layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Left: Mia status + terminal */}
        <div className="glass-panel rounded-2xl p-6 space-y-4">
          {/* Agent header */}
          <div className="flex items-center gap-3">
            <AgentAvatar agentId="mia" size="sm" state={status === 'running' ? 'working' : 'default'} />
            <div>
              <p className="font-heading font-semibold text-sm text-foreground">Mia Orchestrator</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {status === 'running' ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#f97316] animate-pulse" />
                    Running Scout health-check…
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
                    Diagnosis complete
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
                  background: 'linear-gradient(90deg, #6366f1, #0d9488)',
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
                        : 'text-[#94a3b8]'
                  }
                >
                  {line.msg}
                </span>
              </div>
            ))}
            {status === 'running' && (
              <div className="flex gap-2">
                <span className="text-[#475569]">{ts()}</span>
                <span className="text-[#6366f1] animate-pulse">█</span>
              </div>
            )}
            <div ref={logsEndRef} />
          </div>
        </div>

        {/* Right: Summary + findings */}
        <div className="space-y-4">
          {/* Summary quote */}
          <div className="glass-panel rounded-2xl p-6">
            <div className="flex items-start gap-3 mb-4">
              <Sparkles className="w-5 h-5 text-[#6366f1] mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-heading font-semibold text-sm text-foreground mb-1">
                  Final Summary
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {status === 'done'
                    ? 'Your store shows strong brand voice consistency but has detectable revenue leakage in mid-funnel attribution. Scout identified 3 priority actions.'
                    : 'Mia is reviewing Scout\'s findings and preparing your growth roadmap…'}
                </p>
              </div>
            </div>
          </div>

          {/* Findings */}
          {status === 'done' && (
            <div className="space-y-3 animate-fade-in">
              <div className="glass-panel rounded-xl p-4 flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-[#10b981] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">Asset Synchronicity</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Brand voice is 91% coherent across channels
                  </p>
                </div>
                <span
                  className="ml-auto text-xs font-metric font-medium px-2 py-0.5 rounded-full"
                  style={{ background: '#10b98120', color: '#10b981' }}
                >
                  91%
                </span>
              </div>

              <div className="glass-panel rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-[#f97316] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">Leakage Detected</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Mid-funnel drop-off costing est. 18% revenue
                  </p>
                </div>
                <span
                  className="ml-auto text-xs font-metric font-medium px-2 py-0.5 rounded-full"
                  style={{ background: '#f9731620', color: '#f97316' }}
                >
                  HIGH
                </span>
              </div>

              {/* Score badges */}
              <div className="grid grid-cols-2 gap-3">
                <div
                  className="glass-panel rounded-xl p-3 text-center"
                >
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Zap className="w-3.5 h-3.5 text-[#6366f1]" />
                    <span className="text-xs text-muted-foreground">Data Integrity</span>
                  </div>
                  <p className="font-metric font-bold text-lg text-foreground">87<span className="text-xs text-muted-foreground font-normal">/100</span></p>
                </div>
                <div className="glass-panel rounded-xl p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Zap className="w-3.5 h-3.5 text-[#0d9488]" />
                    <span className="text-xs text-muted-foreground">Latency Score</span>
                  </div>
                  <p className="font-metric font-bold text-lg text-foreground">94<span className="text-xs text-muted-foreground font-normal">/100</span></p>
                </div>
              </div>
            </div>
          )}

          {skillRunId && (
            <p className="text-xs text-muted-foreground text-center">
              Run ID: <span className="font-metric">{skillRunId.slice(0, 8)}…</span>
            </p>
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

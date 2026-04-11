'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AgentAvatar } from '@/components/agents/agent-avatar'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LogLine {
  ts: string
  msg: string
  level: 'info' | 'ok' | 'error'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ts() {
  return new Date().toLocaleTimeString('en-US', { hour12: false })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ExtractionPage() {
  const router = useRouter()
  const [logs, setLogs] = useState<LogLine[]>([])
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const hasStarted = useRef(false)

  const addLog = useCallback((msg: string, level: LogLine['level'] = 'info') => {
    setLogs(prev => [...prev, { ts: ts(), msg, level }])
  }, [])

  // ---------------------------------------------------------------------------
  // SSE extraction stream
  // ---------------------------------------------------------------------------

  const startExtraction = useCallback(async (brandId: string, domain: string) => {
    setStatus('running')
    setProgress(5)
    addLog('Connecting to extraction service...', 'info')

    try {
      const res = await fetch('/api/onboarding/extract-brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, domain }),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => null)
        throw new Error(errBody?.error ?? `Server responded with ${res.status}`)
      }

      if (!res.body) {
        throw new Error('No response stream received')
      }

      addLog('Stream connected. Mia is analysing your brand...', 'ok')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse SSE lines
        const lines = buffer.split('\n')
        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() ?? ''

        let currentEvent = ''

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim()
          } else if (line.startsWith('data:')) {
            const raw = line.slice(5).trim()
            if (!raw) continue

            let data: Record<string, unknown>
            try {
              data = JSON.parse(raw)
            } catch {
              continue
            }

            if (currentEvent === 'progress') {
              const pct = typeof data.progress === 'number' ? data.progress : progress
              const msg = (data.message as string) || 'Processing...'
              setProgress(pct)
              addLog(msg, 'info')
            } else if (currentEvent === 'complete') {
              setProgress(100)
              addLog('Extraction complete!', 'ok')

              if (data.brandDna) {
                sessionStorage.setItem(
                  'onboarding_brand_dna',
                  JSON.stringify(data.brandDna),
                )
              }
              if (data.competitors) {
                sessionStorage.setItem(
                  'onboarding_competitors',
                  JSON.stringify(data.competitors),
                )
              }

              setStatus('done')
              setTimeout(() => router.push('/onboarding/review'), 1000)
              return
            } else if (currentEvent === 'error') {
              const errMessage = (data.message as string) || 'Extraction failed'
              addLog(errMessage, 'error')
              setErrorMsg(errMessage)
              setStatus('error')
              return
            }

            // Reset event after consuming data
            currentEvent = ''
          }
        }
      }

      // Stream ended without a complete or error event
      if (status !== 'done' && status !== 'error') {
        addLog('Stream ended unexpectedly.', 'error')
        setErrorMsg('The extraction stream ended without completing.')
        setStatus('error')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown network error'
      addLog(`Error: ${message}`, 'error')
      setErrorMsg(message)
      setStatus('error')
    }
  }, [addLog, progress, router, status])

  // ---------------------------------------------------------------------------
  // Mount effect
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (hasStarted.current) return
    hasStarted.current = true

    const brandId = sessionStorage.getItem('onboarding_brand_id')
    const domain = sessionStorage.getItem('onboarding_domain')

    if (!brandId || !domain) {
      setErrorMsg(
        'Missing brand information. Please go back and connect your store first.',
      )
      setStatus('error')
      return
    }

    startExtraction(brandId, domain)
  }, [startExtraction])

  // Auto-scroll terminal
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // ---------------------------------------------------------------------------
  // Retry handler
  // ---------------------------------------------------------------------------

  function handleRetry() {
    setLogs([])
    setProgress(0)
    setErrorMsg(null)
    setStatus('idle')
    hasStarted.current = false

    const brandId = sessionStorage.getItem('onboarding_brand_id')
    const domain = sessionStorage.getItem('onboarding_domain')

    if (!brandId || !domain) {
      setErrorMsg('Missing brand information. Please go back and connect your store first.')
      setStatus('error')
      return
    }

    startExtraction(brandId, domain)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isRunning = status === 'running' || status === 'idle'
  const isError = status === 'error'

  return (
    <div className="w-full max-w-2xl animate-slide-up">
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
          Step 2 of 5
        </span>
      </div>

      {/* Mia avatar */}
      <div className="text-center mb-10">
        <div className="flex justify-center mb-4">
          <div style={{ filter: 'drop-shadow(0 0 18px rgba(99,102,241,0.35))' }}>
            <AgentAvatar
              agentId="mia"
              size="lg"
              state={isRunning ? 'working' : 'default'}
            />
          </div>
        </div>

        <h1 className="font-heading font-bold text-3xl sm:text-4xl md:text-5xl text-foreground mb-4 tracking-tight">
          {isError ? 'Extraction Failed' : 'Learning Your Brand'}
        </h1>
        <p className="text-muted-foreground text-base max-w-md mx-auto leading-relaxed">
          {isRunning
            ? 'Mia is crawling your website, extracting brand voice, tone, colours, and messaging patterns.'
            : isError
              ? 'Something went wrong while extracting your brand DNA.'
              : 'Extraction complete \u2014 redirecting to review...'}
        </p>
      </div>

      {/* Glass panel with progress + terminal */}
      <div className="glass-panel rounded-2xl p-6 space-y-5 mb-8">
        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>Extraction progress</span>
            <span className="font-metric">{progress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                background: isError
                  ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                  : 'linear-gradient(90deg, #6366f1, #0d9488)',
              }}
            />
          </div>
        </div>

        {/* Terminal-style log viewer */}
        <div
          className="rounded-xl p-4 font-mono text-xs space-y-1.5 max-h-48 overflow-y-auto"
          style={{ background: '#0b0f1a', color: '#94a3b8' }}
        >
          {logs.map((line, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-[#475569] flex-shrink-0">{line.ts}</span>
              <span
                className={
                  line.level === 'ok'
                    ? 'text-[#10b981]'
                    : line.level === 'error'
                      ? 'text-red-400'
                      : 'text-[#94a3b8]'
                }
              >
                {line.msg}
              </span>
            </div>
          ))}
          {isRunning && (
            <div className="flex gap-2">
              <span className="text-[#475569]">{ts()}</span>
              <span className="text-[#6366f1] animate-pulse">{'\u2588'}</span>
            </div>
          )}
          <div ref={logsEndRef} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-center gap-4">
        {isRunning && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>This usually takes 30\u201360 seconds...</span>
          </div>
        )}

        {isError && (
          <>
            <Button
              variant="outline"
              onClick={() => router.push('/onboarding/connect-store')}
              className="gap-2 border-border/50 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
              Go Back
            </Button>
            <Button
              onClick={handleRetry}
              className="gap-2 bg-[#6366f1] hover:bg-[#5254cc] text-white font-semibold px-6"
            >
              Retry Extraction
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

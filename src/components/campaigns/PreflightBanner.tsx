'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { PreflightResult, PreflightVerdict } from '@/lib/preflight-types'

type BannerState =
  | { kind: 'checking' }
  | { kind: 'result'; result: PreflightResult }
  | { kind: 'error'; message: string }

export function PreflightBanner({
  brandId,
  onResult,
}: {
  brandId: string
  onResult?: (r: PreflightResult) => void
}) {
  const [state, setState] = useState<BannerState>({ kind: 'checking' })
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function fetchPreflight(force = false) {
      setState({ kind: 'checking' })
      try {
        const res = await fetch('/api/preflight/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandId, force }),
        })
        if (cancelled) return
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Failed' }))
          setState({ kind: 'error', message: body.error ?? 'Preflight failed' })
          return
        }
        const result = (await res.json()) as PreflightResult
        if (cancelled) return
        setState({ kind: 'result', result })
        onResult?.(result)
      } catch (err) {
        if (cancelled) return
        setState({ kind: 'error', message: err instanceof Error ? err.message : 'Network error' })
      }
    }
    fetchPreflight()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId])

  async function refetch(force = false) {
    setState({ kind: 'checking' })
    try {
      const res = await fetch('/api/preflight/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, force }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Failed' }))
        setState({ kind: 'error', message: body.error ?? 'Preflight failed' })
        return
      }
      const result = (await res.json()) as PreflightResult
      setState({ kind: 'result', result })
      onResult?.(result)
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Network error' })
    }
  }

  if (state.kind === 'checking') {
    return (
      <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-zinc-400 mr-2" />
        Checking your Meta setup…
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Pre-flight error: {state.message}{' '}
        <button onClick={() => refetch(true)} className="underline">
          Retry
        </button>
      </div>
    )
  }

  const { result } = state
  return (
    <div className={bannerClass(result.verdict)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={dotClass(result.verdict)} />
          <span className="font-medium">{headline(result)}</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {result.verdict !== 'ready' && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="underline"
            >
              {expanded ? 'Hide details' : 'Details'}
            </button>
          )}
          <button onClick={() => refetch(true)} className="underline">
            Re-check
          </button>
        </div>
      </div>

      {expanded && result.warnings.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {result.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-0.5">•</span>
              <span>
                <span className="font-mono">{w.skill}</span> — {w.message}
                {w.fix_skill && (
                  <>
                    {' '}
                    <Link
                      href={`/dashboard/mia?intent=fix&skill=${w.fix_skill}&brand=${brandId}`}
                      className="underline"
                    >
                      Fix with {w.fix_skill}
                    </Link>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {result.verdict === 'blocked' && (
        <div className="mt-2 text-xs">
          {result.blocked_reason}{' '}
          <Link
            href={`/dashboard/mia?intent=fix&brand=${brandId}`}
            className="font-medium underline"
          >
            Open Max to fix
          </Link>
        </div>
      )}
    </div>
  )
}

function bannerClass(v: PreflightVerdict) {
  if (v === 'blocked') return 'rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900'
  if (v === 'warning') return 'rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900'
  return 'rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900'
}

function dotClass(v: PreflightVerdict) {
  const base = 'inline-block h-2 w-2 rounded-full'
  if (v === 'blocked') return `${base} bg-red-500`
  if (v === 'warning') return `${base} bg-amber-500`
  return `${base} bg-emerald-500`
}

function headline(r: PreflightResult): string {
  if (r.verdict === 'ready') return 'All systems go'
  if (r.verdict === 'warning') return `${r.warnings.length} warning${r.warnings.length === 1 ? '' : 's'} — you can still launch`
  return `Launch blocked`
}

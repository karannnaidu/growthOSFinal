// src/lib/preflight-types.ts
// Types for Max's pre-flight orchestrator. Shared between the library
// (src/lib/preflight.ts) and UI components (PreflightBanner, AudienceStep).

export type PreflightVerdict = 'ready' | 'warning' | 'blocked'
export type PreflightSeverity = 'info' | 'warning' | 'high'

export interface PreflightWarning {
  skill: string
  severity: PreflightSeverity
  message: string
  fix_skill?: string
}

export interface PreflightDetails {
  pixel: unknown | null
  asc: unknown | null
  structure: unknown | null
  learning: unknown | null
}

export interface PreflightResult {
  brand_id: string
  verdict: PreflightVerdict
  blocked_reason: string | null
  warnings: PreflightWarning[]
  details: PreflightDetails
  cached_at: string
  stale: boolean
}

export interface PreflightRunOptions {
  force?: boolean
}

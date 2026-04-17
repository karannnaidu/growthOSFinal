// Per-stage telemetry persisted alongside each skill_run.
// A stage is absent if it did not run (e.g. rag is absent when the skill
// declares no semantic_query). A stage is present with status='ok' when it
// ran successfully — we keep 'ok' explicitly so downstream queries can filter
// with a single `diagnostics->>'stage' != 'ok'` predicate.

export type StageStatus = 'ok' | 'failed' | 'skipped' | 'partial';

export interface RagDiagnostic {
  status: StageStatus;
  error?: string;
  latency_ms?: number;
}

export interface ExtractDiagnostic {
  status: StageStatus;
  error?: string;
  nodes_created?: number;
  unexpected_node_types?: string[];
}

export interface PostRunDiagnostic {
  status: StageStatus;
  error?: string;
}

export interface SkillRunDiagnostics {
  rag?: RagDiagnostic;
  extract?: ExtractDiagnostic;
  postRun?: PostRunDiagnostic;
  // Per-engine coverage for multi-engine skills (Nova). Key = engine id.
  coverage?: Record<string, StageStatus>;
}

// True if any recorded stage is non-ok. Used by the UI to decide whether to
// show the degraded-enrichment banner.
export function hasDegradedStage(d: SkillRunDiagnostics | null | undefined): boolean {
  if (!d) return false;
  if (d.rag && d.rag.status !== 'ok') return true;
  if (d.extract && d.extract.status !== 'ok') return true;
  if (d.postRun && d.postRun.status !== 'ok') return true;
  if (d.coverage) {
    for (const status of Object.values(d.coverage)) {
      if (status !== 'ok') return true;
    }
  }
  return false;
}

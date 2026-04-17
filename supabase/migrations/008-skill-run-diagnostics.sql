-- 008-skill-run-diagnostics.sql
-- Adds a nullable JSONB diagnostics column to skill_runs so RAG / extraction /
-- postRun failures can be surfaced without blocking the run.

ALTER TABLE skill_runs
  ADD COLUMN IF NOT EXISTS diagnostics jsonb NULL;

COMMENT ON COLUMN skill_runs.diagnostics IS
  'Per-stage reliability telemetry: { rag, extract, postRun, coverage } each with { status, error?, ... }. NULL = all stages ok or skill did not exercise KG paths.';

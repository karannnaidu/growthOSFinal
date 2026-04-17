-- 005-skill-runs-blocked-status.sql
-- Adds 'blocked' status tracking columns to skill_runs + cron dedupe unique index.

-- In this codebase skill_runs.status is stored as text (no pg enum), so no ALTER TYPE needed.
-- Document that 'blocked' is now a valid value in addition to pending/running/completed/failed.

ALTER TABLE skill_runs
  ADD COLUMN IF NOT EXISTS blocked_reason text,
  ADD COLUMN IF NOT EXISTS missing_platforms text[],
  ADD COLUMN IF NOT EXISTS data_source_summary jsonb;

COMMENT ON COLUMN skill_runs.blocked_reason IS
  'Human-readable reason why the skill was blocked (e.g., "Connect Shopify to run").';
COMMENT ON COLUMN skill_runs.missing_platforms IS
  'Machine-readable platform slugs the user must connect to unblock this skill.';
COMMENT ON COLUMN skill_runs.data_source_summary IS
  'Per-tool resolver trace: { toolName: { source, confidence, isComplete } }.';

-- Cron dedupe: one running/completed run per brand+skill+UTC day.
-- Note: expression must be IMMUTABLE for a unique index. `date_trunc` on
-- timestamptz is STABLE (depends on session TZ) — casting to UTC first makes
-- the result IMMUTABLE.
CREATE UNIQUE INDEX IF NOT EXISTS skill_runs_daily_unique
  ON skill_runs (brand_id, skill_id, ((created_at AT TIME ZONE 'UTC')::date))
  WHERE status IN ('completed', 'running');

-- 016-skill-runs-allow-blocked.sql
-- Broaden skill_runs.status to allow 'blocked'. The skills-engine has been
-- writing 'blocked' since pre-flight was introduced, but the CHECK constraint
-- only permitted running/completed/failed, so every blocked insert silently
-- failed — erasing history of skills Mia tried to dispatch that couldn't
-- run due to missing data sources. Idempotent.

alter table public.skill_runs
  drop constraint if exists skill_runs_status_check;

alter table public.skill_runs
  add constraint skill_runs_status_check
  check (status in ('running', 'completed', 'failed', 'blocked'));

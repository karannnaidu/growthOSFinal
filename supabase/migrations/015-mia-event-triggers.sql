-- 015-mia-event-triggers.sql
-- DB-level event emission for Mia orchestration:
--   - platform_connect: fires when a credentials row is INSERTed for a new
--     (brand_id, platform) pair. Token refreshes (UPDATE) don't re-fire.
--   - skill_delta: fires when a skill_runs row transitions to 'completed'.
-- Idempotent.

-- ------------------------------------------------------------------
-- 1. platform_connect trigger on credentials
-- ------------------------------------------------------------------
create or replace function public.mia_emit_platform_connect()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.mia_events (brand_id, event_type, payload)
  values (
    new.brand_id,
    'platform_connect',
    jsonb_build_object(
      'platform', new.platform,
      'credential_id', new.id,
      'at', now()
    )
  );
  return new;
exception when others then
  -- Never block the parent insert because the event bus is down.
  return new;
end;
$$;

drop trigger if exists mia_emit_platform_connect_trigger on public.credentials;
create trigger mia_emit_platform_connect_trigger
after insert on public.credentials
for each row execute function public.mia_emit_platform_connect();

-- ------------------------------------------------------------------
-- 2. skill_delta trigger on skill_runs
--    Fires on UPDATE where status transitions to 'completed' (was not
--    already completed). This catches both runs that complete asynchronously
--    and runs that are inserted already-completed (handled via AFTER INSERT
--    in a second trigger below).
-- ------------------------------------------------------------------
create or replace function public.mia_emit_skill_delta_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and coalesce(old.status, '') <> 'completed' then
    insert into public.mia_events (brand_id, event_type, payload)
    values (
      new.brand_id,
      'skill_delta',
      jsonb_build_object(
        'skill_run_id', new.id,
        'skill_id', new.skill_id,
        'status', new.status,
        'at', now()
      )
    );
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists mia_emit_skill_delta_update_trigger on public.skill_runs;
create trigger mia_emit_skill_delta_update_trigger
after update on public.skill_runs
for each row execute function public.mia_emit_skill_delta_update();

create or replace function public.mia_emit_skill_delta_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' then
    insert into public.mia_events (brand_id, event_type, payload)
    values (
      new.brand_id,
      'skill_delta',
      jsonb_build_object(
        'skill_run_id', new.id,
        'skill_id', new.skill_id,
        'status', new.status,
        'at', now()
      )
    );
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists mia_emit_skill_delta_insert_trigger on public.skill_runs;
create trigger mia_emit_skill_delta_insert_trigger
after insert on public.skill_runs
for each row execute function public.mia_emit_skill_delta_insert();

comment on function public.mia_emit_platform_connect is
  'Emits a platform_connect mia_events row when a credentials row is inserted. Token refreshes (UPDATE) do not re-fire.';
comment on function public.mia_emit_skill_delta_update is
  'Emits a skill_delta mia_events row when a skill_run status transitions to completed.';
comment on function public.mia_emit_skill_delta_insert is
  'Emits a skill_delta mia_events row when a skill_run is inserted already-completed.';

-- 014-mia-first-orchestration.sql
-- Mia becomes the single orchestrator: new tables for watches, requests,
-- decisions, digests, events; additive columns on skill_runs and chat_messages.
-- Idempotent: re-runs are safe.

-- ------------------------------------------------------------------
-- 1. watches  — Mia's deferred intent, machine-readable
-- ------------------------------------------------------------------
create table if not exists public.watches (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  trigger_type text not null,
  predicate jsonb not null,
  resume_action text not null,
  resume_context text,
  source_decision_id uuid,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  fired_at timestamptz,
  fired_predicate_eval jsonb
);

alter table public.watches drop constraint if exists watches_trigger_type_chk;
alter table public.watches
  add constraint watches_trigger_type_chk
  check (trigger_type in (
    'time_elapsed','data_accumulated','metric_crossed',
    'request_acted_on','skill_ran'
  ));

alter table public.watches drop constraint if exists watches_status_chk;
alter table public.watches
  add constraint watches_status_chk
  check (status in ('open','fired','expired','cancelled'));

create index if not exists watches_brand_status_idx
  on public.watches (brand_id, status);
create index if not exists watches_brand_open_expires_idx
  on public.watches (brand_id, expires_at) where status = 'open';

alter table public.watches enable row level security;
drop policy if exists "watches_brand_members" on public.watches;
create policy "watches_brand_members" on public.watches
  for all using (
    brand_id in (
      select brand_id from public.brand_members where user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------
-- 2. mia_requests — skill-emitted asks with lifecycle
-- ------------------------------------------------------------------
create table if not exists public.mia_requests (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  emitted_by_skill_run_id uuid,
  type text not null,
  payload jsonb not null,
  reason text not null,
  priority text not null default 'medium',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  valid_until timestamptz,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_payload jsonb
);

alter table public.mia_requests drop constraint if exists mia_requests_type_chk;
alter table public.mia_requests
  add constraint mia_requests_type_chk
  check (type in (
    'platform_connect','user_approval','data_needed',
    'info_needed','creative_review'
  ));

alter table public.mia_requests drop constraint if exists mia_requests_priority_chk;
alter table public.mia_requests
  add constraint mia_requests_priority_chk
  check (priority in ('low','medium','high','critical'));

alter table public.mia_requests drop constraint if exists mia_requests_status_chk;
alter table public.mia_requests
  add constraint mia_requests_status_chk
  check (status in ('open','acted_on','dismissed','expired'));

create index if not exists mia_requests_brand_open_idx
  on public.mia_requests (brand_id, status, priority);

alter table public.mia_requests enable row level security;
drop policy if exists "mia_requests_brand_members" on public.mia_requests;
create policy "mia_requests_brand_members" on public.mia_requests
  for all using (
    brand_id in (
      select brand_id from public.brand_members where user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------
-- 3. mia_decisions — full decision trace per wake
-- ------------------------------------------------------------------
create table if not exists public.mia_decisions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  wake_source text not null,
  triggered_at timestamptz not null default now(),
  context_snapshot jsonb not null,
  fired_watch_ids uuid[] not null default '{}',
  picked jsonb not null default '[]',
  considered jsonb not null default '[]',
  rejected jsonb not null default '[]',
  new_watches_created uuid[] not null default '{}',
  requests_resolved uuid[] not null default '{}',
  digest_lines jsonb not null default '[]',
  instant_messages jsonb not null default '[]',
  reasoning text,
  model_version text not null,
  prompt_version text not null,
  seed int,
  llm_cost_credits numeric,
  created_at timestamptz not null default now()
);

alter table public.mia_decisions drop constraint if exists mia_decisions_wake_source_chk;
alter table public.mia_decisions
  add constraint mia_decisions_wake_source_chk
  check (wake_source in (
    'heartbeat','event:platform_connect','event:skill_delta',
    'event:user_chat','event:new_skill','event:webhook','onboarding'
  ));

create index if not exists mia_decisions_brand_time_idx
  on public.mia_decisions (brand_id, triggered_at desc);

alter table public.mia_decisions enable row level security;
drop policy if exists "mia_decisions_brand_members" on public.mia_decisions;
create policy "mia_decisions_brand_members" on public.mia_decisions
  for all using (
    brand_id in (
      select brand_id from public.brand_members where user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------
-- 4. mia_digests — one daily rollup per brand-local date
-- ------------------------------------------------------------------
create table if not exists public.mia_digests (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  digest_date date not null,
  status text not null default 'accumulating',
  sections jsonb not null default '{}',
  posted_at timestamptz,
  channels_posted text[],
  source_decision_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.mia_digests drop constraint if exists mia_digests_status_chk;
alter table public.mia_digests
  add constraint mia_digests_status_chk
  check (status in ('accumulating','posted','skipped'));

alter table public.mia_digests drop constraint if exists mia_digests_brand_date_key;
alter table public.mia_digests
  add constraint mia_digests_brand_date_key unique (brand_id, digest_date);

create index if not exists mia_digests_brand_date_idx
  on public.mia_digests (brand_id, digest_date desc);

alter table public.mia_digests enable row level security;
drop policy if exists "mia_digests_brand_members" on public.mia_digests;
create policy "mia_digests_brand_members" on public.mia_digests
  for all using (
    brand_id in (
      select brand_id from public.brand_members where user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------
-- 5. mia_events — event-wake bus
-- ------------------------------------------------------------------
create table if not exists public.mia_events (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  processed boolean not null default false,
  processed_at timestamptz,
  triggered_wake_id uuid references public.mia_decisions(id),
  created_at timestamptz not null default now()
);

alter table public.mia_events drop constraint if exists mia_events_type_chk;
alter table public.mia_events
  add constraint mia_events_type_chk
  check (event_type in (
    'platform_connect','skill_delta','user_chat','new_skill','webhook'
  ));

create index if not exists mia_events_brand_unprocessed_idx
  on public.mia_events (brand_id, processed, created_at);

alter table public.mia_events enable row level security;
drop policy if exists "mia_events_brand_members" on public.mia_events;
create policy "mia_events_brand_members" on public.mia_events
  for all using (
    brand_id in (
      select brand_id from public.brand_members where user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------
-- 6. skill_runs — add requests_emitted column
-- ------------------------------------------------------------------
alter table public.skill_runs
  add column if not exists requests_emitted jsonb;

-- ------------------------------------------------------------------
-- 7. chat_messages — add author_kind, source_decision_id, inline card refs
-- ------------------------------------------------------------------
alter table public.conversation_messages
  add column if not exists author_kind text;

alter table public.conversation_messages drop constraint if exists conversation_messages_author_kind_chk;
alter table public.conversation_messages
  add constraint conversation_messages_author_kind_chk
  check (author_kind is null or author_kind in (
    'user','mia_reactive','mia_proactive','mia_digest'
  ));

alter table public.conversation_messages
  add column if not exists source_decision_id uuid
  references public.mia_decisions(id);

alter table public.conversation_messages
  add column if not exists inline_request_ids uuid[];

alter table public.conversation_messages
  add column if not exists inline_watch_ids uuid[];

-- ------------------------------------------------------------------
-- 8. Cross-reference FK for watches.source_decision_id
-- ------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'watches_source_decision_id_fkey'
  ) then
    alter table public.watches
      add constraint watches_source_decision_id_fkey
      foreign key (source_decision_id) references public.mia_decisions(id);
  end if;
end $$;

-- ------------------------------------------------------------------
-- 9. mia_requests.emitted_by_skill_run_id FK
-- ------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mia_requests_emitted_by_skill_run_fkey'
  ) then
    alter table public.mia_requests
      add constraint mia_requests_emitted_by_skill_run_fkey
      foreign key (emitted_by_skill_run_id) references public.skill_runs(id);
  end if;
end $$;

comment on table public.watches is
  'Mia deferred intent. Heartbeat SQL-evals predicates; fired watches drive next wake planning.';
comment on table public.mia_requests is
  'Skill-emitted asks to the user with attribution + lifecycle (open/acted_on/dismissed/expired).';
comment on table public.mia_decisions is
  'Full decision trace per Mia wake. One row per wake. Source of truth for replay/audit.';
comment on table public.mia_digests is
  'Daily rollup — one per brand per date. Accumulates digest_lines from decisions, composer posts at 08:00 brand-local.';
comment on table public.mia_events is
  'Event-wake bus. Webhooks, deltas, chat messages, new-skill signals write here; drain cron consumes.';

-- 017-preflight-results.sql
-- Caches Max's pre-flight check output per brand for 15-min TTL.
-- Reads: brand members. Writes: service role only.

create table if not exists preflight_results (
  brand_id uuid primary key references brands(id) on delete cascade,
  verdict text not null check (verdict in ('ready','warning','blocked')),
  blocked_reason text,
  warnings jsonb not null default '[]'::jsonb,
  details jsonb not null default '{}'::jsonb,
  cached_at timestamptz not null default now()
);

create index if not exists preflight_results_cached_at_idx
  on preflight_results(cached_at);

alter table preflight_results enable row level security;

drop policy if exists "brand members read preflight" on preflight_results;
create policy "brand members read preflight" on preflight_results
  for select
  using (
    brand_id in (select id from brands where owner_id = auth.uid())
    or brand_id in (select brand_id from brand_members where user_id = auth.uid())
  );

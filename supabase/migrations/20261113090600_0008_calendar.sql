-- 0007_calendar
-- Calendar connections, events and the duplicate-safe sync outbox.
--
-- OAuth tokens are deliberately NOT in calendar_connections. They live in a
-- separate table that has RLS enabled and no policies at all, which means no
-- browser session can read it under any circumstance — a policy mistake on
-- the connection table cannot expose a refresh token, because the token is
-- not there.

create table public.calendar_connections (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references public.profiles (id) on delete cascade,
  provider       calendar_provider not null,
  account_email  text not null check (account_email = lower(account_email)),
  scope          text not null default '',
  status         calendar_connection_status not null default 'active',
  connected_at   timestamptz not null default now(),
  last_synced_at timestamptz,
  last_error     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (profile_id, provider, account_email)
);
create index calendar_connections_profile_idx on public.calendar_connections (profile_id);
select public.attach_updated_at('public.calendar_connections');

-- Secrets. No RLS policy is written for this table on purpose: with RLS
-- enabled and no policy, every row is invisible to anon and authenticated.
-- Only the service role, which bypasses RLS and never reaches the browser,
-- can read it.
create table public.calendar_credentials (
  connection_id  uuid primary key references public.calendar_connections (id) on delete cascade,
  access_token   text not null,
  refresh_token  text not null,
  token_type     text not null default 'Bearer',
  expires_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
select public.attach_updated_at('public.calendar_credentials');

comment on table public.calendar_credentials is
  'Google OAuth tokens. RLS is enabled with no policies, so this table is '
  'unreadable through PostgREST by any signed-in user, including its owner '
  'and a Super Admin. Server-side use only.';

create table public.calendar_events (
  id                   uuid primary key default gen_random_uuid(),
  team_id              uuid not null references public.teams (id) on delete restrict,
  meeting_id           uuid references public.meetings (id) on delete cascade,
  task_id              uuid references public.tasks (id) on delete cascade,
  source_extraction_id uuid references public.ai_extractions (id) on delete set null,
  title                text not null check (length(btrim(title)) > 0),
  description          text,
  starts_at            timestamptz not null,
  ends_at              timestamptz not null,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint calendar_events_ordered check (ends_at >= starts_at),
  constraint calendar_events_has_subject check (meeting_id is not null or task_id is not null)
);
create index calendar_events_team_starts_idx on public.calendar_events (team_id, starts_at);
select public.attach_updated_at('public.calendar_events');

-- The same verification gate as tasks. A calendar invitation is an
-- institutional communication; an unverified AI guess must not become one.
create trigger calendar_events_require_verified_source
  before insert or update of source_extraction_id on public.calendar_events
  for each row execute function public.enforce_verified_ai_source();

create table public.calendar_sync_jobs (
  id                uuid primary key default gen_random_uuid(),
  calendar_event_id uuid not null references public.calendar_events (id) on delete cascade,
  connection_id     uuid not null references public.calendar_connections (id) on delete cascade,
  operation         text not null check (operation in ('create', 'update', 'delete')),
  idempotency_key   text not null,
  state             sync_state not null default 'pending',
  attempts          integer not null default 0 check (attempts >= 0),
  provider_event_id text,
  last_error        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- The whole duplicate-prevention mechanism. A retry after an ambiguous
  -- network failure reuses the key and is refused by the database rather
  -- than creating a second event in someone's calendar.
  unique (connection_id, idempotency_key)
);
create index calendar_sync_jobs_pending_idx on public.calendar_sync_jobs (state, created_at)
  where state = 'pending';
select public.attach_updated_at('public.calendar_sync_jobs');

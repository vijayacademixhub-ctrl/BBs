-- 0002_identity
-- Teams, profiles, membership, invitations and per-user preferences.

create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 2 and 120),
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
select public.attach_updated_at('public.teams');

comment on table public.teams is
  'An academic office team. Confidential records are always scoped to one team.';

-- A profile is the application-side record of an authenticated user. The row
-- is created by the invitation-acceptance trigger in 0003, never by the user.
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null check (email = lower(email) and email like '%_@_%.__%'),
  full_name     text not null check (length(btrim(full_name)) between 2 and 120),
  designation   text not null default '' check (length(designation) <= 120),
  avatar_url    text check (avatar_url is null or avatar_url ~ '^https://'),
  status        account_status not null default 'invited',
  suspended_at  timestamptz,
  suspended_by  uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Suspension must carry its timestamp, so "when was this account disabled"
  -- is always answerable from the row itself.
  constraint profiles_suspension_consistent
    check ((status = 'suspended') = (suspended_at is not null))
);
create unique index profiles_email_key on public.profiles (email);
create index profiles_status_idx on public.profiles (status);
select public.attach_updated_at('public.profiles');

comment on column public.profiles.status is
  'invited: account created, never signed in. active: may use the system. '
  'suspended: retained for audit and attribution, but refused access by '
  'public.is_active_user().';

create table public.team_members (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  role        app_role not null default 'member',
  added_by    uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (team_id, profile_id)
);
-- Indexed because every RLS policy in the system resolves membership through
-- this pair. Without the index each policy check becomes a sequential scan.
create index team_members_profile_team_idx on public.team_members (profile_id, team_id);
create index team_members_team_role_idx on public.team_members (team_id, role);
select public.attach_updated_at('public.team_members');

-- Invitations are the only route to an account. See 0003 for the trigger that
-- enforces this against auth.users directly.
create table public.user_invitations (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (email = lower(email) and email like '%_@_%.__%'),
  team_id     uuid not null references public.teams (id) on delete cascade,
  role        app_role not null default 'member',
  full_name   text not null check (length(btrim(full_name)) between 2 and 120),
  designation text not null default '',
  invited_by  uuid not null references public.profiles (id) on delete restrict,
  status      invitation_status not null default 'pending',
  expires_at  timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at  timestamptz,
  revoked_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- At most one open invitation per address. A second invitation to the same
-- person must replace the first rather than sit alongside it.
create unique index user_invitations_one_open_per_email
  on public.user_invitations (email) where (status = 'pending');
create index user_invitations_team_idx on public.user_invitations (team_id, status);
select public.attach_updated_at('public.user_invitations');

comment on table public.user_invitations is
  'The only supported route to an account. No self-registration exists.';

create table public.user_preferences (
  profile_id            uuid primary key references public.profiles (id) on delete cascade,
  timezone              text not null default 'Asia/Kolkata',
  locale                text not null default 'en-IN',
  theme                 text not null default 'system' check (theme in ('light', 'dark', 'system')),
  notify_meetings       boolean not null default true,
  notify_tasks          boolean not null default true,
  notify_verification   boolean not null default true,
  notify_transcripts    boolean not null default true,
  notify_email          boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
select public.attach_updated_at('public.user_preferences');

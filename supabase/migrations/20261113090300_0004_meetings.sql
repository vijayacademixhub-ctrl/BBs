-- 0004_meetings
-- Meetings, participation, agendas and the recording consent register.

create table public.meetings (
  id               uuid primary key default gen_random_uuid(),
  team_id          uuid not null references public.teams (id) on delete restrict,
  title            text not null check (length(btrim(title)) between 3 and 200),
  description      text check (length(description) <= 4000),
  starts_at        timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 5 and 480),
  location         text check (length(location) <= 200),
  meeting_link     text check (meeting_link is null or meeting_link ~ '^https://'),
  status           meeting_status not null default 'scheduled',
  language         meeting_language not null default 'mixed',
  confidentiality  meeting_confidentiality not null default 'internal',
  organiser_id     uuid not null references public.profiles (id) on delete restrict,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint meetings_has_venue
    check (location is not null or meeting_link is not null)
);
create index meetings_team_starts_idx on public.meetings (team_id, starts_at desc);
create index meetings_organiser_idx on public.meetings (organiser_id);
select public.attach_updated_at('public.meetings');

comment on column public.meetings.confidentiality is
  'internal: the record is visible to the team, its content to participants. '
  'restricted: both are visible to participants only.';

comment on column public.meetings.organiser_id is
  'on delete restrict — a meeting is an institutional record and must not '
  'disappear because a staff account was removed. Suspend the account instead.';

create table public.meeting_participants (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid not null references public.meetings (id) on delete cascade,
  profile_id    uuid not null references public.profiles (id) on delete restrict,
  is_organiser  boolean not null default false,
  attended      boolean,
  added_by      uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (meeting_id, profile_id)
);
-- Drives can_access_meeting_content on every transcript read.
create index meeting_participants_profile_idx on public.meeting_participants (profile_id, meeting_id);

create table public.meeting_agendas (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references public.meetings (id) on delete cascade,
  position    integer not null check (position > 0),
  item        text not null check (length(btrim(item)) between 1 and 500),
  created_at  timestamptz not null default now(),
  unique (meeting_id, position)
);

-- --------------------------------------------------------- consent --------
--
-- One row per participant per meeting. The organiser records what each
-- participant said.
--
-- This register is an administrative record of a conversation that happened
-- outside the system. It is evidence that the organiser asked, not proof
-- that consent was validly obtained. recording_eligibility_rule in
-- app_settings decides what the register must contain before a recording may
-- start; it is 'disabled' until the institution sets a policy.
create table public.meeting_consents (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid not null references public.meetings (id) on delete cascade,
  profile_id    uuid not null references public.profiles (id) on delete restrict,
  status        consent_status not null default 'pending',
  method        consent_method,
  note          text check (length(note) <= 1000),
  recorded_by   uuid references public.profiles (id) on delete set null,
  recorded_at   timestamptz,
  withdrawn_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (meeting_id, profile_id),
  -- A decision must say who recorded it, when, and by what means. A consent
  -- record with no provenance is worth nothing as evidence.
  constraint meeting_consents_decision_has_provenance check (
    status = 'pending'
    or (recorded_by is not null and recorded_at is not null and method is not null)
  ),
  constraint meeting_consents_withdrawal_dated check (
    (status = 'withdrawn') = (withdrawn_at is not null)
  )
);
create index meeting_consents_meeting_idx on public.meeting_consents (meeting_id, status);
select public.attach_updated_at('public.meeting_consents');

comment on table public.meeting_consents is
  'Administrative register of participant consent, recorded by the organiser. '
  'Not automatic proof of valid consent by each participant.';

-- Creates a pending consent row whenever someone is added to a meeting, so
-- the register is complete by construction rather than by the organiser
-- remembering to fill it in.
create or replace function public.seed_participant_consent()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.meeting_consents (meeting_id, profile_id, status)
  values (new.meeting_id, new.profile_id, 'pending')
  on conflict (meeting_id, profile_id) do nothing;
  return new;
end;
$$;

create trigger seed_participant_consent
  after insert on public.meeting_participants
  for each row execute function public.seed_participant_consent();

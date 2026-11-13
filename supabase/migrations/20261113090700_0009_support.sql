-- 0008_support
-- Notifications, documents, application settings and retention configuration.

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  kind        notification_kind not null,
  title       text not null check (length(btrim(title)) > 0),
  body        text,
  entity_type text,
  entity_id   uuid,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_profile_unread_idx on public.notifications (profile_id, created_at desc)
  where read_at is null;

create table public.documents (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams (id) on delete restrict,
  meeting_id      uuid references public.meetings (id) on delete set null,
  title           text not null check (length(btrim(title)) between 1 and 200),
  storage_path    text not null unique check (storage_path !~ '^https?://'),
  bucket_id       text not null check (bucket_id in ('meeting-attachments', 'academic-documents', 'exports')),
  mime_type       text not null,
  byte_size       bigint not null check (byte_size > 0 and byte_size <= 536870912),
  confidentiality meeting_confidentiality not null default 'internal',
  uploaded_by     uuid references public.profiles (id) on delete set null,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index documents_team_idx on public.documents (team_id) where deleted_at is null;
create index documents_meeting_idx on public.documents (meeting_id);
select public.attach_updated_at('public.documents');

comment on column public.documents.storage_path is
  'Path within a private bucket. The check constraint refuses a URL, so a '
  'permanent public link cannot be recorded here.';

-- ----------------------------------------------- application settings -----

create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text not null default '',
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

insert into public.app_settings (key, value, description) values
  (
    'recording_eligibility_rule',
    '"disabled"'::jsonb,
    'Decides when a meeting may be recorded. disabled: recording is not '
    'permitted. all_participants_consented: every participant must have a '
    'consented row. organiser_attestation: the organiser attests on behalf of '
    'the meeting. Remains "disabled" until the institution approves a policy.'
  ),
  (
    'recording_enabled',
    'false'::jsonb,
    'Master switch for production recording. False until the consent policy '
    'is confirmed, per the instruction not to activate recording beforehand.'
  );

-- ------------------------------------------------------ retention ---------
--
-- Retention is configurable and currently inert. No period is approved, so
-- no period is written here. Nothing deletes anything.

create table public.retention_policies (
  id             uuid primary key default gen_random_uuid(),
  scope          retention_scope not null unique,
  enabled        boolean not null default false,
  retention_days integer check (retention_days is null or retention_days between 1 and 3650),
  status         retention_status not null default 'pending_approval',
  approved_by    uuid references public.profiles (id) on delete set null,
  approved_at    timestamptz,
  note           text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- A policy cannot be switched on without both an approved period and a
  -- record of who approved it. This is what makes "pending approval"
  -- structurally different from "approved but not yet configured".
  constraint retention_enabled_requires_approval check (
    not enabled
    or (status = 'approved' and retention_days is not null
        and approved_by is not null and approved_at is not null)
  )
);
select public.attach_updated_at('public.retention_policies');

insert into public.retention_policies (scope, enabled, retention_days, status, note) values
  ('recording_audio', false, null, 'pending_approval',
   'A 90-day period was proposed and has NOT been approved. No period is set '
   'and nothing is deleted. Recordings are retained indefinitely until the '
   'institution approves a policy.'),
  ('transcript', false, null, 'pending_approval',
   'Approved transcripts are retained until an authorised deletion. No '
   'automatic expiry.'),
  ('document', false, null, 'pending_approval',
   'No automatic deletion of academic documents.'),
  ('export', false, null, 'pending_approval',
   'No automatic deletion of generated exports.');

comment on table public.retention_policies is
  'Retention configuration. Every scope is disabled and pending approval; no '
  'scheduler acts on this table. See docs/retention-and-consent.md for the '
  'effect of deletion on backups and audit records.';

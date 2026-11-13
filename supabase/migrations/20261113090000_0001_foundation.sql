-- 0001_foundation
-- Shared types, utility functions and the updated_at trigger used by every
-- subsequent migration. Nothing in this file holds data.
--
-- Conventions for the whole schema:
--   * uuid primary keys, default gen_random_uuid() (built in from PG13)
--   * created_at / updated_at as timestamptz, updated_at maintained by trigger
--   * RLS enabled on every table that holds confidential information
--   * deletion behaviour stated explicitly on every foreign key

-- ---------------------------------------------------------------- enums ---

create type app_role as enum ('super_admin', 'coordinator', 'member');

create type account_status as enum ('invited', 'active', 'suspended');

create type invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

create type meeting_status as enum ('scheduled', 'in_progress', 'completed', 'cancelled');

-- 'internal'   — metadata visible to the team, content to participants only
-- 'restricted' — metadata and content visible to participants only
create type meeting_confidentiality as enum ('internal', 'restricted');

create type meeting_language as enum ('en', 'kn', 'hi', 'mixed');

create type consent_status as enum ('pending', 'consented', 'declined', 'not_applicable', 'withdrawn');

create type consent_method as enum ('verbal_in_meeting', 'written', 'email', 'system_prompt', 'other');

-- How the institution decides whether a meeting may be recorded. Default is
-- 'disabled' and stays that way until a policy is approved.
create type recording_eligibility_rule as enum (
  'disabled',
  'all_participants_consented',
  'organiser_attestation'
);

create type job_stage as enum ('transcribe', 'extract');

create type job_status as enum ('uploaded', 'queued', 'processing', 'completed', 'failed');

create type extraction_kind as enum (
  'summary', 'discussion_point', 'decision', 'action_item', 'deadline',
  'follow_up_meeting', 'important_date', 'academic_activity',
  'pending_issue', 'risk'
);

create type verification_state as enum ('pending', 'approved', 'rejected', 'modified', 'published');

create type verification_decision as enum ('approve', 'approve_with_edits', 'reject', 'request_reanalysis');

create type task_status as enum ('todo', 'in_progress', 'blocked', 'done', 'cancelled');

create type task_priority as enum ('low', 'medium', 'high', 'urgent');

create type calendar_provider as enum ('google', 'ics_export');

create type calendar_connection_status as enum ('active', 'revoked', 'error');

create type sync_state as enum ('pending', 'sent', 'failed', 'skipped');

create type notification_kind as enum ('meeting', 'task', 'verification', 'transcript', 'system');

create type retention_scope as enum ('recording_audio', 'transcript', 'document', 'export');

create type retention_status as enum ('pending_approval', 'approved', 'suspended');

-- ------------------------------------------------------------ utilities ---

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Maintains updated_at. Attached to every table that carries the column.';

-- Applies the updated_at trigger to a table without repeating the DDL.
create or replace function public.attach_updated_at(target regclass)
returns void
language plpgsql
as $$
begin
  execute format(
    'create trigger %I before update on %s for each row execute function public.set_updated_at()',
    'set_updated_at_' || split_part(target::text, '.', 2),
    target
  );
end;
$$;

# AcademicOS — Database Architecture

**Version:** 0.2 — implemented at Milestone 2
**Platform:** PostgreSQL 15 via Supabase

> **The migrations are the source of truth.** This document describes the
> design; `supabase/migrations/` is what actually runs, and it has been
> applied and tested against PostgreSQL. Where the two differ, the migrations
> are correct and this document is stale.
>
> Implemented in addition to the tables listed below: `user_invitations`,
> `meeting_consents`, `calendar_credentials`, `app_settings` and
> `retention_policies`. Access rules are set out in
> [security-model.md](security-model.md).

---

## 1. Conventions

All tables use `uuid` primary keys defaulting to `gen_random_uuid()`, carry
`created_at` and `updated_at` as `timestamptz` with an `updated_at` trigger,
and have Row Level Security enabled. There is no table without RLS; a table
with RLS disabled in Supabase is readable by any authenticated user holding
the publishable key, which is to say, by anyone who opens the browser
console.

Foreign keys specify deletion behaviour explicitly. Content that constitutes
a record of what happened — transcripts, audit entries, approved action
items — is never cascade-deleted by the removal of a user; those references
are set null and the display falls back to a stored name.

## 2. Entity Groups

```
IDENTITY            profiles · teams · team_members · user_preferences

MEETINGS            meetings · meeting_participants · meeting_agendas
                       │
RECORDING           recordings
                       │
PROCESSING          ai_processing_jobs
                       │
TRANSCRIPTION       transcripts · transcript_segments
                       │
EXTRACTION          ai_extractions
                       │  ← human approval gate
VERIFICATION        verification_records
                       │
OFFICIAL RECORD     action_items · tasks · task_assignments · calendar_events

WORK                daily_work_logs
CALENDAR            calendar_connections · calendar_events · calendar_sync_jobs
SUPPORT             notifications · documents · audit_logs
```

The vertical chain from `meetings` down to the official record is the spine
of the system. Each stage references the one above it, so any task created
by the AI can be traced back through the extraction, the segment, the
transcript, the recording and the meeting that produced it. This traceability
is a requirement, not a convenience: a coordinator approving a deadline must
be able to see exactly which sentence produced it.

## 3. Core Relationships

| Parent | Child | Cardinality | On parent delete |
|---|---|---|---|
| teams | team_members | 1:N | cascade |
| profiles | team_members | 1:N | cascade |
| teams | meetings | 1:N | restrict |
| meetings | meeting_participants | 1:N | cascade |
| meetings | meeting_agendas | 1:N | cascade |
| meetings | recordings | 1:N | restrict |
| recordings | ai_processing_jobs | 1:N | cascade |
| recordings | transcripts | 1:1 | restrict |
| transcripts | transcript_segments | 1:N | cascade |
| transcripts | ai_extractions | 1:N | cascade |
| ai_extractions | verification_records | 1:N | cascade |
| ai_extractions | tasks | 1:N (nullable) | set null |
| tasks | task_assignments | 1:N | cascade |
| profiles | daily_work_logs | 1:N | cascade |
| profiles | calendar_connections | 1:N | cascade |
| calendar_events | calendar_sync_jobs | 1:N | cascade |

`recordings` is `restrict` rather than `cascade` on meeting deletion by
design: deleting a meeting must not silently destroy an audio record. The
meeting must be archived instead, or the recording removed deliberately
first.

## 4. Enumerated Types

```sql
create type app_role          as enum ('super_admin','coordinator','member');
create type meeting_status    as enum ('scheduled','in_progress','completed','cancelled');
create type job_status        as enum ('uploaded','queued','processing','completed','failed');
create type extraction_kind   as enum ('summary','discussion_point','decision','action_item',
                                       'deadline','follow_up_meeting','important_date',
                                       'academic_activity','pending_issue','risk');
create type verification_state as enum ('pending','approved','rejected','modified','published');
create type task_status       as enum ('todo','in_progress','blocked','done','cancelled');
create type task_priority     as enum ('low','medium','high','urgent');
create type sync_state        as enum ('pending','sent','failed','skipped');
```

## 5. Selected Table Definitions

Full DDL ships as migrations under `supabase/migrations/`. The tables where
the design carries real consequence are given here.

### 5.1 ai_processing_jobs

```sql
create table ai_processing_jobs (
  id             uuid primary key default gen_random_uuid(),
  recording_id   uuid not null references recordings(id) on delete cascade,
  stage          text not null,                    -- 'transcribe' | 'extract'
  status         job_status not null default 'queued',
  attempts       int  not null default 0,
  max_attempts   int  not null default 3,
  claimed_by     text,                             -- worker identifier
  claimed_at     timestamptz,
  last_error     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index on ai_processing_jobs (status, created_at)
  where status in ('queued','processing');
```

A worker claims work with `for update skip locked`, which makes the queue
safe should a second worker ever be added. `claimed_at` allows a stale claim
from a machine that was shut down mid-job to be reclaimed after a timeout,
rather than leaving the job stuck forever.

### 5.2 ai_extractions

```sql
create table ai_extractions (
  id                  uuid primary key default gen_random_uuid(),
  transcript_id       uuid not null references transcripts(id) on delete cascade,
  kind                extraction_kind not null,
  content             text not null,
  suggested_assignee  uuid references profiles(id) on delete set null,
  suggested_deadline  date,
  confidence          numeric(3,2) check (confidence between 0 and 1),
  needs_clarification boolean not null default false,
  source_segment_ids  uuid[] not null default '{}',
  model_name          text not null,
  state               verification_state not null default 'pending',
  created_at          timestamptz not null default now()
);
```

`suggested_assignee` and `suggested_deadline` are nullable without default.
When the model cannot ground a value in the transcript it writes null and
sets `needs_clarification`. The verification interface renders a null
assignee as "not stated in the meeting" rather than selecting a plausible
team member, which is the behaviour that prevents a confident-looking but
invented assignment from reaching an approver.

### 5.3 The Approval Gate

```sql
alter table tasks
  add column source_extraction_id uuid references ai_extractions(id) on delete set null;

create or replace function enforce_approved_source()
returns trigger language plpgsql as $$
begin
  if new.source_extraction_id is not null then
    if not exists (
      select 1 from ai_extractions e
      where e.id = new.source_extraction_id
        and e.state in ('approved','modified','published')
    ) then
      raise exception 'Task cannot be created from an unapproved extraction';
    end if;
  end if;
  return new;
end $$;

create trigger tasks_require_approved_source
  before insert or update on tasks
  for each row execute function enforce_approved_source();
```

The same trigger pattern applies to `calendar_events`. The rule the brief
states — that AI must never automatically create official tasks or calendar
events without human approval — is thereby enforced by the database rather
than by the correctness of application code. A bug in the AI service cannot
violate it, because the database will refuse the write.

### 5.4 calendar_sync_jobs

```sql
create table calendar_sync_jobs (
  id                uuid primary key default gen_random_uuid(),
  calendar_event_id uuid not null references calendar_events(id) on delete cascade,
  connection_id     uuid not null references calendar_connections(id) on delete cascade,
  operation         text not null,                   -- create | update | delete
  idempotency_key   text not null,
  state             sync_state not null default 'pending',
  attempts          int not null default 0,
  provider_event_id text,
  last_error        text,
  created_at        timestamptz not null default now(),
  unique (connection_id, idempotency_key)
);
```

The unique constraint is the whole mechanism. A retry after an ambiguous
network failure reuses the same key and is rejected by the database rather
than producing a second calendar entry. This is the standard failure in
calendar integrations and it is cheap to prevent at the schema level.

## 6. Row Level Security

Two helper functions underpin every policy. Both are `security definer` and
`stable`, which keeps policies readable and allows the planner to cache them
within a statement.

```sql
create function is_team_member(t uuid) returns boolean
language sql security definer stable as $$
  select exists (select 1 from team_members
                 where team_id = t and profile_id = auth.uid());
$$;

create function has_role(t uuid, r app_role[]) returns boolean
language sql security definer stable as $$
  select exists (select 1 from team_members
                 where team_id = t and profile_id = auth.uid() and role = any(r));
$$;
```

Representative policies:

```sql
-- A meeting is visible to team members; editable by organiser or coordinator+
create policy meetings_select on meetings for select
  using (is_team_member(team_id));

create policy meetings_update on meetings for update
  using (organiser_id = auth.uid()
         or has_role(team_id, array['coordinator','super_admin']::app_role[]));

-- Transcripts inherit meeting participation, not mere team membership
create policy transcripts_select on transcripts for select
  using (exists (
    select 1 from recordings r
    join meeting_participants mp on mp.meeting_id = r.meeting_id
    where r.id = transcripts.recording_id and mp.profile_id = auth.uid()));

-- Only coordinators and above may act on extractions
create policy extractions_update on verification_records for insert
  with check (has_role(team_id, array['coordinator','super_admin']::app_role[]));

-- A member sees their own daily work; coordinators see the team's
create policy daily_work_select on daily_work_logs for select
  using (profile_id = auth.uid()
         or has_role(team_id, array['coordinator','super_admin']::app_role[]));
```

Transcript access deliberately follows *participation*, not team membership.
A meeting that a member did not attend is not automatically readable by
them. This is the correct default for a system holding recorded discussion,
and it is also what makes the assistant's permission-aware retrieval work
correctly without any additional filtering logic.

### 6.1 Index Support for Policies

Every column referenced by an RLS policy is indexed —
`team_members(profile_id, team_id)`, `meeting_participants(profile_id,
meeting_id)`, `tasks(assignee_id)`, `daily_work_logs(profile_id, log_date)`.
An unindexed policy predicate turns every query into a sequential scan, and
the symptom (a dashboard that slows down as data accumulates) is easy to
misdiagnose.

## 7. Storage

One private bucket, `recordings`, with no public access. Uploads use signed
upload URLs issued to authenticated participants. Downloads use short-lived
signed URLs issued by the worker using the service-role key. A storage
policy restricts the upload path prefix to `{team_id}/{meeting_id}/`, and
file type and size are validated both client-side and in the worker before
processing.

Temporary audio written to the Windows host during transcription is removed
in a `finally` block, so that a failed job does not leave meeting audio on a
personal laptop.

## 8. Audit

`audit_logs` records actor, action, entity type, entity id, before and after
state as `jsonb`, and timestamp. Written by trigger for: role changes, user
creation and deactivation, extraction approval and rejection, recording
deletion, and calendar connection changes. The table is insert-only to all
roles; nobody may update or delete a row through the application, which is
what makes the log worth keeping.

## 9. Migration Policy

Migrations are forward-only, timestamped, and never edited after being
applied to a shared environment. Each migration is paired with a note in its
header stating what it changes and why. Seed data for development lives in
`supabase/seed.sql` and is clearly distinguishable from real data, so that
sample records can never be mistaken for institutional record.

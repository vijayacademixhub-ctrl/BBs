-- 0005_recordings_ai
-- Audio, the asynchronous processing queue, transcripts and AI extractions.
--
-- No table here stores a public URL. Audio and attachments live in private
-- buckets and are reached only through short-lived signed URLs minted for a
-- user who has already passed can_access_meeting_content.

create table public.recordings (
  id               uuid primary key default gen_random_uuid(),
  meeting_id       uuid not null references public.meetings (id) on delete restrict,
  storage_path     text not null unique check (storage_path !~ '^https?://'),
  mime_type        text not null check (mime_type in (
                     'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav'
                   )),
  byte_size        bigint not null check (byte_size > 0 and byte_size <= 536870912),
  duration_seconds integer check (duration_seconds >= 0),
  checksum_sha256  text check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by      uuid references public.profiles (id) on delete set null,
  -- Set only when a retention policy has been approved and applied. Null
  -- means the audio is retained indefinitely, which is the current position.
  deleted_at       timestamptz,
  deleted_by       uuid references public.profiles (id) on delete set null,
  deletion_reason  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index recordings_meeting_idx on public.recordings (meeting_id);
select public.attach_updated_at('public.recordings');

comment on column public.recordings.storage_path is
  'Path within the private meeting-recordings bucket. Never a URL: the check '
  'constraint refuses one, so a permanent public link cannot be stored here '
  'even by mistake.';

comment on column public.recordings.meeting_id is
  'on delete restrict — deleting a meeting must not silently destroy audio.';

create table public.ai_processing_jobs (
  id            uuid primary key default gen_random_uuid(),
  recording_id  uuid not null references public.recordings (id) on delete cascade,
  stage         job_stage not null,
  status        job_status not null default 'queued',
  attempts      integer not null default 0 check (attempts >= 0),
  max_attempts  integer not null default 3 check (max_attempts > 0),
  claimed_by    text,
  claimed_at    timestamptz,
  last_error    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- Partial index: the worker only ever asks for outstanding work.
create index ai_processing_jobs_pending_idx
  on public.ai_processing_jobs (status, created_at)
  where status in ('queued', 'processing');
create index ai_processing_jobs_recording_idx on public.ai_processing_jobs (recording_id);
select public.attach_updated_at('public.ai_processing_jobs');

create table public.transcripts (
  id            uuid primary key default gen_random_uuid(),
  recording_id  uuid not null unique references public.recordings (id) on delete restrict,
  language      meeting_language not null default 'mixed',
  model_name    text not null,
  status        job_status not null default 'completed',
  edited_by     uuid references public.profiles (id) on delete set null,
  edited_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
select public.attach_updated_at('public.transcripts');

create table public.transcript_segments (
  id             uuid primary key default gen_random_uuid(),
  transcript_id  uuid not null references public.transcripts (id) on delete cascade,
  position       integer not null check (position >= 0),
  starts_ms      integer not null check (starts_ms >= 0),
  ends_ms        integer not null check (ends_ms >= 0),
  speaker_label  text,
  content        text not null,
  created_at     timestamptz not null default now(),
  unique (transcript_id, position),
  constraint transcript_segments_ordered check (ends_ms >= starts_ms)
);
create index transcript_segments_transcript_idx on public.transcript_segments (transcript_id, position);

create table public.ai_extractions (
  id                  uuid primary key default gen_random_uuid(),
  transcript_id       uuid not null references public.transcripts (id) on delete cascade,
  kind                extraction_kind not null,
  content             text not null check (length(btrim(content)) > 0),
  -- Null means the transcript did not state it. The model is instructed never
  -- to supply a plausible value in place of one that was not said, and the
  -- absence of a default here is part of that: nothing fills these in.
  suggested_assignee  uuid references public.profiles (id) on delete set null,
  suggested_deadline  date,
  confidence          numeric(3,2) check (confidence >= 0 and confidence <= 1),
  needs_clarification boolean not null default false,
  source_segment_ids  uuid[] not null default '{}',
  model_name          text not null,
  state               verification_state not null default 'pending',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index ai_extractions_transcript_idx on public.ai_extractions (transcript_id, state);
create index ai_extractions_pending_idx on public.ai_extractions (state) where state = 'pending';
select public.attach_updated_at('public.ai_extractions');

create table public.verification_records (
  id            uuid primary key default gen_random_uuid(),
  extraction_id uuid not null references public.ai_extractions (id) on delete cascade,
  reviewer_id   uuid not null references public.profiles (id) on delete restrict,
  decision      verification_decision not null,
  note          text check (length(note) <= 2000),
  edited_content text,
  created_at    timestamptz not null default now()
);
create index verification_records_extraction_idx on public.verification_records (extraction_id, created_at desc);

comment on table public.verification_records is
  'Append-only review history. Each row records one human decision about one '
  'AI extraction, and who made it.';

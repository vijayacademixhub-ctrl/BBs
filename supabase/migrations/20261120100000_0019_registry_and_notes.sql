-- 0019_registry_and_notes
--
-- Two additions, both driven by how the team actually works.
--
-- 1. The register. The Master Index workbook is not one table but a set of
--    them — documents, work allocation, weekly review, source map, programme
--    structure — and the team adds to it continually. Modelling each as its
--    own SQL table would mean a migration every time a column is wanted, so
--    a register carries its own field list and its records hold values in
--    jsonb keyed by field. The field list is still relational, so a column
--    can be renamed, reordered or described without touching any record.
--
-- 2. Meeting notes WITHOUT audio. The earlier design stored the audio file in
--    a private bucket and derived a transcript from it. The decision has
--    changed: audio is never persisted. A capture session holds the stream in
--    the browser, sends it to the transcription endpoint and discards it, and
--    what reaches the database is this note — transcript text, data points,
--    decisions and actions.
--
--    The `recordings`, `transcripts` and `transcript_segments` tables and the
--    `meeting-recordings` bucket remain in the schema from that earlier
--    design and are now dormant: the application writes to none of them.
--    They are not dropped here because the access-control suite covers them
--    in detail and removing them belongs in its own change, with those tests
--    rewritten rather than deleted. See docs/audio-free-capture.md.

-- ============================================================= registers ===

create table public.registers (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams (id) on delete restrict,
  slug            text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name            text not null check (length(btrim(name)) between 1 and 120),
  description     text not null default '' check (length(description) <= 1000),
  group_name      text not null default 'General' check (length(group_name) <= 60),
  icon            text not null default 'table' check (length(icon) <= 40),
  title_field_id  text not null,
  status_field_id text,
  owner_field_id  text,
  due_field_id    text,
  updated_field_id text,
  done_values     text[] not null default '{}',
  -- A register imported from the workbook. Protected from deletion so the
  -- index the team depends on cannot be removed by a stray click.
  built_in        boolean not null default false,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (team_id, slug)
);
create index registers_team_idx on public.registers (team_id, group_name, name);
select public.attach_updated_at('public.registers');

create table public.register_fields (
  id          uuid primary key default gen_random_uuid(),
  register_id uuid not null references public.registers (id) on delete cascade,
  -- The key used inside register_records.values. Immutable by convention: a
  -- rename changes the label, never this.
  field_key   text not null check (field_key ~ '^[a-zA-Z][a-zA-Z0-9_]*$'),
  label       text not null check (length(btrim(label)) between 1 and 80),
  kind        text not null check (kind in
                ('text', 'longtext', 'select', 'date', 'url', 'number', 'percent')),
  options     text[] not null default '{}',
  in_grid     boolean not null default true,
  help        text not null default '' check (length(help) <= 400),
  built_in    boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (register_id, field_key)
);
create index register_fields_register_idx on public.register_fields (register_id, position);
select public.attach_updated_at('public.register_fields');

comment on column public.register_fields.field_key is
  'Stable key for this column inside register_records.values. Renaming a '
  'column changes label, not this, so no record has to be rewritten.';

create table public.register_records (
  id          uuid primary key default gen_random_uuid(),
  register_id uuid not null references public.registers (id) on delete cascade,
  values      jsonb not null default '{}'::jsonb check (jsonb_typeof(values) = 'object'),
  -- Archived rather than deleted. A line removed from a shared index is
  -- usually a mistake, and this makes it reversible.
  archived_at timestamptz,
  created_by  uuid references public.profiles (id) on delete set null,
  updated_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index register_records_register_idx on public.register_records (register_id)
  where archived_at is null;
create index register_records_values_idx on public.register_records using gin (values);
select public.attach_updated_at('public.register_records');

-- Field-level history. The workbook had none, so a value that moved could not
-- be explained afterwards. Append-only: the grants below remove UPDATE and
-- DELETE from signed-in sessions, so a change cannot be edited out.
create table public.register_record_changes (
  id          uuid primary key default gen_random_uuid(),
  register_id uuid not null references public.registers (id) on delete cascade,
  record_id   uuid not null references public.register_records (id) on delete cascade,
  field_key   text,
  action      text not null check (action in ('create', 'update', 'archive', 'restore', 'delete')),
  before_value text,
  after_value  text,
  changed_by  uuid references public.profiles (id) on delete set null,
  changed_at  timestamptz not null default now()
);
create index register_record_changes_record_idx
  on public.register_record_changes (record_id, changed_at desc);
create index register_record_changes_register_idx
  on public.register_record_changes (register_id, changed_at desc);

-- ========================================================= meeting notes ===

create table public.meeting_notes (
  id               uuid primary key default gen_random_uuid(),
  meeting_id       uuid not null references public.meetings (id) on delete cascade,
  title            text not null check (length(btrim(title)) between 1 and 200),
  source           text not null check (source in ('live_capture', 'pasted_transcript', 'manual')),
  language         meeting_language not null default 'mixed',
  transcript       text not null default '',
  transcript_model text,
  summary          text,
  captured_minutes numeric(6,2) check (captured_minutes >= 0),
  -- Declared in the data, not only in the interface. The constraint makes the
  -- claim that no audio is kept unfalsifiable at this layer: a row asserting
  -- otherwise cannot exist.
  audio_retained   boolean not null default false check (audio_retained = false),
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index meeting_notes_meeting_idx on public.meeting_notes (meeting_id, created_at desc);
select public.attach_updated_at('public.meeting_notes');

comment on table public.meeting_notes is
  'What a meeting leaves behind once the audio is gone: the transcript text, '
  'the data points, the decisions and the actions. No column here holds or '
  'references an audio file, and audio_retained is constrained to false.';

create table public.meeting_note_data_points (
  id        uuid primary key default gen_random_uuid(),
  note_id   uuid not null references public.meeting_notes (id) on delete cascade,
  label     text not null check (length(btrim(label)) between 1 and 160),
  value     text not null check (length(btrim(value)) between 1 and 400),
  unit      text check (length(unit) <= 40),
  -- The passage the point came from, so a reader can check it rather than
  -- trust it.
  evidence  text,
  origin    text not null default 'person' check (origin in ('person', 'ai')),
  verified  boolean not null default false,
  position  integer not null default 0,
  created_at timestamptz not null default now(),
  -- An AI-produced point starts unverified and has to be checked by a person,
  -- which is the same gate the extraction pipeline uses for tasks.
  constraint data_point_person_origin_is_verified
    check (origin = 'ai' or verified)
);
create index meeting_note_data_points_note_idx
  on public.meeting_note_data_points (note_id, position);

create table public.meeting_note_items (
  id        uuid primary key default gen_random_uuid(),
  note_id   uuid not null references public.meeting_notes (id) on delete cascade,
  kind      text not null check (kind in ('decision', 'action')),
  content   text not null check (length(btrim(content)) > 0),
  position  integer not null default 0,
  created_at timestamptz not null default now()
);
create index meeting_note_items_note_idx on public.meeting_note_items (note_id, kind, position);

-- =============================================================== helpers ===
--
-- Both resolve the owning entity for a child row so the policies below can be
-- written in one line. SECURITY DEFINER because a signed-in session must be
-- able to resolve the parent of a row it is about to be allowed to read,
-- which it cannot do through its own policies without a circular dependency.
-- Both pin search_path, so neither can be redirected to a shadowed table.

create or replace function public.team_of_register(p_register uuid)
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select r.team_id from public.registers r where r.id = p_register;
$$;

create or replace function public.meeting_of_note(p_note uuid)
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select n.meeting_id from public.meeting_notes n where n.id = p_note;
$$;

-- =================================================================== rls ===

alter table public.registers                enable row level security;
alter table public.register_fields          enable row level security;
alter table public.register_records         enable row level security;
alter table public.register_record_changes  enable row level security;
alter table public.meeting_notes            enable row level security;
alter table public.meeting_note_data_points enable row level security;
alter table public.meeting_note_items       enable row level security;

-- A register belongs to a team, and every member of that team may read and
-- edit it. That is deliberate and differs from meeting content: the index is
-- the team's shared working surface, and an index only one person can correct
-- goes stale. Deleting a register is narrower — see registers_delete.

create policy registers_select on public.registers
  for select to authenticated
  using (public.is_team_member(team_id));

create policy registers_insert on public.registers
  for insert to authenticated
  with check (public.is_team_member(team_id) and not built_in);

create policy registers_update on public.registers
  for update to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

create policy registers_delete on public.registers
  for delete to authenticated
  using (
    not built_in
    and public.has_team_role(team_id, array['super_admin', 'coordinator']::app_role[])
  );

create policy register_fields_select on public.register_fields
  for select to authenticated
  using (public.is_team_member(public.team_of_register(register_id)));

create policy register_fields_write on public.register_fields
  for all to authenticated
  using (public.is_team_member(public.team_of_register(register_id)))
  with check (public.is_team_member(public.team_of_register(register_id)));

create policy register_records_select on public.register_records
  for select to authenticated
  using (public.is_team_member(public.team_of_register(register_id)));

create policy register_records_write on public.register_records
  for all to authenticated
  using (public.is_team_member(public.team_of_register(register_id)))
  with check (public.is_team_member(public.team_of_register(register_id)));

create policy register_changes_select on public.register_record_changes
  for select to authenticated
  using (public.is_team_member(public.team_of_register(register_id)));

-- Insert only; no update or delete policy, and the privilege is revoked
-- below as well. History is written once.
create policy register_changes_insert on public.register_record_changes
  for insert to authenticated
  with check (public.is_team_member(public.team_of_register(register_id)));

-- Notes follow meeting content exactly. Team membership is not enough: what
-- was said in a meeting is readable by its participants, and a note is a
-- distillation of what was said.

create policy meeting_notes_select on public.meeting_notes
  for select to authenticated
  using (public.can_access_meeting_content(meeting_id));

create policy meeting_notes_write on public.meeting_notes
  for all to authenticated
  using (public.can_access_meeting_content(meeting_id))
  with check (public.can_access_meeting_content(meeting_id));

create policy note_data_points_select on public.meeting_note_data_points
  for select to authenticated
  using (public.can_access_meeting_content(public.meeting_of_note(note_id)));

create policy note_data_points_write on public.meeting_note_data_points
  for all to authenticated
  using (public.can_access_meeting_content(public.meeting_of_note(note_id)))
  with check (public.can_access_meeting_content(public.meeting_of_note(note_id)));

create policy note_items_select on public.meeting_note_items
  for select to authenticated
  using (public.can_access_meeting_content(public.meeting_of_note(note_id)));

create policy note_items_write on public.meeting_note_items
  for all to authenticated
  using (public.can_access_meeting_content(public.meeting_of_note(note_id)))
  with check (public.can_access_meeting_content(public.meeting_of_note(note_id)));

-- ------------------------------------------------- mandatory second factor --
--
-- Migration 0015 applies this restrictive policy to every table that existed
-- when it ran. Tables added afterwards need it explicitly, and a structural
-- test asserts that none is missing.

do $$
declare
  v_table text;
begin
  for v_table in
    select unnest(array[
      'registers', 'register_fields', 'register_records', 'register_record_changes',
      'meeting_notes', 'meeting_note_data_points', 'meeting_note_items'
    ])
  loop
    execute format(
      'create policy require_mfa on public.%I as restrictive to authenticated '
      'using (public.is_mfa_verified()) with check (public.is_mfa_verified())',
      v_table
    );
  end loop;
end;
$$;

-- ================================================================ grants ===
--
-- Migration 0013 granted the authenticated role table privileges across the
-- schema as it stood then, and revoked everything from anon including default
-- privileges for new tables. These tables therefore start with nothing and
-- are granted individually.

grant select, insert, update, delete on
  public.registers, public.register_fields, public.register_records,
  public.meeting_notes, public.meeting_note_data_points, public.meeting_note_items
to authenticated;

grant select, insert on public.register_record_changes to authenticated;

grant all on
  public.registers, public.register_fields, public.register_records,
  public.register_record_changes, public.meeting_notes,
  public.meeting_note_data_points, public.meeting_note_items
to service_role;

grant execute on function
  public.team_of_register(uuid), public.meeting_of_note(uuid)
to authenticated;

-- ================================================================= audit ===

create trigger audit_registers
  after insert or update or delete on public.registers
  for each row execute function public.audit_row_change('register', 'team_id');

create trigger audit_meeting_notes
  after insert or update or delete on public.meeting_notes
  for each row execute function public.audit_row_change('meeting_note', 'meeting:meeting_id');

-- ====================================================== recorded decision ===

insert into public.app_settings (key, value, description)
values (
  'capture.audio_retention',
  '{"mode": "never_stored", "decided_on": "2026-11-20"}'::jsonb,
  'Meeting audio is never written to the database or to storage. A capture '
  'session transcribes in flight and discards the audio; only the transcript '
  'and the data points are kept, as meeting notes. The recordings tables and '
  'the meeting-recordings bucket are dormant remnants of the earlier design.'
)
on conflict (key) do update set value = excluded.value, description = excluded.description;

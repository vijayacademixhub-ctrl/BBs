-- 0006_work
-- Action items, tasks, assignment history and daily work logs.
--
-- Contains the approval gate: the rule that AI output cannot become an
-- official record without a human decision, enforced by the database rather
-- than by the correctness of application code.

create table public.action_items (
  id             uuid primary key default gen_random_uuid(),
  meeting_id     uuid not null references public.meetings (id) on delete restrict,
  extraction_id  uuid references public.ai_extractions (id) on delete set null,
  content        text not null check (length(btrim(content)) > 0),
  owner_id       uuid references public.profiles (id) on delete set null,
  due_date       date,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index action_items_meeting_idx on public.action_items (meeting_id);
select public.attach_updated_at('public.action_items');

create table public.tasks (
  id                   uuid primary key default gen_random_uuid(),
  team_id              uuid not null references public.teams (id) on delete restrict,
  title                text not null check (length(btrim(title)) between 3 and 200),
  description          text check (length(description) <= 4000),
  status               task_status not null default 'todo',
  priority             task_priority not null default 'medium',
  category             text not null default 'General' check (length(category) <= 60),
  due_date             date,
  assignee_id          uuid references public.profiles (id) on delete set null,
  created_by           uuid references public.profiles (id) on delete set null,
  progress             integer not null default 0 check (progress between 0 and 100),
  meeting_id           uuid references public.meetings (id) on delete set null,
  source_extraction_id uuid references public.ai_extractions (id) on delete set null,
  completed_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint tasks_completion_consistent
    check ((status = 'done') = (completed_at is not null)),
  constraint tasks_done_is_complete
    check (status <> 'done' or progress = 100)
);
create index tasks_assignee_status_idx on public.tasks (assignee_id, status);
create index tasks_team_due_idx on public.tasks (team_id, due_date);
create index tasks_source_extraction_idx on public.tasks (source_extraction_id)
  where source_extraction_id is not null;
select public.attach_updated_at('public.tasks');

create table public.task_assignments (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks (id) on delete cascade,
  profile_id    uuid not null references public.profiles (id) on delete restrict,
  assigned_by   uuid references public.profiles (id) on delete set null,
  assigned_at   timestamptz not null default now(),
  unassigned_at timestamptz,
  constraint task_assignments_interval check (unassigned_at is null or unassigned_at >= assigned_at)
);
create index task_assignments_task_idx on public.task_assignments (task_id, assigned_at desc);
-- One live assignment per task. History is kept by closing the previous row.
create unique index task_assignments_one_active
  on public.task_assignments (task_id) where (unassigned_at is null);

create table public.daily_work_logs (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references public.teams (id) on delete restrict,
  profile_id     uuid not null references public.profiles (id) on delete cascade,
  log_date       date not null,
  completed      text not null check (length(btrim(completed)) >= 10),
  in_progress    text not null default '',
  pending        text not null default '',
  challenges     text,
  next_day_plan  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- One entry per person per day; a correction edits the existing row rather
  -- than creating a second account of the same day.
  unique (profile_id, log_date)
);
create index daily_work_logs_team_date_idx on public.daily_work_logs (team_id, log_date desc);
select public.attach_updated_at('public.daily_work_logs');

-- ------------------------------------------------- the approval gate ------
--
-- A task or calendar event may cite an AI extraction as its source only if a
-- human has approved that extraction. Enforced as a trigger so that no code
-- path can bypass it: not the AI service, not a mistaken API call, not a
-- future developer who forgets. PostgreSQL refuses the write.

create or replace function public.enforce_verified_ai_source()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state verification_state;
begin
  if new.source_extraction_id is null then
    return new;
  end if;

  select state into v_state
  from public.ai_extractions
  where id = new.source_extraction_id;

  if v_state is null then
    raise exception 'The cited AI extraction does not exist.' using errcode = '23503';
  end if;

  if v_state not in ('approved', 'modified', 'published') then
    raise exception
      'AI-derived content cannot become an official record until it has been verified (extraction is %).',
      v_state
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.enforce_verified_ai_source() is
  'The human verification gate. Refuses any task or calendar event that cites '
  'an unapproved AI extraction.';

create trigger tasks_require_verified_source
  before insert or update of source_extraction_id on public.tasks
  for each row execute function public.enforce_verified_ai_source();

-- Keeps completed_at honest without the application having to remember.
create or replace function public.sync_task_completion()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' then
    new.completed_at := coalesce(new.completed_at, now());
    new.progress := 100;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger sync_task_completion
  before insert or update on public.tasks
  for each row execute function public.sync_task_completion();

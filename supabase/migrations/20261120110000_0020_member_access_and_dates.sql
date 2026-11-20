-- 0020_member_access_and_dates
--
-- Two changes, both decided by the account owner on 20-Nov-2026.
--
-- 1. A second factor is required of Super Admins and of nobody else.
--
--    Migration 0015 required it of every account. That is the stronger
--    position and it is being deliberately narrowed, so the reasoning is
--    recorded here rather than left to be inferred.
--
--    The team is fourteen members and one administrator. Requiring every one
--    of them to enrol an authenticator app before they can open the index
--    meant, in practice, that the index would not be used — and Supabase
--    issues no backup codes, so each lost phone becomes an administrator-
--    assisted reset. The Super Admin account is the one that can reach every
--    team, change roles and read the audit trail, and it keeps the
--    requirement.
--
--    What a member account can reach without a second factor is therefore
--    worth being clear about: their team's registers, meetings they take
--    part in, tasks and daily work. Not another team's anything — that is
--    enforced by the team predicates, which are untouched here.
--
-- 2. Data points carry the date they refer to.
--
--    A figure without a date reads as a current fact. Six weeks later nobody
--    can tell whether it still is, which is the problem the Master Index
--    exists to solve, reappearing inside the meeting notes.

-- ============================================ who must present two factors ===

create or replace function public.requires_second_factor()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.profile_id = auth.uid()
      and tm.role = 'super_admin'
  );
$$;

comment on function public.requires_second_factor() is
  'True when the caller holds Super Admin in any team. Those accounts must '
  'present a verified second factor; member and coordinator accounts sign in '
  'with a password alone. Narrowed from "everyone" in migration 0020.';

grant execute on function public.requires_second_factor() to authenticated;

-- The policy text still names is_mfa_verified() directly rather than hiding
-- it behind a helper. A structural test asserts that every table carries a
-- restrictive policy mentioning it, and that test is the thing which catches
-- a table added later with no assurance check at all. Wrapping the call
-- would silence it.

do $$
declare
  v_table text;
begin
  for v_table in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname <> 'profiles'
    order by 1
  loop
    execute format('drop policy if exists require_mfa on public.%I', v_table);
    execute format(
      'create policy require_mfa on public.%I as restrictive to authenticated '
      'using (public.is_mfa_verified() or not public.requires_second_factor()) '
      'with check (public.is_mfa_verified() or not public.requires_second_factor())',
      v_table
    );
  end loop;
end
$$;

-- `profiles` keeps its narrower form: a Super Admin who has not yet verified
-- a factor must still be able to read their own row, or the enrolment screen
-- has nothing to show them.
drop policy if exists require_mfa on public.profiles;
create policy require_mfa on public.profiles
  as restrictive
  to authenticated
  using (public.is_mfa_verified() or not public.requires_second_factor() or id = auth.uid())
  with check (public.is_mfa_verified() or not public.requires_second_factor());

-- Storage sits outside the application schema and needs saying separately.
-- It is left stricter than the tables on purpose: the buckets hold meeting
-- attachments and documents, and nothing in the current application writes
-- or reads them, so relaxing them would widen access for no working feature.
-- When document upload is built, this is the line to revisit.

-- ================================================== data points with dates ===

alter table public.meeting_note_data_points
  add column point_date date,
  add column date_kind  text check (date_kind in ('as_of', 'due', 'decided_on', 'event'));

comment on column public.meeting_note_data_points.point_date is
  'The date the figure refers to, where one was stated in the meeting. Null '
  'means no date was stated — never a guess, and never today''s date as a '
  'stand-in, because an invented date reads as precision that is not there.';

comment on column public.meeting_note_data_points.date_kind is
  'What the date means: the figure''s as-of date, a deadline, the date a '
  'decision was taken, or the date of an event.';

-- A kind without a date describes nothing.
alter table public.meeting_note_data_points
  add constraint data_point_date_kind_needs_date
  check (date_kind is null or point_date is not null);

create index meeting_note_data_points_date_idx
  on public.meeting_note_data_points (point_date)
  where point_date is not null;

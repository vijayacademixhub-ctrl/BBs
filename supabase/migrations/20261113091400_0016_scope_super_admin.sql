-- 0016_scope_super_admin
--
-- SECURITY FIX — cross-team privilege escalation.
--
-- `is_super_admin()` answers "is this user a Super Admin of ANY team". That is
-- the right question for a trigger guard, where the alternative is checking a
-- row that is being created. It is the wrong question everywhere it was used
-- to grant access to a team's data.
--
-- The effect, before this migration: a Super Admin of team B could read every
-- recording, transcript, segment and AI extraction belonging to team A,
-- suspend team A's staff, read team A's restricted documents, and delete team
-- A's recordings from both the database and storage.
--
-- AcademicOS is currently deployed for one team, so nothing was exposed in
-- practice. The policies nonetheless claimed cross-team isolation that they
-- did not provide, and the hole would have opened the moment a second team
-- was created — which is exactly when nobody would be looking for it.
--
-- Found by a test asserting the access matrix role by role, not by review.

-- A Super Admin of a specific team. This is the question almost every policy
-- actually wants.
create or replace function public.is_super_admin_of(p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select public.has_team_role(p_team, array['super_admin']::app_role[]);
$$;

grant execute on function public.is_super_admin_of(uuid) to authenticated;

comment on function public.is_super_admin_of(uuid) is
  'Super Admin of a NAMED team. Prefer this over is_super_admin(), which asks '
  'only whether the user administers something, somewhere.';

comment on function public.is_super_admin() is
  'Super Admin of ANY team. Correct only where no team is in scope — the '
  'trigger guards, and the institution-wide settings tables. Using it to gate '
  'a team''s data grants every Super Admin access to every team.';

-- ------------------------------------------------------ content access ----

create or replace function public.can_access_meeting_content(p_meeting uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select public.is_active_user()
     and exists (
       select 1
       from public.meetings m
       where m.id = p_meeting
         and (
           public.is_meeting_participant(m.id)
           or m.organiser_id = auth.uid()
           -- Oversight belongs to the Super Admin OF THIS MEETING'S TEAM.
           or public.is_super_admin_of(m.team_id)
         )
     );
$$;

-- --------------------------------------------------- profile management ---

-- A Super Admin may manage the accounts of people in a team they administer,
-- and nobody else's.
drop policy if exists profiles_admin_manage on public.profiles;
create policy profiles_admin_manage on public.profiles
  for update to authenticated
  using (
    exists (
      select 1 from public.team_members tm
      where tm.profile_id = public.profiles.id
        and public.is_super_admin_of(tm.team_id)
    )
  )
  with check (
    exists (
      select 1 from public.team_members tm
      where tm.profile_id = public.profiles.id
        and public.is_super_admin_of(tm.team_id)
    )
  );

-- ------------------------------------------------------------ documents ---

drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents
  for select to authenticated
  using (
    deleted_at is null
    and (
      case
        when meeting_id is not null then public.can_access_meeting_content(meeting_id)
        when confidentiality = 'restricted' then
          uploaded_by = auth.uid() or public.is_super_admin_of(team_id)
        else public.is_team_member(team_id)
      end
    )
  );

-- ----------------------------------------------------------- recordings ---

drop policy if exists recordings_admin_delete on public.recordings;
create policy recordings_admin_delete on public.recordings
  for delete to authenticated
  using (
    exists (
      select 1 from public.meetings m
      where m.id = public.recordings.meeting_id
        and public.is_super_admin_of(m.team_id)
    )
  );

-- -------------------------------------------------------------- storage ---

drop policy if exists "recordings deletable by super admin" on storage.objects;
create policy "recordings deletable by super admin"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'meeting-recordings'
    and public.is_super_admin_of(((storage.foldername(name))[1])::uuid)
  );

-- ----------------------------------------------------------- audit logs ---
--
-- Audit rows carry the meeting title and description for meeting changes, and
-- the storage path for recordings, so they are not neutral metadata.
--
-- Rows that name a team are scoped to a Super Admin of that team. Rows that do
-- not — profile, recording and transcript changes, which have no team column
-- to copy from — remain visible to any Super Admin. For a single-team
-- deployment that is the same thing. It is a real residual gap if a second
-- team is ever created, and the fix then is to resolve and store the team on
-- those audit rows. Recorded in docs/security-hardening-report.md rather than
-- left for someone to discover.
drop policy if exists audit_logs_super_admin_read on public.audit_logs;
create policy audit_logs_super_admin_read on public.audit_logs
  for select to authenticated
  using (
    case
      when team_id is not null then public.is_super_admin_of(team_id)
      else public.is_super_admin()
    end
  );

-- ------------------------------------ recordings are not deletable from ---
-- ------------------------------------ a browser session, by anyone --------
--
-- Migration 0013 revokes DELETE on public.recordings from `authenticated`,
-- which means the admin-delete policy above could never fire: the privilege
-- check happens first. A policy that can never take effect is worse than no
-- policy, because it reads as a capability that exists.
--
-- Resolved in favour of the stricter position rather than the policy. Audio
-- is an institutional record, and removing it is a deliberate, audited,
-- server-side act carried out by the AI service under an approved retention
-- policy or an explicit administrative instruction — not something available
-- behind a button in a browser, to anyone, ever.
--
-- The storage policy is dropped for the same reason: leaving it would allow
-- the file to be removed while its database row remained, which is a worse
-- state than either keeping both or removing both.
drop policy if exists recordings_admin_delete on public.recordings;
drop policy if exists "recordings deletable by super admin" on storage.objects;

comment on table public.recordings is
  'Meeting audio. Not deletable from any browser session: DELETE is revoked '
  'from the authenticated role and no policy grants it. Removal is a '
  'server-side action performed with the service-role key, under an approved '
  'retention policy or an explicit administrative instruction, and audited.';

-- 0010_rls
-- Row Level Security for every table.
--
-- Read this file as the authoritative statement of who may see what.
-- The frontend's role checks decide which buttons are drawn; these policies
-- decide what the database will actually return.
--
-- Principles applied throughout:
--   * RLS is enabled on every table without exception.
--   * Where a table should be unreachable from the browser, RLS is enabled
--     and no policy is written, which denies everything.
--   * Membership of a team never by itself grants access to what was said in
--     a meeting. That requires participation.
--   * A suspended account satisfies no policy, because every helper requires
--     public.is_active_user().

alter table public.teams                enable row level security;
alter table public.profiles             enable row level security;
alter table public.team_members         enable row level security;
alter table public.user_invitations     enable row level security;
alter table public.user_preferences     enable row level security;
alter table public.meetings             enable row level security;
alter table public.meeting_participants enable row level security;
alter table public.meeting_agendas      enable row level security;
alter table public.meeting_consents     enable row level security;
alter table public.recordings           enable row level security;
alter table public.ai_processing_jobs   enable row level security;
alter table public.transcripts          enable row level security;
alter table public.transcript_segments  enable row level security;
alter table public.ai_extractions       enable row level security;
alter table public.verification_records enable row level security;
alter table public.action_items         enable row level security;
alter table public.tasks                enable row level security;
alter table public.task_assignments     enable row level security;
alter table public.daily_work_logs      enable row level security;
alter table public.calendar_connections enable row level security;
alter table public.calendar_credentials enable row level security;
alter table public.calendar_events      enable row level security;
alter table public.calendar_sync_jobs   enable row level security;
alter table public.notifications        enable row level security;
alter table public.documents            enable row level security;
alter table public.audit_logs           enable row level security;
alter table public.app_settings         enable row level security;
alter table public.retention_policies   enable row level security;

-- ================================================================ teams ===

create policy teams_select on public.teams
  for select to authenticated
  using (public.is_team_member(id));

create policy teams_write on public.teams
  for all to authenticated
  using (public.has_team_role(id, array['super_admin']::app_role[]))
  with check (public.has_team_role(id, array['super_admin']::app_role[]));

-- ============================================================= profiles ===

-- A team member can see their colleagues, which is needed to assign a task or
-- invite someone to a meeting. They see the profile record only; nothing
-- confidential lives on it.
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or (
      public.is_active_user()
      and exists (
        select 1
        from public.team_members mine
        join public.team_members theirs on theirs.team_id = mine.team_id
        where mine.profile_id = auth.uid() and theirs.profile_id = public.profiles.id
      )
    )
  );

-- Own profile only. The guard_profile_changes trigger additionally refuses
-- any change to status or email, so this policy cannot be used to grant
-- oneself an active account.
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_admin_manage on public.profiles
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- No INSERT policy: profiles are created by the invitation trigger, which
-- runs as the definer. No DELETE policy: accounts are suspended, not erased,
-- so that attribution on past records survives.

-- ========================================================= team_members ===

create policy team_members_select on public.team_members
  for select to authenticated
  using (public.is_team_member(team_id));

-- Membership is managed by Super Admins alone. Coordinators run academic
-- operations; they do not decide who is in the team. The guard trigger
-- separately blocks self-addition and self-promotion.
create policy team_members_admin_write on public.team_members
  for all to authenticated
  using (public.has_team_role(team_id, array['super_admin']::app_role[]))
  with check (public.has_team_role(team_id, array['super_admin']::app_role[]));

-- ===================================================== user_invitations ===

create policy invitations_admin_all on public.user_invitations
  for all to authenticated
  using (public.has_team_role(team_id, array['super_admin']::app_role[]))
  with check (public.has_team_role(team_id, array['super_admin']::app_role[]));

-- ===================================================== user_preferences ===

create policy preferences_own on public.user_preferences
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ============================================================= meetings ===

-- Expressed against the row's own columns rather than through
-- can_view_meeting(), which re-reads this table.
--
-- The reason is not style. PostgreSQL applies SELECT policies to the new row
-- of an INSERT ... RETURNING, and PostgREST uses RETURNING on every insert. A
-- policy that reads the table back cannot see the row being inserted, so the
-- insert would be refused — meeting creation would fail for everyone. Reading
-- the columns directly avoids that, and is cheaper besides.
create policy meetings_select on public.meetings
  for select to authenticated
  using (
    public.is_active_user()
    and (
      organiser_id = auth.uid()
      or public.is_meeting_participant(id)
      or (confidentiality = 'internal' and public.is_team_member(team_id))
    )
  );

create policy meetings_insert on public.meetings
  for insert to authenticated
  with check (
    public.has_team_role(team_id, array['coordinator', 'super_admin']::app_role[])
    and organiser_id is not null
  );

create policy meetings_update on public.meetings
  for update to authenticated
  using (public.can_manage_meeting(id))
  with check (public.can_manage_meeting(id));

create policy meetings_delete on public.meetings
  for delete to authenticated
  using (public.has_team_role(team_id, array['super_admin']::app_role[]));

-- ================================================= meeting_participants ===

create policy meeting_participants_select on public.meeting_participants
  for select to authenticated
  using (public.can_view_meeting(meeting_id));

create policy meeting_participants_manage on public.meeting_participants
  for all to authenticated
  using (public.can_manage_meeting(meeting_id))
  with check (public.can_manage_meeting(meeting_id));

-- ====================================================== meeting_agendas ===

create policy meeting_agendas_select on public.meeting_agendas
  for select to authenticated
  using (public.can_view_meeting(meeting_id));

create policy meeting_agendas_manage on public.meeting_agendas
  for all to authenticated
  using (public.can_manage_meeting(meeting_id))
  with check (public.can_manage_meeting(meeting_id));

-- ===================================================== meeting_consents ===

-- Consent records concern what a named person agreed to. Visible to the
-- meeting's participants and to whoever manages the meeting; not to the team
-- at large.
create policy meeting_consents_select on public.meeting_consents
  for select to authenticated
  using (public.can_access_meeting_content(meeting_id) or public.can_manage_meeting(meeting_id));

create policy meeting_consents_manage on public.meeting_consents
  for all to authenticated
  using (public.can_manage_meeting(meeting_id))
  with check (public.can_manage_meeting(meeting_id));

-- A participant may always withdraw their own consent. Withdrawal is the one
-- consent action the subject themselves can take.
create policy meeting_consents_withdraw_own on public.meeting_consents
  for update to authenticated
  using (profile_id = auth.uid() and public.is_active_user())
  with check (profile_id = auth.uid() and status = 'withdrawn');

-- =========================================================== recordings ===
--
-- Participation-based. A coordinator who was not in the meeting cannot read
-- its audio metadata, and the file itself is additionally gated by the
-- storage policies in 0011.

create policy recordings_select on public.recordings
  for select to authenticated
  using (public.can_access_meeting_content(meeting_id));

create policy recordings_insert on public.recordings
  for insert to authenticated
  with check (public.is_meeting_participant(meeting_id) and uploaded_by = auth.uid());

-- Deletion of audio is a Super Admin act and is audited. No ordinary user,
-- and no coordinator, can erase a recording.
create policy recordings_admin_delete on public.recordings
  for delete to authenticated
  using (public.is_super_admin());

-- =================================================== ai_processing_jobs ===
--
-- Readable by those who can read the recording, so the interface can report
-- honest progress. Never writable from the browser: the queue is driven by
-- the AI service under the service role.

create policy ai_jobs_select on public.ai_processing_jobs
  for select to authenticated
  using (public.can_access_recording(recording_id));

-- ========================================================== transcripts ===

create policy transcripts_select on public.transcripts
  for select to authenticated
  using (public.can_access_recording(recording_id));

create policy transcripts_update on public.transcripts
  for update to authenticated
  using (public.can_access_recording(recording_id))
  with check (public.can_access_recording(recording_id));

create policy transcript_segments_select on public.transcript_segments
  for select to authenticated
  using (public.can_access_transcript(transcript_id));

create policy transcript_segments_update on public.transcript_segments
  for update to authenticated
  using (public.can_access_transcript(transcript_id))
  with check (public.can_access_transcript(transcript_id));

-- ======================================================= ai_extractions ===

create policy ai_extractions_select on public.ai_extractions
  for select to authenticated
  using (public.can_access_transcript(transcript_id));

-- Only a coordinator or Super Admin who can also read the transcript may move
-- an extraction out of 'pending'. Both conditions are required.
create policy ai_extractions_verify on public.ai_extractions
  for update to authenticated
  using (
    public.can_access_transcript(transcript_id)
    and exists (
      select 1
      from public.transcripts t
      join public.recordings r on r.id = t.recording_id
      join public.meetings m on m.id = r.meeting_id
      where t.id = public.ai_extractions.transcript_id
        and public.has_team_role(m.team_id, array['coordinator', 'super_admin']::app_role[])
    )
  )
  with check (public.can_access_transcript(transcript_id));

-- ================================================= verification_records ===

create policy verification_records_select on public.verification_records
  for select to authenticated
  using (
    exists (select 1 from public.ai_extractions e
            where e.id = extraction_id and public.can_access_transcript(e.transcript_id))
  );

-- Append-only: insert is allowed, update and delete are not. A review
-- decision, once made, is part of the record.
create policy verification_records_insert on public.verification_records
  for insert to authenticated
  with check (
    reviewer_id = auth.uid()
    and exists (
      select 1
      from public.ai_extractions e
      join public.transcripts t on t.id = e.transcript_id
      join public.recordings r on r.id = t.recording_id
      join public.meetings m on m.id = r.meeting_id
      where e.id = extraction_id
        and public.can_access_transcript(e.transcript_id)
        and public.has_team_role(m.team_id, array['coordinator', 'super_admin']::app_role[])
    )
  );

-- ========================================================= action_items ===

create policy action_items_select on public.action_items
  for select to authenticated
  using (public.can_access_meeting_content(meeting_id) or public.can_manage_meeting(meeting_id));

create policy action_items_manage on public.action_items
  for all to authenticated
  using (public.can_manage_meeting(meeting_id))
  with check (public.can_manage_meeting(meeting_id));

-- =============================================================== tasks ===
--
-- A task is work allocation rather than confidential discussion, so it is
-- visible across the team. Its content comes from whoever wrote it, and the
-- team needs a shared view of who is doing what.

create policy tasks_select on public.tasks
  for select to authenticated
  using (public.is_team_member(team_id));

create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (public.is_team_member(team_id) and created_by = auth.uid());

-- The assignee may update their own task; coordinators may update any.
create policy tasks_update on public.tasks
  for update to authenticated
  using (
    public.is_active_user()
    and (
      assignee_id = auth.uid()
      or created_by = auth.uid()
      or public.has_team_role(team_id, array['coordinator', 'super_admin']::app_role[])
    )
  )
  with check (public.is_team_member(team_id));

create policy tasks_delete on public.tasks
  for delete to authenticated
  using (public.has_team_role(team_id, array['coordinator', 'super_admin']::app_role[]));

create policy task_assignments_select on public.task_assignments
  for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id and public.is_team_member(t.team_id)));

create policy task_assignments_manage on public.task_assignments
  for all to authenticated
  using (
    exists (select 1 from public.tasks t
            where t.id = task_id
              and public.has_team_role(t.team_id, array['coordinator', 'super_admin']::app_role[]))
  )
  with check (
    exists (select 1 from public.tasks t
            where t.id = task_id
              and public.has_team_role(t.team_id, array['coordinator', 'super_admin']::app_role[]))
  );

-- ===================================================== daily_work_logs ===
--
-- A person's own account of their day. Visible to them and to coordinators
-- for oversight; not to the whole team.

create policy daily_work_logs_select on public.daily_work_logs
  for select to authenticated
  using (
    profile_id = auth.uid()
    or public.has_team_role(team_id, array['coordinator', 'super_admin']::app_role[])
  );

-- Only ever your own. Nobody writes a daily report in someone else's name.
create policy daily_work_logs_own_write on public.daily_work_logs
  for all to authenticated
  using (profile_id = auth.uid() and public.is_active_user())
  with check (profile_id = auth.uid() and public.is_team_member(team_id));

-- ================================================ calendar_connections ===
--
-- Strictly the owner's. A Super Admin cannot read another person's calendar
-- connection: it is their private account, not institutional property.

create policy calendar_connections_own on public.calendar_connections
  for all to authenticated
  using (profile_id = auth.uid() and public.is_active_user())
  with check (profile_id = auth.uid() and public.is_active_user());

-- calendar_credentials: RLS enabled, deliberately no policy. Unreachable
-- from any browser session. Service role only.

create policy calendar_events_select on public.calendar_events
  for select to authenticated
  using (public.is_team_member(team_id));

create policy calendar_events_manage on public.calendar_events
  for all to authenticated
  using (public.has_team_role(team_id, array['coordinator', 'super_admin']::app_role[]))
  with check (public.has_team_role(team_id, array['coordinator', 'super_admin']::app_role[]));

-- calendar_sync_jobs: RLS enabled, no policy. The outbox is driven by the
-- server; the browser has no reason to see it.

-- ======================================================= notifications ===

create policy notifications_own_select on public.notifications
  for select to authenticated
  using (profile_id = auth.uid());

-- Marking as read is the only change a recipient may make. There is no
-- insert policy: notifications are raised by the server.
create policy notifications_own_update on public.notifications
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- =========================================================== documents ===

create policy documents_select on public.documents
  for select to authenticated
  using (
    deleted_at is null
    and (
      case
        when meeting_id is not null then public.can_access_meeting_content(meeting_id)
        when confidentiality = 'restricted' then uploaded_by = auth.uid() or public.is_super_admin()
        else public.is_team_member(team_id)
      end
    )
  );

create policy documents_insert on public.documents
  for insert to authenticated
  with check (public.is_team_member(team_id) and uploaded_by = auth.uid());

create policy documents_update on public.documents
  for update to authenticated
  using (
    uploaded_by = auth.uid()
    or public.has_team_role(team_id, array['coordinator', 'super_admin']::app_role[])
  )
  with check (public.is_team_member(team_id));

create policy documents_delete on public.documents
  for delete to authenticated
  using (public.has_team_role(team_id, array['super_admin']::app_role[]));

-- ========================================================== audit_logs ===
--
-- Readable by Super Admins only, and by nobody writable. There is no INSERT
-- policy either: rows arrive through log_audit(), which is SECURITY DEFINER.
-- 0012 revokes UPDATE and DELETE outright as a second barrier.

create policy audit_logs_super_admin_read on public.audit_logs
  for select to authenticated
  using (public.is_super_admin());

-- ======================================== app_settings and retention =====

create policy app_settings_read on public.app_settings
  for select to authenticated
  using (public.is_active_user());

create policy app_settings_admin_write on public.app_settings
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy retention_read on public.retention_policies
  for select to authenticated
  using (public.is_active_user());

create policy retention_admin_write on public.retention_policies
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

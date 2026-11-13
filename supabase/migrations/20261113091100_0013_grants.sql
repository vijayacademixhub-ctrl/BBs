-- 0012_grants
-- Privilege hardening, applied after every object exists.
--
-- RLS filters rows for a role that already holds the table privilege. These
-- grants decide which roles hold it at all. Both layers matter: a table with
-- a careless policy is still unreachable if the role has no SELECT on it.

-- ------------------------------------------------------ anonymous role ---
--
-- The anon role is what an unauthenticated browser request carries. It is
-- given nothing in the application schema. This is the single control that
-- answers "can confidential information be read anonymously": no, because the
-- role has no privilege on any table, before any policy is consulted.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
revoke usage on schema public from anon;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- --------------------------------------------------- authenticated role --

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Tables an authenticated session must never write, whatever any policy says.
-- Append-only and server-driven records are protected here as well as by the
-- absence of a policy, so that adding a policy later cannot quietly open them.
revoke insert, update, delete on public.audit_logs from authenticated;
revoke update, delete on public.verification_records from authenticated;
revoke all on public.calendar_credentials from authenticated;
revoke insert, update, delete on public.ai_processing_jobs from authenticated;
revoke all on public.calendar_sync_jobs from authenticated;
revoke insert, delete on public.transcripts from authenticated;
revoke insert, delete on public.transcript_segments from authenticated;
revoke insert, delete on public.ai_extractions from authenticated;
revoke insert, delete on public.notifications from authenticated;
revoke update, delete on public.recordings from authenticated;

-- Profiles are created by the invitation trigger and suspended rather than
-- deleted, so neither privilege belongs to a signed-in session.
revoke insert, delete on public.profiles from authenticated;

-- ------------------------------------------------------- service role ----
--
-- The AI service and the backend. This role bypasses RLS by design and its
-- key never reaches a browser.

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

-- ---------------------------------------------------------- functions ----
--
-- Helper functions are executable by signed-in users because policies call
-- them. They are SECURITY DEFINER and read-only, and each pins its
-- search_path, so they cannot be redirected to a shadowed table.

grant execute on function
  public.current_profile_id(), public.is_active_user(),
  public.current_role_in_team(uuid), public.is_team_member(uuid),
  public.has_team_role(uuid, app_role[]), public.is_super_admin(),
  public.meeting_team(uuid), public.is_meeting_participant(uuid),
  public.can_view_meeting(uuid), public.can_access_meeting_content(uuid),
  public.can_manage_meeting(uuid), public.can_access_recording(uuid),
  public.can_access_transcript(uuid)
to authenticated;

-- A signed-in session may record that it opened a transcript or recording.
-- It may not call log_audit directly, which would let it write arbitrary
-- entries into the trail.
grant execute on function public.log_content_access(text, uuid, text) to authenticated;
revoke all on function public.log_audit(text, text, uuid, jsonb, jsonb, uuid, text) from authenticated;
revoke all on function public.log_audit(text, text, uuid, jsonb, jsonb, uuid, text) from anon;

-- Administrative helpers must not be callable from a browser session.
revoke all on function public.attach_updated_at(regclass) from authenticated, anon;

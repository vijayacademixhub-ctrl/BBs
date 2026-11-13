-- 0018_audit_team_and_consent_scope
--
-- TWO SECURITY FIXES, both found by running the synthetic evaluation dataset
-- rather than by review. Neither was visible in the earlier tests because
-- those used a minimal fixture; with two populated teams both became obvious.
--
-- FIX 1 — audit rows carrying no team leaked across teams.
--
-- 0016 scoped audit reads by team where the row names one. Most audit rows do
-- not: the generic trigger copies a team only from tables that have a
-- team_id column. Measured against the evaluation data, a Super Admin of a
-- different team could read 35 of the other team's 50 audit entries —
-- including 18 consent changes (who agreed to be recorded, and who withdrew),
-- 2 recordings with their storage paths, 2 transcripts, 10 profile changes
-- and an MFA reset request.
--
-- This was recorded as a "residual gap, identical in a single-team
-- deployment". That was true and it was also too comfortable: the gap is
-- large, and it concerns exactly the material the system exists to protect.
-- Resolved by making the audit trigger resolve a team for every entity that
-- has one.
--
-- FIX 2 — the consent register of a RESTRICTED meeting was readable by any
-- coordinator.
--
-- meeting_consents_select admitted anyone who could MANAGE the meeting.
-- can_manage_meeting() admits every coordinator of the team, and does not
-- consider confidentiality. So a coordinator who could not see that a
-- restricted meeting existed could still read its consent register — which
-- names its participants and whether each agreed to be recorded.
--
-- A restricted meeting is meant to be invisible to non-participants. Leaking
-- its attendee list through a side table defeats that.

-- ================================================== FIX 1 — audit teams ===

create or replace function public.team_of_profile(p_profile uuid)
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select tm.team_id from public.team_members tm where tm.profile_id = p_profile limit 1;
$$;

create or replace function public.team_of_recording(p_recording uuid)
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select m.team_id from public.recordings r
  join public.meetings m on m.id = r.meeting_id
  where r.id = p_recording;
$$;

create or replace function public.team_of_transcript(p_transcript uuid)
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select m.team_id from public.transcripts t
  join public.recordings r on r.id = t.recording_id
  join public.meetings m on m.id = r.meeting_id
  where t.id = p_transcript;
$$;

create or replace function public.team_of_extraction(p_extraction uuid)
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.team_of_transcript(e.transcript_id)
  from public.ai_extractions e where e.id = p_extraction;
$$;

-- The audit trigger now understands a resolver as its second argument:
-- a plain column name as before, or "<kind>:<column>" to look the team up.
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_entity   text := tg_argv[0];
  v_resolver text := case when array_length(tg_argv, 1) > 1 then tg_argv[1] end;
  v_kind     text;
  v_column   text;
  v_raw      text;
  v_team     uuid;
  v_before   jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_after    jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row      jsonb := coalesce(v_after, v_before);
begin
  if v_resolver is not null then
    if position(':' in v_resolver) > 0 then
      v_kind   := split_part(v_resolver, ':', 1);
      v_column := split_part(v_resolver, ':', 2);
    else
      v_kind   := 'column';
      v_column := v_resolver;
    end if;

    v_raw := nullif(v_row ->> v_column, '');

    if v_raw is not null then
      v_team := case v_kind
        when 'column'     then v_raw::uuid
        when 'meeting'    then public.meeting_team(v_raw::uuid)
        when 'profile'    then public.team_of_profile(v_raw::uuid)
        when 'recording'  then public.team_of_recording(v_raw::uuid)
        when 'transcript' then public.team_of_transcript(v_raw::uuid)
        when 'extraction' then public.team_of_extraction(v_raw::uuid)
      end;
    end if;
  end if;

  perform public.log_audit(
    lower(tg_op) || '_' || v_entity,
    v_entity,
    nullif(v_row ->> 'id', '')::uuid,
    v_before,
    v_after,
    v_team
  );

  return case tg_op when 'DELETE' then old else new end;
end;
$$;

-- Re-point the triggers that previously recorded no team.
drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles
  after insert or update or delete on public.profiles
  for each row execute function public.audit_row_change('profile', 'profile:id');

drop trigger if exists audit_recordings on public.recordings;
create trigger audit_recordings
  after insert or update or delete on public.recordings
  for each row execute function public.audit_row_change('recording', 'meeting:meeting_id');

drop trigger if exists audit_transcripts on public.transcripts;
create trigger audit_transcripts
  after insert or update or delete on public.transcripts
  for each row execute function public.audit_row_change('transcript', 'recording:recording_id');

drop trigger if exists audit_consents on public.meeting_consents;
create trigger audit_consents
  after insert or update or delete on public.meeting_consents
  for each row execute function public.audit_row_change('meeting_consent', 'meeting:meeting_id');

drop trigger if exists audit_verification on public.verification_records;
create trigger audit_verification
  after insert on public.verification_records
  for each row execute function public.audit_row_change('verification_record', 'extraction:extraction_id');

drop trigger if exists audit_calendar_connections on public.calendar_connections;
create trigger audit_calendar_connections
  after insert or update or delete on public.calendar_connections
  for each row execute function public.audit_row_change('calendar_connection', 'profile:profile_id');

drop trigger if exists audit_mfa_reset on public.mfa_reset_requests;
create trigger audit_mfa_reset
  after insert or update or delete on public.mfa_reset_requests
  for each row execute function public.audit_row_change('mfa_reset_request', 'profile:profile_id');

-- log_content_access records a read, which has no row to resolve a team from.
-- It takes the team from the entity instead, so reads are scoped like writes.
create or replace function public.log_content_access(
  p_entity_type text,
  p_entity_id   uuid,
  p_note        text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_team uuid;
begin
  if p_entity_type not in ('recording', 'transcript', 'document') then
    raise exception 'log_content_access covers recordings, transcripts and documents only.';
  end if;

  v_team := case p_entity_type
    when 'recording'  then public.team_of_recording(p_entity_id)
    when 'transcript' then public.team_of_transcript(p_entity_id)
    when 'document'   then (select d.team_id from public.documents d where d.id = p_entity_id)
  end;

  perform public.log_audit('access_' || p_entity_type, p_entity_type, p_entity_id,
                           null, null, v_team, p_note);
end;
$$;

grant execute on function public.log_content_access(text, uuid, text) to authenticated;
grant execute on function
  public.team_of_profile(uuid), public.team_of_recording(uuid),
  public.team_of_transcript(uuid), public.team_of_extraction(uuid)
to authenticated;

comment on policy audit_logs_super_admin_read on public.audit_logs is
  'Scoped to a Super Admin of the row''s team. Rows with no team are now only '
  'institution-wide configuration changes (app settings, retention policy), '
  'which any Super Admin may legitimately see. Before 0018 most rows carried '
  'no team and this fallback leaked across teams.';

-- ============================================== FIX 2 — consent register ===
--
-- Managing a meeting no longer implies being able to read its consent
-- register when the meeting itself is hidden from you. can_view_meeting()
-- already encodes confidentiality, so requiring both is sufficient and keeps
-- the rule in one place.

drop policy if exists meeting_consents_select on public.meeting_consents;
create policy meeting_consents_select on public.meeting_consents
  for select to authenticated
  using (
    public.can_access_meeting_content(meeting_id)
    or (public.can_view_meeting(meeting_id) and public.can_manage_meeting(meeting_id))
  );

drop policy if exists meeting_consents_manage on public.meeting_consents;
create policy meeting_consents_manage on public.meeting_consents
  for all to authenticated
  using (public.can_view_meeting(meeting_id) and public.can_manage_meeting(meeting_id))
  with check (public.can_view_meeting(meeting_id) and public.can_manage_meeting(meeting_id));

comment on table public.meeting_consents is
  'Administrative register of participant consent, recorded by the organiser. '
  'Visible to participants, and to a meeting manager who can also see the '
  'meeting — a restricted meeting''s register is not readable by a '
  'coordinator who cannot see the meeting exists. Not automatic proof of '
  'valid consent by each participant.';

-- Note on existing data: rows written before this migration keep their null
-- team_id. On a new project there are none. On an existing one, backfilling
-- is possible but was not done here because no project exists to backfill.

-- --------------------------------------------- profile rows, resolved late --
--
-- A profile is created before the person is added to a team, so there is no
-- team to copy at the moment the audit row is written. Ten such rows remained
-- visible to every Super Admin.
--
-- Resolved at READ time instead: for a profile row with no stored team, the
-- policy looks up the team that profile belongs to now. This is correct
-- rather than merely convenient — a profile's audit history should follow the
-- person, including the row that records their creation.
drop policy if exists audit_logs_super_admin_read on public.audit_logs;
create policy audit_logs_super_admin_read on public.audit_logs
  for select to authenticated
  using (
    case
      when team_id is not null then public.is_super_admin_of(team_id)
      -- A profile's own team, looked up as it stands today.
      when entity_type = 'profile' and entity_id is not null then
        public.is_super_admin_of(public.team_of_profile(entity_id))
      -- What remains is institution-wide configuration: application settings
      -- and the retention policy. Any Super Admin may legitimately see those.
      else public.is_super_admin()
    end
  );

comment on policy audit_logs_super_admin_read on public.audit_logs is
  'Scoped to a Super Admin of the row''s team. Profile rows, which predate '
  'team membership, resolve their team at read time. Only institution-wide '
  'configuration changes fall through to the unscoped check.';

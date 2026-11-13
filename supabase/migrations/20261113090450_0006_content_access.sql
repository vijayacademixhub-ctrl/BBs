-- 0006_content_access
-- Access helpers for meeting content.
--
-- These live after the meeting and recording tables because they are
-- `language sql`, which PostgreSQL parses when the function is created. A
-- SQL function cannot reference a table that does not yet exist, so these
-- could not sit alongside the identity helpers in 0003.
--
-- Same contract as those: SECURITY DEFINER with a pinned search_path, STABLE,
-- owned by the migration role so that a policy can consult membership without
-- the policy on the membership table recursing into itself.

create or replace function public.meeting_team(p_meeting uuid)
returns uuid
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select m.team_id from public.meetings m where m.id = p_meeting;
$$;

create or replace function public.is_meeting_participant(p_meeting uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.meeting_participants mp
    join public.profiles p on p.id = mp.profile_id
    where mp.meeting_id = p_meeting
      and mp.profile_id = auth.uid()
      and p.status = 'active'
  );
$$;

-- Visibility of the meeting record itself: title, time, location.
--
-- An 'internal' meeting is visible to the team so that scheduling works. A
-- 'restricted' meeting is not: it is visible only to its participants. This
-- is why confidentiality is a column rather than an assumption.
create or replace function public.can_view_meeting(p_meeting uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.meetings m
    where m.id = p_meeting
      and public.is_active_user()
      and (
        public.is_meeting_participant(m.id)
        or m.organiser_id = auth.uid()
        or (m.confidentiality = 'internal' and public.is_team_member(m.team_id))
      )
  );
$$;

-- Access to what was SAID in the meeting: audio, transcript, segments, AI
-- extractions, consent records.
--
-- Deliberately narrower than can_view_meeting. Team membership alone never
-- grants this, and a coordinator does not acquire it by virtue of their role;
-- they must have been a participant. Only a Super Admin has standing oversight,
-- and every such access is written to the audit log.
create or replace function public.can_access_meeting_content(p_meeting uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select public.is_active_user()
     and (
       public.is_meeting_participant(p_meeting)
       or exists (select 1 from public.meetings m
                  where m.id = p_meeting and m.organiser_id = auth.uid())
       or public.is_super_admin()
     );
$$;

comment on function public.can_access_meeting_content(uuid) is
  'Gate for recordings, transcripts, segments, extractions and consent. '
  'Participation-based by design: belonging to the team is not sufficient.';

create or replace function public.can_manage_meeting(p_meeting uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.meetings m
    where m.id = p_meeting
      and public.is_active_user()
      and (
        m.organiser_id = auth.uid()
        or public.has_team_role(m.team_id, array['coordinator', 'super_admin']::app_role[])
      )
  );
$$;

create or replace function public.can_access_recording(p_recording uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1 from public.recordings r
    where r.id = p_recording and public.can_access_meeting_content(r.meeting_id)
  );
$$;

create or replace function public.can_access_transcript(p_transcript uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.transcripts t
    join public.recordings r on r.id = t.recording_id
    where t.id = p_transcript and public.can_access_meeting_content(r.meeting_id)
  );
$$;


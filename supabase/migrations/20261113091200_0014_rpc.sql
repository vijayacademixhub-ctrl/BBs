-- 0014_rpc
-- Remote procedures for operations that must be atomic.
--
-- Creating a meeting touches three tables. Doing that as three calls from the
-- browser can leave a meeting with no participants if the second call fails,
-- and a meeting with no participants is one nobody can open. These run in a
-- single transaction instead.
--
-- All are SECURITY INVOKER, which is the important part: they execute as the
-- calling user, so every RLS policy applies exactly as it would to a direct
-- insert. They are a convenience, not a way around the permission model.

create or replace function public.create_meeting(
  p_team_id         uuid,
  p_title           text,
  p_starts_at       timestamptz,
  p_duration        integer,
  p_description     text default null,
  p_location        text default null,
  p_meeting_link    text default null,
  p_language        meeting_language default 'mixed',
  p_confidentiality meeting_confidentiality default 'internal',
  p_participants    uuid[] default '{}',
  p_agenda          text[] default '{}'
)
returns uuid
language plpgsql
security invoker
set search_path = public, auth, pg_temp
as $$
declare
  v_meeting_id uuid;
  v_actor      uuid := auth.uid();
  v_item       text;
  v_person     uuid;
  v_position   integer := 0;
begin
  insert into public.meetings (
    team_id, title, description, starts_at, duration_minutes,
    location, meeting_link, language, confidentiality, organiser_id, created_by
  )
  values (
    p_team_id, p_title, nullif(btrim(p_description), ''), p_starts_at, p_duration,
    nullif(btrim(p_location), ''), nullif(btrim(p_meeting_link), ''),
    p_language, p_confidentiality, v_actor, v_actor
  )
  returning id into v_meeting_id;

  -- The organiser is always a participant. Without this they could create a
  -- meeting whose content they cannot then read.
  insert into public.meeting_participants (meeting_id, profile_id, is_organiser, added_by)
  values (v_meeting_id, v_actor, true, v_actor)
  on conflict (meeting_id, profile_id) do nothing;

  foreach v_person in array coalesce(p_participants, '{}') loop
    insert into public.meeting_participants (meeting_id, profile_id, added_by)
    values (v_meeting_id, v_person, v_actor)
    on conflict (meeting_id, profile_id) do nothing;
  end loop;

  foreach v_item in array coalesce(p_agenda, '{}') loop
    v_position := v_position + 1;
    insert into public.meeting_agendas (meeting_id, position, item)
    values (v_meeting_id, v_position, v_item);
  end loop;

  return v_meeting_id;
end;
$$;

create or replace function public.replace_meeting_agenda(
  p_meeting_id uuid,
  p_agenda     text[]
)
returns void
language plpgsql
security invoker
set search_path = public, auth, pg_temp
as $$
declare
  v_item     text;
  v_position integer := 0;
begin
  delete from public.meeting_agendas where meeting_id = p_meeting_id;
  foreach v_item in array coalesce(p_agenda, '{}') loop
    v_position := v_position + 1;
    insert into public.meeting_agendas (meeting_id, position, item)
    values (p_meeting_id, v_position, v_item);
  end loop;
end;
$$;

create or replace function public.replace_meeting_participants(
  p_meeting_id   uuid,
  p_participants uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public, auth, pg_temp
as $$
declare
  v_person uuid;
begin
  -- Removing a participant also removes their consent row, which is correct:
  -- a person who was not in the meeting has nothing to consent to. The audit
  -- trigger records the deletion either way.
  delete from public.meeting_participants
  where meeting_id = p_meeting_id
    and not is_organiser
    and profile_id <> all (coalesce(p_participants, '{}'));

  foreach v_person in array coalesce(p_participants, '{}') loop
    insert into public.meeting_participants (meeting_id, profile_id, added_by)
    values (p_meeting_id, v_person, auth.uid())
    on conflict (meeting_id, profile_id) do nothing;
  end loop;
end;
$$;

grant execute on function
  public.create_meeting(uuid, text, timestamptz, integer, text, text, text,
                        meeting_language, meeting_confidentiality, uuid[], text[]),
  public.replace_meeting_agenda(uuid, text[]),
  public.replace_meeting_participants(uuid, uuid[])
to authenticated;

revoke all on function
  public.create_meeting(uuid, text, timestamptz, integer, text, text, text,
                        meeting_language, meeting_confidentiality, uuid[], text[]),
  public.replace_meeting_agenda(uuid, text[]),
  public.replace_meeting_participants(uuid, uuid[])
from anon;

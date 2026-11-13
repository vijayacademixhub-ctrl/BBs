-- 0009_audit
-- Append-only audit trail for sensitive operations.
--
-- Protection works at two levels. RLS gives no UPDATE or DELETE policy, and
-- migration 0012 revokes those privileges outright from authenticated. A
-- signed-in user therefore has no route to alter the record of what they did,
-- even if a future policy were written carelessly.

create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_email text,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  team_id     uuid references public.teams (id) on delete set null,
  before      jsonb,
  after       jsonb,
  note        text,
  created_at  timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

comment on table public.audit_logs is
  'Append-only. No UPDATE or DELETE policy exists and the privileges are '
  'revoked in 0012. actor_email is denormalised so the trail stays readable '
  'after an account is removed.';

-- Fields that must never reach the audit trail. Logging a change to a token
-- would place the secret in a table read by administrators, which defeats the
-- point of keeping tokens out of reach in the first place.
create or replace function public.redact_audit_payload(p jsonb)
returns jsonb
language sql
immutable
as $$
  select case when p is null then null else
    p - 'access_token' - 'refresh_token' - 'token' - 'password'
      - 'encrypted_password' - 'api_key' - 'secret' - 'client_secret'
  end;
$$;

create or replace function public.log_audit(
  p_action      text,
  p_entity_type text,
  p_entity_id   uuid default null,
  p_before      jsonb default null,
  p_after       jsonb default null,
  p_team_id     uuid default null,
  p_note        text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  insert into public.audit_logs (
    actor_id, actor_email, action, entity_type, entity_id, team_id, before, after, note
  )
  values (
    auth.uid(),
    (select email from public.profiles where id = auth.uid()),
    p_action, p_entity_type, p_entity_id, p_team_id,
    public.redact_audit_payload(p_before),
    public.redact_audit_payload(p_after),
    p_note
  );
end;
$$;

-- Generic row-change auditor. TG_ARGV[0] is the entity name; TG_ARGV[1], if
-- present, names the column holding the team id.
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_entity  text := tg_argv[0];
  v_team    uuid;
  v_before  jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_after   jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  if array_length(tg_argv, 1) > 1 then
    v_team := nullif(coalesce(v_after, v_before) ->> tg_argv[1], '')::uuid;
  end if;

  perform public.log_audit(
    lower(tg_op) || '_' || v_entity,
    v_entity,
    nullif(coalesce(v_after, v_before) ->> 'id', '')::uuid,
    v_before,
    v_after,
    v_team
  );

  return case tg_op when 'DELETE' then old else new end;
end;
$$;

-- Sensitive operations, per the Milestone 2 brief.
create trigger audit_profiles
  after insert or update or delete on public.profiles
  for each row execute function public.audit_row_change('profile');

create trigger audit_team_members
  after insert or update or delete on public.team_members
  for each row execute function public.audit_row_change('team_member', 'team_id');

create trigger audit_invitations
  after insert or update or delete on public.user_invitations
  for each row execute function public.audit_row_change('user_invitation', 'team_id');

create trigger audit_meetings
  after insert or update or delete on public.meetings
  for each row execute function public.audit_row_change('meeting', 'team_id');

create trigger audit_recordings
  after insert or update or delete on public.recordings
  for each row execute function public.audit_row_change('recording');

create trigger audit_transcripts
  after insert or update or delete on public.transcripts
  for each row execute function public.audit_row_change('transcript');

create trigger audit_verification
  after insert on public.verification_records
  for each row execute function public.audit_row_change('verification_record');

create trigger audit_consents
  after insert or update or delete on public.meeting_consents
  for each row execute function public.audit_row_change('meeting_consent');

create trigger audit_retention
  after insert or update or delete on public.retention_policies
  for each row execute function public.audit_row_change('retention_policy');

create trigger audit_app_settings
  after insert or update or delete on public.app_settings
  for each row execute function public.audit_row_change('app_setting');

create trigger audit_calendar_connections
  after insert or update or delete on public.calendar_connections
  for each row execute function public.audit_row_change('calendar_connection');

create trigger audit_documents
  after insert or update or delete on public.documents
  for each row execute function public.audit_row_change('document', 'team_id');

-- Reading a transcript or a recording is itself a sensitive act, but a SELECT
-- cannot be caught by a trigger. The application and the AI service record
-- access by calling this explicitly when they mint a signed URL or open a
-- transcript, which is the point at which the content actually reaches a
-- person.
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
begin
  if p_entity_type not in ('recording', 'transcript', 'document') then
    raise exception 'log_content_access covers recordings, transcripts and documents only.';
  end if;
  perform public.log_audit('access_' || p_entity_type, p_entity_type, p_entity_id,
                           null, null, null, p_note);
end;
$$;

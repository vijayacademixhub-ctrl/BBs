-- 0011_storage
-- Private buckets and the policies that govern them.
--
-- All four buckets are private. Supabase serves a private object only through
-- a signed URL that the server mints for a caller who has already satisfied
-- these policies, and that URL expires. There is no public path to any file.
--
-- Path convention, which every policy relies on:
--   meeting-recordings   {team_id}/{meeting_id}/{recording_id}.{ext}
--   meeting-attachments  {team_id}/{meeting_id}/{filename}
--   academic-documents   {team_id}/{filename}
--   exports              {team_id}/{profile_id}/{filename}
--
-- storage.foldername(name) returns the path segments, so [1] is the team and
-- [2] the meeting.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('meeting-recordings', 'meeting-recordings', false, 536870912,
   array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']),
  ('meeting-attachments', 'meeting-attachments', false, 52428800,
   array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation']),
  ('academic-documents', 'academic-documents', false, 104857600,
   array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation']),
  ('exports', 'exports', false, 52428800,
   array['application/pdf', 'text/csv', 'text/calendar', 'application/json', 'text/plain'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- A belt-and-braces guard. If someone flips a bucket to public in the
-- dashboard, this trigger refuses the change: making a bucket public would
-- expose every recording in it to anyone holding the URL.
create or replace function storage.refuse_public_buckets()
returns trigger
language plpgsql
as $$
begin
  if new.public and new.id in
     ('meeting-recordings', 'meeting-attachments', 'academic-documents', 'exports') then
    raise exception
      'Bucket % holds confidential institutional information and cannot be made public.', new.id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists refuse_public_buckets on storage.buckets;
create trigger refuse_public_buckets
  before insert or update on storage.buckets
  for each row execute function storage.refuse_public_buckets();

-- ---------------------------------------------------------- recordings ---
--
-- Read access mirrors can_access_meeting_content exactly, so a user cannot
-- reach through storage what the database would refuse them.

create policy "recordings readable by meeting participants"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'meeting-recordings'
    and public.can_access_meeting_content(((storage.foldername(name))[2])::uuid)
  );

create policy "recordings writable by meeting participants"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'meeting-recordings'
    and public.is_meeting_participant(((storage.foldername(name))[2])::uuid)
  );

-- No UPDATE policy: audio is immutable once written. Overwriting a recording
-- in place would silently change an institutional record.

create policy "recordings deletable by super admin"
  on storage.objects for delete to authenticated
  using (bucket_id = 'meeting-recordings' and public.is_super_admin());

-- --------------------------------------------------------- attachments ---

create policy "attachments readable by meeting participants"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'meeting-attachments'
    and public.can_access_meeting_content(((storage.foldername(name))[2])::uuid)
  );

create policy "attachments writable by meeting managers"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'meeting-attachments'
    and public.can_manage_meeting(((storage.foldername(name))[2])::uuid)
  );

create policy "attachments deletable by meeting managers"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'meeting-attachments'
    and public.can_manage_meeting(((storage.foldername(name))[2])::uuid)
  );

-- ---------------------------------------------------- academic documents --

create policy "documents readable by team members"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'academic-documents'
    and public.is_team_member(((storage.foldername(name))[1])::uuid)
  );

create policy "documents writable by team members"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'academic-documents'
    and public.is_team_member(((storage.foldername(name))[1])::uuid)
  );

create policy "documents deletable by super admin"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'academic-documents'
    and public.has_team_role(((storage.foldername(name))[1])::uuid, array['super_admin']::app_role[])
  );

-- -------------------------------------------------------------- exports ---
-- An export belongs to the person who generated it. Nobody else reads it,
-- because an export can concentrate information its recipient was entitled to
-- see item by item but which should not circulate as a single file.

create policy "exports readable by owner"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'exports'
    and ((storage.foldername(name))[2])::uuid = auth.uid()
  );

create policy "exports writable by owner"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'exports'
    and ((storage.foldername(name))[2])::uuid = auth.uid()
    and public.is_team_member(((storage.foldername(name))[1])::uuid)
  );

create policy "exports deletable by owner"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'exports'
    and ((storage.foldername(name))[2])::uuid = auth.uid()
  );

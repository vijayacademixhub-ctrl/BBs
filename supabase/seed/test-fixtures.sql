-- Test fixtures.
--
-- Loaded by the security suite as the owning role, before any policy applies.
-- Deliberately includes the awkward cases: a suspended account, a user who
-- belongs to a different team, and a meeting that one team member was not
-- invited to.

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@example.ac.in'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'coordinator@example.ac.in'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'member.a@example.ac.in'),
  ('aaaaaaaa-0000-4000-8000-000000000004', 'member.b@example.ac.in'),
  ('aaaaaaaa-0000-4000-8000-000000000005', 'suspended@example.ac.in'),
  ('aaaaaaaa-0000-4000-8000-000000000006', 'outsider@example.ac.in');

insert into public.teams (id, name, slug) values
  ('11111111-1111-4111-8111-111111111111', 'Academic Office', 'academic-office'),
  ('11111111-1111-4111-8111-222222222222', 'Other Department', 'other-department');

insert into public.profiles (id, email, full_name, designation, status, suspended_at) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@example.ac.in',       'Super Admin',  'Research Lead',       'active',    null),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'coordinator@example.ac.in', 'Coordinator',  'Project Coordinator', 'active',    null),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'member.a@example.ac.in',    'Member A',     'Research Associate',  'active',    null),
  ('aaaaaaaa-0000-4000-8000-000000000004', 'member.b@example.ac.in',    'Member B',     'Analyst',             'active',    null),
  ('aaaaaaaa-0000-4000-8000-000000000005', 'suspended@example.ac.in',   'Suspended User','Analyst',            'suspended', now()),
  ('aaaaaaaa-0000-4000-8000-000000000006', 'outsider@example.ac.in',    'Outsider',     'Other Dept',          'active',    null);

insert into public.team_members (team_id, profile_id, role) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', 'super_admin'),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000002', 'coordinator'),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000003', 'member'),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000004', 'member'),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000005', 'member'),
  ('11111111-1111-4111-8111-222222222222', 'aaaaaaaa-0000-4000-8000-000000000006', 'super_admin');

-- A meeting attended by the Super Admin and Member A only. Member B and the
-- Coordinator are team members but were NOT invited: they are the control
-- group for every content-access test.
insert into public.meetings
  (id, team_id, title, starts_at, duration_minutes, location, organiser_id, confidentiality)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'Confidential case review', now() + interval '1 day', 60, 'Room 2',
   'aaaaaaaa-0000-4000-8000-000000000001', 'internal'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'Restricted disciplinary matter', now() + interval '2 days', 45, 'Room 1',
   'aaaaaaaa-0000-4000-8000-000000000001', 'restricted');

insert into public.meeting_participants (meeting_id, profile_id, is_organiser) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', true),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000003', false),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', true);

insert into public.recordings (id, meeting_id, storage_path, mime_type, byte_size, uploaded_by) values
  ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111/bbbbbbbb-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000001.webm',
   'audio/webm', 1048576, 'aaaaaaaa-0000-4000-8000-000000000001');

insert into public.transcripts (id, recording_id, language, model_name) values
  ('dddddddd-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'mixed', 'faster-whisper-small');

insert into public.transcript_segments (transcript_id, position, starts_ms, ends_ms, content) values
  ('dddddddd-0000-4000-8000-000000000001', 0, 0, 4200,
   'The committee agreed the matter should remain confidential to those present.');

insert into public.ai_extractions (id, transcript_id, kind, content, model_name, state) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001',
   'action_item', 'Prepare the confidential summary.', 'qwen3:4b', 'pending'),
  ('eeeeeeee-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000001',
   'action_item', 'Circulate the agreed minutes.', 'qwen3:4b', 'approved');


-- A stored object matching the recording, so storage policies can be tested.
insert into storage.objects (bucket_id, name, owner) values
  ('meeting-recordings',
   '11111111-1111-4111-8111-111111111111/bbbbbbbb-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000001.webm',
   'aaaaaaaa-0000-4000-8000-000000000001');

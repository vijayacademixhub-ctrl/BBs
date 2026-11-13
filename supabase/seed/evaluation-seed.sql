-- AcademicOS — synthetic evaluation data.
--
-- EVERY PERSON AND ORGANISATION BELOW IS FICTIONAL. No real staff member,
-- student, meeting, document or institution appears here. Email addresses use
-- example.edu, which is reserved and cannot receive mail.
--
-- Purpose: give the security model something realistic to be evaluated
-- against. Two teams, so cross-team isolation can be observed rather than
-- assumed. Participants and non-participants in the same team, so the
-- distinction between administering a meeting and hearing it is visible.
--
-- WHAT THIS IS NOT:
--   * It is not loaded into any hosted project. It is for a local database.
--   * The "recordings" are rows describing audio that does not exist. No
--     audio file is created, and the recorder remains switched off.
--   * Retention remains pending approval. Nothing here enables deletion.
--
-- Load with: npm run db:evaluate

begin;

-- =========================================================== identities ===
-- Fictional names, chosen to be clearly invented.

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'priya.anand@example.edu'),
  ('a0000000-0000-4000-8000-000000000002', 'ravi.kulkarni@example.edu'),
  ('a0000000-0000-4000-8000-000000000003', 'meera.das@example.edu'),
  ('a0000000-0000-4000-8000-000000000004', 'arjun.pillai@example.edu'),
  ('a0000000-0000-4000-8000-000000000005', 'lakshmi.nair@example.edu'),
  ('a0000000-0000-4000-8000-000000000006', 'imran.sheikh@example.edu'),
  ('a0000000-0000-4000-8000-000000000007', 'tara.bhatt@example.edu'),
  ('a0000000-0000-4000-8000-000000000008', 'former.staff@example.edu'),
  ('a0000000-0000-4000-8000-000000000009', 'deepak.rao@example.edu'),
  ('a0000000-0000-4000-8000-00000000000a', 'sunita.menon@example.edu');

insert into public.teams (id, name, slug) values
  ('70000000-0000-4000-8000-000000000001', 'Northfield Academic Office', 'northfield-academic-office'),
  ('70000000-0000-4000-8000-000000000002', 'Westgate Research Unit', 'westgate-research-unit');

insert into public.profiles (id, email, full_name, designation, status, suspended_at) values
  -- Northfield: the team under evaluation
  ('a0000000-0000-4000-8000-000000000001','priya.anand@example.edu',  'Priya Anand',   'Office Head',          'active',    null),
  ('a0000000-0000-4000-8000-000000000002','ravi.kulkarni@example.edu','Ravi Kulkarni', 'Deputy Head',          'active',    null),
  ('a0000000-0000-4000-8000-000000000003','meera.das@example.edu',    'Meera Das',     'Programme Coordinator','active',    null),
  ('a0000000-0000-4000-8000-000000000004','arjun.pillai@example.edu', 'Arjun Pillai',  'Research Coordinator', 'active',    null),
  ('a0000000-0000-4000-8000-000000000005','lakshmi.nair@example.edu', 'Lakshmi Nair',  'Research Associate',   'active',    null),
  ('a0000000-0000-4000-8000-000000000006','imran.sheikh@example.edu', 'Imran Sheikh',  'Data Analyst',         'active',    null),
  ('a0000000-0000-4000-8000-000000000007','tara.bhatt@example.edu',   'Tara Bhatt',    'Documentation Officer','active',    null),
  -- A suspended account: kept for attribution, refused access everywhere
  ('a0000000-0000-4000-8000-000000000008','former.staff@example.edu', 'Former Staff',  'Research Associate',   'suspended', now() - interval '20 days'),
  -- Westgate: the isolation control. Nothing of Northfield's should reach them.
  ('a0000000-0000-4000-8000-000000000009','deepak.rao@example.edu',   'Deepak Rao',    'Unit Head',            'active',    null),
  ('a0000000-0000-4000-8000-00000000000a','sunita.menon@example.edu', 'Sunita Menon',  'Research Fellow',      'active',    null);

insert into public.team_members (team_id, profile_id, role) values
  -- TWO Super Admins in Northfield, as the provisioning plan requires
  ('70000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','super_admin'),
  ('70000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','super_admin'),
  ('70000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000003','coordinator'),
  ('70000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000004','coordinator'),
  ('70000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000005','member'),
  ('70000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000006','member'),
  ('70000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000007','member'),
  ('70000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000008','member'),
  -- Westgate has its own Super Admin: the cross-team escalation control
  ('70000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000009','super_admin'),
  ('70000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-00000000000a','member');

insert into public.user_preferences (profile_id)
select id from public.profiles;

-- An open invitation, to evaluate the invitation-only path.
insert into public.user_invitations (email, team_id, role, full_name, designation, invited_by) values
  ('new.coordinator@example.edu','70000000-0000-4000-8000-000000000001','coordinator',
   'New Coordinator','Programme Coordinator','a0000000-0000-4000-8000-000000000001');

-- ============================================================= meetings ===
--
-- M1 internal, recorded      — Priya, Ravi, Lakshmi, Imran
-- M2 restricted, recorded    — Priya, Ravi only (a staffing matter)
-- M3 internal, not recorded  — Meera organises; Arjun did not attend
-- M4 Westgate's own          — isolation control
--
-- Note which people are NOT in M1 and M2: Meera and Arjun are coordinators of
-- this team, and must still be unable to read those transcripts.

insert into public.meetings
  (id, team_id, title, description, starts_at, duration_minutes, location, status, language, confidentiality, organiser_id, created_by)
values
  ('b0000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',
   'Semester planning review',
   'Allocation of teaching load and review of the examination timetable.',
   now() - interval '6 days', 60, 'Committee Room A', 'completed', 'mixed', 'internal',
   'a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001'),

  ('b0000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001',
   'Confidential staffing matter',
   'Restricted. Visible only to those present.',
   now() - interval '3 days', 45, 'Office Head room', 'completed', 'en', 'restricted',
   'a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001'),

  ('b0000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000001',
   'Weekly coordination meeting',
   'Standing meeting for programme coordination.',
   now() + interval '2 days', 45, 'Committee Room B', 'scheduled', 'mixed', 'internal',
   'a0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000003'),

  ('b0000000-0000-4000-8000-000000000004','70000000-0000-4000-8000-000000000002',
   'Westgate grant review',
   'Belongs to the other team entirely.',
   now() + interval '1 day', 60, 'Westgate Seminar Room', 'scheduled', 'en', 'internal',
   'a0000000-0000-4000-8000-000000000009','a0000000-0000-4000-8000-000000000009');

insert into public.meeting_participants (meeting_id, profile_id, is_organiser, attended) values
  ('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001', true,  true),
  ('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002', false, true),
  ('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000005', false, true),
  ('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000006', false, false),
  ('b0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001', true,  true),
  ('b0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002', false, true),
  ('b0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000003', true,  null),
  ('b0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000005', false, null),
  ('b0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000007', false, null),
  ('b0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000009', true,  null),
  ('b0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-00000000000a', false, null);

insert into public.meeting_agendas (meeting_id, position, item) values
  ('b0000000-0000-4000-8000-000000000001',1,'Teaching load allocation'),
  ('b0000000-0000-4000-8000-000000000001',2,'Examination timetable conflicts'),
  ('b0000000-0000-4000-8000-000000000001',3,'Room booking policy'),
  ('b0000000-0000-4000-8000-000000000002',1,'Staffing matter — restricted'),
  ('b0000000-0000-4000-8000-000000000003',1,'Progress since last meeting'),
  ('b0000000-0000-4000-8000-000000000003',2,'Upcoming deadlines'),
  ('b0000000-0000-4000-8000-000000000004',1,'Grant application status');

-- ============================================== individual consent =========
--
-- The organiser records a decision per participant. The register is seeded
-- automatically as 'pending' by a trigger; these updates represent the
-- organiser having asked each person individually, as the confirmed consent
-- decision requires.
--
-- All five statuses appear, including a withdrawal after the fact — the case
-- most likely to be mishandled.

update public.meeting_consents set
  status = 'consented', method = 'verbal_in_meeting',
  recorded_by = 'a0000000-0000-4000-8000-000000000001', recorded_at = now() - interval '6 days',
  note = 'Agreed at the start of the meeting.'
where meeting_id = 'b0000000-0000-4000-8000-000000000001'
  and profile_id in ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002');

update public.meeting_consents set
  status = 'consented', method = 'written',
  recorded_by = 'a0000000-0000-4000-8000-000000000001', recorded_at = now() - interval '7 days',
  note = 'Consent given in writing before the meeting.'
where meeting_id = 'b0000000-0000-4000-8000-000000000001'
  and profile_id = 'a0000000-0000-4000-8000-000000000005';

-- Invited but did not attend: nothing to consent to.
update public.meeting_consents set
  status = 'not_applicable', method = 'other',
  recorded_by = 'a0000000-0000-4000-8000-000000000001', recorded_at = now() - interval '6 days',
  note = 'Invited but did not attend; not recorded.'
where meeting_id = 'b0000000-0000-4000-8000-000000000001'
  and profile_id = 'a0000000-0000-4000-8000-000000000006';

update public.meeting_consents set
  status = 'consented', method = 'verbal_in_meeting',
  recorded_by = 'a0000000-0000-4000-8000-000000000001', recorded_at = now() - interval '3 days'
where meeting_id = 'b0000000-0000-4000-8000-000000000002'
  and profile_id = 'a0000000-0000-4000-8000-000000000001';

-- Withdrawn after the recording was made. The audio still exists; what the
-- institution does about that is a policy question, not a technical one, and
-- is exactly why retention is still pending approval.
update public.meeting_consents set
  status = 'withdrawn', method = 'email', withdrawn_at = now() - interval '1 day',
  recorded_by = 'a0000000-0000-4000-8000-000000000002', recorded_at = now() - interval '1 day',
  note = 'Consent withdrawn by email the following week.'
where meeting_id = 'b0000000-0000-4000-8000-000000000002'
  and profile_id = 'a0000000-0000-4000-8000-000000000002';

-- A declined consent on the upcoming meeting: recording must not proceed
-- under the individual-consent rule while this stands.
update public.meeting_consents set
  status = 'declined', method = 'verbal_in_meeting',
  recorded_by = 'a0000000-0000-4000-8000-000000000003', recorded_at = now() - interval '1 day',
  note = 'Declined; asked that the session not be recorded.'
where meeting_id = 'b0000000-0000-4000-8000-000000000003'
  and profile_id = 'a0000000-0000-4000-8000-000000000007';

-- =========================================== recordings and transcripts ===
--
-- These rows describe audio that DOES NOT EXIST. No file is created. They
-- exist so that transcript access can be evaluated; the recorder itself is
-- switched off and stays off.

insert into public.recordings
  (id, meeting_id, storage_path, mime_type, byte_size, duration_seconds, uploaded_by)
values
  ('c0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001',
   '70000000-0000-4000-8000-000000000001/b0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000001.webm',
   'audio/webm', 54525952, 3480, 'a0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002',
   '70000000-0000-4000-8000-000000000001/b0000000-0000-4000-8000-000000000002/c0000000-0000-4000-8000-000000000002.webm',
   'audio/webm', 38797312, 2640, 'a0000000-0000-4000-8000-000000000001');

insert into public.transcripts (id, recording_id, language, model_name, status) values
  ('d0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','mixed','faster-whisper-small','completed'),
  ('d0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000002','en','faster-whisper-small','completed');

-- Synthetic transcript text. Invented dialogue about invented business.
insert into public.transcript_segments (transcript_id, position, starts_ms, ends_ms, speaker_label, content) values
  ('d0000000-0000-4000-8000-000000000001',0,0,8200,'Speaker 1',
   'Let us begin with the teaching load. The second-year allocation is still uneven across the two sections.'),
  ('d0000000-0000-4000-8000-000000000001',1,8200,17400,'Speaker 2',
   'I can redistribute two of the tutorial groups, but not before the timetable is finalised.'),
  ('d0000000-0000-4000-8000-000000000001',2,17400,26900,'Speaker 1',
   'Then let us agree that the timetable is settled by the end of this month, and the reallocation follows.'),
  ('d0000000-0000-4000-8000-000000000001',3,26900,38100,'Speaker 3',
   'There is a clash between the two examination slots on the Thursday. Somebody needs to check that against the room bookings.'),
  ('d0000000-0000-4000-8000-000000000001',4,38100,47500,'Speaker 2',
   'I will take that. I should have an answer within the week.'),
  ('d0000000-0000-4000-8000-000000000002',0,0,9100,'Speaker 1',
   'This item is restricted to those present and should not be discussed outside this room.'),
  ('d0000000-0000-4000-8000-000000000002',1,9100,19800,'Speaker 2',
   'Understood. I will prepare the note and circulate it only to the two of us.');

-- ========================================================= AI extractions ==
--
-- A deliberate mixture: approved, pending, and one where the transcript did
-- not state an owner or a deadline. That last case is the important one — the
-- model leaves them null and flags it rather than inventing a plausible name.

insert into public.ai_extractions
  (id, transcript_id, kind, content, suggested_assignee, suggested_deadline, confidence, needs_clarification, source_segment_ids, model_name, state)
values
  ('e0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','decision',
   'The examination timetable will be settled by the end of the month, with tutorial reallocation to follow.',
   null, null, 0.91, false, '{}', 'qwen3:4b', 'approved'),
  ('e0000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000001','action_item',
   'Check the Thursday examination clash against the room bookings.',
   'a0000000-0000-4000-8000-000000000002', (current_date + 7), 0.86, false, '{}', 'qwen3:4b', 'approved'),
  ('e0000000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000001','action_item',
   'Someone needs to review the second-year section balance.',
   null, null, 0.42, true, '{}', 'qwen3:4b', 'pending'),
  ('e0000000-0000-4000-8000-000000000004','d0000000-0000-4000-8000-000000000001','risk',
   'The tutorial reallocation depends on the timetable, which has no confirmed date.',
   null, null, 0.63, true, '{}', 'qwen3:4b', 'pending'),
  ('e0000000-0000-4000-8000-000000000005','d0000000-0000-4000-8000-000000000002','action_item',
   'Prepare the restricted note and circulate it to attendees only.',
   'a0000000-0000-4000-8000-000000000002', (current_date + 3), 0.88, false, '{}', 'qwen3:4b', 'pending');

insert into public.verification_records (extraction_id, reviewer_id, decision, note) values
  ('e0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','approve',
   'Matches what was agreed.'),
  ('e0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','approve_with_edits',
   'Owner confirmed; deadline set to one week.');

-- ================================================================ work ====

insert into public.tasks
  (id, team_id, title, description, status, priority, category, due_date, assignee_id, created_by, progress, meeting_id, source_extraction_id)
values
  ('f0000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',
   'Check Thursday examination clash against room bookings', null,
   'in_progress','high','Administration', current_date + 7,
   'a0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001', 40,
   'b0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002'),
  ('f0000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001',
   'Compile semester enrolment summary','Figures by programme and section.',
   'todo','medium','Analysis', current_date + 3,
   'a0000000-0000-4000-8000-000000000006','a0000000-0000-4000-8000-000000000003', 0, null, null),
  ('f0000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000001',
   'Update the programme handbook',null,
   'blocked','medium','Documentation', current_date - 2,
   'a0000000-0000-4000-8000-000000000007','a0000000-0000-4000-8000-000000000003', 25, null, null),
  ('f0000000-0000-4000-8000-000000000004','70000000-0000-4000-8000-000000000001',
   'Archive last semester''s assessment records',null,
   'done','low','Administration', current_date - 10,
   'a0000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000001', 100, null, null),
  ('f0000000-0000-4000-8000-000000000005','70000000-0000-4000-8000-000000000002',
   'Draft the Westgate grant narrative',null,
   'in_progress','high','Writing', current_date + 5,
   'a0000000-0000-4000-8000-00000000000a','a0000000-0000-4000-8000-000000000009', 55, null, null);

insert into public.daily_work_logs (team_id, profile_id, log_date, completed, in_progress, pending, challenges, next_day_plan) values
  ('70000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000005', current_date - 1,
   'Completed the archive of last semester''s assessment records and logged the box references.',
   'Supporting the enrolment summary.','Awaiting the registry extract.',
   'The registry extract has not been released yet.','Follow up with the registry office.'),
  ('70000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000006', current_date - 1,
   'Reconciled enrolment figures for three of the five programmes.',
   'Remaining two programmes.','Section balance review.',null,'Finish the remaining programmes.'),
  ('70000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000007', current_date - 2,
   'Reviewed the handbook sections that changed this year and listed the edits required.',
   'Handbook revision.','Blocked pending the timetable.',
   'The handbook cannot be finalised until the timetable is settled.','Draft the sections that do not depend on it.'),
  ('70000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-00000000000a', current_date - 1,
   'Drafted the first two sections of the Westgate grant narrative.',
   'Methodology section.','Budget table.',null,'Complete the methodology section.');

-- =========================================================== documents ====

insert into public.documents
  (team_id, meeting_id, title, storage_path, bucket_id, mime_type, byte_size, confidentiality, uploaded_by)
values
  ('70000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001',
   'Draft examination timetable',
   '70000000-0000-4000-8000-000000000001/b0000000-0000-4000-8000-000000000001/draft-timetable.pdf',
   'meeting-attachments','application/pdf', 284736,'internal','a0000000-0000-4000-8000-000000000001'),
  ('70000000-0000-4000-8000-000000000001', null,
   'Programme handbook 2026',
   '70000000-0000-4000-8000-000000000001/programme-handbook-2026.pdf',
   'academic-documents','application/pdf', 1048576,'internal','a0000000-0000-4000-8000-000000000007'),
  ('70000000-0000-4000-8000-000000000001', null,
   'Restricted staffing note',
   '70000000-0000-4000-8000-000000000001/restricted-staffing-note.pdf',
   'academic-documents','application/pdf', 65536,'restricted','a0000000-0000-4000-8000-000000000001'),
  ('70000000-0000-4000-8000-000000000002', null,
   'Westgate grant guidelines',
   '70000000-0000-4000-8000-000000000002/grant-guidelines.pdf',
   'academic-documents','application/pdf', 524288,'internal','a0000000-0000-4000-8000-000000000009');

-- Storage rows matching the above, so storage policies can be evaluated.
-- No bytes are stored; these describe objects that do not exist.
insert into storage.objects (bucket_id, name, owner) values
  ('meeting-recordings','70000000-0000-4000-8000-000000000001/b0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000001.webm','a0000000-0000-4000-8000-000000000001'),
  ('meeting-recordings','70000000-0000-4000-8000-000000000001/b0000000-0000-4000-8000-000000000002/c0000000-0000-4000-8000-000000000002.webm','a0000000-0000-4000-8000-000000000001'),
  ('meeting-attachments','70000000-0000-4000-8000-000000000001/b0000000-0000-4000-8000-000000000001/draft-timetable.pdf','a0000000-0000-4000-8000-000000000001'),
  ('academic-documents','70000000-0000-4000-8000-000000000001/programme-handbook-2026.pdf','a0000000-0000-4000-8000-000000000007'),
  ('academic-documents','70000000-0000-4000-8000-000000000002/grant-guidelines.pdf','a0000000-0000-4000-8000-000000000009');

-- ======================================================== notifications ===

insert into public.notifications (profile_id, kind, title, body) values
  ('a0000000-0000-4000-8000-000000000002','task','Task assigned: Thursday examination clash','Due in one week.'),
  ('a0000000-0000-4000-8000-000000000007','task','Task overdue: Update the programme handbook','Blocked pending the timetable.'),
  ('a0000000-0000-4000-8000-000000000001','verification','Two extractions await verification','From the semester planning review.'),
  ('a0000000-0000-4000-8000-000000000003','meeting','Weekly coordination meeting in two days','Committee Room B.');

-- ===================================================== MFA reset record ===
-- A worked example of administrator-assisted recovery, approved by the OTHER
-- Super Admin — never by the subject.

insert into public.mfa_reset_requests
  (profile_id, reason, status, requested_by, approved_by, approved_at, identity_check)
values
  ('a0000000-0000-4000-8000-000000000005',
   'Authenticator application lost when the device was replaced.',
   'approved',
   'a0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000002',
   now() - interval '2 days',
   'Identity confirmed in person against staff identity card.');

commit;

-- Retention and recording are deliberately untouched above. Confirm:
select 'recording_enabled = ' || (select value::text from public.app_settings where key='recording_enabled')
    || ', eligibility = ' || (select value::text from public.app_settings where key='recording_eligibility_rule')
    || ', retention scopes enabled = ' || (select count(*)::text from public.retention_policies where enabled)
  as "policy state after seeding";

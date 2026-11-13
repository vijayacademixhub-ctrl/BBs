# M3 — Migration Runbook

**17 migrations.** Applied in filename order. Nothing has been applied to any
hosted project.

Migration history has not been rewritten. Two corrections (0016, 0017) were
made as new forward migrations rather than by editing the files they correct,
and each states in its header what it corrects and why.

---

## 1. Before You Apply Anything

- [ ] `docs/m3-deployment-guide.md` §1–§6 complete: the project exists, the
      region is right, auth settings applied.
- [ ] `major_version` in `supabase/config.toml` matches the project's Postgres
      version. Check this; it is the one setting that silently mismatches.
- [ ] The local suite passes: `npm run test:db` — **196 tests**.
- [ ] The project is empty. These migrations assume a clean schema; they are
      not written to run over existing tables.

Apply in one pass:

```bash
supabase db push
```

A per-file validation query is given below so a partial failure can be
diagnosed without guessing where it stopped.

---

## 2. Dependency Order

Not arbitrary. Three constraints force it:

1. **0001 before everything** — the enum types are referenced by column
   definitions throughout.
2. **0006 after 0004 and 0005** — those helpers are `language sql`, which
   PostgreSQL parses at creation time, so they cannot reference tables that
   do not yet exist. This is why 0006 is numbered between 0005 and 0007
   rather than grouped with the other helpers in 0003.
3. **0011–0013 after all tables** — policies and grants need their objects.

```
0001 types ─┬─ 0002 identity ── 0003 identity security
            ├─ 0004 meetings ──┐
            ├─ 0005 recordings ┴─ 0006 content access ── 0007 work
            ├─ 0008 calendar
            └─ 0009 support ── 0010 audit
                                 └─ 0011 RLS ── 0012 storage ── 0013 grants
                                                   └─ 0014 RPC
                                                       └─ 0015 MFA
                                                           └─ 0016 scoping fix
                                                               └─ 0017 MFA scoping fix
```

---

## 3. Migration by Migration

Each entry: what it does, what it touches, what it depends on, how to confirm
it worked, and what undoing it would cost.

A general note on rollback, which applies to all seventeen: **there are no
down migrations**, deliberately. A down migration that drops a column is one
that destroys data, and it is usually written with less care than the
migration it reverses. The rollback plan is the pre-migration dump
(`docs/backup-and-recovery.md`). Each file runs in its own transaction, so a
failure leaves that file unapplied rather than half-applied.

---

### 0001 — `20261113090000_0001_foundation.sql`

**Purpose.** 22 enum types and the `updated_at` machinery. Holds no data.

**Affects.** Types `app_role`, `account_status`, `meeting_status`,
`job_status`, `task_status`, `verification_state`, `consent_status`,
`recording_eligibility_rule` and 14 more. Functions `set_updated_at()`,
`attach_updated_at()`.

**Depends on.** Nothing. Must be first.

**Validate.**
```sql
select count(*) from pg_type t join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public' and t.typtype = 'e';   -- expect 22
```

**Rollback.** Safe to drop on an empty project. Once any table uses a type,
dropping it cascades to the column.

---

### 0002 — `20261113090100_0002_identity.sql`

**Purpose.** Teams, profiles, membership, invitations, preferences.

**Affects.** `teams`, `profiles`, `team_members`, `user_invitations`,
`user_preferences`. `profiles.id` references `auth.users`.

**Depends on.** 0001; the `auth` schema, which Supabase provides.

**Validate.**
```sql
select count(*) from information_schema.tables
where table_schema = 'public'
  and table_name in ('teams','profiles','team_members','user_invitations','user_preferences');
-- expect 5
```

**Rollback.** Dropping `profiles` cascades to nearly everything. On a
populated project this is a restore, not a drop.

---

### 0003 — `20261113090200_0003_identity_security.sql`

**Purpose.** Identity helpers and the two privilege-escalation guards.
Closes registration.

**Affects.** Functions `current_profile_id`, `is_active_user`,
`current_role_in_team`, `is_team_member`, `has_team_role`, `is_super_admin`,
`auth.enforce_invitation_only`, `guard_team_membership`,
`guard_profile_changes`. Triggers on `team_members`, `profiles` and
**`auth.users`**.

**Depends on.** 0002.

**Watch for.** This is the only migration that creates a trigger on
`auth.users`. If `supabase db push` reports a permission problem, the
migration role lacks rights on the `auth` schema — raise it rather than
dropping the trigger, because without it registration is not actually closed.

**Validate.**
```sql
select tgname from pg_trigger
where tgrelid = 'auth.users'::regclass and not tgisinternal;
-- expect enforce_invitation_only
```

**Rollback.** Dropping the trigger reopens registration. Do not.

---

### 0004 — `20261113090300_0004_meetings.sql`

**Purpose.** Meetings, participants, agendas, the consent register.

**Affects.** `meetings`, `meeting_participants`, `meeting_agendas`,
`meeting_consents`. Trigger `seed_participant_consent` creates a pending
consent row whenever a participant is added.

**Depends on.** 0001, 0002.

**Validate.**
```sql
select conname from pg_constraint
where conrelid = 'public.meeting_consents'::regclass
  and conname = 'meeting_consents_decision_has_provenance';
```

**Rollback.** `meetings.team_id` is `on delete restrict`; the table cannot be
dropped while recordings reference it.

---

### 0005 — `20261113090400_0005_recordings_ai.sql`

**Purpose.** Audio, the processing queue, transcripts, AI extractions,
verification history.

**Affects.** `recordings`, `ai_processing_jobs`, `transcripts`,
`transcript_segments`, `ai_extractions`, `verification_records`.

**Depends on.** 0001, 0004.

**Validate.** Confirm a URL cannot be stored where a path belongs:
```sql
insert into public.recordings (meeting_id, storage_path, mime_type, byte_size)
values (gen_random_uuid(), 'https://example.com/x.webm', 'audio/webm', 1);
-- expect: violates check constraint
```

**Rollback.** `recordings.meeting_id` is `restrict`, deliberately: dropping a
meeting must not silently destroy audio.

---

### 0006 — `20261113090450_0006_content_access.sql`

**Purpose.** The access helpers for meeting content.

**Affects.** `meeting_team`, `is_meeting_participant`, `can_view_meeting`,
`can_access_meeting_content`, `can_manage_meeting`, `can_access_recording`,
`can_access_transcript`.

**Depends on.** 0004 and 0005 — **hard**. These are `language sql` and will
fail to create if the tables do not exist. This is why the file sits here.

**Validate.**
```sql
select count(*) from pg_proc
where proname in ('can_view_meeting','can_access_meeting_content','can_manage_meeting')
  and pronamespace = 'public'::regnamespace;   -- expect 3
```

**Rollback.** Dropping these breaks every policy that calls them.

---

### 0007 — `20261113090500_0007_work.sql`

**Purpose.** Action items, tasks, assignment history, daily work. **Contains
the AI verification gate.**

**Affects.** `action_items`, `tasks`, `task_assignments`, `daily_work_logs`.
Trigger `tasks_require_verified_source`.

**Depends on.** 0001, 0002, 0004, 0005.

**Validate.** The gate is the point of this migration, so test it:
```sql
-- with an extraction whose state is 'pending'
insert into public.tasks (team_id, title, source_extraction_id)
values ('<team>', 'should be refused', '<pending extraction>');
-- expect: AI-derived content cannot become an official record...
```

**Rollback.** Dropping the trigger removes the human-approval gate. Do not.

---

### 0008 — `20261113090600_0008_calendar.sql`

**Purpose.** Calendar connections, OAuth tokens, events, the sync outbox.

**Affects.** `calendar_connections`, `calendar_credentials`,
`calendar_events`, `calendar_sync_jobs`.

**Depends on.** 0001, 0002, 0004, 0007.

**Note.** `calendar_credentials` is separate from `calendar_connections` on
purpose: a policy mistake on the connection table cannot expose a refresh
token, because the token is not in that table.

**Validate.**
```sql
select conname from pg_constraint
where conrelid = 'public.calendar_sync_jobs'::regclass and contype = 'u';
-- expect the (connection_id, idempotency_key) unique constraint
```

---

### 0009 — `20261113090700_0009_support.sql`

**Purpose.** Notifications, documents, application settings, retention
configuration. **Seeds the inert retention rows and the recording switches.**

**Affects.** `notifications`, `documents`, `app_settings`,
`retention_policies`.

**Depends on.** 0001, 0002, 0004.

**Validate.** This is the migration that establishes "nothing is approved":
```sql
select scope, enabled, retention_days, status from public.retention_policies;
-- expect 4 rows, all enabled=false, retention_days=null, status=pending_approval

select key, value from public.app_settings
where key in ('recording_enabled','recording_eligibility_rule');
-- expect false and "disabled"
```

**Rollback.** Re-running would conflict on the primary keys.

---

### 0010 — `20261113090800_0010_audit.sql`

**Purpose.** The append-only audit trail and its triggers.

**Affects.** `audit_logs`. Functions `redact_audit_payload`, `log_audit`,
`audit_row_change`, `log_content_access`. Triggers on 12 tables.

**Depends on.** All table migrations above.

**Validate.**
```sql
select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
where t.tgname like 'audit_%' and not t.tgisinternal;   -- expect 12
```

**Rollback.** Dropping triggers stops the trail without warning. Any gap in
the trail is itself a finding.

---

### 0011 — `20261113090900_0011_rls.sql`

**Purpose.** Row Level Security on every table. **The largest and most
consequential file: 476 lines, 56 policy statements.**

**Affects.** `alter table ... enable row level security` on 28 tables, plus
the permissive policies.

**Depends on.** All tables and all helpers.

**Watch for.** A failure partway leaves some tables with RLS enabled and no
policy — which denies everything and looks like total breakage. The
transaction prevents this, but if the file is ever split, do not split it
across transactions.

**Validate.**
```sql
select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
-- expect 0
```

**Rollback.** Disabling RLS exposes every table to every signed-in user.
Never do this on a project holding real data, not even briefly to debug.

---

### 0012 — `20261113091000_0012_storage.sql`

**Purpose.** Four private buckets and their policies.

**Affects.** `storage.buckets` (4 rows), `storage.objects` policies, the
`refuse_public_buckets` trigger.

**Depends on.** 0006, 0011; the `storage` schema, which Supabase provides.

**Validate.**
```sql
select id, public, file_size_limit from storage.buckets order by id;
-- expect 4 rows, public = false on every one

update storage.buckets set public = true where id = 'meeting-recordings';
-- expect: cannot be made public
```

**Rollback.** Dropping a bucket deletes its objects. On a populated project
this is irreversible — Supabase's database backups do not contain Storage.

---

### 0013 — `20261113091100_0013_grants.sql`

**Purpose.** Privilege hardening. Strips the anonymous role entirely and
removes write privileges that no policy should be able to grant back.

**Affects.** Grants and revokes on `anon`, `authenticated`, `service_role`.

**Depends on.** Every object must exist, or the revokes silently miss it.
**Must run after 0011.**

**Validate.**
```sql
select count(*) from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public';   -- expect 0

select privilege_type from information_schema.role_table_grants
where grantee = 'authenticated' and table_name = 'audit_logs';   -- expect SELECT only
```

**Rollback.** Re-granting to `anon` would expose every table to
unauthenticated requests.

---

### 0014 — `20261113091200_0014_rpc.sql`

**Purpose.** Atomic meeting creation. Creating a meeting touches three
tables, and doing it as three calls can leave a meeting with no participants
— one nobody can open.

**Affects.** `create_meeting`, `replace_meeting_agenda`,
`replace_meeting_participants`.

**Depends on.** 0004, 0011.

**Note.** All three are `SECURITY INVOKER`. If one were ever changed to
`SECURITY DEFINER` it would hand every member the ability to create meetings.
A test asserts this.

**Validate.**
```sql
select proname, prosecdef from pg_proc
where proname in ('create_meeting','replace_meeting_agenda','replace_meeting_participants');
-- expect prosecdef = false on all three
```

---

### 0015 — `20261113091300_0015_mfa.sql`

**Purpose.** Mandatory MFA. Restrictive `aal2` policies on every table and on
`storage.objects`, plus the administrator-assisted reset record.

**Affects.** `is_mfa_verified()`, `current_aal()`, a `require_mfa` restrictive
policy on every table in `public` and on `storage.objects`,
`mfa_reset_requests`.

**Depends on.** 0011, 0012.

**Watch for.** The policies are applied by iterating over `public`. A table
created **after** this migration will not get one. The structural test suite
fails if any table lacks it — run `npm run test:db` after adding any table.

**Validate.**
```sql
select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and not exists (select 1 from pg_policy p where p.polrelid = c.oid
                  and not p.polpermissive
                  and pg_get_expr(p.polqual, p.polrelid) like '%is_mfa_verified%');
-- expect 0 rows

select count(*) from pg_policy
where polrelid = 'storage.objects'::regclass and not polpermissive;   -- expect >= 1
```

**Rollback.** Dropping these admits password-only sessions to every
confidential record.

---

### 0016 — `20261113091400_0016_scope_super_admin.sql`

**Purpose.** **Security fix.** `is_super_admin()` asks whether a user
administers *any* team. It was used in six places to gate a *specific*
team's data, so a Super Admin of team B could read team A's recordings and
transcripts, suspend its staff, and delete its recordings.

**Affects.** Adds `is_super_admin_of(team)`. Four sites rescoped —
`can_access_meeting_content`, `profiles_admin_manage`, `documents_select`,
`audit_logs_super_admin_read`. Two removed entirely rather than rescoped:
`recordings_admin_delete` and the storage recording-delete policy, because
`DELETE` on `recordings` was already revoked in 0013 and the policy could
never fire.

**Depends on.** 0011, 0012, 0015.

**Why it is a separate migration.** 0011 and 0015 were not edited. The
correction is legible in history, and anyone reading 0011 alone would
otherwise believe the original policy is current.

**Validate.**
```sql
select prosrc like '%is_super_admin_of%' from pg_proc
where proname = 'can_access_meeting_content';   -- expect true

select has_table_privilege('authenticated','public.recordings','DELETE');  -- expect false
```

---

### 0017 — `20261113091500_0017_scope_mfa_reset.sql`

**Purpose.** **Security fix.** 0016 corrected six uses of the unscoped
`is_super_admin()` but missed `mfa_reset_requests`, created in 0015 during the
same pass. A Super Admin of another team could see that a member had lost
their authenticator, and could raise and approve a reset for them — placing a
forged authorisation in the record a server-side operator is expected to act
on.

**Affects.** `mfa_reset_select`, `mfa_reset_admin_write`.

**Depends on.** 0015, 0016.

**Found by.** Listing every policy still referencing `is_super_admin()` during
M3 verification, rather than assuming 0016 had been complete.

**Validate.**
```sql
select distinct polname from pg_policy
where pg_get_expr(polqual, polrelid) ~ 'is_super_admin\(\)'
   or pg_get_expr(polwithcheck, polrelid) ~ 'is_super_admin\(\)'
order by 1;
-- expect exactly: app_settings_admin_write, audit_logs_super_admin_read,
--                 retention_admin_write
```

Those three are deliberate: institution-wide configuration, and the
null-team fallback on the audit trail. The migration header records why. A
fourth name appearing here is a bug.

---

## 4. Post-Migration Verification

Run every one. Each has an expected value; a mismatch means stop.

```sql
-- 1. All tables protected
select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;   -- 0

-- 2. Anonymous role holds nothing
select count(*) from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public';   -- 0

-- 3. Every SECURITY DEFINER function pins its search_path
select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','auth') and p.prosecdef
  and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c
                  where c like 'search_path=%');   -- 0

-- 4. No public bucket
select count(*) from storage.buckets where public;   -- 0

-- 5. Retention inert
select count(*) from public.retention_policies where enabled or retention_days is not null;  -- 0

-- 6. Recording off
select value from public.app_settings where key = 'recording_enabled';   -- false

-- 7. Audit trail unwritable by users
select count(*) from information_schema.role_table_grants
where grantee = 'authenticated' and table_name = 'audit_logs'
  and privilege_type in ('INSERT','UPDATE','DELETE');   -- 0

-- 8. Registration closed
select count(*) from pg_trigger
where tgrelid = 'auth.users'::regclass and tgname = 'enforce_invitation_only';   -- 1
```

Then the Advisors page in the dashboard: no "RLS disabled" or "exposed table"
findings.

Then `npm run verify:deployment` — see `docs/m3-live-verification.md`.

---

## 5. If a Migration Fails

1. **Do not re-run the whole push.** Find which file stopped, with the
   validation queries above.
2. **Do not edit the failed file and push again** if any file after it
   applied. Write a corrective migration forward instead.
3. **On an empty project**, the simplest recovery is to delete and recreate
   it. Faster and cleaner than unpicking a partial apply, and there is no
   data to lose. This is only true before §4 of the deployment guide.
4. **On a populated project**, restore the pre-migration dump. That is why
   the deployment guide takes one first.

---

## 6. Adding a Migration Later

- Forward-only. Never edit an applied file.
- New table? It needs: RLS enabled, a permissive policy, the `require_mfa`
  restrictive policy, grants, and an index on every column a policy touches.
- Run `npm run test:db` before pushing. The structural tests fail on a table
  without RLS, a table without the MFA policy, an unpinned `SECURITY DEFINER`
  function, a public bucket, a privilege granted to `anon`, or a new unscoped
  `is_super_admin()` use. That suite is the review you would otherwise have
  to do by eye.

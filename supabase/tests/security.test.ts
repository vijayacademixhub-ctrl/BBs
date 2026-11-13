import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type pg from 'pg'
import {
  asAnon, asAnonAttempt, asUnknownSubject, asUser, asUserAttempt, attemptDirect,
  buildSchema, connect, denialReason, IDS,
} from './db'

const here = dirname(fileURLToPath(import.meta.url))
let db: pg.Client

beforeAll(async () => {
  db = await connect()
  await buildSchema(db)
  await db.query(readFileSync(join(here, '..', 'seed', 'test-fixtures.sql'), 'utf8'))
}, 60_000)

afterAll(async () => {
  await db?.end()
})

/* ======================================================= confidentiality === */

describe('anonymous access', () => {
  const confidential = [
    'profiles', 'meetings', 'recordings', 'transcripts', 'transcript_segments',
    'ai_extractions', 'tasks', 'daily_work_logs', 'documents', 'audit_logs',
    'meeting_consents', 'calendar_connections', 'calendar_credentials',
  ]

  it.each(confidential)('an anonymous request cannot read public.%s', async (table) => {
    const outcome = await asAnonAttempt(db, () => db.query(`select * from public.${table}`))
    // The anon role holds no privilege on the schema at all, so the request is
    // refused before any policy is consulted.
    expect(denialReason(outcome)).toMatch(/permission denied/i)
  })

  it('an anonymous request cannot write', async () => {
    const outcome = await asAnonAttempt(db, () =>
      db.query(`insert into public.tasks (team_id, title) values ($1, 'injected')`, [IDS.team]),
    )
    expect(denialReason(outcome)).toMatch(/permission denied/i)
  })
})

describe('a token whose subject is not a profile', () => {
  it('reads nothing, even though the role is authenticated', async () => {
    const rows = await asUnknownSubject(db, async () => {
      const r = await db.query('select id from public.meetings')
      return r.rows
    })
    expect(rows).toHaveLength(0)
  })
})

/* ============================================================ suspension === */

describe('a suspended account', () => {
  it('cannot read meetings', async () => {
    const rows = await asUser(db, 'suspended', async () =>
      (await db.query('select id from public.meetings')).rows,
    )
    expect(rows).toHaveLength(0)
  })

  it('cannot read team members', async () => {
    const rows = await asUser(db, 'suspended', async () =>
      (await db.query('select id from public.team_members')).rows,
    )
    expect(rows).toHaveLength(0)
  })

  it('cannot create a task', async () => {
    const outcome = await asUserAttempt(db, 'suspended', () =>
      db.query(
        `insert into public.tasks (team_id, title, created_by) values ($1, 'Should not exist', $2)`,
        [IDS.team, IDS.suspended],
      ),
    )
    expect(denialReason(outcome)).toMatch(/row-level security/i)
  })
})

/* ====================================================== meeting content === */

describe('meeting content is reachable only through participation', () => {
  it('a participant reads the transcript', async () => {
    const rows = await asUser(db, 'memberA', async () =>
      (await db.query('select id from public.transcripts')).rows,
    )
    expect(rows).toHaveLength(1)
  })

  it('a team member who did not attend reads nothing', async () => {
    const rows = await asUser(db, 'memberB', async () =>
      (await db.query('select id from public.transcripts')).rows,
    )
    expect(rows).toHaveLength(0)
  })

  it('a COORDINATOR who did not attend reads nothing — role does not override participation', async () => {
    const rows = await asUser(db, 'coordinator', async () =>
      (await db.query('select id from public.transcripts')).rows,
    )
    expect(rows).toHaveLength(0)
  })

  it('the same applies to the recording', async () => {
    const participant = await asUser(db, 'memberA', async () =>
      (await db.query('select id from public.recordings')).rows,
    )
    const nonParticipant = await asUser(db, 'memberB', async () =>
      (await db.query('select id from public.recordings')).rows,
    )
    expect(participant).toHaveLength(1)
    expect(nonParticipant).toHaveLength(0)
  })

  it('the same applies to transcript segments and AI extractions', async () => {
    const segments = await asUser(db, 'memberB', async () =>
      (await db.query('select id from public.transcript_segments')).rows,
    )
    const extractions = await asUser(db, 'memberB', async () =>
      (await db.query('select id from public.ai_extractions')).rows,
    )
    expect(segments).toHaveLength(0)
    expect(extractions).toHaveLength(0)
  })

  it('a Super Admin retains oversight of content', async () => {
    const rows = await asUser(db, 'superAdmin', async () =>
      (await db.query('select id from public.transcripts')).rows,
    )
    expect(rows).toHaveLength(1)
  })
})

describe('meeting visibility respects confidentiality', () => {
  it('an internal meeting is visible to the team', async () => {
    const rows = await asUser(db, 'memberB', async () =>
      (await db.query('select id from public.meetings where id = $1', [IDS.meetingPrivate])).rows,
    )
    expect(rows).toHaveLength(1)
  })

  it('a restricted meeting is invisible to a non-participant', async () => {
    const rows = await asUser(db, 'memberB', async () =>
      (await db.query('select id from public.meetings where id = $1', [IDS.meetingRestricted])).rows,
    )
    expect(rows).toHaveLength(0)
  })
})

/* ========================================================= cross-tenant === */

describe('cross-team isolation', () => {
  it('a user of another team sees none of this team\'s meetings', async () => {
    const rows = await asUser(db, 'outsider', async () =>
      (await db.query('select id from public.meetings')).rows,
    )
    expect(rows).toHaveLength(0)
  })

  it('a user of another team sees none of this team\'s tasks or profiles', async () => {
    const result = await asUser(db, 'outsider', async () => ({
      tasks: (await db.query('select id from public.tasks')).rows,
      profiles: (await db.query('select id from public.profiles')).rows,
    }))
    expect(result.tasks).toHaveLength(0)
    // Only their own profile.
    expect(result.profiles.map((r) => r.id)).toEqual([IDS.outsider])
  })

  it('a user of another team cannot insert into this team', async () => {
    const outcome = await asUserAttempt(db, 'outsider', () =>
      db.query(`insert into public.tasks (team_id, title, created_by) values ($1, 'Injected', $2)`, [
        IDS.team,
        IDS.outsider,
      ]),
    )
    expect(denialReason(outcome)).toMatch(/row-level security/i)
  })
})

/* ================================================ privilege escalation === */

describe('privilege escalation is refused', () => {
  it('a member cannot raise their own role', async () => {
    const outcome = await asUserAttempt(db, 'memberA', () =>
      db.query(`update public.team_members set role = 'super_admin' where profile_id = $1`, [
        IDS.memberA,
      ]),
    )
    expect(denialReason(outcome)).toMatch(/row-level security|cannot change their own role/i)
  })

  it('a member cannot add themselves to another team', async () => {
    const outcome = await asUserAttempt(db, 'memberA', () =>
      db.query(
        `insert into public.team_members (team_id, profile_id, role) values ($1, $2, 'member')`,
        [IDS.otherTeam, IDS.memberA],
      ),
    )
    expect(denialReason(outcome)).toMatch(/row-level security|cannot add themselves/i)
  })

  it('a coordinator cannot grant the Super Admin role', async () => {
    const outcome = await asUserAttempt(db, 'coordinator', () =>
      db.query(`update public.team_members set role = 'super_admin' where profile_id = $1`, [
        IDS.memberA,
      ]),
    )
    expect(denialReason(outcome)).toMatch(/row-level security|Super Admin/i)
  })

  it('a member cannot activate their own suspended colleague', async () => {
    const outcome = await asUserAttempt(db, 'memberA', () =>
      db.query(`update public.profiles set status = 'active' where id = $1`, [IDS.suspended]),
    )
    expect(denialReason(outcome)).toMatch(/row-level security|Super Admin/i)
  })

  it('a user cannot change their own account status', async () => {
    const outcome = await asUserAttempt(db, 'memberA', () =>
      db.query(`update public.profiles set status = 'suspended' where id = $1`, [IDS.memberA]),
    )
    expect(denialReason(outcome)).toMatch(/Super Admin|row-level security/i)
  })

  it('a user cannot change their own sign-in address', async () => {
    const outcome = await asUserAttempt(db, 'memberA', () =>
      db.query(`update public.profiles set email = 'attacker@example.com' where id = $1`, [
        IDS.memberA,
      ]),
    )
    expect(denialReason(outcome)).toMatch(/cannot be changed|row-level security/i)
  })

  it('a Super Admin genuinely can change a role — the control is not simply "deny all"', async () => {
    const updated = await asUser(db, 'superAdmin', async () => {
      const r = await db.query(
        `update public.team_members set role = 'coordinator' where profile_id = $1 returning role`,
        [IDS.memberA],
      )
      return r.rows
    })
    expect(updated).toEqual([{ role: 'coordinator' }])
  })

  it('a Super Admin still cannot change their OWN role', async () => {
    const outcome = await asUserAttempt(db, 'superAdmin', () =>
      db.query(`update public.team_members set role = 'member' where profile_id = $1`, [
        IDS.superAdmin,
      ]),
    )
    expect(denialReason(outcome)).toMatch(/cannot change their own role/i)
  })
})

/* ====================================================== the AI gate ===== */

describe('the AI verification gate', () => {
  it('refuses a task citing an unapproved extraction', async () => {
    const outcome = await asUserAttempt(db, 'coordinator', () =>
      db.query(
        `insert into public.tasks (team_id, title, created_by, source_extraction_id)
         values ($1, 'Task from unverified AI output', $2, $3)`,
        [IDS.team, IDS.coordinator, IDS.extractionPending],
      ),
    )
    expect(denialReason(outcome)).toMatch(/until it has been verified/i)
  })

  it('accepts a task citing an approved extraction', async () => {
    const rows = await asUser(db, 'coordinator', async () => {
      const r = await db.query(
        `insert into public.tasks (team_id, title, created_by, source_extraction_id)
         values ($1, 'Task from verified AI output', $2, $3) returning id`,
        [IDS.team, IDS.coordinator, IDS.extractionApproved],
      )
      return r.rows
    })
    expect(rows).toHaveLength(1)
  })

  it('refuses a calendar event citing an unapproved extraction', async () => {
    const outcome = await asUserAttempt(db, 'coordinator', () =>
      db.query(
        `insert into public.calendar_events
           (team_id, meeting_id, title, starts_at, ends_at, source_extraction_id)
         values ($1, $2, 'Unverified follow-up', now(), now() + interval '1 hour', $3)`,
        [IDS.team, IDS.meetingPrivate, IDS.extractionPending],
      ),
    )
    expect(denialReason(outcome)).toMatch(/until it has been verified/i)
  })

  it('cannot be bypassed even by the service role', async () => {
    // The gate is a trigger, not a policy, so bypassrls does not avoid it.
    await db.query('begin')
    const outcome = await attemptDirect(() =>
      db.query(
        `insert into public.tasks (team_id, title, source_extraction_id) values ($1, 'Service bypass', $2)`,
        [IDS.team, IDS.extractionPending],
      ),
    )
    await db.query('rollback')
    expect(denialReason(outcome)).toMatch(/until it has been verified/i)
  })
})

/* ============================================================== audit === */

describe('audit logs', () => {
  it('are readable only by a Super Admin', async () => {
    const admin = await asUser(db, 'superAdmin', async () =>
      (await db.query('select count(*)::int as n from public.audit_logs')).rows[0].n,
    )
    const member = await asUser(db, 'memberA', async () =>
      (await db.query('select count(*)::int as n from public.audit_logs')).rows[0].n,
    )
    expect(admin).toBeGreaterThan(0)
    expect(member).toBe(0)
  })

  it('cannot be updated, even by a Super Admin', async () => {
    const outcome = await asUserAttempt(db, 'superAdmin', () =>
      db.query(`update public.audit_logs set action = 'tampered'`),
    )
    expect(denialReason(outcome)).toMatch(/permission denied/i)
  })

  it('cannot be deleted, even by a Super Admin', async () => {
    const outcome = await asUserAttempt(db, 'superAdmin', () =>
      db.query('delete from public.audit_logs'),
    )
    expect(denialReason(outcome)).toMatch(/permission denied/i)
  })

  it('cannot be forged by a member inserting directly', async () => {
    const outcome = await asUserAttempt(db, 'memberA', () =>
      db.query(
        `insert into public.audit_logs (action, entity_type) values ('fake_event', 'meeting')`,
      ),
    )
    expect(denialReason(outcome)).toMatch(/permission denied/i)
  })

  it('record a role change automatically', async () => {
    await db.query('begin')
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: IDS.superAdmin, role: 'authenticated', aal: 'aal2' }),
    ])
    await db.query('set local role authenticated')
    await db.query(`update public.team_members set role = 'coordinator' where profile_id = $1`, [
      IDS.memberB,
    ])
    await db.query('reset role')
    const { rows } = await db.query(
      `select action, actor_id from public.audit_logs
       where entity_type = 'team_member' order by id desc limit 1`,
    )
    await db.query('rollback')
    expect(rows[0].action).toBe('update_team_member')
    expect(rows[0].actor_id).toBe(IDS.superAdmin)
  })

  it('never contain OAuth tokens', async () => {
    await db.query('begin')
    const { rows: conn } = await db.query(
      `insert into public.calendar_connections (profile_id, provider, account_email)
       values ($1, 'google', 'admin@example.ac.in') returning id`,
      [IDS.superAdmin],
    )
    await db.query(
      `insert into public.calendar_credentials (connection_id, access_token, refresh_token)
       values ($1, 'ya29.SECRET-ACCESS', '1//SECRET-REFRESH')`,
      [conn[0].id],
    )
    const { rows } = await db.query(
      `select count(*)::int as n from public.audit_logs
       where before::text ilike '%SECRET%' or after::text ilike '%SECRET%'`,
    )
    await db.query('rollback')
    expect(rows[0].n).toBe(0)
  })
})

/* =================================================== calendar secrets === */

describe('calendar credentials', () => {
  it('are unreadable by their own owner', async () => {
    const outcome = await asUserAttempt(db, 'superAdmin', () =>
      db.query('select * from public.calendar_credentials'),
    )
    expect(denialReason(outcome)).toMatch(/permission denied/i)
  })

  it('are unreadable by another user', async () => {
    const outcome = await asUserAttempt(db, 'memberA', () =>
      db.query('select * from public.calendar_credentials'),
    )
    expect(denialReason(outcome)).toMatch(/permission denied/i)
  })

  it('a connection belongs only to its owner', async () => {
    await db.query('begin')
    await db.query(
      `insert into public.calendar_connections (profile_id, provider, account_email)
       values ($1, 'google', 'member.a@example.ac.in')`,
      [IDS.memberA],
    )
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: IDS.superAdmin, role: 'authenticated', aal: 'aal2' }),
    ])
    await db.query('set local role authenticated')
    const { rows } = await db.query('select id from public.calendar_connections')
    await db.query('rollback')
    // Even a Super Admin does not see another person's calendar connection.
    expect(rows).toHaveLength(0)
  })
})

/* ====================================================== daily work ====== */

describe('daily work logs', () => {
  beforeAll(async () => {
    await db.query(
      `insert into public.daily_work_logs (team_id, profile_id, log_date, completed)
       values ($1, $2, current_date, 'Completed the confidential case summary.')`,
      [IDS.team, IDS.memberA],
    )
  })

  it('are invisible to a peer', async () => {
    const rows = await asUser(db, 'memberB', async () =>
      (await db.query('select id from public.daily_work_logs')).rows,
    )
    expect(rows).toHaveLength(0)
  })

  it('are visible to a coordinator for oversight', async () => {
    const rows = await asUser(db, 'coordinator', async () =>
      (await db.query('select id from public.daily_work_logs')).rows,
    )
    expect(rows).toHaveLength(1)
  })

  it('cannot be written in someone else\'s name', async () => {
    const outcome = await asUserAttempt(db, 'memberB', () =>
      db.query(
        `insert into public.daily_work_logs (team_id, profile_id, log_date, completed)
         values ($1, $2, current_date - 1, 'Fabricated entry on behalf of a colleague.')`,
        [IDS.team, IDS.memberA],
      ),
    )
    expect(denialReason(outcome)).toMatch(/row-level security/i)
  })
})

/* ========================================================== storage ===== */

describe('private storage', () => {
  it('every bucket is private', async () => {
    const { rows } = await db.query('select id, public from storage.buckets')
    expect(rows).toHaveLength(4)
    expect(rows.every((r) => r.public === false)).toBe(true)
  })

  it('a bucket cannot be made public', async () => {
    const outcome = await attemptDirect(() =>
      db.query(`update storage.buckets set public = true where id = 'meeting-recordings'`),
    )
    expect(denialReason(outcome)).toMatch(/cannot be made public/i)
  })

  it('an anonymous request sees no objects', async () => {
    const outcome = await asAnonAttempt(db, () => db.query('select * from storage.objects'))
    expect(denialReason(outcome)).toMatch(/permission denied/i)
  })

  it('a meeting participant can list the recording object', async () => {
    const rows = await asUser(db, 'memberA', async () =>
      (await db.query(`select id from storage.objects where bucket_id = 'meeting-recordings'`)).rows,
    )
    expect(rows).toHaveLength(1)
  })

  it('a non-participant cannot, mirroring the database policy', async () => {
    const rows = await asUser(db, 'memberB', async () =>
      (await db.query(`select id from storage.objects where bucket_id = 'meeting-recordings'`)).rows,
    )
    expect(rows).toHaveLength(0)
  })

  it('a non-participant cannot upload into another meeting\'s folder', async () => {
    const outcome = await asUserAttempt(db, 'memberB', () =>
      db.query(
        `insert into storage.objects (bucket_id, name) values ('meeting-recordings', $1)`,
        [`${IDS.team}/${IDS.meetingPrivate}/injected.webm`],
      ),
    )
    expect(denialReason(outcome)).toMatch(/row-level security/i)
  })
})

/* ==================================================== data integrity ==== */

describe('data integrity', () => {
  it('rejects an invalid foreign key', async () => {
    const outcome = await attemptDirect(() =>
      db.query(
        `insert into public.tasks (team_id, title) values ('11111111-1111-4111-8111-999999999999', 'Orphan')`,
      ),
    )
    expect(denialReason(outcome)).toMatch(/foreign key/i)
  })

  it('prevents two daily logs for the same person on the same day', async () => {
    await db.query('begin')
    await db.query(
      `insert into public.daily_work_logs (team_id, profile_id, log_date, completed)
       values ($1, $2, '2026-01-05', 'First account of the day.')`,
      [IDS.team, IDS.memberB],
    )
    const outcome = await attemptDirect(() =>
      db.query(
        `insert into public.daily_work_logs (team_id, profile_id, log_date, completed)
         values ($1, $2, '2026-01-05', 'Second, conflicting account of the day.')`,
        [IDS.team, IDS.memberB],
      ),
    )
    await db.query('rollback')
    expect(denialReason(outcome)).toMatch(/duplicate key/i)
  })

  it('prevents duplicate calendar sync jobs for the same idempotency key', async () => {
    await db.query('begin')
    const { rows: ev } = await db.query(
      `insert into public.calendar_events (team_id, meeting_id, title, starts_at, ends_at)
       values ($1, $2, 'Sync me', now(), now() + interval '1 hour') returning id`,
      [IDS.team, IDS.meetingPrivate],
    )
    const { rows: conn } = await db.query(
      `insert into public.calendar_connections (profile_id, provider, account_email)
       values ($1, 'google', 'sync@example.ac.in') returning id`,
      [IDS.superAdmin],
    )
    const insert = () =>
      db.query(
        `insert into public.calendar_sync_jobs (calendar_event_id, connection_id, operation, idempotency_key)
         values ($1, $2, 'create', 'same-key')`,
        [ev[0].id, conn[0].id],
      )
    await insert()
    const outcome = await attemptDirect(insert)
    await db.query('rollback')
    expect(denialReason(outcome)).toMatch(/duplicate key/i)
  })

  it('prevents a duplicate team membership', async () => {
    const outcome = await attemptDirect(() =>
      db.query(
        `insert into public.team_members (team_id, profile_id, role) values ($1, $2, 'member')`,
        [IDS.team, IDS.memberA],
      ),
    )
    expect(denialReason(outcome)).toMatch(/duplicate key/i)
  })

  it('refuses a recording row holding a URL instead of a storage path', async () => {
    const outcome = await attemptDirect(() =>
      db.query(
        `insert into public.recordings (meeting_id, storage_path, mime_type, byte_size)
         values ($1, 'https://example.com/public/recording.webm', 'audio/webm', 1000)`,
        [IDS.meetingPrivate],
      ),
    )
    expect(denialReason(outcome)).toMatch(/storage_path/i)
  })

  it('refuses a meeting with neither a location nor a link', async () => {
    const outcome = await attemptDirect(() =>
      db.query(
        `insert into public.meetings (team_id, title, starts_at, duration_minutes, organiser_id)
         values ($1, 'Nowhere', now(), 30, $2)`,
        [IDS.team, IDS.superAdmin],
      ),
    )
    expect(denialReason(outcome)).toMatch(/meetings_has_venue/i)
  })

  it('refuses a suspended profile with no suspension timestamp', async () => {
    const outcome = await attemptDirect(() =>
      db.query(`update public.profiles set status = 'suspended' where id = $1`, [IDS.memberB]),
    )
    expect(denialReason(outcome)).toMatch(/profiles_suspension_consistent/i)
  })
})

/* ======================================== registration and invitations == */

describe('registration is closed', () => {
  it('an auth user cannot be created without an open invitation', async () => {
    const outcome = await attemptDirect(() =>
      db.query(`insert into auth.users (email) values ('intruder@example.com')`),
    )
    expect(denialReason(outcome)).toMatch(/registration is closed/i)
  })

  it('an account can be created when an invitation is open', async () => {
    await db.query('begin')
    await db.query(
      `insert into public.user_invitations (email, team_id, role, full_name, invited_by)
       values ('newcomer@example.ac.in', $1, 'member', 'New Comer', $2)`,
      [IDS.team, IDS.superAdmin],
    )
    const inserted = await db.query(
      `insert into auth.users (email) values ('newcomer@example.ac.in') returning id`,
    )
    await db.query('rollback')
    expect(inserted.rows).toHaveLength(1)
  })

  it('an expired invitation does not open the door', async () => {
    await db.query('begin')
    await db.query(
      `insert into public.user_invitations (email, team_id, role, full_name, invited_by, expires_at)
       values ('stale@example.ac.in', $1, 'member', 'Stale Invite', $2, now() - interval '1 day')`,
      [IDS.team, IDS.superAdmin],
    )
    const outcome = await attemptDirect(() =>
      db.query(`insert into auth.users (email) values ('stale@example.ac.in')`),
    )
    await db.query('rollback')
    expect(denialReason(outcome)).toMatch(/registration is closed/i)
  })

  it('a member cannot create an invitation', async () => {
    const outcome = await asUserAttempt(db, 'memberA', () =>
      db.query(
        `insert into public.user_invitations (email, team_id, role, full_name, invited_by)
         values ('friend@example.com', $1, 'member', 'A Friend', $2)`,
        [IDS.team, IDS.memberA],
      ),
    )
    expect(denialReason(outcome)).toMatch(/row-level security/i)
  })

  it('a member cannot even see invitations', async () => {
    const rows = await asUser(db, 'memberA', async () =>
      (await db.query('select id from public.user_invitations')).rows,
    )
    expect(rows).toHaveLength(0)
  })
})

/* ==================================================== consent register == */

describe('consent register', () => {
  it('is created automatically for every participant', async () => {
    const { rows } = await db.query(
      `select status from public.meeting_consents where meeting_id = $1 order by created_at`,
      [IDS.meetingPrivate],
    )
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.status === 'pending')).toBe(true)
  })

  it('refuses a recorded decision with no provenance', async () => {
    const outcome = await attemptDirect(() =>
      db.query(
        `update public.meeting_consents set status = 'consented'
         where meeting_id = $1 and profile_id = $2`,
        [IDS.meetingPrivate, IDS.memberA],
      ),
    )
    expect(denialReason(outcome)).toMatch(/decision_has_provenance/i)
  })

  it('accepts a decision that records who, when and how', async () => {
    const rows = await asUser(db, 'superAdmin', async () => {
      const r = await db.query(
        `update public.meeting_consents
         set status = 'consented', method = 'verbal_in_meeting',
             recorded_by = $3, recorded_at = now()
         where meeting_id = $1 and profile_id = $2 returning status`,
        [IDS.meetingPrivate, IDS.memberA, IDS.superAdmin],
      )
      return r.rows
    })
    expect(rows).toEqual([{ status: 'consented' }])
  })

  it('a participant may withdraw their own consent', async () => {
    const rows = await asUser(db, 'memberA', async () => {
      const r = await db.query(
        `update public.meeting_consents
         set status = 'withdrawn', withdrawn_at = now(), method = 'system_prompt',
             recorded_by = $2, recorded_at = now()
         where meeting_id = $1 and profile_id = $2 returning status`,
        [IDS.meetingPrivate, IDS.memberA],
      )
      return r.rows
    })
    expect(rows).toEqual([{ status: 'withdrawn' }])
  })

  it('a non-participant cannot see the register', async () => {
    const rows = await asUser(db, 'memberB', async () =>
      (await db.query('select id from public.meeting_consents')).rows,
    )
    expect(rows).toHaveLength(0)
  })
})

/* =============================================== retention is inert ===== */

describe('retention policy', () => {
  it('is disabled and pending approval for every scope', async () => {
    const { rows } = await db.query(
      'select scope, enabled, retention_days, status from public.retention_policies order by scope',
    )
    expect(rows).toHaveLength(4)
    expect(rows.every((r) => r.enabled === false)).toBe(true)
    expect(rows.every((r) => r.retention_days === null)).toBe(true)
    expect(rows.every((r) => r.status === 'pending_approval')).toBe(true)
  })

  it('cannot be enabled without an approved period and an approver', async () => {
    const outcome = await attemptDirect(() =>
      db.query(`update public.retention_policies set enabled = true where scope = 'recording_audio'`),
    )
    expect(denialReason(outcome)).toMatch(/retention_enabled_requires_approval/i)
  })

  it('cannot be changed by an ordinary member', async () => {
    const outcome = await asUserAttempt(db, 'memberA', () =>
      db.query(
        `update public.retention_policies set note = 'approved by me' where scope = 'recording_audio'`,
      ),
    )
    expect(denialReason(outcome)).toMatch(/row-level security/i)
  })

  it('recording remains switched off until a policy is confirmed', async () => {
    const { rows } = await db.query(
      `select value from public.app_settings where key in ('recording_enabled', 'recording_eligibility_rule')
       order by key`,
    )
    expect(rows.map((r) => r.value)).toEqual(['disabled', false])
  })
})

/* ================================================= remote procedures ==== */

describe('meeting creation RPC', () => {
  it('runs as the caller, so an ordinary member is still refused', async () => {
    // The procedure is SECURITY INVOKER. If it were SECURITY DEFINER it would
    // hand every member the ability to create meetings, which is exactly the
    // mistake this test exists to catch.
    const outcome = await asUserAttempt(db, 'memberA', () =>
      db.query(
        `select public.create_meeting($1, 'Member-created meeting', now() + interval '1 day',
                                      30, null, 'Room 9', null, 'en', 'internal', $2, $3)`,
        [IDS.team, [IDS.memberB], ['Only item']],
      ),
    )
    expect(denialReason(outcome)).toMatch(/row-level security/i)
  })

  it('lets a coordinator create a meeting atomically, with themselves as a participant', async () => {
    const result = await asUser(db, 'coordinator', async () => {
      const created = await db.query(
        `select public.create_meeting($1, 'Coordinator meeting', now() + interval '1 day',
                                      30, 'Planning', 'Room 3', null, 'en', 'internal', $2, $3) as id`,
        [IDS.team, [IDS.memberB], ['First item', 'Second item']],
      )
      const id = created.rows[0].id as string
      const participants = await db.query(
        'select profile_id from public.meeting_participants where meeting_id = $1',
        [id],
      )
      const agenda = await db.query(
        'select item from public.meeting_agendas where meeting_id = $1 order by position',
        [id],
      )
      return { participants: participants.rows.map((r) => r.profile_id), agenda: agenda.rows }
    })

    expect(result.participants).toContain(IDS.coordinator)
    expect(result.participants).toContain(IDS.memberB)
    expect(result.agenda).toEqual([{ item: 'First item' }, { item: 'Second item' }])
  })

  it('leaves nothing behind when a later step fails', async () => {
    const before = (await db.query('select count(*)::int as n from public.meetings')).rows[0].n
    await asUserAttempt(db, 'coordinator', () =>
      db.query(
        `select public.create_meeting($1, 'Doomed meeting', now() + interval '1 day',
                                      30, null, 'Room 4', null, 'en', 'internal', $2, $3)`,
        // A participant id that is not a profile. The participant insert fails,
        // and the meeting row must go with it.
        [IDS.team, ['99999999-9999-4999-8999-999999999999'], []],
      ),
    )
    const after = (await db.query('select count(*)::int as n from public.meetings')).rows[0].n
    expect(after).toBe(before)
  })
})

describe('insert ... returning', () => {
  it('a coordinator can insert a meeting directly and read the row back', async () => {
    // PostgREST appends RETURNING to every insert, so the SELECT policy is
    // applied to the new row. A select policy that re-reads its own table
    // cannot see that row and silently breaks all creation. This test exists
    // because exactly that defect was present and shipped-looking.
    const rows = await asUser(db, 'coordinator', async () => {
      const r = await db.query(
        `insert into public.meetings
           (team_id, title, starts_at, duration_minutes, location, organiser_id)
         values ($1, 'Direct insert with returning', now() + interval '1 day', 30, 'Room 7', $2)
         returning id, title`,
        [IDS.team, IDS.coordinator],
      )
      return r.rows
    })
    expect(rows).toHaveLength(1)
  })

  it('a task insert returns its row', async () => {
    const rows = await asUser(db, 'memberA', async () => {
      const r = await db.query(
        `insert into public.tasks (team_id, title, created_by) values ($1, 'Returning task', $2)
         returning id`,
        [IDS.team, IDS.memberA],
      )
      return r.rows
    })
    expect(rows).toHaveLength(1)
  })

  it('a daily work log insert returns its row', async () => {
    const rows = await asUser(db, 'memberB', async () => {
      const r = await db.query(
        `insert into public.daily_work_logs (team_id, profile_id, log_date, completed)
         values ($1, $2, '2026-02-02', 'Returned row check for the daily log.') returning id`,
        [IDS.team, IDS.memberB],
      )
      return r.rows
    })
    expect(rows).toHaveLength(1)
  })
})

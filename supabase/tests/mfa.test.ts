import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type pg from 'pg'
import {
  asUser, asUserAal1, asUserAal1Attempt, asUserAttempt, asUserNoAalClaim,
  attemptDirect, buildSchema, connect, denialReason, IDS,
} from './db'

/**
 * Mandatory multi-factor authentication.
 *
 * These tests exercise the database half of MFA: whether a session that has
 * not verified a second factor can reach confidential records. They cannot
 * exercise the GoTrue half — enrolment, the TOTP challenge, and the issuing
 * of an aal2 token are Supabase's, and no project exists. See
 * docs/security-hardening-report.md §MFA for exactly what that leaves open.
 *
 * What is modelled here is the claim the database actually sees: `aal1`,
 * `aal2`, or no claim at all.
 */

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

/* ======================================== a password-only session (aal1) == */

describe('a session that has not verified a second factor', () => {
  const confidential = [
    'meetings', 'recordings', 'transcripts', 'transcript_segments', 'ai_extractions',
    'tasks', 'daily_work_logs', 'documents', 'meeting_consents', 'notifications',
    'team_members', 'teams', 'user_preferences', 'calendar_connections',
    'calendar_events', 'action_items', 'task_assignments', 'verification_records',
    'app_settings', 'retention_policies', 'mfa_reset_requests',
  ]

  it.each(confidential)('reads nothing from public.%s', async (table) => {
    const rows = await asUserAal1(db, 'superAdmin', async () =>
      (await db.query(`select * from public.${table}`)).rows,
    )
    expect(rows).toHaveLength(0)
  })

  it('reads nothing even as a Super Admin — the role does not substitute for the factor', async () => {
    const rows = await asUserAal1(db, 'superAdmin', async () =>
      (await db.query('select id from public.transcripts')).rows,
    )
    expect(rows).toHaveLength(0)
  })

  it('cannot create a task', async () => {
    const outcome = await asUserAal1Attempt(db, 'coordinator', () =>
      db.query(`insert into public.tasks (team_id, title, created_by) values ($1, 'Single factor', $2)`, [
        IDS.team,
        IDS.coordinator,
      ]),
    )
    expect(denialReason(outcome)).toMatch(/row-level security/i)
  })

  it('cannot create a meeting', async () => {
    const outcome = await asUserAal1Attempt(db, 'coordinator', () =>
      db.query(
        `insert into public.meetings (team_id, title, starts_at, duration_minutes, location, organiser_id)
         values ($1, 'Single factor meeting', now(), 30, 'Room 1', $2)`,
        [IDS.team, IDS.coordinator],
      ),
    )
    expect(denialReason(outcome)).toMatch(/row-level security/i)
  })

  it('cannot update its own daily work', async () => {
    const outcome = await asUserAal1Attempt(db, 'memberA', () =>
      db.query(`update public.daily_work_logs set completed = 'edited' where profile_id = $1`, [
        IDS.memberA,
      ]),
    )
    expect(denialReason(outcome)).toMatch(/row-level security|no rows affected/i)
  })

  it('cannot read a storage object', async () => {
    const rows = await asUserAal1(db, 'memberA', async () =>
      (await db.query(`select id from storage.objects where bucket_id = 'meeting-recordings'`)).rows,
    )
    expect(rows).toHaveLength(0)
  })
})

/* ================================================= the enrolment carve-out = */

describe('the enrolment carve-out', () => {
  it('lets an unverified session read its OWN profile, so enrolment can proceed', async () => {
    // Without this the user reaches a blank screen with no way forward: they
    // cannot see who they are signed in as, and cannot enrol.
    const rows = await asUserAal1(db, 'memberA', async () =>
      (await db.query('select id, full_name from public.profiles')).rows,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(IDS.memberA)
  })

  it('does not let it read a colleague\'s profile', async () => {
    const rows = await asUserAal1(db, 'memberA', async () =>
      (await db.query('select id from public.profiles where id = $1', [IDS.memberB])).rows,
    )
    expect(rows).toHaveLength(0)
  })

  it('does not let it write to its own profile', async () => {
    const outcome = await asUserAal1Attempt(db, 'memberA', () =>
      db.query(`update public.profiles set full_name = 'Renamed Before MFA' where id = $1`, [
        IDS.memberA,
      ]),
    )
    expect(denialReason(outcome)).toMatch(/row-level security|no rows affected/i)
  })

  it('does not let it discover the team', async () => {
    const rows = await asUserAal1(db, 'memberA', async () =>
      (await db.query('select team_id from public.team_members')).rows,
    )
    expect(rows).toHaveLength(0)
  })
})

/* =================================================== a missing aal claim == */

describe('a token carrying no aal claim', () => {
  it('is treated as single-factor and refused', async () => {
    // Supabase defines a JWT with no aal claim as aal1. An older token, or one
    // issued before MFA was required, must not be a way in.
    const rows = await asUserNoAalClaim(db, 'superAdmin', async () =>
      (await db.query('select id from public.meetings')).rows,
    )
    expect(rows).toHaveLength(0)
  })
})

/* ==================================================== a verified session == */

describe('a session with a verified second factor', () => {
  it('works normally', async () => {
    const rows = await asUser(db, 'memberA', async () =>
      (await db.query('select id from public.transcripts')).rows,
    )
    expect(rows).toHaveLength(1)
  })

  it('still cannot exceed its role — MFA grants assurance, not privilege', async () => {
    const rows = await asUser(db, 'memberB', async () =>
      (await db.query('select id from public.transcripts')).rows,
    )
    expect(rows).toHaveLength(0)
  })

  it('is still refused if the account is suspended', async () => {
    const rows = await asUser(db, 'suspended', async () =>
      (await db.query('select id from public.meetings')).rows,
    )
    expect(rows).toHaveLength(0)
  })
})

/* =============================================== administrator-assisted == */

describe('administrator-assisted MFA reset', () => {
  it('can be raised and approved by a Super Admin', async () => {
    const rows = await asUser(db, 'superAdmin', async () => {
      const r = await db.query(
        `insert into public.mfa_reset_requests
           (profile_id, reason, requested_by, status, approved_by, approved_at, identity_check)
         values ($1, 'Lost authenticator device; identity confirmed in person.', $2,
                 'approved', $2, now(), 'Verified in person against staff ID.')
         returning id, status`,
        [IDS.memberA, IDS.superAdmin],
      )
      return r.rows
    })
    expect(rows[0].status).toBe('approved')
  })

  it('cannot be approved by the subject themselves', async () => {
    // A locked-out user approving their own reset would make the control
    // decorative. The constraint refuses it regardless of who issues the write.
    const outcome = await attemptDirect(() =>
      db.query(
        `insert into public.mfa_reset_requests
           (profile_id, reason, requested_by, status, approved_by, approved_at)
         values ($1, 'Self approval attempt, which must be refused.', $1, 'approved', $1, now())`,
        [IDS.memberA],
      ),
    )
    expect(denialReason(outcome)).toMatch(/not_self_approved/i)
  })

  it('cannot be marked approved without recording who approved it and when', async () => {
    const outcome = await attemptDirect(() =>
      db.query(
        `insert into public.mfa_reset_requests (profile_id, reason, status)
         values ($1, 'Approved with no approver recorded, which is not an approval.', 'approved')`,
        [IDS.memberA],
      ),
    )
    expect(denialReason(outcome)).toMatch(/approval_recorded/i)
  })

  it('cannot be raised by an ordinary member', async () => {
    const outcome = await asUserAttempt(db, 'memberB', () =>
      db.query(
        `insert into public.mfa_reset_requests (profile_id, reason, requested_by)
         values ($1, 'Member attempting to reset their own second factor.', $1)`,
        [IDS.memberB],
      ),
    )
    expect(denialReason(outcome)).toMatch(/row-level security/i)
  })

  it('is visible to its subject, so they can see it was handled', async () => {
    await db.query('begin')
    await db.query(
      `insert into public.mfa_reset_requests (profile_id, reason, requested_by, status, approved_by, approved_at)
       values ($1, 'Device replaced; reset approved by the Super Admin.', $2, 'approved', $2, now())`,
      [IDS.memberB, IDS.superAdmin],
    )
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: IDS.memberB, role: 'authenticated', aal: 'aal2' }),
    ])
    await db.query('set local role authenticated')
    const { rows } = await db.query('select id from public.mfa_reset_requests')
    await db.query('rollback')
    expect(rows).toHaveLength(1)
  })

  it('is invisible to an unrelated colleague', async () => {
    await db.query('begin')
    await db.query(
      `insert into public.mfa_reset_requests (profile_id, reason, requested_by)
       values ($1, 'Reset request concerning another member entirely.', $2)`,
      [IDS.memberA, IDS.superAdmin],
    )
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: IDS.memberB, role: 'authenticated', aal: 'aal2' }),
    ])
    await db.query('set local role authenticated')
    const { rows } = await db.query('select id from public.mfa_reset_requests')
    await db.query('rollback')
    expect(rows).toHaveLength(0)
  })

  it('is written to the audit trail', async () => {
    await db.query('begin')
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: IDS.superAdmin, role: 'authenticated', aal: 'aal2' }),
    ])
    await db.query('set local role authenticated')
    await db.query(
      `insert into public.mfa_reset_requests (profile_id, reason, requested_by)
       values ($1, 'Audited reset request raised by the Super Admin.', $2)`,
      [IDS.memberA, IDS.superAdmin],
    )
    await db.query('reset role')
    const { rows } = await db.query(
      `select action, actor_id from public.audit_logs
       where entity_type = 'mfa_reset_request' order by id desc limit 1`,
    )
    await db.query('rollback')
    expect(rows[0].action).toBe('insert_mfa_reset_request')
    expect(rows[0].actor_id).toBe(IDS.superAdmin)
  })
})

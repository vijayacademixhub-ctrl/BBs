import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type pg from 'pg'
import { asAnon, asUser, asUserAttempt, buildSchema, connect, denialReason, IDS } from './db'

/**
 * Meeting access, stated as a matrix and checked cell by cell.
 *
 * The least-privilege model is easy to describe and easy to erode: one
 * convenience policy added later ("coordinators should just be able to see
 * everything") would undo it without any test failing, unless the tests say
 * what each role may and may not reach.
 *
 * Fixture arrangement:
 *   meetingPrivate     internal,   participants: superAdmin, memberA
 *   meetingRestricted  restricted, participants: superAdmin
 *   coordinator and memberB are team members who attended NEITHER.
 *   outsider belongs to a different team entirely.
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

type Actor = 'superAdmin' | 'coordinator' | 'memberA' | 'memberB' | 'outsider'

async function countVisible(actor: Actor, sql: string, params: unknown[] = []): Promise<number> {
  return asUser(db, actor, async () => (await db.query(sql, params)).rows.length)
}

/* ================================================== metadata visibility == */

describe('meeting metadata (title, time, location)', () => {
  const internal: Array<[Actor, number]> = [
    ['superAdmin', 1],   // organiser and participant
    ['memberA', 1],      // participant
    ['coordinator', 1],  // team member, internal meeting — scheduling visibility
    ['memberB', 1],      // team member, internal meeting
    ['outsider', 0],     // different team
  ]

  it.each(internal)('an internal meeting is visible to %s (%i)', async (actor, expected) => {
    const n = await countVisible(actor, 'select id from public.meetings where id = $1', [
      IDS.meetingPrivate,
    ])
    expect(n).toBe(expected)
  })

  const restricted: Array<[Actor, number]> = [
    ['superAdmin', 1],   // organiser and participant
    ['memberA', 0],      // not invited
    ['coordinator', 0],  // not invited; role does not help
    ['memberB', 0],
    ['outsider', 0],
  ]

  it.each(restricted)('a restricted meeting is visible to %s (%i)', async (actor, expected) => {
    const n = await countVisible(actor, 'select id from public.meetings where id = $1', [
      IDS.meetingRestricted,
    ])
    expect(n).toBe(expected)
  })

  it('is not visible anonymously', async () => {
    const message = await asAnon(db, async () => {
      try {
        await db.query('select id from public.meetings')
        return ''
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    })
    expect(message).toMatch(/permission denied/i)
  })
})

/* =================================================== content visibility == */

describe('meeting content (recording, transcript, segments, extractions)', () => {
  const expectations: Array<[Actor, number]> = [
    ['superAdmin', 1],   // institution-wide oversight
    ['memberA', 1],      // participant
    ['coordinator', 0],  // NOT a participant — role grants no transcript access
    ['memberB', 0],      // team member, did not attend
    ['outsider', 0],     // different team
  ]

  it.each(expectations)('the recording is reachable by %s (%i)', async (actor, expected) => {
    expect(await countVisible(actor, 'select id from public.recordings')).toBe(expected)
  })

  it.each(expectations)('the transcript is reachable by %s (%i)', async (actor, expected) => {
    expect(await countVisible(actor, 'select id from public.transcripts')).toBe(expected)
  })

  it.each(expectations)('transcript segments are reachable by %s (%i)', async (actor, expected) => {
    expect(await countVisible(actor, 'select id from public.transcript_segments')).toBe(expected)
  })

  it.each(expectations)('AI extractions are reachable by %s (%i)', async (actor, expected) => {
    expect(await countVisible(actor, 'select id from public.ai_extractions')).toBe(2 * expected)
  })

  // The consent register follows a deliberately different rule from the rest
  // of the content: participants AND whoever administers the meeting can see
  // it, because the organiser has to be able to fill it in and a coordinator
  // has to be able to check it was filled in. It carries who agreed to be
  // recorded, not what was said.
  const consentExpectations: Array<[Actor, number]> = [
    ['superAdmin', 2],
    ['memberA', 2],
    ['coordinator', 2], // can manage team meetings, so can audit the register
    ['memberB', 0],
    ['outsider', 0],
  ]

  it.each(consentExpectations)('the consent register is reachable by %s (%i)', async (actor, expected) => {
    const n = await countVisible(
      actor,
      'select id from public.meeting_consents where meeting_id = $1',
      [IDS.meetingPrivate],
    )
    expect(n).toBe(expected)
  })

  it('the storage object follows the same rule as the database row', async () => {
    const participant = await countVisible(
      'memberA',
      `select id from storage.objects where bucket_id = 'meeting-recordings'`,
    )
    const coordinator = await countVisible(
      'coordinator',
      `select id from storage.objects where bucket_id = 'meeting-recordings'`,
    )
    expect(participant).toBe(1)
    expect(coordinator).toBe(0)
  })
})

/* ====================================================== operational acts == */

describe('operational functions', () => {
  it('a coordinator can create a meeting', async () => {
    const outcome = await asUserAttempt(db, 'coordinator', () =>
      db.query(
        `insert into public.meetings (team_id, title, starts_at, duration_minutes, location, organiser_id)
         values ($1, 'Coordinator scheduling', now() + interval '1 day', 30, 'Room 5', $2)`,
        [IDS.team, IDS.coordinator],
      ),
    )
    expect(outcome.error).toBe('')
  })

  it('an ordinary member cannot create a meeting', async () => {
    const outcome = await asUserAttempt(db, 'memberA', () =>
      db.query(
        `insert into public.meetings (team_id, title, starts_at, duration_minutes, location, organiser_id)
         values ($1, 'Member scheduling', now() + interval '1 day', 30, 'Room 5', $2)`,
        [IDS.team, IDS.memberA],
      ),
    )
    expect(denialReason(outcome)).toMatch(/row-level security/i)
  })

  it('a coordinator cannot edit a meeting they neither organised nor attended', async () => {
    // can_manage_meeting admits coordinators of the team, so this succeeds.
    // Asserted explicitly so the decision is visible rather than assumed: a
    // coordinator may ADMINISTER any team meeting, but still cannot READ its
    // content. The two are separate on purpose.
    const outcome = await asUserAttempt(db, 'coordinator', () =>
      db.query(`update public.meetings set location = 'Moved' where id = $1`, [IDS.meetingPrivate]),
    )
    expect(outcome.error).toBe('')
    expect(outcome.rowCount).toBe(1)

    const stillNoContent = await countVisible('coordinator', 'select id from public.transcripts')
    expect(stillNoContent).toBe(0)
  })

  it('an outsider cannot edit this team\'s meeting', async () => {
    const outcome = await asUserAttempt(db, 'outsider', () =>
      db.query(`update public.meetings set location = 'Hijacked' where id = $1`, [
        IDS.meetingPrivate,
      ]),
    )
    expect(denialReason(outcome)).toMatch(/row-level security|no rows affected/i)
  })

  it('only a Super Admin can delete a meeting', async () => {
    const asCoordinator = await asUserAttempt(db, 'coordinator', () =>
      db.query('delete from public.meetings where id = $1', [IDS.meetingPrivate]),
    )
    expect(denialReason(asCoordinator)).toMatch(/no rows affected|row-level security/i)
  })

  it('nobody can delete a recording from a browser session — not even a Super Admin', async () => {
    // Audio is an institutional record. Removal is a deliberate server-side
    // act under an approved retention policy, not a button. The privilege is
    // revoked outright, so this is refused before any policy is consulted.
    for (const actor of ['memberA', 'coordinator', 'superAdmin'] as const) {
      const outcome = await asUserAttempt(db, actor, () =>
        db.query('delete from public.recordings where id = $1', [IDS.recording]),
      )
      expect(outcome.error).toMatch(/permission denied/i)
    }
  })

  it('nor can anyone delete the stored audio object', async () => {
    const outcome = await asUserAttempt(db, 'superAdmin', () =>
      db.query(`delete from storage.objects where bucket_id = 'meeting-recordings'`),
    )
    expect(denialReason(outcome)).toMatch(/no rows affected|row-level security/i)
  })
})

/* ======================================================= verification === */

describe('AI verification rights', () => {
  it('require both transcript access and a coordinating role', async () => {
    // memberA can read the transcript but is not a coordinator.
    const member = await asUserAttempt(db, 'memberA', () =>
      db.query(
        `insert into public.verification_records (extraction_id, reviewer_id, decision)
         values ($1, $2, 'approve')`,
        [IDS.extractionPending, IDS.memberA],
      ),
    )
    expect(denialReason(member)).toMatch(/row-level security/i)

    // The coordinator is a coordinator but cannot read the transcript.
    const coordinator = await asUserAttempt(db, 'coordinator', () =>
      db.query(
        `insert into public.verification_records (extraction_id, reviewer_id, decision)
         values ($1, $2, 'approve')`,
        [IDS.extractionPending, IDS.coordinator],
      ),
    )
    expect(denialReason(coordinator)).toMatch(/row-level security/i)
  })

  it('are satisfied by a Super Admin, who has both', async () => {
    const outcome = await asUserAttempt(db, 'superAdmin', () =>
      db.query(
        `insert into public.verification_records (extraction_id, reviewer_id, decision)
         values ($1, $2, 'approve')`,
        [IDS.extractionPending, IDS.superAdmin],
      ),
    )
    expect(outcome.error).toBe('')
  })

  it('cannot be exercised on behalf of someone else', async () => {
    const outcome = await asUserAttempt(db, 'superAdmin', () =>
      db.query(
        `insert into public.verification_records (extraction_id, reviewer_id, decision)
         values ($1, $2, 'approve')`,
        [IDS.extractionPending, IDS.coordinator],
      ),
    )
    expect(denialReason(outcome)).toMatch(/row-level security/i)
  })
})

/* ================================ cross-team Super Admin (regression) === */

describe('a Super Admin of a different team', () => {
  // `outsider` is a Super Admin — of Other Department, not of Academic Office.
  // Before migration 0016 this role reached every team's confidential content
  // because is_super_admin() asked only whether the user administered
  // *something*. These assertions exist so that cannot return.

  it('cannot read another team\'s recordings or transcripts', async () => {
    expect(await countVisible('outsider', 'select id from public.recordings')).toBe(0)
    expect(await countVisible('outsider', 'select id from public.transcripts')).toBe(0)
    expect(await countVisible('outsider', 'select id from public.transcript_segments')).toBe(0)
    expect(await countVisible('outsider', 'select id from public.ai_extractions')).toBe(0)
  })

  it('cannot suspend another team\'s staff', async () => {
    const outcome = await asUserAttempt(db, 'outsider', () =>
      db.query(
        `update public.profiles set status = 'suspended', suspended_at = now() where id = $1`,
        [IDS.memberA],
      ),
    )
    expect(denialReason(outcome)).toMatch(/row-level security|no rows affected|Super Admin/i)
  })

  it('cannot read another team\'s audit entries', async () => {
    const n = await countVisible(
      'outsider',
      `select id from public.audit_logs where team_id = $1`,
      [IDS.team],
    )
    expect(n).toBe(0)
  })

  it('cannot read another team\'s consent register', async () => {
    expect(await countVisible('outsider', 'select id from public.meeting_consents')).toBe(0)
  })

  it('still administers its own team normally', async () => {
    // The fix must scope the privilege, not remove it.
    const outcome = await asUserAttempt(db, 'outsider', () =>
      db.query(
        `insert into public.meetings (team_id, title, starts_at, duration_minutes, location, organiser_id)
         values ($1, 'Own team meeting', now() + interval '1 day', 30, 'Their room', $2)`,
        [IDS.otherTeam, IDS.outsider],
      ),
    )
    expect(outcome.error).toBe('')
  })
})

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type pg from 'pg'
import { buildSchema, connect } from './db'

/**
 * Evaluation-dataset tests.
 *
 * The other suites use a minimal fixture, which is right for checking a rule
 * in isolation. This one runs against the synthetic evaluation data — two
 * populated teams, ten fictional people — because two real leaks were only
 * visible at that scale:
 *
 *   1. Audit rows that carried no team were readable by a Super Admin of
 *      any team. With one team that is invisible; with two it was 35 of 50
 *      rows, including consent changes and recording paths.
 *   2. A coordinator could read the consent register of a RESTRICTED meeting
 *      they could not see the existence of.
 *
 * Both are fixed in migration 0018. These assertions keep them fixed.
 */

const here = dirname(fileURLToPath(import.meta.url))
let db: pg.Client

const TEAM = {
  northfield: '70000000-0000-4000-8000-000000000001',
  westgate: '70000000-0000-4000-8000-000000000002',
}

const WHO = {
  priya: 'a0000000-0000-4000-8000-000000000001',   // Super Admin, Northfield
  ravi: 'a0000000-0000-4000-8000-000000000002',    // Super Admin, Northfield
  meera: 'a0000000-0000-4000-8000-000000000003',   // Coordinator, attended neither recorded meeting
  lakshmi: 'a0000000-0000-4000-8000-000000000005', // Member, attended the internal meeting
  tara: 'a0000000-0000-4000-8000-000000000007',    // Member, attended neither
  former: 'a0000000-0000-4000-8000-000000000008',  // Suspended
  deepak: 'a0000000-0000-4000-8000-000000000009',  // Super Admin, Westgate
}

const RESTRICTED_MEETING = 'b0000000-0000-4000-8000-000000000002'

beforeAll(async () => {
  db = await connect()
  await buildSchema(db)
  await db.query(readFileSync(join(here, '..', 'seed', 'evaluation-seed.sql'), 'utf8'))
}, 90_000)

afterAll(async () => {
  await db?.end()
})

async function as<T>(who: keyof typeof WHO, fn: () => Promise<T>, aal = 'aal2'): Promise<T> {
  await db.query('begin')
  try {
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: WHO[who], role: 'authenticated', aal }),
    ])
    await db.query('set local role authenticated')
    return await fn()
  } finally {
    await db.query('rollback')
  }
}

const countAs = (who: keyof typeof WHO, sql: string, params: unknown[] = [], aal = 'aal2') =>
  as(who, async () => (await db.query(sql, params)).rows.length, aal)

/* =============================================== the dataset is sane ===== */

describe('the synthetic dataset', () => {
  it('contains two teams and two Super Admins in the team under evaluation', async () => {
    const { rows: teams } = await db.query('select id from public.teams')
    expect(teams).toHaveLength(2)

    const { rows: admins } = await db.query(
      `select profile_id from public.team_members where team_id = $1 and role = 'super_admin'`,
      [TEAM.northfield],
    )
    expect(admins).toHaveLength(2)
  })

  it('records an individual consent decision per participant, covering every status', async () => {
    const { rows } = await db.query(
      `select distinct status::text from public.meeting_consents order by 1`,
    )
    expect(rows.map((r) => r.status)).toEqual(
      expect.arrayContaining(['consented', 'declined', 'not_applicable', 'pending', 'withdrawn']),
    )
  })

  it('leaves recording disabled and every retention scope pending approval', async () => {
    const { rows: settings } = await db.query(
      `select key, value from public.app_settings
       where key in ('recording_enabled','recording_eligibility_rule') order by key`,
    )
    expect(settings.map((s) => s.value)).toEqual(['disabled', false])

    const { rows: retention } = await db.query(
      'select enabled, retention_days, status from public.retention_policies',
    )
    expect(retention).toHaveLength(4)
    expect(retention.every((r) => !r.enabled && r.retention_days === null)).toBe(true)
    expect(retention.every((r) => r.status === 'pending_approval')).toBe(true)
  })

  it('uses only fictional addresses that cannot receive mail', async () => {
    const { rows } = await db.query(
      `select count(*)::int as n from public.profiles where email not like '%@example.edu'`,
    )
    expect(rows[0].n).toBe(0)
  })
})

/* ======================================== FIX 1 — audit trail scoping ==== */

describe('the audit trail is confined to the row\'s own team', () => {
  it('shows a Super Admin of another team none of this team\'s entries', async () => {
    const leaked = await countAs(
      'deepak',
      'select id from public.audit_logs where team_id = $1',
      [TEAM.northfield],
    )
    expect(leaked).toBe(0)
  })

  it('shows them no consent changes, recordings or transcripts from this team', async () => {
    // These were the worst of the leak: 18 consent changes naming who agreed
    // to be recorded, and recording rows carrying storage paths.
    //
    // Westgate has consent rows of its own, so the assertion is that none of
    // the visible ones belong to Northfield — not that none are visible.
    const rows = await as('deepak', async () =>
      (
        await db.query(
          `select entity_type, team_id from public.audit_logs
           where entity_type in ('meeting_consent','recording','transcript','verification_record')`,
        )
      ).rows,
    )
    expect(rows.filter((r) => r.team_id === TEAM.northfield)).toHaveLength(0)
    expect(rows.every((r) => r.team_id === TEAM.westgate)).toBe(true)
  })

  it('shows them no profile entries belonging to this team', async () => {
    // Profile rows are written before team membership exists, so they carry
    // no team and are resolved at read time instead.
    const n = await countAs(
      'deepak',
      `select a.id from public.audit_logs a
       where a.entity_type = 'profile' and public.team_of_profile(a.entity_id) = $1`,
      [TEAM.northfield],
    )
    expect(n).toBe(0)
  })

  it('still shows a Super Admin their own team\'s entries', async () => {
    // The fix must scope the trail, not empty it.
    const n = await countAs('priya', 'select id from public.audit_logs')
    expect(n).toBeGreaterThan(20)
  })

  it('leaves no audit row for a team-bound entity without a team', async () => {
    const { rows } = await db.query(`
      select distinct entity_type from public.audit_logs
      where team_id is null and entity_type not in ('profile','app_setting','retention_policy')
      order by 1
    `)
    expect(rows.map((r) => r.entity_type)).toEqual([])
  })

  it('keeps the trail unreadable by ordinary members', async () => {
    expect(await countAs('meera', 'select id from public.audit_logs')).toBe(0)
    expect(await countAs('lakshmi', 'select id from public.audit_logs')).toBe(0)
  })
})

/* ================================== FIX 2 — restricted consent register == */

describe('a restricted meeting\'s consent register', () => {
  it('is hidden from a coordinator who cannot see the meeting', async () => {
    const meetingVisible = await countAs(
      'meera',
      'select id from public.meetings where id = $1',
      [RESTRICTED_MEETING],
    )
    const consentVisible = await countAs(
      'meera',
      'select id from public.meeting_consents where meeting_id = $1',
      [RESTRICTED_MEETING],
    )
    expect(meetingVisible).toBe(0)
    // Leaking the register would reveal who attended a meeting the
    // coordinator is not permitted to know took place.
    expect(consentVisible).toBe(0)
  })

  it('cannot be written by that coordinator either', async () => {
    const changed = await as('meera', async () => {
      const r = await db.query(
        `update public.meeting_consents set note = 'edited by a coordinator'
         where meeting_id = $1`,
        [RESTRICTED_MEETING],
      )
      return r.rowCount
    })
    expect(changed).toBe(0)
  })

  it('remains visible to its participants', async () => {
    const n = await countAs(
      'priya',
      'select id from public.meeting_consents where meeting_id = $1',
      [RESTRICTED_MEETING],
    )
    expect(n).toBe(2)
  })

  it('does not restrict an INTERNAL meeting\'s register from a coordinator', async () => {
    // The fix must not over-correct: a coordinator still has to be able to
    // check that consent was recorded for meetings they administer.
    const n = await countAs(
      'meera',
      `select id from public.meeting_consents
       where meeting_id = 'b0000000-0000-4000-8000-000000000001'`,
    )
    expect(n).toBe(4)
  })
})

/* ====================================== the model, with realistic data === */

describe('the access model at evaluation scale', () => {
  it('keeps meeting content with participants, not with roles', async () => {
    expect(await countAs('lakshmi', 'select id from public.transcripts')).toBe(1)
    expect(await countAs('meera', 'select id from public.transcripts')).toBe(0)
    expect(await countAs('tara', 'select id from public.transcripts')).toBe(0)
    expect(await countAs('priya', 'select id from public.transcripts')).toBe(2)
  })

  it('isolates the two teams completely', async () => {
    for (const table of ['meetings', 'recordings', 'transcripts', 'tasks', 'documents']) {
      const n = await as('deepak', async () =>
        (await db.query(`select id from public.${table}`)).rows.length,
      )
      // Westgate has one meeting, one task and one document of its own, and
      // no recordings at all; none of Northfield's rows may appear.
      const own = await db.query(
        `select count(*)::int as n from public.${table} ${
          table === 'recordings' || table === 'transcripts'
            ? 'where false'
            : `where team_id = '${TEAM.westgate}'`
        }`,
      )
      expect(n).toBe(own.rows[0].n)
    }
  })

  it('refuses a suspended account everything but its own profile row', async () => {
    for (const table of ['meetings', 'tasks', 'daily_work_logs', 'team_members', 'documents']) {
      expect(await countAs('former', `select id from public.${table}`)).toBe(0)
    }

    // The one exception, and it is deliberate: the application reads the
    // profile to discover that the account is suspended and say so. Without
    // it the user would get an indistinguishable "no profile" error. The row
    // holds their own name and address and nothing else.
    const own = await as('former', async () =>
      (await db.query('select id, status from public.profiles')).rows,
    )
    expect(own).toHaveLength(1)
    expect(own[0].id).toBe(WHO.former)
    expect(own[0].status).toBe('suspended')
  })

  it('refuses a password-only session everything but its own profile', async () => {
    expect(await countAs('priya', 'select id from public.meetings', [], 'aal1')).toBe(0)
    expect(await countAs('priya', 'select id from public.transcripts', [], 'aal1')).toBe(0)
    expect(await countAs('priya', 'select id from public.audit_logs', [], 'aal1')).toBe(0)
    expect(await countAs('priya', 'select id from public.profiles', [], 'aal1')).toBe(1)
  })

  it('still refuses a task built on an unverified extraction', async () => {
    const message = await as('priya', async () => {
      try {
        await db.query(
          `insert into public.tasks (team_id, title, created_by, source_extraction_id)
           values ($1, 'From unverified AI output', $2, 'e0000000-0000-4000-8000-000000000003')`,
          [TEAM.northfield, WHO.priya],
        )
        return ''
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    })
    expect(message).toMatch(/until it has been verified/i)
  })

  it('still permits no browser session to delete a recording', async () => {
    const message = await as('priya', async () => {
      try {
        await db.query('delete from public.recordings')
        return ''
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    })
    expect(message).toMatch(/permission denied/i)
  })
})

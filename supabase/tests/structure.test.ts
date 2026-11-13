import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type pg from 'pg'
import { buildSchema, connect } from './db'

/**
 * Structural guarantees.
 *
 * These assert properties of the schema itself rather than behaviour, and
 * exist to catch the mistakes that are easy to make later: adding a table and
 * forgetting RLS, writing a SECURITY DEFINER function without pinning its
 * search_path, or granting the anonymous role something. Each would be a
 * serious hole, and none would be obvious in review.
 */

let db: pg.Client

beforeAll(async () => {
  db = await connect()
  await buildSchema(db)
}, 60_000)

afterAll(async () => {
  await db?.end()
})

describe('row level security coverage', () => {
  it('is enabled on every table in the application schema', async () => {
    const { rows } = await db.query(`
      select c.relname as table_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
      order by 1
    `)
    expect(rows.map((r) => r.table_name)).toEqual([])
  })

  it('records exactly which tables are unreachable from the browser', async () => {
    // A table with RLS and no PERMISSIVE policy denies everything, which is
    // intentional for server-only tables. Restrictive policies are excluded
    // from this count because they only ever narrow access — a table whose
    // sole policy is restrictive is still closed.
    //
    // The list is asserted exactly so that it cannot grow or shrink unnoticed.
    const { rows } = await db.query(`
      select c.relname as table_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
        and not exists (
          select 1 from pg_policy p where p.polrelid = c.oid and p.polpermissive
        )
      order by 1
    `)
    expect(rows.map((r) => r.table_name)).toEqual([
      'calendar_credentials',
      'calendar_sync_jobs',
    ])
  })

  it('requires a verified second factor on every table', async () => {
    // Mandatory MFA is enforced by a restrictive policy per table. A table
    // added later without one would be readable by a password-only session,
    // which is exactly the regression this guards against.
    const { rows } = await db.query(`
      select c.relname as table_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and not exists (
          select 1 from pg_policy p
          where p.polrelid = c.oid
            and not p.polpermissive
            and pg_get_expr(p.polqual, p.polrelid) like '%is_mfa_verified%'
        )
      order by 1
    `)
    expect(rows.map((r) => r.table_name)).toEqual([])
  })
})

describe('super admin scoping', () => {
  it('uses the unscoped is_super_admin() in exactly the accepted places', async () => {
    // is_super_admin() asks "a Super Admin of ANY team". Using it to gate a
    // team's data grants every administrator access to every team — which is
    // precisely the defect migrations 0016 and 0017 corrected.
    //
    // The accepted uses are institution-wide configuration, and the
    // null-team fallback on the audit trail. This asserts the list exactly,
    // so a sixth use cannot appear without someone deciding it belongs.
    const { rows } = await db.query(`
      select distinct p.polname
      from pg_policy p
      where pg_get_expr(p.polqual, p.polrelid) ~ 'is_super_admin\\(\\)'
         or pg_get_expr(p.polwithcheck, p.polrelid) ~ 'is_super_admin\\(\\)'
      order by 1
    `)
    expect(rows.map((r) => r.polname)).toEqual([
      'app_settings_admin_write',
      'audit_logs_super_admin_read',
      'retention_admin_write',
    ])
  })

  it('scopes meeting content access to the meeting\'s own team', async () => {
    const { rows } = await db.query(`
      select 1 from pg_proc
      where proname = 'can_access_meeting_content'
        and pronamespace = 'public'::regnamespace
        and prosrc like '%is_super_admin_of%'
    `)
    expect(rows).toHaveLength(1)
  })
})

describe('the anonymous role', () => {
  it('holds no privilege on any application table', async () => {
    const { rows } = await db.query(`
      select table_name, privilege_type
      from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public'
      order by 1, 2
    `)
    expect(rows).toEqual([])
  })

  it('cannot read from any table, checked table by table', async () => {
    // Schema USAGE is deliberately NOT asserted here. Every role inherits
    // USAGE on `public` from the PUBLIC pseudo-role, and Supabase's own
    // defaults rely on that; revoking it is a change whose side effects
    // cannot be verified outside a hosted project.
    //
    // It is also not the control that matters. USAGE on a schema permits
    // nothing by itself — a role still needs a privilege on each object. The
    // assertion below is the real guarantee, and it is checked against every
    // table rather than a list someone has to remember to update.
    const { rows: tables } = await db.query(`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by 1
    `)
    expect(tables.length).toBeGreaterThan(20)

    // has_table_privilege answers exactly the question the planner asks
    // before any policy is consulted.
    const { rows: anyPrivilege } = await db.query(`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and (
          has_table_privilege('anon', c.oid, 'SELECT')
          or has_table_privilege('anon', c.oid, 'INSERT')
          or has_table_privilege('anon', c.oid, 'UPDATE')
          or has_table_privilege('anon', c.oid, 'DELETE')
        )
      order by 1
    `)
    expect(anyPrivilege.map((r) => r.relname)).toEqual([])
  })
})

describe('security definer functions', () => {
  it('all pin their search_path', async () => {
    // An unpinned SECURITY DEFINER function can be redirected to an
    // attacker-controlled table by setting search_path on the session. This
    // is the single most common way such a function becomes an escalation.
    const { rows } = await db.query(`
      select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'auth')
        and p.prosecdef
        and not exists (
          select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
          where cfg like 'search_path=%'
        )
      order by 1
    `)
    expect(rows.map((r) => r.proname)).toEqual([])
  })
})

describe('storage buckets', () => {
  it('require a verified second factor, like every application table', async () => {
    // storage.objects sits outside the application schema and is not covered
    // by the loop that applies the policy in public. It needs its own, and a
    // missing one was a real gap found during hardening.
    const { rows } = await db.query(`
      select 1
      from pg_policy p
      where p.polrelid = 'storage.objects'::regclass
        and not p.polpermissive
        and pg_get_expr(p.polqual, p.polrelid) like '%is_mfa_verified%'
    `)
    expect(rows).toHaveLength(1)
  })

  it('are all private and all have a size limit and a mime allowlist', async () => {
    const { rows } = await db.query(
      'select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id',
    )
    expect(rows.map((r) => r.id)).toEqual([
      'academic-documents', 'exports', 'meeting-attachments', 'meeting-recordings',
    ])
    for (const row of rows) {
      expect(row.public).toBe(false)
      expect(Number(row.file_size_limit)).toBeGreaterThan(0)
      expect(row.allowed_mime_types.length).toBeGreaterThan(0)
    }
  })
})

describe('audit trail protection', () => {
  it('grants no write privilege on audit_logs to signed-in users', async () => {
    const { rows } = await db.query(`
      select privilege_type
      from information_schema.role_table_grants
      where grantee = 'authenticated' and table_schema = 'public' and table_name = 'audit_logs'
      order by 1
    `)
    expect(rows.map((r) => r.privilege_type)).toEqual(['SELECT'])
  })

  it('grants nothing at all on calendar_credentials to signed-in users', async () => {
    const { rows } = await db.query(`
      select privilege_type
      from information_schema.role_table_grants
      where grantee = 'authenticated' and table_schema = 'public'
        and table_name = 'calendar_credentials'
    `)
    expect(rows).toEqual([])
  })
})

describe('referential integrity', () => {
  it('never cascades a profile deletion into an institutional record', async () => {
    // Deleting a staff account must not erase meetings, recordings or
    // transcripts. Accounts are suspended rather than deleted, but the
    // schema should not depend on that discipline being remembered.
    const { rows } = await db.query(`
      select c.conrelid::regclass::text as child, a.attname as column_name, c.confdeltype as on_delete
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f'
        and c.confrelid = 'public.profiles'::regclass
        and c.confdeltype = 'c'
      order by 1, 2
    `)
    // Only rows that ARE the user's own data or their membership may
    // cascade. Meetings, recordings, transcripts, tasks and action items must
    // not appear in this list: those are institutional records.
    expect(rows.map((r) => r.child).sort()).toEqual([
      'calendar_connections',
      'daily_work_logs',
      'mfa_reset_requests',
      'notifications',
      'team_members',
      'user_preferences',
    ])
  })
})

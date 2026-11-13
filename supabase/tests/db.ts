import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(here, '..', 'migrations')
const harnessDir = join(here, 'harness')

export const CONNECTION =
  process.env.ACADEMICOS_TEST_DATABASE_URL ??
  'postgresql://postgres@localhost:5432/academicos_test'

/**
 * Builds the schema from the real migration files.
 *
 * The suite deliberately runs the migrations rather than a hand-maintained
 * snapshot: a test that passes against a different schema from the one
 * deployed would prove nothing.
 */
export async function buildSchema(client: pg.Client) {
  const files = [
    join(harnessDir, '10_reset.sql'),
    join(harnessDir, '00_supabase_shim.sql'),
    ...readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort().map((f) => join(migrationsDir, f)),
  ]
  for (const file of files) {
    await client.query(readFileSync(file, 'utf8'))
  }
}

export async function connect(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: CONNECTION })
  await client.connect()
  return client
}

/** Identifiers for the fixture accounts, fixed so tests can reference them. */
export const IDS = {
  team: '11111111-1111-4111-8111-111111111111',
  otherTeam: '11111111-1111-4111-8111-222222222222',
  superAdmin: 'aaaaaaaa-0000-4000-8000-000000000001',
  coordinator: 'aaaaaaaa-0000-4000-8000-000000000002',
  memberA: 'aaaaaaaa-0000-4000-8000-000000000003',
  memberB: 'aaaaaaaa-0000-4000-8000-000000000004',
  suspended: 'aaaaaaaa-0000-4000-8000-000000000005',
  outsider: 'aaaaaaaa-0000-4000-8000-000000000006',
  meetingPrivate: 'bbbbbbbb-0000-4000-8000-000000000001',
  meetingRestricted: 'bbbbbbbb-0000-4000-8000-000000000002',
  recording: 'cccccccc-0000-4000-8000-000000000001',
  transcript: 'dddddddd-0000-4000-8000-000000000001',
  extractionPending: 'eeeeeeee-0000-4000-8000-000000000001',
  extractionApproved: 'eeeeeeee-0000-4000-8000-000000000002',
} as const

export type Actor = keyof typeof IDS | 'anon'

/**
 * Runs `fn` with the session acting as the given user, exactly as PostgREST
 * would present it: the `authenticated` role plus a JWT claims GUC. Everything
 * happens inside a transaction that is always rolled back, so tests cannot
 * contaminate one another.
 */
export async function asUser<T>(
  client: pg.Client,
  actor: Exclude<Actor, 'anon'>,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query('begin')
  try {
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: IDS[actor], role: 'authenticated' }),
    ])
    await client.query('set local role authenticated')
    return await fn()
  } finally {
    await client.query('rollback')
  }
}

/** The same, for an unauthenticated request. */
export async function asAnon<T>(client: pg.Client, fn: () => Promise<T>): Promise<T> {
  await client.query('begin')
  try {
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ role: 'anon' }),
    ])
    await client.query('set local role anon')
    return await fn()
  } finally {
    await client.query('rollback')
  }
}

/** A session carrying a JWT whose subject is not a known profile. */
export async function asUnknownSubject<T>(client: pg.Client, fn: () => Promise<T>): Promise<T> {
  await client.query('begin')
  try {
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: '99999999-9999-4999-8999-999999999999', role: 'authenticated' }),
    ])
    await client.query('set local role authenticated')
    return await fn()
  } finally {
    await client.query('rollback')
  }
}


export interface Attempt {
  /** Error text if PostgreSQL refused the statement outright. */
  error: string
  /** Rows the statement actually affected or returned. */
  rowCount: number
}

/**
 * A denial has two shapes in PostgreSQL and the distinction matters.
 *
 *   * A privilege denial, or a WITH CHECK violation on INSERT, raises.
 *   * A USING clause on UPDATE or DELETE does not raise. The row is simply
 *     invisible, so the statement succeeds having affected nothing.
 *
 * Tests that assert only on a thrown error would miss the second case
 * entirely and would pass against a policy that silently did nothing. This
 * normalises both into one string so each test can state which it expects.
 */
export function denialReason(attempt: Attempt): string {
  if (attempt.error) return attempt.error
  if (attempt.rowCount === 0) return 'no rows affected — row-level security excluded them'
  return ''
}

async function runAttempt(fn: () => Promise<unknown>): Promise<Attempt> {
  try {
    const result = (await fn()) as { rowCount?: number | null }
    return { error: '', rowCount: result?.rowCount ?? 0 }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), rowCount: 0 }
  }
}

/** Attempts an operation as the given user and reports how it was refused. */
export async function asUserAttempt(
  client: pg.Client,
  actor: Exclude<Actor, 'anon'>,
  fn: () => Promise<unknown>,
): Promise<Attempt> {
  return asUser(client, actor, () => runAttempt(fn))
}

/** The same, unauthenticated. */
export async function asAnonAttempt(
  client: pg.Client,
  fn: () => Promise<unknown>,
): Promise<Attempt> {
  return asAnon(client, () => runAttempt(fn))
}

/**
 * Attempts an operation with no role switching, as the owning role.
 *
 * Used for constraint and trigger tests, where the question is whether the
 * database itself refuses the write rather than whether a policy hides it.
 * A rule that the owner can bypass is not a rule.
 */
export async function attemptDirect(fn: () => Promise<unknown>): Promise<Attempt> {
  return runAttempt(fn)
}

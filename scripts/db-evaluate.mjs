#!/usr/bin/env node
/**
 * AcademicOS — local evaluation environment.
 *
 * Rebuilds a local PostgreSQL database from the real migration files, loads
 * the synthetic evaluation dataset, and shows what each persona can actually
 * see. Every person and organisation in the data is fictional.
 *
 *   npm run db:evaluate                  rebuild, seed, print the access matrix
 *   npm run db:evaluate -- --keep        skip the rebuild, just report
 *   npm run db:evaluate -- --as priya --sql "select title from meetings"
 *
 * This touches no hosted project. It is the only way to evaluate the security
 * model, because the browser's demonstration mode has no database and
 * therefore no Row Level Security to evaluate.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const has = (f) => args.includes(`--${f}`)
const val = (f) => {
  const i = args.indexOf(`--${f}`)
  return i >= 0 ? args[i + 1] : undefined
}

const connectionString =
  process.env.ACADEMICOS_TEST_DATABASE_URL ??
  'postgresql://postgres@127.0.0.1:5432/academicos_test'

/** The fictional personas in the evaluation dataset. */
const PEOPLE = {
  priya:  { id: 'a0000000-0000-4000-8000-000000000001', name: 'Priya Anand',   role: 'Super Admin',  team: 'Northfield' },
  ravi:   { id: 'a0000000-0000-4000-8000-000000000002', name: 'Ravi Kulkarni', role: 'Super Admin',  team: 'Northfield' },
  meera:  { id: 'a0000000-0000-4000-8000-000000000003', name: 'Meera Das',     role: 'Coordinator',  team: 'Northfield' },
  arjun:  { id: 'a0000000-0000-4000-8000-000000000004', name: 'Arjun Pillai',  role: 'Coordinator',  team: 'Northfield' },
  lakshmi:{ id: 'a0000000-0000-4000-8000-000000000005', name: 'Lakshmi Nair',  role: 'Member',       team: 'Northfield' },
  imran:  { id: 'a0000000-0000-4000-8000-000000000006', name: 'Imran Sheikh',  role: 'Member',       team: 'Northfield' },
  tara:   { id: 'a0000000-0000-4000-8000-000000000007', name: 'Tara Bhatt',    role: 'Member',       team: 'Northfield' },
  former: { id: 'a0000000-0000-4000-8000-000000000008', name: 'Former Staff',  role: 'Suspended',    team: 'Northfield' },
  deepak: { id: 'a0000000-0000-4000-8000-000000000009', name: 'Deepak Rao',    role: 'Super Admin',  team: 'Westgate' },
  sunita: { id: 'a0000000-0000-4000-8000-00000000000a', name: 'Sunita Menon',  role: 'Member',       team: 'Westgate' },
}

const client = new pg.Client({ connectionString })
await client.connect()

async function rebuild() {
  const files = [
    join(root, 'supabase/tests/harness/10_reset.sql'),
    join(root, 'supabase/tests/harness/00_supabase_shim.sql'),
    ...readdirSync(join(root, 'supabase/migrations'))
      .filter((f) => f.endsWith('.sql')).sort()
      .map((f) => join(root, 'supabase/migrations', f)),
    join(root, 'supabase/seed/evaluation-seed.sql'),
  ]
  for (const file of files) {
    await client.query(readFileSync(file, 'utf8'))
  }
  console.log('Schema rebuilt and synthetic evaluation data loaded.\n')
}

/**
 * Runs a query as a persona, exactly as PostgREST would present them:
 * the `authenticated` role plus JWT claims. `aal` defaults to aal2 because
 * multi-factor authentication is mandatory and that is what a working
 * session looks like.
 */
async function asPerson(key, sql, aal = 'aal2') {
  const person = PEOPLE[key]
  if (!person) throw new Error(`Unknown persona "${key}". Try: ${Object.keys(PEOPLE).join(', ')}`)
  await client.query('begin')
  try {
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: person.id, role: 'authenticated', aal }),
    ])
    await client.query('set local role authenticated')
    return await client.query(sql)
  } finally {
    await client.query('rollback')
  }
}

async function countAs(key, sql, aal = 'aal2') {
  try {
    const { rows } = await asPerson(key, sql, aal)
    return String(rows.length)
  } catch (error) {
    return error.message.includes('permission denied') ? 'denied' : 'error'
  }
}

async function matrix() {
  const checks = [
    ['Meetings visible',        'select id from public.meetings'],
    ['— restricted one',        "select id from public.meetings where confidentiality = 'restricted'"],
    ['Recordings',              'select id from public.recordings'],
    ['Transcripts',             'select id from public.transcripts'],
    ['Transcript lines',        'select id from public.transcript_segments'],
    ['AI extractions',          'select id from public.ai_extractions'],
    ['Consent records',         'select id from public.meeting_consents'],
    ['Tasks',                   'select id from public.tasks'],
    ['Daily work entries',      'select id from public.daily_work_logs'],
    ['Documents',               'select id from public.documents'],
    ['Audit entries',           'select id from public.audit_logs'],
    ['Stored files',            'select id from storage.objects'],
    ['MFA reset requests',      'select id from public.mfa_reset_requests'],
  ]

  const people = Object.keys(PEOPLE)
  const header = ['Can see', ...people.map((k) => k.padEnd(7))]
  console.log('ACCESS MATRIX — rows each persona can actually read')
  console.log('(every session below has completed two-factor authentication)\n')
  console.log(header[0].padEnd(20) + header.slice(1).join(' '))
  console.log('-'.repeat(20 + people.length * 8))

  for (const [label, sql] of checks) {
    const cells = []
    for (const key of people) cells.push((await countAs(key, sql)).padEnd(7))
    console.log(label.padEnd(20) + cells.join(' '))
  }

  console.log('\nLegend: a number is rows returned; "denied" is a privilege refusal.')
  console.log('Personas:')
  for (const [key, p] of Object.entries(PEOPLE)) {
    console.log(`  ${key.padEnd(8)} ${p.name.padEnd(15)} ${p.role.padEnd(12)} ${p.team}`)
  }
}

async function mfaComparison() {
  console.log('\n\nWITHOUT A VERIFIED SECOND FACTOR')
  console.log('The same Super Admin, signed in by password alone:\n')
  const checks = [
    ['Meetings', 'select id from public.meetings'],
    ['Transcripts', 'select id from public.transcripts'],
    ['Tasks', 'select id from public.tasks'],
    ['Own profile', 'select id from public.profiles'],
    ['Team membership', 'select id from public.team_members'],
    ['Stored files', 'select id from storage.objects'],
  ]
  console.log('  Check'.padEnd(22) + 'aal2'.padEnd(8) + 'aal1')
  console.log('  ' + '-'.repeat(36))
  for (const [label, sql] of checks) {
    const two = await countAs('priya', sql, 'aal2')
    const one = await countAs('priya', sql, 'aal1')
    console.log('  ' + label.padEnd(20) + two.padEnd(8) + one)
  }
  console.log('\n  Only the own-profile row survives at aal1, and deliberately:')
  console.log('  the enrolment screen has to show who is signed in.')
}

async function policyState() {
  const { rows: settings } = await client.query(
    `select key, value from public.app_settings order by key`,
  )
  const { rows: retention } = await client.query(
    `select scope, enabled, retention_days, status from public.retention_policies order by scope`,
  )
  console.log('\n\nPOLICY STATE (must remain unchanged during evaluation)\n')
  for (const s of settings) console.log(`  ${s.key.padEnd(28)} ${JSON.stringify(s.value)}`)
  console.log()
  for (const r of retention) {
    console.log(
      `  retention/${r.scope.padEnd(17)} enabled=${String(r.enabled).padEnd(6)}` +
        `days=${String(r.retention_days ?? 'none').padEnd(6)}${r.status}`,
    )
  }
}

/* ---------------------------------------------------------------- main -- */

if (!has('keep')) await rebuild()

const persona = val('as')
const sql = val('sql')

if (persona && sql) {
  console.log(`Running as ${PEOPLE[persona]?.name ?? persona} (${PEOPLE[persona]?.role ?? '?'})\n`)
  try {
    const { rows } = await asPerson(persona, sql)
    console.log(rows.length ? JSON.stringify(rows, null, 2) : '(no rows — the policies returned nothing)')
  } catch (error) {
    console.log(`Refused: ${error.message}`)
  }
} else {
  await matrix()
  await mfaComparison()
  await policyState()
  console.log('\n\nTry a query of your own, for example:')
  console.log('  npm run db:evaluate -- --keep --as meera --sql "select content from public.transcript_segments"')
  console.log('  npm run db:evaluate -- --keep --as priya --sql "select content from public.transcript_segments"')
}

await client.end()

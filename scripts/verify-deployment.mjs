#!/usr/bin/env node
/**
 * AcademicOS — live deployment verification.
 *
 * Runs against a REAL Supabase project and checks the properties that cannot
 * be tested locally: that authentication works, that a password-only session
 * genuinely reaches no confidential data, that signed URLs expire, and that
 * access is written to the audit trail.
 *
 * It is read-mostly. The only things it creates are a small test object in
 * the exports bucket (and only with --with-storage), which it deletes again.
 * It uploads no institutional data and creates no accounts.
 *
 * CREDENTIALS ARE READ FROM THE ENVIRONMENT AND NEVER PRINTED. Export them
 * for the run and let them fall out of scope with the shell:
 *
 *   export ACADEMICOS_URL="https://<ref>.supabase.co"
 *   export ACADEMICOS_PUBLISHABLE_KEY="sb_publishable_..."
 *   export ACADEMICOS_ADMIN_EMAIL="first.admin@your-institution.ac.in"
 *   export ACADEMICOS_ADMIN_PASSWORD='...'          # quote it
 *   node scripts/verify-deployment.mjs
 *
 * Phase B (the aal2 checks) additionally needs a current TOTP code:
 *
 *   node scripts/verify-deployment.mjs --totp 123456 --with-storage
 *
 * Never put these in .env, in a script, or in your shell history file. On
 * Windows PowerShell use $env:NAME = '...' and close the window afterwards.
 */

import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const value = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}

const URL_ = process.env.ACADEMICOS_URL
const KEY = process.env.ACADEMICOS_PUBLISHABLE_KEY
const EMAIL = process.env.ACADEMICOS_ADMIN_EMAIL
const PASSWORD = process.env.ACADEMICOS_ADMIN_PASSWORD
const TOTP = value('totp')
const WITH_STORAGE = flag('with-storage')
const SKIP_EXPIRY_WAIT = flag('skip-expiry-wait')

if (!URL_ || !KEY || !EMAIL || !PASSWORD) {
  console.error(
    'Missing configuration. Set ACADEMICOS_URL, ACADEMICOS_PUBLISHABLE_KEY,\n' +
      'ACADEMICOS_ADMIN_EMAIL and ACADEMICOS_ADMIN_PASSWORD, then run again.\n' +
      'See docs/m3-live-verification.md.',
  )
  process.exit(2)
}

if (KEY.startsWith('sb_secret_') || KEY.includes('service_role')) {
  console.error(
    'REFUSING TO RUN: ACADEMICOS_PUBLISHABLE_KEY holds a secret or service-role key.\n' +
      'That key bypasses Row Level Security, so every check below would pass\n' +
      'regardless of whether the policies work. Use the publishable key.',
  )
  process.exit(2)
}

const CONFIDENTIAL = [
  'meetings', 'recordings', 'transcripts', 'transcript_segments',
  'ai_extractions', 'tasks', 'daily_work_logs', 'documents',
  'meeting_consents', 'audit_logs', 'calendar_credentials',
]

const results = []
let failures = 0

function record(phase, name, passed, detail = '') {
  results.push({ phase, name, passed, detail })
  if (!passed) failures += 1
  const mark = passed ? 'PASS' : 'FAIL'
  console.log(`  ${mark}  ${name}${detail ? ` — ${detail}` : ''}`)
}

/** Strips anything credential-shaped before a value is printed. */
function safe(text) {
  return String(text ?? '')
    .replace(/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g, '[token]')
    .replace(/token=[^&\s]+/g, 'token=[redacted]')
    .slice(0, 160)
}

function newClient() {
  return createClient(URL_, KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

/** Decodes the aal claim without verifying the signature — for reporting only. */
function aalOf(accessToken) {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString())
    return payload.aal ?? 'aal1'
  } catch {
    return 'unknown'
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ============================================================== phase A === */

async function phaseAnonymous() {
  console.log('\nA. Anonymous access (no session)')
  const anon = newClient()

  for (const table of CONFIDENTIAL) {
    const { data, error } = await anon.from(table).select('*').limit(1)
    const denied = Boolean(error) || (Array.isArray(data) && data.length === 0)
    record('A', `anonymous read of ${table} is refused`, denied, error ? safe(error.message) : '')
  }

  // An unauthenticated storage read must not work either.
  const { error: storageError } = await anon.storage.from('meeting-recordings').list()
  record('A', 'anonymous storage listing is refused', Boolean(storageError),
    storageError ? safe(storageError.message) : 'returned without error')
}

/* ============================================================== phase B === */

async function phaseSignIn() {
  console.log('\nB. Authentication')

  const bad = newClient()
  const { error: badError } = await bad.auth.signInWithPassword({
    email: EMAIL,
    password: `${PASSWORD}-definitely-wrong`,
  })
  record('B', 'an incorrect password is refused', Boolean(badError))
  record(
    'B',
    'the refusal does not reveal whether the account exists',
    !/user not found|no such user|not registered/i.test(badError?.message ?? ''),
    badError ? safe(badError.message) : '',
  )

  const client = newClient()
  const { data, error } = await client.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  })
  record('B', 'the correct password signs in', !error, error ? safe(error.message) : '')
  if (error || !data.session) return null

  const aal = aalOf(data.session.access_token)
  record('B', 'the password-only session is aal1, not aal2', aal === 'aal1', `aal=${aal}`)

  const { data: factors } = await client.auth.mfa.listFactors()
  const verified = factors?.totp?.length ?? 0
  record('B', 'the administrator has a verified TOTP factor enrolled', verified > 0,
    `${verified} verified factor(s)`)

  return client
}

/* ============================================================== phase C === */

async function phaseAal1Enforcement(client) {
  console.log('\nC. AAL2 enforcement — the central claim')
  console.log('   A signed-in session that has NOT verified a second factor')
  console.log('   must reach no confidential record.\n')

  for (const table of CONFIDENTIAL) {
    const { data, error } = await client.from(table).select('*').limit(1)
    const empty = Boolean(error) || (Array.isArray(data) && data.length === 0)
    record('C', `aal1 session reads nothing from ${table}`, empty,
      error ? safe(error.message) : `${data?.length ?? 0} row(s)`)
  }

  // The enrolment carve-out: own profile readable, nothing else.
  const { data: own } = await client.from('profiles').select('id, full_name')
  record('C', 'aal1 session can read exactly its own profile row',
    Array.isArray(own) && own.length === 1, `${own?.length ?? 0} row(s)`)

  const { data: team } = await client.from('team_members').select('team_id')
  record('C', 'aal1 session cannot discover the team',
    Array.isArray(team) && team.length === 0, `${team?.length ?? 0} row(s)`)

  const { error: writeError } = await client
    .from('tasks')
    .insert({ team_id: '00000000-0000-4000-8000-000000000000', title: 'aal1 write attempt' })
  record('C', 'aal1 session cannot write', Boolean(writeError),
    writeError ? safe(writeError.message) : 'the insert succeeded')
}

/* ============================================================== phase D === */

async function phaseVerified(client) {
  console.log('\nD. Verified session (aal2)')

  const { data: factors } = await client.auth.mfa.listFactors()
  const factor = factors?.totp?.[0]
  if (!factor) {
    record('D', 'a verified TOTP factor is available to challenge', false, 'none enrolled')
    return null
  }

  const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({
    factorId: factor.id,
  })
  record('D', 'a challenge can be created', !challengeError,
    challengeError ? safe(challengeError.message) : '')
  if (challengeError || !challenge) return null

  const { error: wrongError } = await client.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.id,
    code: '000000',
  })
  record('D', 'an incorrect code is refused', Boolean(wrongError))

  const { data: fresh } = await client.auth.mfa.challenge({ factorId: factor.id })
  const { data: verified, error: verifyError } = await client.auth.mfa.verify({
    factorId: factor.id,
    challengeId: fresh.id,
    code: TOTP,
  })
  record('D', 'the correct code is accepted', !verifyError,
    verifyError ? safe(verifyError.message) : '')
  if (verifyError || !verified) return null

  const aal = aalOf(verified.access_token)
  record('D', 'verification issues an aal2 token', aal === 'aal2', `aal=${aal}`)

  const { data: meetings, error: meetingError } = await client.from('meetings').select('id').limit(5)
  record('D', 'the verified session can now query meetings', !meetingError,
    meetingError ? safe(meetingError.message) : `${meetings?.length ?? 0} row(s)`)

  const { data: team } = await client.from('team_members').select('team_id, role')
  record('D', 'the verified session can read its own membership',
    Array.isArray(team) && team.length > 0, `role=${team?.[0]?.role ?? 'none'}`)

  const { error: auditError } = await client.from('audit_logs').select('id').limit(1)
  record('D', 'a Super Admin can read the audit trail', !auditError,
    auditError ? safe(auditError.message) : '')

  const { error: auditWriteError } = await client
    .from('audit_logs')
    .insert({ action: 'forged_entry', entity_type: 'meeting' })
  record('D', 'nobody can write to the audit trail', Boolean(auditWriteError),
    auditWriteError ? safe(auditWriteError.message) : 'the insert succeeded')

  const { error: credError } = await client.from('calendar_credentials').select('*').limit(1)
  record('D', 'calendar credentials remain unreadable even at aal2', Boolean(credError),
    credError ? safe(credError.message) : 'returned without error')

  const { data: retention } = await client.from('retention_policies').select('scope, enabled, retention_days')
  const inert = (retention ?? []).every((r) => r.enabled === false && r.retention_days === null)
  record('D', 'every retention policy is still disabled with no period', inert,
    `${retention?.length ?? 0} scope(s)`)

  const { data: settings } = await client
    .from('app_settings')
    .select('key, value')
    .in('key', ['recording_enabled', 'recording_eligibility_rule'])
  const recordingOff = settings?.find((s) => s.key === 'recording_enabled')?.value === false
  record('D', 'recording is still switched off', Boolean(recordingOff))

  return client
}

/* ============================================================== phase E === */

async function phaseStorage(client) {
  console.log('\nE. Private storage and signed URL expiry')

  const { data: team } = await client.from('team_members').select('team_id').limit(1).maybeSingle()
  const { data: user } = await client.auth.getUser()
  if (!team?.team_id || !user?.user?.id) {
    record('E', 'a team and user are available for the storage check', false)
    return
  }

  // The exports bucket is owned by the uploading user, so this touches no
  // meeting data. The object is removed at the end.
  const path = `${team.team_id}/${user.user.id}/deployment-check-${Date.now()}.txt`
  const body = new Blob(['AcademicOS deployment verification. Not institutional data.'], {
    type: 'text/plain',
  })

  const { error: uploadError } = await client.storage.from('exports').upload(path, body, {
    contentType: 'text/plain',
  })
  record('E', 'an authorised upload succeeds', !uploadError,
    uploadError ? safe(uploadError.message) : '')
  if (uploadError) return

  const { data: signed, error: signError } = await client.storage
    .from('exports')
    .createSignedUrl(path, 60)
  record('E', 'a signed URL can be created', !signError && Boolean(signed?.signedUrl))
  if (!signed?.signedUrl) return

  const fresh = await fetch(signed.signedUrl)
  record('E', 'the signed URL works immediately', fresh.ok, `HTTP ${fresh.status}`)

  // The unsigned path must not serve the object: this is what "private
  // bucket" actually means, and it is worth checking rather than assuming.
  const unsigned = `${URL_}/storage/v1/object/public/exports/${path}`
  const publicAttempt = await fetch(unsigned)
  record('E', 'the public path does NOT serve the object', !publicAttempt.ok,
    `HTTP ${publicAttempt.status}`)

  if (SKIP_EXPIRY_WAIT) {
    record('E', 'expired signed URL is refused', false, 'skipped by --skip-expiry-wait')
  } else {
    console.log('     waiting 65 seconds for the signature to expire…')
    await sleep(65_000)
    const expired = await fetch(signed.signedUrl)
    record('E', 'the signed URL stops working after it expires', !expired.ok,
      `HTTP ${expired.status}`)
  }

  const { error: removeError } = await client.storage.from('exports').remove([path])
  record('E', 'the test object was cleaned up', !removeError,
    removeError ? safe(removeError.message) : '')
}

/* ============================================================== phase F === */

async function phaseAudit(client) {
  console.log('\nF. Audit trail')

  const before = await client.from('audit_logs').select('id').order('id', { ascending: false }).limit(1)
  const highest = before.data?.[0]?.id ?? 0

  // log_content_access is what the application calls when it opens a
  // transcript or mints a signed URL for a recording.
  const { error: rpcError } = await client.rpc('log_content_access', {
    p_entity_type: 'document',
    p_entity_id: '00000000-0000-4000-8000-000000000000',
    p_note: 'deployment verification',
  })
  record('F', 'content access can be recorded', !rpcError, rpcError ? safe(rpcError.message) : '')

  const after = await client
    .from('audit_logs')
    .select('id, action')
    .gt('id', highest)
    .order('id', { ascending: false })
    .limit(1)
  record('F', 'the access produced an audit entry',
    (after.data?.length ?? 0) > 0 && after.data?.[0]?.action === 'access_document',
    after.data?.[0]?.action ?? 'no new entry')
}

/* ================================================================ main === */

console.log('AcademicOS — live deployment verification')
console.log(`Project: ${URL_}`)
console.log(`Signing in as: ${EMAIL.replace(/^(.).*(@.*)$/, '$1***$2')}`)

await phaseAnonymous()
const client = await phaseSignIn()

if (client) {
  await phaseAal1Enforcement(client)

  if (TOTP) {
    const verified = await phaseVerified(client)
    if (verified) {
      await phaseAudit(verified)
      if (WITH_STORAGE) await phaseStorage(verified)
      else console.log('\nE. Storage — skipped (pass --with-storage to include it)')
    }
  } else {
    console.log('\nD/E/F. Skipped: no TOTP code supplied.')
    console.log('   Re-run with --totp <current 6-digit code> --with-storage')
    console.log('   to verify aal2 issuance, the audit trail and signed URL expiry.')
  }

  await client.auth.signOut()
}

const passed = results.filter((r) => r.passed).length
console.log(`\n${'='.repeat(60)}`)
console.log(`${passed}/${results.length} checks passed`)

if (!TOTP) {
  console.log('\nINCOMPLETE: phases D, E and F were not run. The deployment is not')
  console.log('verified until they pass. See docs/m3-live-verification.md.')
  process.exit(failures > 0 ? 1 : 3)
}

if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED. Do not upload confidential data.`)
  process.exit(1)
}

console.log('\nAll checks passed.')

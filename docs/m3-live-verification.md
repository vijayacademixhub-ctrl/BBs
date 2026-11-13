# M3 — Live Verification

What must be true before confidential data is entered, and how to confirm it
against the real project.

**Nothing below has been run.** No project exists.

---

## 1. What Is Already Proven, and What Is Not

| | |
|---|---|
| **Proven locally — 196 tests** | The schema and its policies behave correctly. Run with `npm run test:db`. |
| **Not proven — needs a project** | That the deployed project is configured as instructed, and that Supabase's own services behave as documented. |

The gap is narrow but real. The local suite builds the schema from the actual
migration files and exercises the policies against PostgreSQL with the same
`auth.uid()` mechanism Supabase uses, so a policy that passes locally passes
for the same reason in production. What it cannot reproduce is GoTrue,
signed-URL issuance, the Storage API, or any dashboard setting.

So: **the database half is proven; the platform half is not.** Both must work.

### 1.1 Which Checks Need a Real Project

| Check | Local | Needs project |
|---|---|---|
| RLS policy logic | ✅ 196 tests | |
| Cross-team isolation | ✅ | |
| Participant-based content access | ✅ | |
| Super Admin team scoping | ✅ | |
| AAL2 enforcement in the database | ✅ | |
| Audit trail immutability | ✅ | |
| Retention and recording inert | ✅ | |
| Storage policy logic | ✅ | |
| Signed-URL issuance contract | ✅ (mocked client) | |
| **Password sign-in** | | ✅ |
| **Email verification delivery** | | ✅ |
| **MFA enrolment and challenge** | | ✅ |
| **That verification issues an aal2 token** | | ✅ |
| **Signed URL actually expires** | | ✅ |
| **Public bucket path refuses to serve** | | ✅ |
| **Invitation-only against real GoTrue** | | ✅ |
| **Session expiry and refresh rotation** | | ✅ |
| **Recording upload and retrieval** | | ✅ (and consent policy) |

---

## 2. The Automated Script

Most of the right-hand column is covered by a script that runs against the
real project:

```bash
npm run verify:deployment
```

It is read-mostly. The only thing it creates is a small text file in the
`exports` bucket (with `--with-storage`), which it deletes again. It uploads
no institutional data and creates no accounts.

### 2.1 Credentials

Export them for the run and let them fall out of scope with the shell. **Do
not put them in `.env`, in a script, or anywhere they persist.**

macOS or Linux:

```bash
export ACADEMICOS_URL="https://<project-ref>.supabase.co"
```

```bash
export ACADEMICOS_PUBLISHABLE_KEY="sb_publishable_..."
```

```bash
export ACADEMICOS_ADMIN_EMAIL="first.admin@your-institution.ac.in"
```

```bash
read -rs ACADEMICOS_ADMIN_PASSWORD && export ACADEMICOS_ADMIN_PASSWORD
```

Windows PowerShell:

```powershell
$env:ACADEMICOS_URL = 'https://<project-ref>.supabase.co'
```

```powershell
$env:ACADEMICOS_PUBLISHABLE_KEY = 'sb_publishable_...'
```

```powershell
$env:ACADEMICOS_ADMIN_EMAIL = 'first.admin@your-institution.ac.in'
```

```powershell
$env:ACADEMICOS_ADMIN_PASSWORD = Read-Host -AsSecureString | ConvertFrom-SecureString -AsPlainText
```

Close the window afterwards. On Linux, `read -rs` keeps the password out of
the shell history; typing `export PASSWORD=...` directly does not.

The script **refuses to run** if the publishable variable holds a key that
looks like a secret or service-role key, because such a key bypasses Row Level
Security and every check would then pass regardless of whether the policies
work.

### 2.2 Running it

First pass, without MFA — covers anonymous access, sign-in, and the central
AAL2 claim:

```bash
npm run verify:deployment
```

Second pass, with a current six-digit code from the authenticator app:

```bash
node scripts/verify-deployment.mjs --totp 123456 --with-storage
```

The second pass takes about 70 seconds, most of it waiting for a signed URL
to expire. That wait is the test; `--skip-expiry-wait` exists for a quick
re-run during troubleshooting and marks the check failed when used.

Exit codes: `0` all passed, `1` something failed, `2` misconfigured, `3`
incomplete (phases D–F not run).

### 2.3 What Each Phase Covers

**A — Anonymous.** Eleven confidential tables and storage listing, with no
session. All must be refused.

**B — Authentication.** Wrong password refused; the refusal does not reveal
whether the account exists; correct password signs in; the resulting session
is `aal1`, not `aal2`; the administrator has a verified factor enrolled.

**C — AAL2 enforcement.** *The central claim of the hardening work.* The
session is signed in but has not verified a second factor. Every one of the
eleven confidential tables must return nothing. The enrolment carve-out must
return exactly one row — the user's own profile — and the team must be
undiscoverable. Writes must fail.

**D — Verified session.** An incorrect TOTP code is refused; a correct one is
accepted; the resulting token carries `aal=aal2`; queries now work; the audit
trail is readable but not writable; calendar credentials remain unreadable
even at `aal2`; retention is still inert; recording is still off.

**E — Storage.** Authorised upload succeeds; a signed URL works immediately;
**the public path does not serve the object**; the signed URL stops working
after expiry; the test object is cleaned up.

**F — Audit.** Recording a content access produces an audit entry with the
expected action.

---

## 3. Manual Checks

Four things the script cannot do.

### 3.1 Email verification — needs a real mailbox

- [ ] Invite a test address and confirm the email **arrives**
- [ ] Confirm the link activates the account
- [ ] Confirm an unconfirmed account cannot sign in

If nothing arrives, the cause is almost always Supabase's default SMTP sender
being rejected by an institutional mail server. Configure a custom SMTP sender
on the institution's own domain — see `docs/m3-deployment-guide.md` §5.2.

### 3.2 Invitation-only registration

- [ ] In the dashboard, try Authentication → Users → **Add user** with an
      address that has no invitation. The database must refuse it:
      *"Registration is closed."*
- [ ] Create an invitation, retry, confirm it succeeds
- [ ] Set an invitation's `expires_at` to the past and confirm it is refused

If the first check succeeds rather than failing, the trigger from migration
0003 did not apply and **registration is not closed**. Stop.

### 3.3 Session expiry and refresh

- [ ] Sign in, leave the tab idle beyond the inactivity timeout, confirm the
      session ends
- [ ] Sign out in one tab, confirm a second tab loses access
- [ ] Confirm a refresh token issues a new access token that still carries
      `aal2` — an MFA-verified session must not silently drop to `aal1` on
      refresh

The third is the one worth testing deliberately. If assurance were lost on
refresh, users would be bounced to the MFA screen at unpredictable intervals
and would reasonably conclude the system was broken.

### 3.4 Two-person checks

With a second account at a lower role:

- [ ] A member cannot read `audit_logs`
- [ ] A member cannot read a transcript of a meeting they did not attend
- [ ] A **coordinator** cannot either — this is the least-privilege decision
      most likely to be weakened later, so confirm it holds in the real
      deployment
- [ ] A suspended account is refused at the next request

---

## 4. Recording — Deliberately Not Verified Here

Recording is switched off (`recording_enabled` = `false`,
`recording_eligibility_rule` = `disabled`), and the consent policy is not
approved.

Upload and retrieval of meeting audio should be verified **after** the consent
policy is settled, with a deliberate test recording made by the two
administrators with their own consent recorded in the register. Testing it
earlier would mean recording someone under a policy that does not yet exist.

The storage path works the same way for every bucket, and §2.3 phase E
verifies the mechanism using the `exports` bucket, which contains nothing
belonging to anyone else. So the plumbing is confirmed without recording a
person.

---

## 5. Pass Criteria

Confidential data may be entered only when all of these hold:

- [ ] `npm run verify:deployment --totp <code> --with-storage` — **all checks
      passed**, exit code 0
- [ ] Post-migration SQL checks pass (`docs/m3-migration-runbook.md` §4)
- [ ] Dashboard Advisors: no "RLS disabled" or "exposed table" findings
- [ ] §3.1 email verification confirmed with a real mailbox
- [ ] §3.2 invitation-only confirmed, including the refusal
- [ ] §3.3 session behaviour confirmed, including `aal2` surviving refresh
- [ ] §3.4 two-person checks confirmed
- [ ] Two Super Admins, both MFA-enrolled
      (`docs/administrator-provisioning.md` §8)
- [ ] A backup has been taken **and a restore tested**
      (`docs/backup-and-recovery.md`)

The last one is the one most likely to be deferred. An untested backup is a
hope, and the moment you need it is the worst moment to discover it does not
work.

---

## 6. If Something Fails

**Do not work around it, and do not enter data anyway.**

| Failure | Likely cause |
|---|---|
| Phase A returns rows | Migration 0013 did not apply; `anon` still holds privileges |
| Phase C returns rows | **Serious.** Migration 0015 did not apply, or a table was created after it without the restrictive policy. A password-only session can read confidential data. |
| Phase D gives `aal1` after a correct code | TOTP verification disabled in the dashboard, or the factor is not verified |
| Phase E public path serves the object | A bucket is public. Migration 0012 did not apply, or a bucket was created by hand |
| Phase E URL still works after expiry | Clock skew, or the TTL was not applied. Re-run before concluding |
| Phase F produces no audit entry | Migration 0010 did not apply |
| §3.2 add-user succeeds without invitation | **Registration is not closed.** Migration 0003's trigger on `auth.users` did not apply |

Each row maps to a migration. Check whether that migration applied before
looking anywhere else — on an empty project the fastest fix is usually to
delete it and start §3 of the deployment guide again.

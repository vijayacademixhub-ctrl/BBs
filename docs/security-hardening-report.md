# Security Hardening Report

**Date:** 2026-11-13
**Scope:** Pre-deployment hardening of Milestone 2.
**Status:** Local hardening complete. Nothing has been deployed.

No Supabase project was created, no cloud migration applied, no application
deployed and no institutional data uploaded.

---

## 1. Summary

Two genuine security defects were found and fixed, both by tests rather than
by review. One was a cross-team privilege escalation. The other left meeting
audio reachable by a session that had not completed multi-factor
authentication.

Mandatory MFA was implemented and is enforced in PostgreSQL. Signed-URL
issuance, logging hygiene and dependency currency were addressed. The database
test suite grew from 95 assertions to **190**; the frontend suite from 22 to
**43**.

| Area | Outcome |
|---|---|
| Mandatory MFA | Implemented, enforced at the database. GoTrue half untested — §2.6 |
| Meeting access model | Verified role by role; one escalation fixed — §3 |
| Private storage | Policies verified; signed-URL expiry untested — §4 |
| Backup and recovery | Documented. Nothing executed — §5 |
| Consent and retention | Unchanged and still inert — §6 |
| Final audit | Nine areas reviewed — §7 |

---

## 2. Mandatory Multi-Factor Authentication

### 2.1 How It Is Enforced

A **restrictive** RLS policy on every table in the application schema and on
`storage.objects`, requiring `aal2`:

```sql
create policy require_mfa on public.<table>
  as restrictive to authenticated
  using (public.is_mfa_verified()) with check (public.is_mfa_verified());
```

Restrictive rather than folded into an existing helper. A restrictive policy
is ANDed with every permissive policy, so a policy written later that forgets
the check cannot open the table. With the helper approach, one such omission
would silently admit password-only sessions.

Supabase has no setting that makes MFA compulsory; it only enables the
enrolment and verification APIs. This policy is the compulsion.

### 2.2 Defect Found — Storage Was Not Covered

The policies were applied by iterating over `public`. `storage.objects` lives
in another schema and was missed, so a password-only session could still list
and download meeting recordings: the storage policies checked participation,
but nothing checked assurance level.

Found by a test asserting that an `aal1` session can read no storage object.
Fixed in migration 0015 with a restrictive policy on `storage.objects`, plus a
structural test that fails if it is ever absent.

### 2.3 The Enrolment Carve-Out

A user who has not enrolled signs in at `aal1` and must reach the enrolment
screen, which shows who they are signed in as. `profiles` therefore permits an
`aal1` session to read **its own row only** — no colleague's profile, no team
list, and no write of any kind. Tested in both directions.

### 2.4 Recovery

Supabase's TOTP issues no backup codes, so there is no self-service recovery.
Administrator-assisted reset is recorded in `public.mfa_reset_requests`:
approval must name an approver and a time, the subject cannot approve their
own, an ordinary member cannot raise one, and every change is audited. The
factor removal itself is a server-side action with the service-role key.

**Procedural requirement, not a code one:** appoint at least two Super Admins,
and ensure more than one person can reach the Supabase dashboard with their
own MFA recovery codes stored physically. A single Super Admin losing their
device is otherwise unrecoverable from inside the application. See
`docs/mfa-setup.md` §4.2.

### 2.5 Scenarios Tested

Unenrolled (`aal1`), token with no `aal` claim, verified (`aal2`), suspended
account at `aal2`, failed challenge handling, and the enrolment carve-out in
both directions. Twenty-one confidential tables are each asserted to return
nothing at `aal1`, including for a Super Admin.

### 2.6 What Is Not Verified

| Property | Why |
|---|---|
| Enrolment against a real GoTrue instance | No project exists |
| QR code and TOTP secret generation | Supabase's, server-side |
| Challenge and verify with a real code | Needs a live auth service |
| That verification actually issues an `aal2` token | Supabase's |
| Factor removal through the Admin API | Needs the service-role key |
| Session expiry and inactivity timeout | Platform behaviour |

**Plainly:** the database half is proven — no `aal2`, no confidential data,
demonstrated rather than asserted. The authentication half is written against
the documented API and has never been run. Both must work; one is verified.

---

## 3. Meeting Access — a Cross-Team Escalation

### 3.1 The Defect

`is_super_admin()` answers "is this user a Super Admin of **any** team". It
was used in six places to grant access to a **specific** team's data.

Before the fix, a Super Admin of team B could:

- read every recording, transcript, segment and AI extraction of team A
- suspend team A's staff
- read team A's restricted documents
- delete team A's recordings from the database and from storage
- read team A's audit entries

AcademicOS runs with one team, so nothing was exposed in practice. The
policies nonetheless claimed a cross-team isolation they did not provide, and
the hole would have opened the moment a second team was created — precisely
when nobody would be looking for it.

Found by an access-matrix test that checks every role including a Super Admin
of another team. The earlier cross-team tests passed because they checked
`meetings` and `tasks`, which are team-scoped; the content tables are
meeting-scoped and fell through to the global check.

### 3.2 The Fix

Migration 0016 adds `is_super_admin_of(team)` and uses it in
`can_access_meeting_content`, `profiles_admin_manage`, `documents_select`,
recording deletion and the storage delete policy. `audit_logs` is scoped by
the row's team where it has one.

`is_super_admin()` remains for the trigger guards and the institution-wide
settings tables, where no team is in scope. Both functions now carry comments
saying which question they answer, so the distinction is visible at the point
of use.

### 3.3 A Second Finding — a Policy That Could Never Fire

`recordings_admin_delete` granted deletion to a Super Admin, but migration
0013 had revoked `DELETE` on `recordings` from `authenticated`. The privilege
check runs first, so the policy was unreachable. A policy that cannot fire is
worse than none, because it reads as a capability that exists.

Resolved toward the stricter position: recordings are not deletable from any
browser session, by anyone. The storage policy was dropped too — leaving it
would have allowed the file to be removed while its database row remained,
which is worse than either keeping both or removing both. Removal is a
deliberate, audited, server-side act under an approved retention policy.

### 3.4 The Verified Matrix

| | Super Admin | Coordinator | Member (attended) | Member (did not) | Other team |
|---|---|---|---|---|---|
| Internal meeting metadata | ✓ | ✓ | ✓ | ✓ | ✗ |
| Restricted meeting metadata | ✓ | ✗ | ✗ | ✗ | ✗ |
| Recording | ✓ | **✗** | ✓ | ✗ | ✗ |
| Transcript and segments | ✓ | **✗** | ✓ | ✗ | ✗ |
| AI extractions | ✓ | **✗** | ✓ | ✗ | ✗ |
| Consent register | ✓ | ✓ | ✓ | ✗ | ✗ |
| Create a meeting | ✓ | ✓ | ✗ | ✗ | ✗ |
| Edit a team meeting | ✓ | ✓ | organiser only | ✗ | ✗ |
| Delete a meeting | ✓ | ✗ | ✗ | ✗ | ✗ |
| Delete a recording | **✗** | ✗ | ✗ | ✗ | ✗ |
| Verify AI extractions | ✓ | needs transcript access too | ✗ | ✗ | ✗ |

The two cells worth noting. A **coordinator cannot read a transcript of a
meeting they did not attend** — administering a meeting and hearing it are
separate, deliberately. The consent register is the exception, because an
organiser must be able to fill it in and a coordinator must be able to check
that it was; it records who agreed to be recorded, not what was said.

Every cell is asserted by a test.

---

## 4. Private Storage

### 4.1 Verified Locally

All four buckets private; a trigger refuses any attempt to make one public;
anonymous requests denied; policies mirror the database exactly, so a
participant sees the object and a non-participant does not; a non-participant
cannot upload into another meeting's folder; no table can store a URL, because
check constraints on `storage_path` refuse anything beginning `http`; and —
new in this pass — `aal2` is required.

### 4.2 Signed URLs

Issuance is now confined to one module, `src/lib/supabase/storage.ts`, with a
test asserting nothing else mints one. That single place guarantees three
properties that would otherwise be conventions:

1. **A 60-second lifetime**, not left to the caller. Long enough to start a
   download; short enough that a URL copied into a chat message or a bug
   report has already stopped working.
2. **The audit entry is written first.** If it fails, no URL is issued. An
   unrecorded access to a confidential recording is worse than a failed one.
3. **The URL is never logged.** It is a bearer credential: anyone holding it
   can fetch the object without a session.

Tests cover the requested lifetime, the ordering, the refusal when auditing
fails, that neither the URL nor its token reaches the console, and that an
access failure does not reveal whether the file exists.

### 4.3 Not Verified

**That Supabase honours the expiry.** The signature is generated and checked
server-side, and no project exists. What is proven is that the application
asks for a short lifetime and never hands out a URL it has not recorded —
the part that can be got wrong here. Whether a URL stops working after 60
seconds must be confirmed against the hosted project;
`docs/pre-deployment-checklist.md` §4 says how.

### 4.4 Logging Hygiene

- `redactForLog()`, `redactUrl()`, `redactTokens()` strip credentials from
  URLs, JWT-shaped strings and secret-looking fields.
- `logger` is the only logging surface and redacts everything.
- Static tests over the source assert that **no file calls `console.*`
  directly**, that no signed URL is written to browser storage, that signed
  URLs are minted in one module, and that nothing reads a service-role key.

A unit test can show a redaction helper works; it cannot show everyone used
it. The static checks are what make the property hold across the codebase.

Confidential content — transcript text, meeting descriptions, daily work — is
not logged at all, redacted or otherwise. Identifiers and outcomes only.

---

## 5. Backup and Recovery

Documented in `docs/backup-and-recovery.md`. **Nothing has been executed.**

Two facts drive it, both from Supabase's documentation: automated backups are
a paid feature with none at all on Free; and **Supabase database backups
exclude Storage objects on every plan**, so recordings need a separate
arrangement regardless of what is paid for.

The plan covers all four data classes, daily database and Storage exports,
encryption before anything leaves the machine, an off-site copy, named
responsibilities, restore procedures per scenario, and quarterly restore
testing. It also states what deletion means in the presence of backups (§6
there), because that interacts with the retention decision.

Not in place: any backup, any tested restore, any encryption key, any off-site
location, any named owner.

---

## 6. Consent and Retention — Unchanged

Both remain unapproved and inert, as instructed. Verified by test on every
run:

- `recording_enabled` is `false`; `recording_eligibility_rule` is `disabled`.
- All four retention scopes are disabled with no period and status
  `pending_approval`.
- A constraint refuses to enable a policy without an approved period, a
  recorded approver and a timestamp.
- No scheduler exists — not a disabled one.
- No default retention duration appears anywhere, including `.env.example`.
- The consent register refuses a recorded decision without provenance, and a
  participant may withdraw their own consent.

`docs/backup-and-recovery.md` §6 now documents how backup retention affects a
deletion request: deleting a recording does not remove it from backups already
taken, so "deleted" means removed from the live system unless backup retention
is aligned or the backups are pruned. Anyone promising a participant that a
recording has been destroyed should know this before promising it.

---

## 7. Final Security Audit

| Area | Finding |
|---|---|
| **RLS policies and functions** | RLS on all 29 tables. All 16 `SECURITY DEFINER` functions pin `search_path` — asserted structurally. Two tables are intentionally unreachable from a browser (`calendar_credentials`, `calendar_sync_jobs`), asserted as an exact list so it cannot change unnoticed. |
| **Privilege escalation** | One real defect found and fixed (§3). Self-promotion, self-addition to a team, coordinator-minting-a-super-admin, self-suspension and self-reactivation all refused. A Super Admin cannot change their own role. A test confirms a Super Admin genuinely *can* change someone else's, so the control is not merely "deny everything". |
| **Invitation-only registration** | Two controls: the dashboard setting, and a trigger on `auth.users`. Expired invitations refused; members cannot raise or even see invitations. The first-account exemption closes permanently once one profile exists. |
| **Suspended accounts** | Enforced once, in `is_active_user()`, so it applies everywhere at once rather than table by table. A suspended account fails every policy including at `aal2`. |
| **Session expiry and refresh** | Config sets a 168-hour timebox, 8-hour inactivity timeout, 1-hour JWT and refresh-token rotation. The client handles sign-out in another tab, refresh failure and expiry. **Not verified** — platform behaviour, no project. |
| **Audit-log integrity** | Append-only three ways: no `UPDATE`/`DELETE` policy, privileges revoked from `authenticated`, and inserts only through a `SECURITY DEFINER` function members cannot call. Token-shaped fields redacted before writing, asserted by test. A Super Admin can read it and cannot alter it. |
| **Environment variables and secrets** | `.env` git-ignored; `.env.example` holds placeholders only. Secret scan clean. No retention default present. |
| **Frontend exposure of privileged keys** | Only the publishable key reaches the browser. A development guard throws if a service-role or `sb_secret_` key is placed in the publishable variable. A static test asserts no source file reads a service-role key. |
| **Dependency vulnerabilities** | `npm audit`: **0 vulnerabilities**. All minor and patch updates applied and verified against the full suite. Major upgrades deferred deliberately — see §9. |

---

## 8. Verification

| Check | Result |
|---|---|
| Database security suite | **190 passed** (was 95) |
| — security.test.ts | 100 |
| — mfa.test.ts | 42 |
| — meeting-access.test.ts | 41 |
| — structure.test.ts | 7 |
| Frontend unit tests | **43 passed** (was 22) |
| M1 browser regression | **17 of 17 — unchanged** |
| M2 browser checks | 11 of 11 (was 9) |
| TypeScript, strict mode | clean |
| Production build | succeeds, 429 kB / 134 kB compressed |
| `npm audit` | 0 vulnerabilities |
| Secret scan | clean |
| Migrations against a clean database | 16 of 16 apply |

---

## 9. Known Limitations and Residual Risks

Stated because they are real, not because they are acceptable indefinitely.

**Audit rows without a team are visible to any Super Admin.** Rows naming a
team are scoped. Rows for profile, recording and transcript changes have no
team column to copy from and remain visible to any Super Admin. For a
single-team deployment these are the same thing. If a second team is ever
created this becomes a real gap, and the fix is to resolve and store the team
on those rows. Recorded here rather than left to be discovered.

**Institution-wide settings are shared.** `app_settings` and
`retention_policies` are singletons readable and writable by any Super Admin.
Correct for one institution; would need scoping for a multi-tenant
deployment.

**No second-person approval for administrative actions.** A Super Admin can
suspend anyone and read any transcript in their team. The audit trail records
it and they cannot alter it, but nothing requires a colleague to concur. For
ten people that is proportionate. For a larger deployment it would not be.

**A sole Super Admin losing their authenticator is unrecoverable from inside
the application.** Mitigated procedurally — see §2.4 — not by code.

**Team creation requires the service role.** The policy requires a Super Admin
role *in the team being created*, which nobody can hold for a team that does
not exist. Deliberate for a single-team system; a second team needs a
server-side step.

**Major dependency versions deferred.** React 19, Tailwind 4, TypeScript 7 and
lucide 1.x are available. None carries a security advisory; all are breaking
changes. Upgrading them during a hardening pass would introduce risk without
reducing any. They should be scheduled deliberately, with the regression
suite as the safety net.

**The bundle is 429 kB (134 kB compressed).** Up from 280 kB at M1 because
the Supabase client sits in the main chunk. A performance matter, not a
security one.

**The local harness is not Supabase.** It reproduces `auth.uid()`, the three
roles and the storage tables faithfully enough to test policies. It is not
GoTrue, not the Storage API, and not the platform's rate limiting.

---

## 10. What Remains Unmet

Honestly stated: three of the seven hardening requirements cannot be fully
met without a project.

| Requirement | Status |
|---|---|
| 1. Mandatory MFA | **Partly met.** Database enforcement proven. Enrolment, challenge and `aal2` issuance implemented but never run. |
| 2. Meeting access policies | **Met.** Every role and cross-team case tested; one escalation fixed. |
| 3. Private storage | **Partly met.** Policies and the issuance contract verified. Expiry and reuse-after-expiry are server-side and untested. |
| 4. Backup and recovery | **Documented, not executed.** No backup taken, no restore tested. |
| 5. Consent and retention | **Met.** Both inert, verified by test; backup interaction documented. |
| 6. Final security audit | **Met**, within the limits above. |
| 7. Deliverables | **Met.** Four documents produced. |

Nothing in this report claims live authentication, signed-URL expiry, cloud
backups or production security has been verified, because none of it has.
`docs/pre-deployment-checklist.md` is the list of what to do once a project
exists; the authentication and storage items take about fifteen minutes.

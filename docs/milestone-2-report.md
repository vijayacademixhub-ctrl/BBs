# Milestone 2 — Completion Report

**Date:** 2026-11-13
**Scope:** Supabase configuration, schema and migrations, authentication,
roles and RLS, private storage, frontend integration, audit logging,
security testing, documentation.

**No live Supabase project has been created, and no migration has been
applied to anything but a local throwaway database.** Your approval is
required before either happens.

---

## 1. What Was Built

### M2.1 — Supabase configuration

`supabase/config.toml` carries the local stack settings and doubles as the
record of what must be applied to the hosted project: signup disabled,
anonymous sign-ins disabled, all external providers off, refresh-token
rotation on, a 168-hour session timebox and an 8-hour inactivity timeout.
`docs/supabase-setup.md` covers project creation, region verification, the
key distinction, and post-deployment checks.

### M2.2 — Schema and migrations

Fourteen migrations under `supabase/migrations/`, covering all 23 tables from
the architecture document plus five the brief implied but did not list:
`user_invitations`, `meeting_consents`, `calendar_credentials`,
`app_settings` and `retention_policies`.

UUID keys, explicit deletion behaviour on every foreign key, check
constraints, unique constraints and an index on every column an RLS policy
touches.

### M2.3 — Authentication

Invitation-only. Two independent controls: the Supabase signup setting, and a
database trigger that refuses any `auth.users` insert without an open,
unexpired invitation. The first account is exempt only while the instance has
no profiles at all.

### M2.4 — Roles and RLS

RLS on all 28 tables. Thirteen `SECURITY DEFINER` helper functions, each with
a pinned `search_path`, which is what lets a policy consult membership
without recursing into itself.

The significant decision: **meeting content is reachable only through
participation**. A coordinator who was not in a meeting cannot read its
transcript. Team membership grants visibility of scheduling, not of what was
said.

### M2.5 — Private storage

Four private buckets with size limits and MIME allowlists, storage policies
mirroring the database policies exactly, and a trigger that refuses any
attempt to make a bucket public. Check constraints prevent a URL ever being
stored in a path column.

### M2.6 — Frontend integration

Auth provider, login page, protected routes, role-aware navigation,
permission-denied states, sign-out, and a Supabase repository implementing
the same contract as the sample store.

The data source is chosen from build configuration: with no backend
configured the application runs on demonstration data and says so on every
screen; with one configured it uses real authentication and real rows. It
never claims a session it does not have — the login page in sample mode says
there is nothing to sign in to rather than quietly redirecting past itself.

### M2.7 — Audit and security testing

Audit triggers on twelve sensitive tables, token redaction before writing,
and an explicit call for content access, which a trigger cannot catch because
`SELECT` does not fire one.

95 database tests plus 22 frontend tests and two browser suites.

### M2.8 — Documentation

`supabase-setup.md`, `security-model.md`, `retention-and-consent.md`,
`migration-and-backup.md`, and this report.

---

## 2. Two Defects the Tests Caught

Both would have reached production. Both are the reason for testing security
properties rather than reviewing them.

**Registration was not actually closed.** The enforcement function was
written and never attached to `auth.users`. The control existed in the
codebase and did nothing. Caught by a test asserting that a user cannot be
created without an invitation.

**Every meeting insert would have failed.** `meetings_select` called a helper
that re-reads the `meetings` table. PostgreSQL applies SELECT policies to the
new row of an `INSERT … RETURNING`, and PostgREST uses `RETURNING` on every
insert — so the policy could not see the row being inserted and refused it.
Meeting creation would have been broken for every user. The policy now reads
the row's own columns, and three regression tests cover it.

---

## 3. Verification

| Check | Result |
|---|---|
| Migrations apply to a clean database | 14 of 14 |
| Database security suite | **95 passed** |
| Frontend unit tests | 22 passed |
| M1 browser regression (`verify:m1`) | **17 of 17 — unchanged** |
| M2 browser checks (`verify:m2`) | 9 of 9 |
| TypeScript, strict mode | clean |
| Production build | succeeds |
| `npm audit` | 0 vulnerabilities |
| Secret scan | clean |

### What the 95 tests cover

Anonymous access refused on thirteen confidential tables and on storage;
tokens whose subject is not a profile; suspended accounts across read and
write; participation-based access to recordings, transcripts, segments and
extractions, including the coordinator case; cross-team isolation;
self-promotion, self-addition, coordinator escalation and self-suspension;
that a Super Admin genuinely *can* change a role, so the control is not
merely "deny everything"; the AI gate including that the service role cannot
bypass it; audit immutability, forgery and token redaction; calendar secrets
unreadable even by their owner; storage policies and the public-bucket guard;
foreign keys, uniqueness and check constraints; closed registration including
expiry; the consent register's provenance requirement; retention being inert
and unenablable without an approver; and `INSERT … RETURNING`.

Tests use three accounts of different roles plus a suspended account and an
account in another team, as the brief required.

---

## 4. Acceptance Criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Supabase configuration documented | Met |
| 2 | Database migrations work | Met — 14 apply cleanly to a clean database |
| 3 | Authentication works | **Partly** — see §5 |
| 4 | Only authorised users can access the application | Met at the database; frontend guards in place |
| 5 | Role-based access enforced in PostgreSQL | Met — 95 tests |
| 6 | Private storage working | **Partly** — policies verified locally; signed-URL issuance is a platform behaviour, see §5 |
| 7 | Cross-user access tests pass | Met |
| 8 | Confidential information not accessible anonymously | Met — `anon` holds no privilege on any table |
| 9 | Audit logs protected | Met — three independent barriers |
| 10 | M1 functionality still operational | Met — 17 of 17 unchanged |
| 11 | No secrets exposed | Met |
| 12 | Setup and recovery documentation complete | Met |

## 5. What Cannot Be Claimed Yet

Criteria 3 and 6 are marked partly met, and the distinction is real rather
than cautious phrasing.

The sign-in **flow** is implemented and the session handling is wired —
expiry, cross-tab sign-out, refresh failure and suspended accounts are all
handled. But no credential has ever been checked against a real GoTrue
instance, because no project exists. Password sign-in, lockout and token
expiry are platform behaviours this session cannot reproduce.

The same applies to storage. The policies are verified, and they are the part
that decides who may reach a file. Signed-URL issuance and expiry are
Supabase's, and remain unexercised.

Both become verifiable in roughly fifteen minutes once a project exists.
`docs/supabase-setup.md` §9 is the checklist.

## 6. Decisions Taken, With Reasons

**Participation over role for meeting content.** Following the instruction
not to grant broad access from team membership. A coordinator is not
automatically entitled to hear a conversation they were not part of.

**Calendar tokens in a separate table with no policies.** A policy mistake on
the connections table then cannot expose a refresh token, because the token
is not in that table.

**No deletion scheduler, not even a disabled one.** Writing a scheduler
before a policy exists means writing code whose correct behaviour is unknown
and leaving it where a configuration change could start it.

**`AUDIO_RETENTION_DAYS` removed from `.env.example`.** A number in an
environment variable looks settled. The retention table records that nothing
is approved, and a constraint prevents enabling a policy without a recorded
approver.

**The sample mode retained.** You asked that frontend work not be blocked on
credentials. The application still runs with no backend at all, labelled
throughout, and switches to real data when configured.

## 7. Known Limitations

- **No MFA.** Supabase supports it. It should be enabled before real
  institutional data is entered, at the same time as the first account.
- **The bundle grew** from 280 kB to 429 kB (89 kB to 133 kB compressed),
  because the Supabase client is in the main chunk. Worth splitting later;
  not worth contorting the data layer for now.
- **Team creation needs the service role.** The policy requires a Super Admin
  role in the team being created, which no one can hold for a team that does
  not exist. Fine for one team; a second needs a server-side step.
- **`transcriptStatus` is always null** in the Supabase repository. Nothing
  reports a processing state until the AI service exists at Milestone 4, and
  inventing one would be the kind of false progress indicator this project
  has avoided.
- **The local harness is not Supabase.** It reproduces `auth.uid()`, the
  roles and the storage tables faithfully enough for policy testing, and
  nothing else.

## 8. What I Need From You

**To deploy:**

1. Approval to create the Supabase project.
2. Confirmation that `ap-south-1` (Mumbai) is offered in your account's
   region dropdown. If it is not, stop and tell me — do not accept the
   default, which would place institutional records outside India.
3. A plan decision. Free has **no automated backups at all**; Pro has daily
   backups for seven days. Separately, and on every plan, Supabase backups do
   **not** include Storage objects, so recordings need their own arrangement
   either way. My recommendation: Pro if these are genuinely institutional
   records, Free with scheduled dumps if the system is still being evaluated.

**Policy decisions, which are not mine to make:**

4. The recording eligibility rule — every participant must consent, or
   organiser attestation. Recording stays off until this is answered.
5. Whether to approve a retention period, and what happens to backups in
   light of `docs/retention-and-consent.md` §1.3: deleting a recording does
   not remove it from a backup taken while it existed.

## 9. Recommended Next Step

Create the project and run the §9 verification, which closes criteria 3 and
6 and moves Milestone 2 from "verified locally" to "verified in place". That
is a short piece of work and it should happen before Milestone 3 builds the
recorder on top of it.

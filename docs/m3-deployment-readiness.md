# M3 — Deployment Readiness Assessment

**Date:** 2026-11-13
**Base commit verified:** `55f60d3`
**Status:** ready for a controlled evaluation deployment, **not** for
production.

No Supabase project has been created, nothing has been deployed, no cloud
migration applied, no institutional data entered, and no office staff
invited.

---

## 1. Assessment

**Ready to deploy for evaluation with synthetic data.** Not ready for
institutional records, for reasons that are decisions rather than defects —
§4.

This pass found **two more security defects**, both by loading the synthetic
evaluation dataset rather than by review. That is now four defects across
three hardening passes, every one of them found by a test or by evaluation
data, none by reading the code.

---

## 2. M3.1 — Repository Verification

Verified against a database rebuilt from the migration files, not recalled.

| Check | Result |
|---|---|
| Commit `55f60d3`, clean tree | Confirmed |
| Migrations apply to a clean database | 18 of 18 |
| `is_super_admin_of` used in policies | 5 policies + `can_access_meeting_content` |
| Unscoped `is_super_admin()` remaining | 3, all institution-wide and asserted by a test |
| MFA reset requests team-scoped | Both policies |
| Tables lacking the `aal2` restrictive policy | **None** |
| `storage.objects` `aal2` policy | Present |
| `DELETE` on `recordings` for `authenticated` | Revoked |
| Delete policies on recordings or its bucket | 0 and 0 |
| Tables with RLS | 29 |
| `SECURITY DEFINER` functions without a pinned `search_path` | 0 |
| Public buckets | 0 |
| Retention scopes enabled | 0 |
| `recording_enabled` | `false` |

### Test results

| Suite | Result |
|---|---|
| Database security | **216 passed** (was 196) |
| — security.test.ts | 100 |
| — mfa.test.ts | 46 |
| — meeting-access.test.ts | 41 |
| — evaluation.test.ts | 22 (new) |
| — structure.test.ts | 7 |
| Frontend unit | 43 passed |
| M1 browser regression | **17 of 17 — unchanged** |
| M2 browser checks | 11 of 11 |
| TypeScript, strict | clean |
| Production build | succeeds, 441 kB / 138 kB compressed |
| `npm audit` | 0 vulnerabilities |
| Secret scan | clean |

M1 and M2 functionality is intact: the browser regressions are unchanged at
17/17 and 11/11.

---

## 3. Two Defects Found During Evaluation

Both were invisible to the existing 196 tests, which use a minimal fixture.
Both became obvious the moment two populated teams existed.

### 3.1 The audit trail leaked across teams

The generic audit trigger copied a team only from tables that have a
`team_id` column, so most rows carried none — and the policy's fallback for
those rows was the unscoped check.

Measured against the evaluation data, Westgate's Super Admin could read **35
of Northfield's 50** audit entries:

| Entity | Rows leaked | What they contained |
|---|---|---|
| `meeting_consent` | 18 | Who agreed to be recorded, and who withdrew |
| `profile` | 10 | Staff names, addresses, designations, status changes |
| `recording` | 2 | Storage paths of meeting audio |
| `transcript` | 2 | Transcript metadata |
| `verification_record` | 2 | Who approved which AI extraction |
| `mfa_reset_request` | 1 | That a named person had lost their authenticator |

This had been recorded in the hardening report as a residual gap "identical
in a single-team deployment". That was true, and it was too comfortable a
description of a gap covering most of the trail and concerning exactly the
material the system exists to protect.

**Fixed** in migration 0018: the audit trigger now resolves a team for every
auditable entity, through the meeting, recording, transcript, extraction or
profile as appropriate. Profile rows, which are written before the person
joins a team, resolve theirs at read time. After the fix Westgate's Super
Admin sees 8 rows, all its own, and **0** of Northfield's.

### 3.2 A restricted meeting's consent register was readable by any coordinator

`meeting_consents_select` admitted anyone who could *manage* the meeting, and
`can_manage_meeting()` admits every coordinator of the team without
considering confidentiality.

So a coordinator who could not see that the restricted staffing meeting
existed could nonetheless read its consent register — which names its two
participants and records that one of them withdrew consent after the fact. A
restricted meeting is meant to be invisible to non-participants; leaking its
attendee list through a side table defeats that.

**Fixed** in migration 0018 by requiring `can_view_meeting()` as well, which
already encodes confidentiality. Verified not to over-correct: a coordinator
still sees the register of the internal meetings they administer.

### 3.3 What This Says About the Process

Four defects across three passes, all found by tests or evaluation data:

| Pass | Defect | Found by |
|---|---|---|
| M2 | Registration was not actually closed — the trigger was never attached | A test |
| M2 | Every meeting insert would fail — a SELECT policy re-read its own table | A test |
| Hardening | Storage escaped MFA enforcement | A test |
| Hardening | `is_super_admin()` unscoped in six places | An access-matrix test |
| M3 | `mfa_reset_requests` missed by the above | Exhaustive policy listing |
| **M3 evaluation** | **Audit trail leaked across teams** | **Evaluation dataset** |
| **M3 evaluation** | **Restricted consent register readable** | **Evaluation dataset** |

The pattern is consistent and worth stating: **review did not find any of
them.** Minimal fixtures catch rules in isolation and miss interactions;
realistic data catches interactions. Both were needed.

It also argues against treating the current state as finished. The rate of
discovery has not yet fallen off.

---

## 4. Outstanding Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Personal account ownership** | **High over time** | Synthetic data only until transfer; a written transfer date agreed before the project is created |
| **Free plan has no automated backups** | **High once real data exists** | Tolerable during evaluation because the data is disposable. Must be revisited with the ownership transfer |
| Free plan pauses after a week idle | Medium | Evaluation inconvenience only |
| No live verification yet | Medium | Authentication, MFA enrolment and signed-URL expiry remain untested — `docs/m3-live-verification.md` |
| No backup has ever been taken or restored | Medium during evaluation, **high in production** | Phase 2 exit criterion |
| Consent policy approved in principle, not in force | Low — by design | Recording stays off until formally approved |
| Retention undecided | Low — by design | Nothing is deleted; no scheduler exists |
| A sole Super Admin losing their device | Medium | Two administrators, procedurally |
| Further undiscovered defects | **Medium** | See §3.3. The discovery rate has not fallen off |

### 4.1 The Two That Deserve Attention

**Personal ownership becoming permanent by default.** Not through anyone's
decision — through nobody revisiting it. The system works, people rely on it,
and the institution's records end up in an individual's personal account.
Mitigated only by agreeing a date in writing *before* creating the project,
and by refusing to enter real data until the transfer completes.

**The Free plan once real data exists.** During evaluation the worst case is
rebuilding from `npm run db:evaluate`, which takes seconds. The moment a real
meeting is recorded, "there is no automated backup" changes from a footnote
to the most serious thing on this page.

---

## 5. What Is Still Not Verified

Unchanged from the hardening report, because no project has been created.

| Property | Why |
|---|---|
| Password sign-in and email verification | Needs GoTrue |
| MFA enrolment, challenge, `aal2` issuance | Needs GoTrue |
| Signed-URL expiry | Server-side, needs Storage |
| Invitation-only against real GoTrue | Needs a project |
| Session expiry and refresh rotation | Platform behaviour |
| Backup and restore | Nothing has been backed up |

The database half is proven — now at evaluation scale, with two populated
teams. The platform half has never been run. `npm run verify:deployment`
covers most of the gap in about two minutes once a project exists.

---

## 6. Deliverables

| Document | Covers |
|---|---|
| `m3-evaluation-plan.md` | The two kinds of evaluation, phases, what stays off |
| `account-ownership-transfer.md` | Personal ownership risks, conditions, transfer procedure |
| `administrator-provisioning.md` | Two Super Admins, placeholders, no-self-approval, recovery |
| `backup-and-recovery.md` | Academic Office / IT, PostgreSQL and Storage separately, RPO/RTO as proposals |
| `sample-data-test-plan.md` | The synthetic dataset, how to run it, what it found |
| `m3-deployment-readiness.md` | This document |

New tooling: `npm run db:evaluate` (local evaluation environment and access
matrix) and `supabase/seed/evaluation-seed.sql`.

---

## 7. Recommendation

**Proceed with Phase 1 now** — it is local, creates nothing, and needs no
approval. Run `npm run db:evaluate` and satisfy yourself the access matrix
matches how the office actually works. That judgement is yours and cannot be
delegated to a test.

**Phase 2 on your approval**, under the conditions in
`account-ownership-transfer.md` §2 — synthetic data only, a written transfer
date, MFA on the personal account.

**Phase 3 requires decisions that have not been made.** Ownership transfer,
plan, consent policy formally approved, retention settled. Those are the
institution's, not mine.

# Account Ownership and Transfer

**Decision recorded:** the Supabase project will be created under a personal
account for evaluation, with transfer to institutional ownership later.

This document sets out what that means, what it risks, and how to undo it.

---

## 1. The Risk, Stated Plainly

A Supabase project belongs to an **organisation**, and the organisation owner
controls everything about it. Under personal ownership, one individual holds:

- **Deletion.** They can delete the project. Deleting a project permanently
  removes its backups too. There is no recovery.
- **Billing.** The plan, and therefore whether backups exist at all.
- **The last way in.** When every application administrator is locked out,
  the dashboard is the only route, and the organisation owner controls who
  reaches it.
- **Data access.** The owner can read every table through the dashboard,
  including every transcript, regardless of any Row Level Security policy.

That last point deserves emphasis because it is easy to miss. Everything this
project has built — mandatory MFA, participation-based transcript access,
cross-team isolation — governs the **application**. The organisation owner
sits underneath all of it with full database access. The security model
protects records from colleagues; it does not protect them from whoever owns
the Supabase account.

### 1.1 Specific Risks of Personal Ownership

| Risk | Consequence | Likelihood during evaluation |
|---|---|---|
| The individual leaves, graduates, or becomes unavailable | The institution cannot reach its own records | Low over weeks, **high over a year** |
| Personal account compromised | Full access to all institutional data | Low, but MFA on that account is essential |
| Project deleted by accident | Total loss including backups | Low |
| Billing lapses or the card expires | Project paused or degraded | Moderate |
| Dispute or misunderstanding about ownership | Institution has no formal claim to data held in a personal account | Moderate, and the awkward one |
| Evaluation quietly becomes production | The temporary arrangement becomes permanent by default | **High. This is the real risk.** |

The last row is the one to take seriously. Temporary arrangements become
permanent not by decision but by nobody revisiting them. The system works,
people start relying on it, and two years later the institution's meeting
records sit in a former student's personal account.

---

## 2. Conditions for Personal Ownership

Personal ownership is acceptable **for evaluation only**, and only with all
of the following. These are not nice-to-haves; without them the arrangement
is not acceptable even temporarily.

- [ ] **No real institutional data.** Synthetic data only — see
      `docs/sample-data-test-plan.md`. This is what makes the risks above
      tolerable: there is nothing of value to lose.
- [ ] **No real office staff invited.** Two test administrators only.
- [ ] **MFA enabled on the personal Supabase account**, with recovery codes
      printed and stored physically.
- [ ] **A written transfer date**, agreed with the Academic Office, before
      the project is created. Not "later" — a date.
- [ ] **A second person has dashboard access** from the start, as an
      organisation member, so a single lost account does not strand the
      project.
- [ ] **The Academic Office knows** the project exists, who owns it, and what
      it contains.

### 2.1 The Line That Must Not Be Crossed

> **Real institutional data must not be entered while the project is under
> personal ownership.**

If evaluation concludes successfully, the transfer in §4 happens **before**
the first real meeting is scheduled, not after. Entering real data first and
transferring later means institutional records sitting in a personal account
for however long the transfer takes.

If that sequencing is inconvenient, the right response is to start the
transfer earlier, not to enter data sooner.

---

## 3. Setting Up the Personal Account

1. Create a Supabase account using an address the individual controls and
   will keep. Not a university address that expires at graduation — the
   account must outlive the course.
2. **Enable MFA immediately**, before creating any project. Supabase's
   dashboard MFA issues recovery codes; print them and store them somewhere
   physical. These are the last way back in.
3. Create the organisation. Name it for the institution, not the person —
   `northfield-academic-office`, not `priyas-projects`. It makes the intent
   legible and the eventual transfer less surprising.
4. Invite the second administrator as an organisation member with their own
   account and their own MFA.
5. Create the project per `docs/m3-deployment-guide.md`.

### 3.1 Dashboard Access Is Not Application Access

Two separate systems, and conflating them causes real confusion:

| | Supabase dashboard | AcademicOS |
|---|---|---|
| Account | Supabase account | AcademicOS profile |
| MFA | Supabase's, **with recovery codes** | TOTP, **no recovery codes** |
| Reset when locked out | Recovery codes, then Supabase support | The other Super Admin, or the dashboard |
| Bypasses RLS | **Yes, completely** | No |

A person can hold one without the other, and usually should. A coordinator
needs an AcademicOS account and has no business in the dashboard.

---

## 4. Transferring to the Institution

Supabase transfers projects by moving them between organisations. The project
reference, URL and keys are unchanged, so no redeployment is needed.

### 4.1 Before

- [ ] The institution has created its own Supabase account, under a
      departmental address that does not belong to one person
- [ ] That account has MFA enabled with recovery codes stored
- [ ] A current backup has been taken and **a restore tested** —
      `docs/backup-and-recovery.md`. Do not transfer on an untested backup.
- [ ] Both Super Admins know the transfer is happening and when
- [ ] A short written note records what is being transferred and why

### 4.2 The Transfer

1. The institutional account creates an organisation, on the intended plan.
2. The personal owner invites the institutional account to the **existing**
   organisation as an Owner.
3. The institutional owner accepts.
4. Project Settings → General → Transfer project, into the institutional
   organisation.
5. Billing moves with it. Confirm the new organisation's plan is what you
   intend — a transfer into an organisation on the Free plan silently drops
   the daily backups you were relying on.
6. The personal account's role is reduced to a member, or removed.

### 4.3 After

- [ ] The application still works end to end — `npm run verify:deployment`
- [ ] Backups are still running under the new billing
- [ ] The personal account no longer holds Owner
- [ ] The institutional owner has confirmed they can reach the project
- [ ] The transfer is recorded in whatever the institution uses for asset
      records

### 4.4 If Transfer Is Refused or Delayed

It happens: procurement, budget approval, nobody wanting to own it.

**Do not simply carry on.** Set a review date, and until the transfer
completes keep the project on synthetic data. A system running on real
institutional records in a personal account is a governance problem that
grows quietly with every meeting recorded.

---

## 5. Two-Person Administrative Access

At every stage — personal ownership included — **two people** must be able to
reach the system independently.

| Layer | Primary | Secondary |
|---|---|---|
| Supabase organisation | Project owner | Second member, own account and MFA |
| Supabase dashboard recovery | Owner's recovery codes | Second member's recovery codes, stored separately |
| AcademicOS Super Admin | First administrator | Second administrator |
| Backups | Academic Office | IT |

The secondary must be able to *do* the thing, not merely be named. A
secondary who has never signed in, never run a restore and does not know
where the recovery codes are is a name on a page.

---

## 6. Evaluation Exit Criteria

Before the arrangement changes from evaluation to production, all of these:

- [ ] Transfer to institutional ownership **completed**
- [ ] A plan chosen deliberately, with backups understood
      (`docs/m3-deployment-guide.md` §3)
- [ ] Recording consent policy approved — currently pending
- [ ] Retention policy approved or explicitly deferred in writing — currently
      pending
- [ ] Backup and restore tested under the new ownership
- [ ] Two Super Admins who are the actual office staff, not test accounts
- [ ] Synthetic data removed, not merely ignored

The last one matters. Fictional data left alongside real records is how
someone eventually cites a meeting that never happened.

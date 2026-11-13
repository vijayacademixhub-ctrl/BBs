# M3 — Evaluation Plan

How AcademicOS is evaluated before any real institutional record is entered.

**Nothing has been deployed.** No Supabase project exists, no cloud migration
has been applied, no institutional data exists, and no office staff have been
invited.

---

## 1. Confirmed Decisions

| Area | Decision | What follows from it |
|---|---|---|
| Supabase account | Personal, temporarily; transfer to the institution later | Synthetic data only until transfer — `docs/account-ownership-transfer.md` |
| Plan | Free, evaluation only | **No automated backups.** The scheduled dump is the only copy, and the project pauses after about a week idle |
| Super Admins | Two separate authorised individuals | `docs/administrator-provisioning.md` |
| Backups | Primary: Academic Office. Secondary: IT | `docs/backup-and-recovery.md` §4 |
| Recording consent | Individual participant consent | Recording stays **off** until the policy is formally approved |
| Retention | Pending institutional approval | Nothing is deleted; no scheduler exists |

### 1.1 What "Individual Participant Consent" Means Here

The decision is recorded and the data model supports it: `meeting_consents`
holds one row per participant per meeting, with the status, the method, who
recorded it and when, and a constraint refusing a decision that lacks any of
those.

It is **not yet in force**, and that distinction matters.
`recording_eligibility_rule` remains `disabled` rather than
`all_participants_consented`, because switching it is what makes recording
possible, and recording must not become possible until the institution has
formally approved the policy — not merely until the project owner has decided
what it should be.

When the policy is approved, one setting changes:

```sql
update public.app_settings
set value = '"all_participants_consented"'
where key = 'recording_eligibility_rule';
```

That change is audited, and `recording_enabled` is a separate switch that
must also be turned on. Two switches, deliberately: deciding the rule and
enabling the feature are different decisions.

---

## 2. The Two Kinds of Evaluation

They answer different questions and are easy to confuse.

| | Interface evaluation | Security evaluation |
|---|---|---|
| What you do | Click through the application in the browser | Query a real database as different people |
| Command | `npm run dev` | `npm run db:evaluate` |
| Data | The built-in demonstration data | The synthetic two-team dataset |
| Answers | Is this usable? Is anything missing? | Can the wrong person see this? |
| **Cannot answer** | Anything about access control | Anything about usability |

> **Clicking through the browser cannot evaluate the security model.**
> Demonstration mode has no database, so there is no Row Level Security to
> evaluate. Everything it shows is the interface's own behaviour, and it
> would show exactly the same thing if every policy were deleted.

This is why the security evaluation runs against PostgreSQL. It is also why
the access matrix in §4 is the meaningful artefact rather than a screenshot.

---

## 3. Interface Evaluation

```bash
npm install
```

```bash
npm run dev
```

Open <http://localhost:5173>. You are a Super Admin against demonstration
data, which is labelled as such on every screen.

Worth looking at: the dashboard, scheduling and editing a meeting, creating a
task and moving it through its states, a daily work entry, the mobile layout
at a narrow window, and the pages for modules not yet built — which say so
rather than pretending.

What you will **not** find: a working sign-in (there is no backend), a
recorder, transcripts, or AI output. Each says so where you would expect to
find it.

---

## 4. Security Evaluation

```bash
npm run db:evaluate
```

Rebuilds a local database from the real migration files, loads ten fictional
people across two teams, and prints what each can actually read.

### 4.1 What the Matrix Should Show

| Observation | What it demonstrates |
|---|---|
| Meera and Arjun — **coordinators** — see 0 transcripts | A role is not participation |
| Lakshmi sees 1 transcript; Priya sees 2 | Participation grants access; oversight is the Super Admin's |
| Only Priya and Ravi see the restricted meeting | Confidentiality hides the meeting itself |
| Deepak sees 0 of Northfield's rows, in every table | Cross-team isolation |
| Former Staff sees 0 of everything but their own profile | Suspension is system-wide |
| At `aal1`, Priya sees 0 of everything but her own profile | Mandatory MFA |

The last row is the one to dwell on. That is a Super Admin, correct password,
reaching nothing — the central security claim of the project, as a number.

### 4.2 Ask Your Own Questions

```bash
npm run db:evaluate -- --keep --as meera --sql "select content from public.transcript_segments"
```

```bash
npm run db:evaluate -- --keep --as priya --sql "select content from public.transcript_segments"
```

Same query, different person. One gets nothing; the other gets the meeting.

Worth trying: read `audit_logs` as `deepak` and confirm nothing of
Northfield's appears; read `meeting_consents` as `meera` and confirm the
restricted meeting is absent; try `insert into public.team_members ...` as
`lakshmi` and watch it be refused.

### 4.3 The Automated Suites

```bash
npm run test:all
```

216 database tests and 43 frontend tests. The database suite builds the
schema from the migration files rather than a snapshot, so a pass says
something about what would actually be deployed.

---

## 5. What Evaluation Found

Loading two populated teams found **two real defects** that 196 abstract
tests had not.

**The audit trail leaked across teams.** Most audit rows carried no team,
because the trigger copied one only from tables with a `team_id` column.
Measured here: Westgate's Super Admin could read 35 of Northfield's 50 audit
entries, including 18 consent changes naming who agreed to be recorded, two
recordings with their storage paths, and ten profile changes.

**A restricted meeting's consent register was readable by any coordinator.**
The policy admitted anyone who could *manage* the meeting, and managing does
not consider confidentiality — so a coordinator who could not see the
staffing meeting existed could read who attended it and that one of them
withdrew consent.

Both fixed in migration 0018, both now covered by regression tests.

The general lesson is worth recording: minimal fixtures test rules in
isolation and miss interactions. The leaks appeared the moment there were two
teams with real volumes of data. **Evaluation is not a formality here — it
has found something every time it has been run.**

---

## 6. Evaluation Phases

### Phase 1 — Local, now. No cloud resources.

- [ ] Interface evaluation (§3)
- [ ] Security evaluation (§4)
- [ ] `npm run test:all` passes
- [ ] Review the access matrix and confirm it matches what the office expects
- [ ] Decide whether anything in the model is wrong for how the office works

Phase 1 needs no approval and creates nothing. **This is where you are.**

### Phase 2 — A project with synthetic data. Needs your approval.

- [ ] Personal Supabase account with MFA and stored recovery codes
- [ ] Transfer date agreed in writing
- [ ] Project created (`docs/m3-deployment-guide.md`)
- [ ] 18 migrations applied (`docs/m3-migration-runbook.md`)
- [ ] Two test Super Admins provisioned
- [ ] `npm run verify:deployment` passes
- [ ] Synthetic data loaded, matrix reproduced against the hosted project
- [ ] Backup taken and **a restore tested**

Phase 2 verifies what cannot be tested locally: real authentication, real MFA
enrolment, signed-URL expiry, email delivery.

### Phase 3 — Production. Needs several further decisions.

- [ ] Ownership transferred to the institution
- [ ] Plan reconsidered now that backups matter
- [ ] Consent policy formally approved; eligibility rule switched
- [ ] Retention approved or explicitly deferred in writing
- [ ] Real Super Admins provisioned; test accounts removed
- [ ] Synthetic data removed, not merely ignored
- [ ] Office staff invited

---

## 7. What Stays Off Throughout

| | State | Changes when |
|---|---|---|
| Recording | `recording_enabled = false` | The consent policy is formally approved |
| Eligibility rule | `disabled` | The same |
| Retention, all four scopes | Disabled, no period, pending approval | The institution approves a period |
| Automatic deletion | Does not exist — no scheduler was written | A retention policy is approved |
| Real data | None | Phase 3 |
| Office staff | Not invited | Phase 3 |

Tests assert the first three on every run, so evaluation cannot silently
change them.

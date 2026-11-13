# Retention and Consent

**Both policies are unapproved. Neither is active in this system.**

This document records what has been built to support them, what has
deliberately not been built, and what the institution needs to decide.

---

## 1. Retention — Current Position

The 90-day audio retention period proposed at Milestone 1 has **not** been
approved. Accordingly:

- No retention period is configured anywhere in this system.
- Nothing is deleted automatically. No scheduler exists, enabled or disabled.
- Recordings, transcripts, documents and exports are retained indefinitely.
- `AUDIO_RETENTION_DAYS` has been removed from `.env.example`. A number in an
  environment variable looks settled and could cause a deployment to begin
  deleting institutional records on the strength of a default.

### 1.1 Where Configuration Lives

`public.retention_policies`, one row per scope:

| Scope | Enabled | Period | Status |
|---|---|---|---|
| `recording_audio` | false | none | pending approval |
| `transcript` | false | none | pending approval |
| `document` | false | none | pending approval |
| `export` | false | none | pending approval |

A check constraint prevents a policy being switched on without all of:
`status = 'approved'`, a period, a recorded approver, and an approval
timestamp.

```sql
constraint retention_enabled_requires_approval check (
  not enabled
  or (status = 'approved' and retention_days is not null
      and approved_by is not null and approved_at is not null)
)
```

This is the difference between "pending approval" and "approved but not yet
configured" being structural rather than a matter of someone remembering.
Only a Super Admin may change the table, and every change is written to the
audit trail.

### 1.2 Deliberately Not Built

No deletion scheduler exists — not a disabled one, not a dormant one. Writing
a scheduler before a policy exists means writing code whose correct behaviour
is unknown, and leaving it where a configuration change could start it.

When a policy is approved, the deletion job belongs in the AI service, which
already holds the service-role key and runs on a schedule. It should: select
rows past their period, delete the Storage object first, then mark the row
deleted, then write an audit entry — in that order, so a failure leaves a
file with no row rather than a row with no file.

### 1.3 What Deletion Would Actually Do

This is the part most retention policies get wrong, and it should be
understood before a period is chosen.

**Deleting a recording does not delete it from backups.** A backup taken
while the file existed still contains it. If the institution's intent is that
audio ceases to exist after N days, the retention period must be at least as
long as the backup retention, or the backups must be rotated accordingly.
Otherwise the policy is nominal.

**Supabase database backups do not contain Storage objects at all.** They
hold only the metadata rows. Restoring a database backup after a deletion
would restore the `recordings` row pointing at a file that is gone. The
application handles a missing object as an error, but the inconsistency is
real and should be expected during any restore.

**The audit trail survives deletion, by design.** `audit_logs` records that a
recording existed, who accessed it and when it was deleted, and those entries
are not removed by retention. This is deliberate: a retention policy that
erased its own evidence would make it impossible to answer "was this record
handled correctly". The audit row holds no content — no transcript text, no
audio — only the fact of the action.

**Transcripts and audio are separable.** Deleting audio while keeping the
approved transcript is likely to be what the institution actually wants:
the substance is preserved, the voice recording is not. The schema supports
this, since the scopes are independent.

### 1.4 What You Need to Decide

1. Whether audio is deleted at all, and after how long.
2. Whether transcripts follow the same period or are retained indefinitely.
3. Whether the period runs from the meeting date or from transcript approval.
4. What happens to backups, in light of §1.3.
5. Who may approve a deletion outside the policy, and whether that requires a
   second person.

---

## 2. Consent — Current Position

**Production recording is switched off and cannot be enabled by
configuration alone.**

`public.app_settings` holds:

| Key | Value | Meaning |
|---|---|---|
| `recording_enabled` | `false` | Master switch. Recording is not permitted. |
| `recording_eligibility_rule` | `"disabled"` | No rule has been chosen for when a meeting may be recorded. |

### 2.1 The Consent Register

`public.meeting_consents` holds one row per participant per meeting. A row is
created automatically when someone is added to a meeting, so the register is
complete by construction rather than by the organiser remembering to create
it.

| Column | Purpose |
|---|---|
| `profile_id` | Who the consent concerns |
| `status` | `pending`, `consented`, `declined`, `not_applicable`, `withdrawn` |
| `method` | `verbal_in_meeting`, `written`, `email`, `system_prompt`, `other` |
| `recorded_by` | Who recorded the decision |
| `recorded_at` | When |
| `note` | Free text |
| `withdrawn_at` | Set when withdrawn |

A constraint refuses any status other than `pending` unless `recorded_by`,
`recorded_at` and `method` are all present. A consent record with no
provenance is worthless as evidence, so the database will not store one.

A participant may always withdraw their own consent; that is the one consent
action the subject themselves can take, and it has its own RLS policy.

### 2.2 What This Register Is, and What It Is Not

**It is** an administrative record that the organiser asked each participant
and recorded the answer.

**It is not** proof that each participant gave valid, informed consent. The
organiser recording "consented" on someone's behalf is a statement by the
organiser, not by that person. The distinction matters: a register full of
organiser-recorded consents could create a false impression that the
institution has obtained consent when what it has is one person's account of
having asked.

This is stated in the table's comment in the database as well as here,
because whoever reads the schema next should not have to infer it.

### 2.3 The Eligibility Rule

`recording_eligibility_rule` decides what the register must contain before
recording may begin:

| Value | Meaning |
|---|---|
| `disabled` | Recording is not permitted. **Current value.** |
| `all_participants_consented` | Every participant must have `status = 'consented'`. The strictest, and the only one that makes the register load-bearing. |
| `organiser_attestation` | The organiser attests for the meeting. Weaker, and relies on the distinction in §2.2 being understood by whoever relies on it. |

The rule is configurable precisely because this is the institution's decision
and not an engineering one.

### 2.4 What You Need to Decide

1. Which eligibility rule applies.
2. Whether a participant who declines may still attend an unrecorded meeting,
   or whether recording proceeds without them.
3. What happens to a recording when consent is withdrawn after the fact —
   deletion, redaction, or retention with the withdrawal noted.
4. Whether participants external to the institution can be recorded at all,
   and how their consent is captured, since they will have no account.
5. Who is accountable for the register being accurate.

Until (1) is answered, `recording_enabled` stays `false` and Milestone 3 does
not ship a working recorder — which is the instruction given, and the right
one.

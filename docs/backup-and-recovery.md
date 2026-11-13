# Backup and Recovery

**Nothing in this document has been executed.** No backup has been taken, no
restore tested, and no project exists to back up. It is the plan to put in
place before real institutional data is entered, not a description of
arrangements that exist.

`docs/migration-and-backup.md` covers migration procedure and rollback. This
document covers the data.

---

## 1. The Two Facts That Shape Everything Here

From Supabase's own documentation:

**Automated backups are a paid feature.** Free plan projects get none at all.
Pro gets daily backups retained seven days; Team fourteen; Enterprise up to
thirty. Supabase's recommendation for Free projects is to export regularly
with `supabase db dump` and keep off-site copies.

**Supabase database backups do not include Storage objects, on any plan.**
The database holds only metadata rows describing files. Restoring a database
backup does not restore a deleted recording. This is not a Free-plan
limitation — it applies to Enterprise too.

For AcademicOS the second fact matters more than the first, because the
recordings are the bulk of the irreplaceable material and they are precisely
what Supabase does not cover.

Also: **deleting the project deletes its backups**. There is no recovery from
a deleted project except from copies held elsewhere.

---

## 2. What Has to Be Backed Up

| Class | Where it lives | Covered by Supabase backups? | Replaceable? |
|---|---|---|---|
| **Database records** — meetings, tasks, daily work, profiles, consent register, audit trail | PostgreSQL | Pro and above only | No |
| **Audio recordings** | `meeting-recordings` bucket | **No — on any plan** | No. The meeting is over. |
| **Uploaded documents** | `meeting-attachments`, `academic-documents` | **No** | Sometimes — the author may hold a copy |
| **Transcripts and AI output** | PostgreSQL (`transcripts`, `transcript_segments`, `ai_extractions`, `verification_records`) | Pro and above only | Only by re-running transcription, and only while the audio survives |
| **Generated exports** | `exports` bucket | **No** | Yes — regenerate them |

Transcripts deserve a note. They are *derived* from audio, so in principle
they can be regenerated. In practice they cannot once the audio is gone, and
an **approved** transcript carries human verification decisions that cannot be
reproduced at all. Treat approved transcripts as primary records, not as
derived data.

---

## 3. Recommended Arrangement

The Windows AI host already exists, already holds the service-role key, and
already runs scheduled work. It is the natural place for this, and it avoids
introducing another system that itself needs securing.

### 3.1 Database — daily

```bash
supabase db dump --db-url "$ACADEMICOS_DB_URL" -f "academicos-db-$(date +%F).sql"
```

Roles and data can be dumped separately with `--role-only` and `--data-only`
when a more granular restore is wanted.

### 3.2 Storage — daily

Supabase Storage is S3-compatible, so any S3 client works. The point is that
**this step has no alternative**: nothing else backs these files up.

```bash
aws s3 sync "s3://meeting-recordings" ./backup/recordings \
  --endpoint-url "$SUPABASE_S3_ENDPOINT"
```

Repeat for `meeting-attachments` and `academic-documents`. `exports` can be
skipped — those are regenerable by definition.

### 3.3 Encryption — before anything leaves the machine

A backup of this system is a complete copy of confidential institutional
information in plain form: every transcript, every daily report, every staff
record. It needs the same protection as the system itself, and arguably more,
because it will sit somewhere with weaker access control.

```bash
age -r "$BACKUP_RECIPIENT_PUBLIC_KEY" \
  -o "academicos-db-$(date +%F).sql.age" "academicos-db-$(date +%F).sql"
```

`age`, `gpg` or an encrypted archive are all acceptable. What is not
acceptable is an unencrypted dump on a shared drive, a personal cloud folder,
or an unencrypted external disk.

**The decryption key must not live only on the machine that makes the
backups.** If that laptop fails, the backups it holds become unreadable, and
a backup that cannot be read is not a backup.

### 3.4 Off-site — at least one copy elsewhere

At least one copy must be on neither the Windows host nor in the same Supabase
project. A backup that exists only on the machine that generates it protects
against almost nothing: not theft, not fire, not a failed disk.

Institutional storage, or an encrypted external drive kept in a different
building, are both adequate. A personal consumer cloud account is not, for
confidential institutional records.

### 3.5 Retention of the backups themselves

Keep daily copies for 30 days and monthly copies for 12 months, as a starting
point for the institution to approve.

This interacts directly with deletion requests — see §6.

---

## 4. Responsibilities

Backups fail quietly. Naming who is responsible is the only thing that makes
the failure visible before it matters.

Every responsibility has a **primary** and a **secondary**. A single named
owner is the same failure mode as a single Super Admin: it works until that
person is on leave, ill, or has left.

| Responsibility | Primary | Secondary | Cadence |
|---|---|---|---|
| Backups are running and succeeding | _________ | _________ | Weekly |
| Encryption key held in two places | _________ | _________ | At setup, then quarterly |
| Off-site copy is current | _________ | _________ | Monthly |
| A restore is performed and verified | _________ | _________ | Quarterly, and after any schema change |
| Approving deletion and retention | Institution | — | As required |

The secondary must be able to perform the task, not merely know it exists.
That means they have the credentials, know where the off-site copy lives, and
have done a restore at least once. A secondary who has never run the procedure
is a name on a page.

Approving deletion is deliberately not an engineering responsibility. It is
an institutional decision and belongs with whoever is accountable for the
records, not with whoever runs the scripts.

### 4.1 Recovery Objectives

These are **proposals**, not measurements. Nothing has been restored, so the
actual recovery time is unknown. Replace the proposed figures with observed
ones after the first restore test (§5.1), and treat any that cannot be met as
a decision to revisit rather than a number to quietly leave in place.

| Data class | RPO — how much may be lost | RTO — how long to restore | Basis |
|---|---|---|---|
| Database (Pro plan) | **24 hours** | 1–2 hours | Supabase daily backup, plus the scheduled dump |
| Database (Free plan) | **24 hours**, and only if the scheduled dump runs | 1–2 hours | There is no automated backup on Free; the dump is the only copy |
| Meeting recordings | **24 hours** | Hours to a day | Not in any Supabase backup. Restore speed is bounded by upload bandwidth, and audio is most of the bytes |
| Documents | 24 hours | Under an hour | Smaller volume |
| Transcripts and AI output | 24 hours | With the database | Stored in PostgreSQL |

**What a 24-hour RPO actually means:** a failure at 16:00 loses everything
since the previous night's backup. For an academic office that is likely a
day of daily work entries, task updates, and possibly a meeting recording.
Whether that is acceptable is a judgement for the institution, not a
technical default — and if it is not acceptable, the options are more
frequent dumps or Point-in-Time Recovery, which costs roughly USD 100/month
on top of Pro.

**A caution on RTO.** The figures above assume the backup exists, is
readable, and the person restoring it has done it before. If any of those is
untrue the real RTO is unbounded. That is the whole argument for §5.1.

---

## 5. Restoring

### 5.1 Test It Before You Need It

**An untested backup is a hope, not a backup.** Restore into a scratch project
once, confirm the database suite passes against it, and write down how long it
took. That number is what you will need when something has actually gone
wrong and someone asks how long the system will be down.

### 5.2 A Few Rows Deleted by Mistake

Restore the latest dump into a scratch database, extract the rows, re-insert
into production. Do not restore the whole project for a handful of rows: the
downtime costs more than the error did.

### 5.3 A Bad Migration

Restore the pre-migration dump (`docs/migration-and-backup.md` §5.1) into a
scratch project, verify, then copy the affected data back.

### 5.4 A Storage Object Deleted

Restore from the Storage sync in §3.2. A database backup will not help; the
file was never in it.

### 5.5 The Whole Project Lost

1. Create a new project **in the same region** (`ap-south-1`).
2. Apply the migrations: `supabase db push`.
3. Restore the database dump.
4. Restore the Storage buckets from the sync.
5. Re-issue the publishable key, update the frontend environment, redeploy.
6. Re-issue the service-role key to the AI service.
7. Re-run the verification in `docs/pre-deployment-checklist.md`, because a
   restored project does not necessarily carry the dashboard settings — MFA,
   signup disabled, session timeouts — which are configuration, not data.

Expect downtime proportional to size. For a ten-person team the database will
be small and the Storage restore will dominate, because audio is most of the
bytes.

### 5.6 The Project Deleted

Supabase's backups are gone with it. Only the off-site copies in §3.4 remain,
which is the entire argument for §3.4.

---

## 6. Backups and Deletion Requests

This is the part most retention policies get wrong, and it should be settled
before any retention period is approved.

**Deleting a recording does not delete it from backups already taken.** A
backup made while the file existed still contains it, and will keep
containing it for as long as that backup is retained.

So if the institution's intent is that audio ceases to exist N days after a
meeting, then:

- the backup retention must be no longer than N days, **or**
- the backups must themselves be pruned when a deletion is performed, **or**
- the policy must say plainly that "deleted" means removed from the live
  system and that copies persist in backups for up to the backup retention
  period.

The third is usually what institutions actually mean, and it is far better to
write it down than to let people assume the first.

The same applies to a consent withdrawal that results in deletion. If someone
withdraws consent and the recording is removed, copies remain in backups until
those backups age out. Anyone making that commitment to a participant should
know it before they make it.

**The audit trail survives deletion deliberately.** `audit_logs` records that
a recording existed, who accessed it and when it was deleted, and retention
does not remove those entries. A retention policy that erased its own evidence
would make "was this handled correctly?" unanswerable. The audit rows contain
no content — no transcript text, no audio — only the fact of the action.

---

## 7. What Is Not in Place

Stated plainly, because this is a plan and not a report:

- No backup has been taken. No project exists.
- No restore has been tested, so the recovery time in §5.1 is unknown.
- No encryption key has been generated or escrowed.
- No off-site location has been chosen.
- No primary or secondary owner has been named.
- The recovery objectives in §4.1 are proposals and have never been measured.
- The backup scripts in §3 are the documented commands, not scripts that
  exist in this repository and have been run.

All of these belong to the deployment step, and all are in
`docs/pre-deployment-checklist.md`.

# Sample-Data Test Plan

Synthetic data for evaluating AcademicOS, and how to use it.

**Every person and organisation below is fictional.** Addresses use
`example.edu`, a reserved domain that cannot receive mail. No real staff
member, student, meeting, document or institution appears anywhere in this
dataset, and none may be added to it.

---

## 1. What This Is For

The browser's demonstration mode lets you click through the interface. It
cannot evaluate the security model at all, because it has no database and
therefore no Row Level Security. Anything it shows you is the interface's own
behaviour.

This dataset is the opposite: two populated teams in a real PostgreSQL
database, so that who-can-see-what can be observed rather than taken on
trust.

That distinction is not academic. Two genuine leaks were found by loading
this data that the existing 196 tests had not caught — see §6.

---

## 2. The Cast

### Northfield Academic Office — the team under evaluation

| Person | Role | Why they are here |
|---|---|---|
| Priya Anand | **Super Admin** | First administrator. Attended both recorded meetings. |
| Ravi Kulkarni | **Super Admin** | Second administrator. Proves resets can be approved by someone other than the subject. |
| Meera Das | Coordinator | **Attended neither recorded meeting.** The control for "a role is not participation". |
| Arjun Pillai | Coordinator | Same, second instance. |
| Lakshmi Nair | Member | Attended the internal meeting. Should see its transcript. |
| Imran Sheikh | Member | Invited but did not attend. Consent recorded as not applicable. |
| Tara Bhatt | Member | Attended nothing recorded. Declined consent for an upcoming meeting. |
| Former Staff | **Suspended** | Kept for attribution, refused access everywhere. |

### Westgate Research Unit — the isolation control

| Person | Role | Why they are here |
|---|---|---|
| Deepak Rao | **Super Admin** | Administers a *different* team. Must see nothing of Northfield's. |
| Sunita Menon | Member | Ordinary member of the other team. |

Deepak is the most important persona in the dataset. A Super Admin of another
team is the shape of attacker the cross-team fixes in migrations 0016, 0017
and 0018 all address, and every one of those defects was found by asking what
he could see.

---

## 3. The Content

**Four meetings.** One internal and recorded; one **restricted** and recorded
(the staffing matter); one upcoming and unrecorded; one belonging entirely to
Westgate.

**Individual consent, per participant.** All five statuses appear:
`consented` (verbal and written), `declined`, `not_applicable` (invited but
absent), `pending`, and `withdrawn` — the last recorded *after* the meeting
was recorded, which is the case most likely to be mishandled and the one that
most clearly shows why retention cannot be settled by engineering.

**Two synthetic transcripts** with seven lines of invented dialogue about
invented business — a timetable clash, a tutorial reallocation.

**Five AI extractions**: two approved, three pending, two of them flagged
`needs_clarification` with a null owner and null deadline. That last pair is
deliberate: the model is instructed to leave what the transcript did not say
empty rather than supply a plausible name.

**Five tasks**, one of them created from an approved extraction so the
provenance link is exercised. **Four daily work entries. Four documents**,
one marked restricted. **One MFA reset request**, approved by the second
Super Admin, never by the subject.

### What the dataset deliberately does not contain

**No audio.** The recording rows describe files that do not exist. Likewise
the storage rows: they describe objects, not bytes. Recording stays switched
off — `recording_enabled` is `false` and the eligibility rule is `disabled` —
and the dataset does not change that.

**No retention.** All four scopes remain disabled, with no period and status
`pending_approval`. A test asserts this after loading, so the dataset cannot
quietly turn deletion on.

---

## 4. Running It

```bash
npm run db:evaluate
```

Rebuilds a local database from the real migration files, loads the dataset,
and prints an access matrix: how many rows each of the ten personas can
actually read from thirteen tables, plus the same comparison with and without
a verified second factor.

Query it yourself as any persona:

```bash
npm run db:evaluate -- --keep --as meera --sql "select content from public.transcript_segments"
```

```bash
npm run db:evaluate -- --keep --as priya --sql "select content from public.transcript_segments"
```

Meera is a coordinator and gets nothing. Priya attended and gets the
transcript. That one pair is the clearest demonstration of the access model
in the whole system.

`--keep` skips the rebuild so your previous state survives.

---

## 5. What to Look At

The matrix should show, among other things:

| Expectation | Why it matters |
|---|---|
| Meera and Arjun see **0** transcripts | A coordinator who was not there cannot hear the meeting |
| Lakshmi sees **1** transcript, Priya sees **2** | Participation grants access; oversight is the Super Admin's |
| Only Priya and Ravi see the **restricted** meeting | It is invisible to the rest of the team |
| Deepak sees **0** of Northfield's rows, in every table | Cross-team isolation |
| Former Staff sees **0** everywhere but their own profile | Suspension applies system-wide |
| At `aal1`, Priya sees **0** of everything but her own profile | Mandatory MFA, enforced by the database |

The `aal1` column is worth dwelling on. It is the same Super Admin, signed in
with the correct password, reaching nothing. That is the central security
claim of the whole project, and here it is a number you can read.

---

## 6. What Loading This Data Found

Two defects, neither visible in the minimal fixtures the other suites use.

**The audit trail leaked across teams.** Most audit rows carried no team,
because the trigger copied one only from tables with a `team_id` column.
Measured here, Westgate's Super Admin could read **35 of Northfield's 50**
audit entries — including 18 consent changes naming who agreed to be
recorded, 2 recordings with their storage paths, and 10 profile changes.

This had been recorded in an earlier report as a residual gap that was
"identical in a single-team deployment". That was true, and it was also too
comfortable a way to describe a gap covering most of the trail. Fixed in
migration 0018 by resolving a team for every auditable entity.

**A restricted meeting's consent register was readable by any coordinator.**
The policy admitted anyone who could *manage* the meeting, and managing does
not consider confidentiality. So Meera — who cannot see that the staffing
meeting exists — could read its consent register, which names its two
participants and records that one withdrew consent. Also fixed in 0018.

Both now have regression tests in `supabase/tests/evaluation.test.ts`.

---

## 7. Rules for This Dataset

- **Fictional only.** If a real name, address, meeting title or document
  appears here, the dataset has become institutional data and everything in
  the deployment restrictions applies to it.
- **Local only.** It is never loaded into a hosted project. Nothing in the
  repository does so, and nothing should be added that could.
- **It must not change policy state.** Recording stays off, retention stays
  pending. Tests assert both after loading.
- **It is disposable.** `npm run db:evaluate` drops and rebuilds. Do not put
  anything in the evaluation database you would mind losing — which is
  another way of saying do not put anything real in it.

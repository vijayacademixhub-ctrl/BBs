# AcademicOS — user guide

The Baseline Builders operations site: the Master Index as editable
registers, meetings captured as transcripts and dated figures without
keeping any audio, a calendar covering everything with a date on it, and
task and daily-work tracking.

**Live at <https://academicos-chi.vercel.app>**

This file is the manual. Part I is how to use it, Part II is what is still
outstanding, and Part III is for anyone changing the code.

---

# Part I — Using the site

## 1. What it is, in one paragraph

The team's Master Index workbook has become a database that fifteen people
can edit at once. Each sheet is now a *register*: Document Master Index,
Work Allocation, Weekly Review, Source Map and Programme Structure, holding
103 records between them. Everything is edited in place, every change is
recorded with who made it and what it was before, and new columns or whole
new registers can be added from the interface without anyone writing code.
Around that sit the meeting, calendar and task modules.

## 2. Signing in

Open <https://academicos-chi.vercel.app>. Nothing is visible until you sign
in — a visitor who has not signed in sees the sign-in page and no data.

**Sign-in IDs look like `name@bbs.local`.** They are identifiers, not real
mailboxes: nothing is ever emailed to them. Your ID and first password were
issued separately.

**First thing to do: change your password**, at **Settings → Password**. The
password you were given was chosen by someone else and reached you through a
message; until you replace it, whoever saw that message can sign in as you.
It must be at least ten characters — length matters more than punctuation.

**The Super Admin account also needs an authenticator app.** Only that
account does; the other fourteen sign in with a password alone. The reason is
narrow: the Super Admin can reach every team, change people's roles and read
the audit trail. On first sign-in that account is shown a QR code to scan
with Google Authenticator, Microsoft Authenticator or 1Password, and from
then on it asks for a six-digit code at each sign-in.

> **If the Super Admin loses that phone there is no self-service way back.**
> Supabase issues no backup codes. Set it up on a device you will keep, and
> read §10.1 about enrolling a second administrator.

**If a member forgets their password**, the Super Admin resets it in the
Supabase dashboard — see §12.3. There is no "forgot password" link, because
there is no mailbox to send a reset link to.

## 3. The Master Index

### 3.1 The hub

**Master Index** in the sidebar opens the hub, not a table. This is
deliberate: the workbook opened onto a wall of rows, which answered none of
the questions people actually arrive with. The hub answers those instead.

Across the top are the four figures that matter — total records, open items,
records with information missing, and anything overdue. Below them is a card
for each register showing its own counts, what is incomplete, and when it was
last changed. At the bottom is **Recent changes**: every edit, with its
before and after value.

The search box above the cards searches **every column of every register at
once**. Two characters are enough. This is the fastest way to answer "where
is the thing about admissions" without knowing which register it is in.

### 3.2 Opening and editing a register

Click **Open and edit** on a card.

**To change a value: click the cell, type, press Enter.** Escape abandons the
change. In a paragraph field, Enter adds a line break and **Ctrl+Enter**
saves. Each change saves on its own — there is no Save button to forget,
because an index gets edited in passing, between meetings and on phones.

Other things on that screen:

- **The strip at the top** — records, open, incomplete, overdue for this
  register.
- **Search this register**, plus filters for status and owner, a toggle for
  **Incomplete only**, and one for **Show archived**.
- **Column headings sort.** Click once for ascending, again for descending,
  a third time to clear. Empty cells always sort last, because a blank is an
  absence rather than a value.
- **The pencil on a row** opens the full record, including columns hidden
  from the grid. This is also where a record is deleted permanently.
- **The box icon archives a row.** Archived records leave the counts but are
  not destroyed, and **Show archived** brings them back into view. Prefer
  archiving to deleting.
- **A warning triangle** on a row means something expected is missing — an
  owner, a date, a format. Hover to see which.

### 3.3 The Dictionary, and why it matters

**Master Index → Dictionary** is a register like any other, holding the names
and terms the transcription keeps getting wrong. Every term in it is given to
the model *before* it listens to a meeting.

This is the cheapest accuracy improvement available. In testing, *Karshima*
came back as *Kashima*; with the term in the Dictionary it does not. Twenty
terms are already there — the team's names, Lalbagh, CMS, OBE, TLEP, WOW,
Area Chairs. **Add a row whenever you see a name transcribed wrongly**, and
put what it produced in the **Heard as** column.

**Snippets** beside it holds phrases the team writes often. It is a shared
phrasebook at present: the text is there to copy, with no insert button yet.

### 3.4 Adding columns, and adding registers

**Columns** on any register opens the column manager. Give the new column a
name and a type — short text, paragraph, choice, date, link, number or
percentage — and it appears in the grid at once. A choice column takes its
options as a comma-separated list.

Two rules are enforced rather than left to care. A column that came from the
workbook can be **hidden** from the grid but not deleted, because everyone
depends on those. Deleting a column *you* added removes the column and keeps
its values, so adding it back restores what people had written.

**New register** on the hub creates a whole new table — an event calendar, a
committee register, anything. It starts with a Title and a Notes column; add
the rest as they are needed.

### 3.5 The separate window

**Separate window** opens one register in its own operating-system window,
which can sit beside a meeting or on a second screen. It is a real window,
not a tab and not a pop-up panel, and it has no sidebar: it exists to hold
one register. Asking for the same register twice brings the existing window
forward rather than opening a second editable copy of the same rows.

### 3.6 Getting data out

**Export** downloads the register as a CSV that opens in Excel with the
accents and Kannada intact. Archived rows are included and marked, so an
export is a complete picture rather than the current filter.

## 4. Meetings, and capturing them by voice

### 4.1 What is kept, and what is not

**No audio is ever stored.** The microphone stream stays in your browser, is
transcribed in forty-second segments, and each segment is discarded the
moment its text comes back. There is no recording to download afterwards,
because none exists. What is kept is the **note**: the transcript, the data
points, the decisions and the actions.

This is enforced in four places, not just promised: the audio never exists as
one whole file; the server function that transcribes it writes nothing
anywhere; the database column that would record retained audio cannot hold
anything but "false"; and a test records real speech and then inspects what
was stored to confirm no audio field exists.

### 4.2 Capturing a meeting

**Capture** in the sidebar. Choose the meeting, set the spoken language —
**Mixed** handles English, Kannada and Hindi in one sentence and is the right
default — and confirm that everyone present has been told. The microphone is
requested only after that, never before.

While recording you will see the elapsed time, how many segments have been
transcribed, and the transcript appearing as it goes. **Pause** closes the
current segment so nothing is held while paused. A silent stretch is noticed
and not sent at all. **Stop and review** finishes and releases the
microphone.

### 4.3 Turning it into a note

After stopping you can correct the transcript — speech recognition gets names
wrong, and it is easier to fix now than later.

**Propose data points** reads the transcript and pulls out the figures,
decisions and actions, with the date each figure refers to. Given *"the
response rate reached sixty two percent as of the eighteenth of November"* it
produces `Response rate = 62%`, dated 2026-11-18, marked **as of**, with the
sentence it came from quoted underneath.

Everything a model proposes is marked **unverified** and carries a checkbox:
*I have checked this against the transcript*. Nothing it produced is treated
as fact until a person ticks that. It is instructed never to infer a number
or a date that was not said, and to leave a field out rather than guess — a
date inferred from "next month" would read as precision that is not there.

You can also add data points by hand with **Add a data point**, setting the
date and what the date means (as of, due, decided on, or an event date).

**Rewrite the transcript** offers five fixed rewrites — tidy the wording,
format as minutes, condense to points, translate to English, make it formal.
Each changes wording only: every one is instructed never to add, remove,
round or reword a number, a date, a name or a decision, because a model that
tidies 62% into 60% produces something that then reads as what was said.
Check the result before saving; the previous version is kept until you leave
the screen.

**Save notes** writes it all to the database. **Notes** in the sidebar lists
every note, searchable across transcripts and figures.

### 4.4 Working without recording

Recording is not required. **Write or paste a transcript instead** on the
capture screen goes straight to the same review step, and data points can
always be entered by hand. Use this for a meeting already held, or when
recording is not appropriate.

### 4.5 What to expect from the microphone

Chrome, Edge and Firefox on a laptop work well. On an iPhone, Safari stops
recording when the screen locks — keep the screen on, or use the paste route.
If the browser refuses the microphone, the page says so plainly rather than
pretending to record.

## 5. Calendar

**Calendar** gathers everything with a date: meetings, task due dates, and
every dated row in every register. A due date sitting in Work Allocation used
to be invisible until someone opened that register; now it appears beside
everything else. Overdue items are listed first.

**Export .ics** downloads the whole agenda as a calendar file that opens in
Google Calendar, Outlook or Apple Calendar. This needs no setup and works
today.

**Block** writes a single entry to a shared Google Calendar. It is currently
unavailable — see §11.1. When it is connected, pressing Block twice cannot
create two entries: the event's identity is derived from the thing being
blocked, so a repeat press or a retry after a dropped connection is refused
by Google rather than duplicated.

## 6. Tasks and daily work

**Tasks** is personal and team work with status, priority, category, due date
and assignee, filterable by any of them. Anyone can create a task; you can
edit tasks assigned to you and tasks you created.

**Daily Work** is the end-of-day entry: what was completed, what is in
progress, what is pending, and the next day's plan. One entry per person per
day — editing a day amends that entry rather than adding a second account of
it. You can see your own entries and your colleagues'.

## 7. Insights

**Insights** reports what the team has produced: how much of the index has an
owner, how many meetings left a written record, how many extracted figures
carry a stated date, who is carrying the allocation, and who has been keeping
the index up to date.

One figure deserves attention — **how much has been checked**. Figures a
model proposed are not facts until a person has confirmed them against the
transcript, and this says what proportion still has not been.

There is deliberately no word count, no speaking rate and no daily streak.
Rewarding a daily entry creates a reason to file one on a day when nothing
happened, and that entry is worth less than the silence it replaced. The
reasoning is in [docs/wispr-flow-analysis.md](docs/wispr-flow-analysis.md).

## 8. Dashboard

The first screen after signing in. It shows your own due, pending, overdue
and recently completed counts; the Master Index figures with the registers
that need attention; your upcoming meetings; your priority tasks; and recent
daily work across the team. Every figure is a link to the screen it came
from, and all of them are computed from the same records those screens show,
so the two cannot disagree.

## 9. Who can do what

|  | Member (14 people) | Super Admin (you) |
|---|---|---|
| Sign in | Password alone | Password **and** authenticator app |
| Master Index — read | Everything | Everything |
| Master Index — edit records | Everything | Everything |
| Add columns and registers | Yes | Yes |
| Delete a register | No | Only ones not from the workbook |
| Capture meetings and write notes | Meetings they attend | All |
| **Create a meeting** | **No** | Yes |
| Tasks | Create; edit own and created | All in the team |
| Daily work | Own entry; read the team's | All |
| Audit trail | No | Yes |
| Accounts and roles | No | Yes |

Everyone can edit every record in the index. That was a deliberate choice: an
index only one person can correct goes stale. Every change is recorded with
who made it and the previous value, so a mistake is traceable and reversible
rather than prevented.

Full detail in [docs/accounts-and-access.md](docs/accounts-and-access.md).

---

# Part II — What is pending

## 10. Needs a decision from you

**10.1 A second Super Admin.** You are the only one, and that account needs an
authenticator app. A lost or wiped phone would leave nobody able to schedule
meetings, add people or change roles. Promoting one trusted person to Super
Admin removes that single point of failure.

**10.2 Who can schedule meetings.** Only the Super Admin can. Members capture
and write up meetings but cannot create one, so every new meeting waits on
you. The **coordinator** role already exists for exactly this — it can
schedule meetings and verify extractions without seeing the audit trail or
touching accounts. Naming one or two coordinators would unblock the team.

**10.3 Renaming the eleven placeholder accounts.** `member05` to `member15`
are real working accounts with placeholder names. Renaming them is a Super
Admin action in the Supabase dashboard; their records follow them.

**10.4 Everyone changing their password.** Fifteen passwords were issued
through a chat message. Until each person changes theirs at **Settings →
Password**, anyone who read that message can sign in as them.

**10.5 Rotating the Gemini key.** The key was pasted into a chat, so it should
be regenerated in Google AI Studio and replaced in the Vercel environment.
The site keeps working throughout; only the key changes.

**10.6 Whether the site should stay publicly reachable.** The address is open
to anyone who has it, and the sign-in page is what protects the data — which
is the correct arrangement, and the workbook is no longer in the published
JavaScript. If you would rather the address itself were restricted, Vercel's
Deployment Protection can require a Vercel login as well, at the cost of
every team member needing a Vercel account.

## 11. Needs something from Google

**11.1 Calendar blocking.** Not connected. An API key cannot do this: it
identifies a project rather than a person, and Google accepts it only for
reading public data. Writing an event needs a **service account** with the
calendar shared to it, which is free. The steps are in
[docs/calendar-setup.md](docs/calendar-setup.md) §3; once the credentials are
in the Vercel environment, **Block** starts working with no code change.
Until then, **Export .ics** does the same job manually.

**11.2 Drive synchronisation.** Built, waiting on the same credentials.
**Sync from Drive** appears on the Document Master Index once the service
account exists, and refreshes the last-updated date, the file's current Drive
name and a missing owner. It never changes your document names, statuses or
remarks, and it reports any link it could not open.

**11.3 Signing in with a Jain University address.** Built, waiting on an
OAuth client. The button appears on the sign-in page only once Google is
enabled in Supabase, and it sits alongside the password form rather than
replacing it. Each person's email also has to be changed from `@bbs.local`
to their real address before it can match them.

Every step for all three is in
[docs/google-workspace-setup.md](docs/google-workspace-setup.md), with a
nine-line summary at the end.

**11.4 In what order.** The dashboard carries a **Finishing the setup** card
that detects what is outstanding and drops each item as you deal with it.
[docs/setup-walkthrough.md](docs/setup-walkthrough.md) is the companion to
it: the same work arranged into five sittings, shortest and most exposed
first, with what breaks if a step is skipped.

## 12. Not built yet

**12.1 Verification Centre and Academic Assistant.** Listed in the sidebar
and marked as such. The verification gate they depend on already exists in
the database — AI-derived content cannot become a task or calendar event
without human approval — but the review screen and the question-answering
assistant are not written.

**12.2 Reports.** Workload, completion trends and compliance reporting. The
Master Index already shows load by owner inside Work Allocation, which covers
part of it.

**12.3 A Team screen.** Adding people, changing roles, suspending accounts
and resetting passwords are all done in the Supabase dashboard today, not in
the application. Procedures are in
[docs/accounts-and-access.md](docs/accounts-and-access.md) §4. Suspend rather
than delete: a suspended account reaches nothing, while their name stays
attached to what they wrote.

**12.4 Notifications.** The screen exists; nothing generates entries yet.

## 13. Known limits, recorded honestly

**13.1 Sign-up is closed by a dashboard setting, not by the schema.** The
migration that refuses account creation without an invitation could not be
installed, because the managed connection cannot write to Supabase's `auth`
schema. **Check that Authentication → Sign In / Providers → "Allow new users
to sign up" is off.** Someone signing up would reach no data — every policy
requires a profile and a team membership, and they would have neither — but
they would exist.

**13.2 The production branch.** The site is deployed from
`claude/exciting-davinci-brt4gr`, while the repository's default branch is
still the older `claude/compassionate-hawking-mz27z6`. A push to the default
branch could replace the live site with older code. Set the production branch
in Vercel (**Settings → Git**), or merge the working branch into the default.

**13.3 Dormant audio tables.** `recordings`, `transcripts` and the
`meeting-recordings` storage bucket remain in the schema from the earlier
design and are never written to. They were left rather than dropped because
the access-control tests cover them in detail; removing them belongs in its
own change. Anyone auditing the system should know they are there and that
nothing fills them.

**13.4 Retention is unset, on purpose.** No automatic deletion runs for any
class of record. Each policy is marked pending approval, and a database
constraint prevents one being switched on without a recorded approver — see
[docs/retention-and-consent.md](docs/retention-and-consent.md).

**13.5 One team.** Everything is scoped to Baseline Builders. The schema
supports several teams and keeps them strictly apart, but only one exists.

---

# Part III — Running and changing the code

## 14. For developers

Node.js 20 or later. From the repository root:

```bash
npm install
```

```bash
npm run dev
```

With no `VITE_SUPABASE_*` values set, the application runs with no backend:
registers appear with their columns and no records, and it says so. With them
set it uses real accounts and real rows.

| Command | Purpose |
|---|---|
| `npm run dev` | Development server on port 5173 |
| `npm run build` | Production build into `apps/web/dist` |
| `npm test` | Unit tests |
| `npm run typecheck` | TypeScript, no emit |
| `npm run test:db` | Database security suite — 221 tests against PostgreSQL |
| `npm run verify:registry` | Browser verification of the Master Index — 30 checks |
| `npm run verify:capture` | Browser verification of audio-free capture — 20 checks |
| `npm run verify:live` | End to end against a real backend and key — 18 checks |

The browser verifications need `npm run preview` running, and the capture
ones need a microphone — on Linux, `xvfb-run -a npm run verify:capture`.

## 15. Rules the code keeps

1. **The browser never holds a secret.** Transcription, extraction and
   calendar writes go through functions on the deployment that read their
   keys from the server environment. A variable prefixed `VITE_` is published
   in the bundle, so no secret may ever carry that prefix.
2. **Authorisation is the database's job.** Row Level Security decides every
   row. Deleting every role check in the interface would not reveal one extra
   record.
3. **Meeting audio is never stored**, and the database constraint says so as
   well as the interface.
4. **AI output is never an official record** until a person approves it,
   enforced by a database trigger rather than by application code.
5. **The team's real data never ships to the browser.** The workbook lives in
   `api/_workbook`, read only by the server function that imports it.

## 16. Documents

| Document | Contents |
|---|---|
| [docs/accounts-and-access.md](docs/accounts-and-access.md) | The fifteen accounts, roles, two-factor policy, adding and removing people |
| [docs/setup-walkthrough.md](docs/setup-walkthrough.md) | The remaining setup in the order to do it, and the dashboard card that tracks it |
| [docs/google-workspace-setup.md](docs/google-workspace-setup.md) | Everything Google: the service account, the locked calendar, Drive sharing, Jain sign-in |
| [docs/wispr-flow-analysis.md](docs/wispr-flow-analysis.md) | What was taken from Wispr Flow, what was declined, and why |
| [docs/master-index.md](docs/master-index.md) | The register model, editing, adding columns, the separate window |
| [docs/audio-free-capture.md](docs/audio-free-capture.md) | Why no audio is kept, and what makes that true rather than claimed |
| [docs/calendar-setup.md](docs/calendar-setup.md) | ICS today; the Google service account, and why an API key cannot work |
| [docs/vercel-deployment.md](docs/vercel-deployment.md) | Deploying, environment variables, and who can see the result |
| [docs/architecture.md](docs/architecture.md) | System design, modules, folder structure, security |
| [docs/database-architecture.md](docs/database-architecture.md) | Entity relationships, key DDL, RLS policies, the AI approval gate |
| [docs/security-model.md](docs/security-model.md) | Who can access what, how it is enforced, what is verified |
| [docs/mfa-setup.md](docs/mfa-setup.md) | Two-factor authentication and what recovery exists |
| [docs/retention-and-consent.md](docs/retention-and-consent.md) | Both policies are unapproved; what you need to decide |
| [docs/backup-and-recovery.md](docs/backup-and-recovery.md) | Backup plan, restore procedures, responsibilities |
| [docs/m3-migration-runbook.md](docs/m3-migration-runbook.md) | Every migration: purpose, dependencies, validation, rollback |

Older milestone and planning documents remain in `docs/` and describe how the
system reached this point.

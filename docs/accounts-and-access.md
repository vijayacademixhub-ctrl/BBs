# Accounts and access

## 1. Who exists

Fifteen accounts on the team **Baseline Builders**, created 20-Nov-2026:
one Super Admin and fourteen members. Four carry real names from the
workbook; the rest are numbered placeholders to be renamed.

Sign-in addresses are `name@bbs.local`. The domain is deliberately not a real
one: nothing is ever emailed to it, so no message can go astray while the
system is being set up. Changing someone's address later is a Super Admin
action and does not affect their records, which are keyed by account id.

**Passwords were issued once, in the setup conversation, and are not stored
in this repository.** Anyone who still has that conversation can sign in as
anyone whose password has not been changed. Everyone should change theirs at
**Settings → Password** on first sign-in; until they do, treat the account as
shared with whoever saw the list.

## 2. What a member can do

| | Member | Super Admin |
|---|---|---|
| Sign in | Password alone | Password **and** an authenticator app |
| Master Index — read | Every register | Every register |
| Master Index — edit | Every record, every column | Every record, every column |
| Add a column or a register | Yes | Yes |
| Delete a register | No | Only one not imported from the workbook |
| Tasks | Create; edit their own and those they created | Everything in the team |
| Daily work | Their own entry; read the team's | Everything |
| Meetings — see | Those they take part in, and the team's internal ones | All |
| Meetings — create | **No** | Yes |
| Meeting notes, transcripts, data points | Meetings they took part in | All |
| Audit trail | No | Yes, for their own team |
| Accounts and roles | No | Yes |

Two consequences worth being deliberate about.

**Only the Super Admin can schedule a meeting.** Members capture and write up
meetings but cannot create one. With fourteen members and one administrator,
that makes every new meeting depend on one person. If that becomes a
bottleneck, the fix is to make one or two people **coordinators** — a role
that already exists, sits between member and Super Admin, and can schedule
meetings and verify AI extractions without gaining access to the audit trail
or to account management.

**Everyone can edit every record in the index.** That was chosen knowingly:
an index only one person can correct goes stale. Every change is recorded
with who made it and what the value was before, so a mistake is traceable and
reversible rather than prevented.

## 3. Two-factor authentication

Required of Super Admin accounts, and of no others. That account can reach
every team, change roles and read the audit trail; the others cannot.

It is enforced in two places that must agree: a restrictive Row Level
Security policy on every table, and the interface's routing. They disagreed
once — the database had been narrowed and the interface had not, so every
member who signed in was parked on an enrolment screen they could not leave.
Both now decide from the same rule.

Supabase issues no backup codes. A Super Admin who loses their authenticator
has no self-service route back; the recovery procedure is in
[mfa-setup.md](mfa-setup.md) §4, and the request and approval are recorded in
`mfa_reset_requests`. **Set up the authenticator on a device you will keep,
and consider enrolling a second Super Admin** so that one lost phone is not
one lost system.

## 4. Adding and removing people

Both are Super Admin actions in the Supabase dashboard — the application's
Team screen is not built yet.

**Adding** means creating the account under Authentication, then a matching
`profiles` row and a `team_members` row with the role. The `profiles` row is
what the application reads; without it the person signs in and reaches
nothing.

**Removing** means setting `profiles.status` to `suspended`, not deleting.
Every policy requires an active account, so a suspended one satisfies none of
them and reaches nothing — while their name stays attached to what they
wrote. Deleting the account would strip authorship from records that are
supposed to say who made them.

## 5. One gap, recorded

The schema has a trigger, `auth.enforce_invitation_only`, that refuses any
account creation without an open invitation. It is **not installed on the
deployed database**: the managed connection used to apply the migrations
cannot write to Supabase's `auth` schema.

What this means in practice: if public sign-ups are enabled in the Supabase
dashboard, anyone could create an account. They would reach no data — a new
account has no `profiles` row and no team membership, and every policy
requires both — but they would exist.

**Check that Authentication → Sign In / Providers → "Allow new users to sign
up" is off.** That setting, not the trigger, is what currently closes the
door.

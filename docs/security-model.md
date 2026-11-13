# Security Model

How access is decided in AcademicOS, what is enforced where, and what has
been verified.

---

## 1. The Controlling Principle

> Authorisation is enforced by PostgreSQL. Everything in the browser is
> presentation.

The frontend hides controls a user cannot use. If every one of those checks
were deleted, no user would gain access to a single additional row, because
the browser talks to PostgREST using that user's own token and every query it
can issue is already constrained by Row Level Security.

This is why the test suite runs against the database rather than the
interface. Testing that a button is hidden proves nothing about whether the
data is reachable.

## 2. Layers

| Layer | Enforces | Can it be bypassed from a browser? |
|---|---|---|
| Table privileges (`GRANT`/`REVOKE`) | Whether a role may touch a table at all | No. Checked before any policy. |
| Row Level Security | Which rows a role may see or change | No. |
| Triggers | Invariants that must hold regardless of role — the AI approval gate, role-escalation guards, closed registration | No. Not even the service role: the AI gate is a trigger, and `BYPASSRLS` does not bypass triggers. |
| Frontend guards | Which controls are drawn | Yes, trivially. Not relied upon. |

## 3. Roles

Held per team in `team_members.role`.

| | Super Admin | Coordinator | Member |
|---|---|---|---|
| Create and suspend accounts | Yes | No | No |
| Assign roles | Yes | No | No |
| Create meetings | Yes | Yes | No |
| Edit a meeting | Yes | Yes | If organiser |
| Read a transcript | **Yes (oversight)** | **Only if a participant** | **Only if a participant** |
| Verify AI extractions | Yes | Yes, if a participant | No |
| Assign tasks | Yes | Yes | No |
| Update own tasks | Yes | Yes | Yes |
| Read others' daily work | Yes | Yes | No |
| Read audit logs | Yes | No | No |
| Change retention policy | Yes | No | No |
| Delete a recording | Yes | No | No |

### 3.1 Why a Coordinator Cannot Read Every Transcript

Team membership grants visibility of *scheduling*. It does not grant access
to what was said.

A coordinator who was not in a meeting has no more access to its recording,
transcript, segments or AI extractions than any other member. Their role
lets them run academic operations — create meetings, assign work — not listen
to conversations they were not part of.

This follows the instruction not to grant broad access merely because someone
belongs to the team, and it is the behaviour you would want if the meeting
concerned you. Only the Super Admin has standing oversight of content, and
every such access can be recorded through `log_content_access()`.

A test asserts this specifically, because it is the kind of restriction that
quietly erodes:

> *a COORDINATOR who did not attend reads nothing — role does not override participation*

## 4. Access to Meeting Content

Two gates, deliberately different in width.

**`can_view_meeting()`** — the meeting record: title, time, location.
Participants, the organiser, and — for `internal` meetings only — the team.

**`can_access_meeting_content()`** — audio, transcript, segments, AI
extractions, consent register. Participants, the organiser, and the Super
Admin. Team membership is not sufficient, and no role substitutes for having
been there.

A meeting marked `restricted` is invisible even as a calendar entry to
anyone who was not invited.

## 5. Suspension

`profiles.status` is checked by `is_active_user()`, which every other helper
is built on. A suspended account therefore fails every policy in the system
at once, rather than table by table.

Accounts are suspended, never deleted. Deleting one would remove the
attribution from meetings they organised and work they recorded. The schema
reinforces this: foreign keys from institutional records to `profiles` are
`on delete restrict` or `set null`, never `cascade`. Only a user's own data —
preferences, notifications, daily logs, calendar connections — cascades. A
structural test asserts exactly that list.

## 6. Closed Registration

Two independent controls.

1. **Supabase setting** — "Allow new users to sign up" is OFF.
2. **Database trigger** — `auth.enforce_invitation_only()` refuses any insert
   into `auth.users` without a matching open, unexpired invitation.

The second exists because the first lives in a dashboard and can be changed
by anyone with console access, including by accident. The trigger fails the
insert regardless.

The first account is exempt, and only while the instance has no profiles at
all. That exemption closes permanently the moment one exists.

This defect was caught by the test suite during development: the function was
written but the trigger was never attached, so registration was not in fact
closed. That is the argument for testing security properties rather than
reviewing them.

## 7. The AI Verification Gate

> AI output cannot become an official record without a human decision.

Enforced by `enforce_verified_ai_source()`, a trigger on `tasks` and
`calendar_events`. A row citing an extraction whose state is not `approved`,
`modified` or `published` is refused by PostgreSQL.

Because it is a trigger and not a policy, **the service role cannot bypass
it either**. The AI service holds a key that bypasses RLS; it does not bypass
this. A test asserts that specifically.

## 8. Secrets in the Database

**Calendar OAuth tokens** live in `public.calendar_credentials`, which has
RLS enabled and **no policies at all**. With RLS on and no policy, every row
is invisible. Privileges are revoked from `authenticated` as well. The result
is that no browser session can read a refresh token — not the owner's, not a
Super Admin's. Only the service role can.

They are kept in a separate table from `calendar_connections` precisely so
that a policy mistake on the connection table cannot expose a token: the
token is not there to expose.

**The audit trail** redacts token-shaped fields before writing. A test
asserts that inserting a credential produces no audit row containing the
secret.

## 9. The Audit Trail

Append-only, three ways:

1. No `UPDATE` or `DELETE` policy exists.
2. `INSERT`, `UPDATE` and `DELETE` are revoked from `authenticated`, so even
   a careless future policy could not open them.
3. Rows arrive only through `log_audit()`, which is `SECURITY DEFINER` and
   not executable by `authenticated`.

A Super Admin can read it and cannot alter it. That is the point: a trail its
own administrator can edit is not evidence of anything.

Reads of confidential content cannot be caught by a trigger, because `SELECT`
does not fire one. `log_content_access()` is called explicitly at the moment
a signed URL is minted or a transcript opened — the point at which content
actually reaches a person.

## 10. Storage

Four private buckets. None is public, and a trigger refuses any attempt to
make one public.

Storage policies mirror the database policies exactly, so a file cannot be
reached through Storage that the database would refuse. Paths encode the
team and meeting (`{team_id}/{meeting_id}/…`) and the policies read those
segments.

Files are served only through short-lived signed URLs, minted for a caller
who has already passed the same checks. No table stores a URL: check
constraints on `recordings.storage_path` and `documents.storage_path` refuse
anything beginning `http://` or `https://`, so a permanent public link cannot
be recorded even by mistake.

There is no external sharing feature, by design.

## 11. What Is Verified, and What Is Not

### Verified by the local suite — 95 tests

Anonymous access refused on every table; unknown-subject tokens; suspended
accounts; participation-based content access including the coordinator case;
cross-team isolation; self-promotion, self-addition and coordinator
escalation; the AI gate including service-role bypass; audit immutability and
redaction; calendar secret isolation; storage policies and the public-bucket
guard; constraints and uniqueness; closed registration including expiry; the
consent register's provenance requirement; retention being inert; and
`INSERT … RETURNING` behaviour.

### Structural tests — 6

RLS enabled on every table; the set of policy-free tables fixed; `anon` holds
no privilege on any table; every `SECURITY DEFINER` function pins its
`search_path`; buckets private with limits; profile deletion never cascades
into institutional records.

### Not verified locally, and cannot be

| Property | Why | Where it is checked |
|---|---|---|
| Password sign-in, lockout, expiry | GoTrue is not reproduced locally | Against the hosted project |
| Signed URL expiry | Issued by the Storage API | Against the hosted project |
| Rate limiting | Platform behaviour | Against the hosted project |
| Dashboard auth settings | Configured outside the repository | `docs/supabase-setup.md` §4 |

The gap is deliberate and bounded. What the local suite proves is that the
schema and its policies behave correctly; what it cannot prove is that the
hosted platform is configured as instructed. §9 of the setup document covers
the latter, and it needs doing once, after deployment.

## 12. Known Weaknesses

Stated because they are real, not because they are acceptable indefinitely.

- **Role is read per request** rather than embedded in the JWT. A role change
  takes effect immediately, which is the behaviour wanted for suspension, at
  the cost of a lookup per policy evaluation. Indexed, and fine at this scale.
- **A Super Admin is highly privileged.** They can read every transcript and
  suspend anyone. The audit trail records what they do and they cannot alter
  it, but there is no second-person approval for administrative actions. For
  ten people that is proportionate; for a larger deployment it would not be.
- **No MFA.** Supabase supports it. For a system holding confidential
  institutional records it should be enabled before real data is entered,
  and it is worth doing at the same time as the first account.
- **Team creation is effectively server-side only.** The policy requires a
  Super Admin role *in the team being created*, which cannot be satisfied for
  a team that does not yet exist. Deliberate, since the system is scoped to
  one team, but it means a second team needs the service role.

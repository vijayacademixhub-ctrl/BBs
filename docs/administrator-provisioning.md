# Administrator Provisioning

How the first two Super Admin accounts are created. Nothing here has been
done; no account exists.

**Two accounts, not one.** With mandatory MFA and no backup codes, a single
Super Admin who loses their authenticator cannot be recovered from inside the
application. This is the most likely way to lose control of the system, and
it is prevented by a procedure rather than by code.

---

## 1. Rules

| Rule | Why |
|---|---|
| Individual accounts only | An action in the audit trail must be attributable to a person. A shared account makes every entry say "someone". |
| No shared credentials, ever | Including "just for setup". Setup accounts become permanent. |
| TOTP MFA mandatory | Enforced by the database: a password-only session reaches no confidential record. |
| Independent dashboard access | Each administrator has their own Supabase dashboard login with its own MFA and recovery codes. |
| No public registration | Accounts come from invitations. The database refuses anything else. |
| Every administrative action audited | Automatic. Super Admins can read the trail and cannot alter it. |

**Nothing secret goes in writing here.** No password, TOTP secret, QR code or
recovery code may be placed in source code, `.env.example`, a log, a commit
message, a screenshot, or this repository. A secret that has been written
down in a shared place is already shared.

---

## 2. Before You Start

- [ ] Two named people identified. Not one person with two addresses — that
      reproduces the single point of failure with extra steps.
- [ ] Both have institutional email addresses that work. Test by sending one
      a message before you rely on it.
- [ ] Both have an authenticator app installed: Google Authenticator,
      Microsoft Authenticator, 1Password, Authy or Bitwarden.
- [ ] Both have their own Supabase dashboard login, with dashboard MFA
      enabled and recovery codes **printed and stored physically** in separate
      places.
- [ ] Migrations applied and the post-migration checks pass
      (`docs/m3-migration-runbook.md` §4).

That fourth item is the one people defer. Supabase's dashboard MFA *does*
issue recovery codes, unlike the application's TOTP. They are the last way
back into the project if both application administrators are locked out.

---

## 3. The First Super Admin

Registration is closed, which creates a chicken-and-egg problem. The database
resolves it: `auth.enforce_invitation_only()` permits a user to be created
while the instance has **no profiles at all**. That exemption closes
permanently the moment one exists — you get exactly one.

### 3.1 Create the auth user

Dashboard → Authentication → Users → **Add user**.

- Email: the first administrator's institutional address
- **Auto Confirm User: ON** — they cannot receive a confirmation email before
  their profile exists
- Password: let them set it themselves via a recovery link, or generate one
  and hand it over in person. **Not by email, and not in a chat message.**

Copy the generated **user UUID**.

### 3.2 Create the profile and membership

SQL Editor. Substitute the real values; the placeholders below contain
nothing secret and nothing real.

```sql
begin;

insert into public.teams (name, slug)
values ('Academic Office', 'academic-office');

insert into public.profiles (id, email, full_name, designation, status)
values (
  '<user-uuid-from-step-3.1>',
  'first.admin@your-institution.ac.in',
  'First Administrator',
  'Research Lead',
  'active'
);

insert into public.team_members (team_id, profile_id, role)
select t.id, '<user-uuid-from-step-3.1>', 'super_admin'
from public.teams t where t.slug = 'academic-office';

insert into public.user_preferences (profile_id)
values ('<user-uuid-from-step-3.1>');

commit;
```

Note: `profiles.status` must be `'active'`. The default is `'invited'`, and
an invited profile satisfies no policy — the account would sign in and see
nothing, which looks exactly like a broken deployment.

### 3.3 Confirm the exemption has closed

```sql
-- As a sanity check, try to add a second user in the dashboard.
-- The database must now refuse it:
--   "Registration is closed. An account can only be created from an open invitation"
```

If it succeeds, the trigger from migration 0003 did not apply. Stop and fix
that before going further; registration is not actually closed.

### 3.4 First sign-in and enrolment

1. The administrator signs in with email and password.
2. The application redirects them to `/mfa` — they can reach nothing else.
3. They scan the QR code with their authenticator app.
4. They enter the six-digit code. The factor is only marked verified once a
   correct code is accepted, so a mis-scanned code cannot lock them out.
5. They land on the dashboard.

**The TOTP secret is shown once.** Supabase does not return it again and
nobody can recover it — not the application, not the other Super Admin, not
Supabase. If they do not complete step 4, they must start enrolment again.

---

## 4. The Second Super Admin

**Do this immediately. Not "later".** Until it is done the system has a single
point of failure, and the window is exactly when nobody is thinking about it.

### 4.1 Raise the invitation

As the first Super Admin, signed in and MFA-verified:

```sql
insert into public.user_invitations (email, team_id, role, full_name, designation, invited_by)
select
  'second.admin@your-institution.ac.in',
  t.id,
  'super_admin',
  'Second Administrator',
  'Coordinator',
  '<first-admin-uuid>'
from public.teams t where t.slug = 'academic-office';
```

The invitation expires after 14 days. Only one open invitation per address is
allowed — a second must replace the first, not sit alongside it.

### 4.2 Create the account

Dashboard → Authentication → Users → **Add user**, with the invited address.
The trigger checks for an open, unexpired invitation and permits it.

Then the profile and membership, as in §3.2 — `status = 'active'`, role
`super_admin`.

### 4.3 Close the invitation

```sql
update public.user_invitations
set status = 'accepted', accepted_at = now(), accepted_by = '<new-user-uuid>'
where email = 'second.admin@your-institution.ac.in' and status = 'pending';
```

### 4.4 Enrolment

As §3.4, by the second administrator on their own device.

### 4.5 Confirm there are two

```sql
select p.full_name, p.email, p.status, tm.role
from public.team_members tm
join public.profiles p on p.id = tm.profile_id
where tm.role = 'super_admin';
-- expect two rows, both status = 'active'
```

The database will not let the last Super Admin be removed —
`guard_team_membership` raises "A team must retain at least one Super Admin."
That protects against removing the only one; it does not create the second.

---

## 5. The Remaining Team Members

The same invitation flow, with role `coordinator` or `member`. Once both
Super Admins exist this is routine, and either can do it.

Roles, in short: **Super Admin** administers accounts and has oversight of
content; **Coordinator** runs meetings and assigns work but **cannot read a
transcript of a meeting they did not attend**; **Member** does their own work
and sees meetings they were invited to. `docs/security-model.md` §3 has the
full matrix.

---

## 6. Recovery

### 6.1 A member loses their authenticator

1. They contact a Super Admin **out of band** — in person, or by a channel
   where identity can be established. **Not by email alone:** an attacker who
   has the password very likely has the mailbox too.
2. The Super Admin verifies identity, against a staff ID where possible, and
   records how.
3. The Super Admin raises and approves a reset:

```sql
insert into public.mfa_reset_requests
  (profile_id, reason, requested_by, status, approved_by, approved_at, identity_check)
values (
  '<subject-uuid>',
  'Authenticator device lost; replacement issued.',
  '<super-admin-uuid>',
  'approved',
  '<super-admin-uuid>',
  now(),
  'Identity verified in person against staff ID card.'
);
```

   The database refuses an approval that names no approver and time, and
   refuses one where the approver is the subject.

4. A **server-side operator** removes the factor using the service-role key,
   or in the dashboard under Authentication → Users → the user → Factors.
5. Mark the request `completed`.
6. The user signs in and enrols again.

The request table exists so the decision is recorded. Removing a factor in
the dashboard alone leaves no trace in the application's own records, and
"who authorised this, and on what basis" would be unanswerable.

### 6.2 One Super Admin is locked out

The other performs §6.1. This is the entire reason for having two.

### 6.3 Both Super Admins are locked out

The only route is the Supabase **dashboard**, which is a separate account with
its own credentials and its own recovery codes — the ones you were asked to
print in §2. From there the factors can be removed directly.

If those codes were never stored, recovery depends on Supabase support and
the organisation owner's account. Do not end up here.

### 6.4 Someone leaves

**Suspend, do not delete.**

```sql
update public.profiles
set status = 'suspended', suspended_at = now(), suspended_by = '<super-admin-uuid>'
where id = '<leaver-uuid>';
```

A suspended account fails every policy immediately. Deleting the profile would
remove attribution from meetings they organised and work they recorded, and
the schema is built to prevent that — foreign keys from institutional records
are `restrict` or `set null`, never `cascade`.

If the leaver was a Super Admin, **appoint a replacement first**. The database
will refuse to remove the last one.

---

## 7. What Is Audited Automatically

Every change to a profile, team membership, invitation, meeting, recording,
transcript, consent record, retention policy, application setting, calendar
connection, document and MFA reset request.

Each entry records who, what, before, after and when. Token-shaped fields are
redacted before writing. The trail is append-only: no `UPDATE` or `DELETE`
policy exists, those privileges are revoked from `authenticated`, and inserts
go only through a `SECURITY DEFINER` function members cannot call.

A Super Admin can read it and cannot alter it. That is the point — a trail
its own administrator can edit is not evidence of anything.

Reads of confidential content cannot be caught by a trigger, because `SELECT`
does not fire one. The application calls `log_content_access()` at the moment
a signed URL is minted or a transcript opened, which is when content actually
reaches a person.

---

## 8. Checklist

- [ ] Organisation owned by the institution, not an individual
- [ ] Two named Super Admins, individual accounts, no shared credentials
- [ ] Both enrolled in TOTP MFA on their own devices
- [ ] Both have independent Supabase dashboard access
- [ ] Dashboard MFA enabled for both, recovery codes printed and stored in
      two separate physical places
- [ ] A direct user creation in the dashboard is now refused by the database
- [ ] `select count(*) ... where role = 'super_admin'` returns 2
- [ ] Both have signed in, completed MFA, and seen the dashboard
- [ ] No password, secret, QR code or recovery code has been written into any
      file, log or message

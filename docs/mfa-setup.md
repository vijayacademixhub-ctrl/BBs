# Multi-Factor Authentication

**Mandatory for every AcademicOS account.** A session that has not verified a
second factor can reach no confidential record, and that is enforced by
PostgreSQL rather than by the interface.

---

## 1. How It Is Enforced

Supabase records the strength of a session in the `aal` claim of the access
token: `aal1` for password alone, `aal2` once a second factor has been
verified. A token with no `aal` claim counts as `aal1`.

Every table in the application schema, and `storage.objects`, carries a
**restrictive** policy requiring `aal2`:

```sql
create policy require_mfa on public.<table>
  as restrictive
  to authenticated
  using (public.is_mfa_verified())
  with check (public.is_mfa_verified());
```

A restrictive policy is ANDed with every permissive policy on the table. That
matters more than it might appear: if the requirement were folded into one of
the helper functions instead, a permissive policy written later that forgot to
call that helper would open the table to password-only sessions and nothing
would complain. With a restrictive policy there is nothing to forget.

Supabase offers no setting that makes MFA compulsory — the dashboard only
enables the enrolment and verification APIs. Compulsion is this policy.

### 1.1 The One Carve-Out

A user who has not yet enrolled signs in at `aal1` and must reach the
enrolment screen, which needs to show them who they are signed in as. So
`profiles` carries a narrower restriction:

```sql
using (public.is_mfa_verified() or id = auth.uid())
with check (public.is_mfa_verified())
```

They can read their own row and nothing else: not a colleague's profile, not
the team list, and no write of any kind. Everything else stays closed.

### 1.2 What Is Not Affected

The **service role** bypasses RLS entirely and is unaffected. That is correct:
the AI service authenticates with a key held on a server, not with a browser
session, and an assurance level has no meaning for it.

---

## 2. Enabling It on the Project

In the dashboard, under Authentication → Multi-Factor Authentication:

| Setting | Value | Note |
|---|---|---|
| TOTP (App Authenticator) enrolment | **Enabled** | Required, or nobody can enrol |
| TOTP verification | **Enabled** | Must stay enabled. Disabling it disables the challenge and verify APIs, which would lock out every enrolled user rather than relaxing the requirement |
| Phone factors | Disabled | Adds an SMS provider and a cost, and SMS is the weaker factor |
| Maximum enrolled factors | 10 | The default is fine |

`supabase/config.toml` carries the same values for local development. The two
are configured separately; the dashboard governs the hosted project.

---

## 3. What a User Experiences

**First sign-in.** Email and password, then the enrolment screen: a QR code to
scan with an authenticator app, then a six-digit code to confirm it worked.
The code they enter proves the app is set up correctly before the factor is
marked verified — so a mis-scanned code cannot leave them locked out.

**Every sign-in after that.** Email and password, then a six-digit code.

**If they go to a page directly** without verifying, they are redirected to
`/mfa` rather than shown an empty screen. This follows Supabase's own
guidance: encountering a lower assurance level than expected usually means
the user closed a tab mid-flow or left one open overnight, and the useful
response is to let them finish rather than to show an error.

Supported authenticator apps: Google Authenticator, Microsoft Authenticator,
1Password, Authy, Bitwarden — anything implementing standard TOTP.

---

## 4. Recovery — Read This Before Deployment

**Supabase's TOTP implementation issues no backup codes.** There is no
self-service recovery. A user who loses their authenticator device cannot get
back in by themselves, and neither the application nor the Super Admin can
retrieve the original secret — it is shown once, at enrolment, and never
again.

This is the single most likely cause of a support incident, and it is worth
understanding before the first account exists rather than during the first
lockout.

### 4.1 Ordinary Recovery — a User Loses Their Device

1. The user contacts the Super Admin **out of band** — in person, or by a
   channel where their identity can be established. Not by email alone: an
   attacker who has compromised the password very likely has the mailbox too.
2. The Super Admin **verifies identity**, in person against a staff ID where
   possible, and records how they did so.
3. The Super Admin raises a reset in `public.mfa_reset_requests` with the
   reason and the identity check, and marks it approved. The database refuses
   an approval that does not name an approver and a time, and refuses one
   where the approver is the subject.
4. A **server-side operator** performs the actual removal with the
   service-role key:

```bash
curl -X DELETE \
  "$SUPABASE_URL/auth/v1/admin/users/$USER_ID/factors/$FACTOR_ID" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

   It can also be done in the dashboard under Authentication → Users → the
   user → Factors. Either way the request row is then marked `completed`.
5. The user signs in and is taken through enrolment again.

The request table exists so this decision is recorded and audited. Removing a
factor in the dashboard alone leaves no trace in the application's own
records, and "who authorised this reset, and on what basis" would then be
unanswerable.

### 4.2 The Hard Case — the Sole Super Admin Is Locked Out

If there is one Super Admin and they lose their device, nobody inside the
application can help them. The only route is a Supabase **dashboard** login,
which is a separate account with its own credentials.

Two things prevent this becoming a crisis, and both must be done at setup:

1. **Appoint at least two Super Admins.** One person holding the only
   administrative account is a single point of failure for the whole system,
   not just for MFA.
2. **Make sure more than one person can reach the Supabase dashboard**, and
   that *those* accounts have MFA enabled with their recovery codes stored
   somewhere physical. Supabase's own dashboard MFA does issue recovery codes.

Record both in whatever the institution uses for operational continuity. This
is a procedural control; no amount of code substitutes for it.

### 4.3 Suspension Is Not Recovery

Suspending an account does not remove its factors, and reactivating it does
not restore access to a lost device. They are independent.

---

## 5. What Has Been Tested, and What Has Not

### Tested against PostgreSQL — 21 assertions

A password-only session reads nothing from any of 21 confidential tables, nor
from storage, nor as a Super Admin. It cannot create a meeting or a task, nor
update its own daily work. A token with no `aal` claim is refused in the same
way. The enrolment carve-out returns exactly one row — the user's own profile
— and permits no write. A verified session works normally, is still bound by
its role, and is still refused if the account is suspended. The reset request
cannot be self-approved, cannot be marked approved without an approver, cannot
be raised by an ordinary member, is visible to its subject and to nobody else,
and is written to the audit trail.

### Not tested, and not testable here

| What | Why |
|---|---|
| Enrolment against a real GoTrue instance | No project exists |
| QR code generation and the TOTP secret | Supabase's, server-side |
| Challenge and verify with a real code | Needs a live auth service |
| That a verified challenge actually issues an `aal2` token | Supabase's |
| Factor removal through the Admin API | Needs the service-role key and a project |

**What this means plainly:** the database half is proven — a session without
`aal2` cannot reach confidential data, demonstrated rather than asserted. The
authentication half is implemented against the documented API and has never
been run. Both halves need to work; only one has been verified.

The verification steps are in `docs/pre-deployment-checklist.md` §3 and take
about fifteen minutes once a project exists.

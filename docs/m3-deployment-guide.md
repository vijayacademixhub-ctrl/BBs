# M3 — Supabase Deployment Guide

**Nothing in this document has been carried out.** No project exists, no
migration has been applied to anything but a local throwaway database, and no
institutional data exists anywhere.

Every step needs your explicit go-ahead. Steps are ordered: a later one
assumes the earlier ones are done.

---

## 1. Account Ownership — Decide This First

The Supabase organisation that owns this project should belong to the
**institution**, not to an individual.

Why it matters more than it looks: the organisation owner controls billing,
can delete the project, and is the last resort when every Super Admin is
locked out. If that account belongs to a student or a staff member who later
leaves, the institution loses control of its own records — and deleting a
Supabase project destroys its backups too.

**Recommended arrangement:**

| | |
|---|---|
| Organisation owner | An institutional account — a departmental address, not a personal one |
| Billing | Institutional |
| Members with dashboard access | At least two named people, each with their own login |
| Dashboard MFA | Enabled on every member account, recovery codes stored physically |

If the project must be created under a personal account to get started, agree
in writing **when** it transfers to the institution, and do it before real
data is entered. Transferring later is possible but involves an organisation
move, which is easier to agree now than to negotiate after.

---

## 2. Region — Verify, Do Not Assume

Target: **Mumbai, `ap-south-1`**.

`ap-south-1` appears in Supabase's published list of supported AWS regions.
That is not the same as it being available to your organisation today, at the
instance size you choose — capacity varies.

**The region dropdown in the creation dialog is authoritative.** It lists only
what you can actually choose.

> **For the EVALUATION project only, the owner has decided that any region
> is acceptable**, on the basis that it will hold synthetic data and no
> institutional record. Prefer `ap-south-1`, then `ap-south-2` (Hyderabad),
> then whatever is offered.
>
> **This decision does not carry into production.** The region cannot be
> changed after creation, so a production project must be created in the
> intended region from the start — which in practice means the ownership
> transfer in `docs/account-ownership-transfer.md` §4 is a *new project in
> the right region*, not a transfer of the evaluation one, unless the
> evaluation project happened to land in an Indian region.
>
> That is worth deciding deliberately rather than discovering later: if the
> evaluation project is created outside India and then quietly becomes
> production, the residency decision will have been made by whatever capacity
> Supabase had that day.

Choose the **specific** region `ap-south-1`, not the "Asia Pacific" general
grouping — the grouping lets Supabase place the project anywhere in the area
based on capacity, which defeats the point of choosing.

**The region cannot be changed afterwards.** Moving means creating a new
project and migrating into it.

---

## 3. Plan — Pro Recommended

**Recommendation: Pro.**

| | Free | Pro (~USD 25/month) |
|---|---|---|
| Automated database backups | **None** | Daily, 7 days retained |
| Database size | 500 MB | 8 GB included |
| Storage | 1 GB | 100 GB included |
| Project pausing | After a week idle | No |

Three reasons the Free plan is a poor fit here, in order of seriousness:

1. **No automated backups at all.** Supabase's own recommendation for Free
   projects is to export regularly and keep off-site copies — that is, to do
   it yourself. For a system holding institutional records, relying solely on
   a script someone remembers to check is a real risk.
2. **Projects pause after about a week of inactivity.** An academic office
   has quiet weeks. A paused project means the application is simply down
   until someone restores it.
3. **1 GB of storage is roughly 65 hours of audio.** That is months rather
   than weeks, but it will be reached, and hitting the ceiling mid-term is
   disruptive.

**What Pro does not solve.** Supabase's backups **exclude Storage objects on
every plan, Pro included**. Meeting recordings need their own backup
arrangement regardless of what you pay. See `docs/backup-and-recovery.md`.

**Point-in-Time Recovery** is a further add-on at roughly USD 100/month for a
seven-day window, and requires a compute add-on. For ten people this is very
unlikely to be warranted; daily backups plus the scheduled dumps in the backup
runbook are proportionate.

**If Free is chosen anyway** — a reasonable call while the system is still
being evaluated — then the scheduled dump and Storage sync in the backup
runbook become mandatory rather than advisable, and the first restore test
must happen before any real meeting is recorded.

---

## 4. Create the Project

1. Name: `academicos-prod` (or `academicos-pilot` if this is a trial).
2. Region: `ap-south-1`, per §2.
3. Database password: generate a long random one, store it in the
   institution's password manager. It is shown once and is not needed for
   normal application use.
4. Record the **project reference** — the subdomain of the project URL.
5. Note the **Postgres major version** and set `major_version` in
   `supabase/config.toml` to match **before applying any migration**.

---

## 5. Authentication Configuration

Dashboard → Authentication. These are security controls, not preferences.
`supabase/config.toml` carries the same values for local development; the two
are configured separately and the dashboard governs the hosted project.

### 5.1 Registration — closed

| Setting | Value |
|---|---|
| Allow new users to sign up | **OFF** |
| Anonymous sign-ins | **OFF** |
| All external OAuth providers | **OFF** |

This is the first of two controls. The second is a database trigger
(migration 0003) that refuses any `auth.users` insert without an open,
unexpired invitation. Defence in depth is deliberate: the dashboard setting
lives where it can be changed by accident.

Each enabled OAuth provider would be a route into the system that the
invitation workflow does not control, which is why all are off.

### 5.2 Email verification

| Setting | Value | Why |
|---|---|---|
| Confirm email | **ON** | Prevents an account being activated from a mistyped address |
| Secure email change | **ON** | A change requires confirmation at both the old and new address |
| Email OTP expiry | 3600 s | |
| Minimum frequency between emails | 60 s | Limits mail-based abuse |

On the built-in SMTP: Supabase's default sender is rate-limited and intended
for development. For a ten-person team it will likely cope, but delivery to
institutional mail servers is unreliable — such servers are often strict about
unfamiliar senders. **If invitation emails do not arrive, that is the cause.**
Configuring a custom SMTP sender on the institution's own domain fixes it and
is worth doing before you invite nine people.

### 5.3 Multi-factor authentication

| Setting | Value |
|---|---|
| TOTP (App Authenticator) enrolment | **Enabled** |
| TOTP verification | **Enabled** |
| Phone factors | Disabled |
| Maximum enrolled factors | 10 |

**Verification must stay enabled.** Disabling it disables the challenge and
verify APIs, which would lock out every enrolled user rather than relaxing the
requirement.

Supabase has no setting that makes MFA compulsory. Compulsion comes from
restrictive RLS policies (migration 0015) requiring an `aal2` claim on every
table and on `storage.objects`. A password-only session reaches no
confidential record regardless of what is configured here.

Phone factors are off: they add an SMS provider and a cost, and SMS is the
weaker factor.

### 5.4 Sessions

| Setting | Value | Effect |
|---|---|---|
| JWT expiry | 3600 s | Bounds how long a stolen token is useful |
| Refresh token rotation | **ON** | A reused refresh token invalidates the session, turning theft into a detectable event |
| Reuse interval | 10 s | Tolerates a genuine race without weakening the above |
| Session timebox | 168 h | A session cannot outlive a working week |
| Inactivity timeout | 8 h | A forgotten signed-in device stops working overnight |

### 5.5 Site URL and redirects

Set **Site URL** to the deployed frontend origin, and add `http://localhost:5173`
to additional redirect URLs for development. An over-broad redirect list is a
standard way to turn an auth flow into an open redirect, so keep it to exactly
these two.

---

## 6. Database Settings

| Setting | Value | Note |
|---|---|---|
| SSL enforcement | **ON** | Refuses unencrypted connections |
| Network restrictions | Consider restricting to the Windows host's IP | Only if that host has a static address. A dynamic one will lock you out. |
| Connection pooling | Default (Transaction mode) | The AI service should use the pooler, not a direct connection |
| Exposed schemas | `public` only | `auth` and `storage` are reached by their own APIs, never through REST |

The AI service connects with the service-role key and should use the pooler
connection string. A laptop that sleeps and wakes will otherwise leave idle
direct connections behind.

---

## 7. Storage

Migration 0012 creates all four buckets as private, with size limits and MIME
allowlists. **Do not create them by hand** — the migration is the record of
what they should be.

| Bucket | Limit | Holds |
|---|---|---|
| `meeting-recordings` | 512 MB | Meeting audio |
| `meeting-attachments` | 50 MB | Files attached to a meeting |
| `academic-documents` | 100 MB | Team documents |
| `exports` | 50 MB | Generated exports, owned by the person who made them |

After migration, confirm in the dashboard that every bucket shows **private**.
A trigger refuses any attempt to make one public, so if the toggle appears to
fail, that is the trigger working.

---

## 8. Environment Variables

### 8.1 Frontend — Cloudflare Pages

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Both are compiled into the published JavaScript, and that is expected: the
publishable key grants nothing on its own, because every row it reaches is
filtered by Row Level Security against the signed-in user's token.

> **The service-role key must never be given a `VITE_` prefix.** Vite inlines
> every `VITE_` variable into the bundle, so doing so publishes a key that
> bypasses Row Level Security entirely to anyone who opens the site.
>
> `apps/web/src/lib/supabase/client.ts` throws during development if a key
> that looks like a secret is placed in the publishable variable. That is a
> safety net, not a substitute for care.

### 8.2 AI service — Windows host only

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
```

Server-side only. Not in `apps/web`, not in any committed file, not in a log.

### 8.3 Key formats

New projects are issued `sb_publishable_…` and `sb_secret_…`. Older projects
have JWT-shaped `anon` and `service_role` keys. Both work with
`@supabase/supabase-js` v2. Use whichever the dashboard shows, in the matching
variable.

If a secret key is ever exposed, rotate it immediately. A leaked publishable
key is not an emergency; a leaked secret key is.

---

## 9. Order of Operations

1. §1–§4 — account, region, plan, project.
2. §5–§6 — authentication and database settings, **before** any account
   exists.
3. `docs/m3-migration-runbook.md` — apply the 17 migrations, run the
   post-migration queries.
4. `docs/administrator-provisioning.md` — create the two Super Admins.
5. `docs/m3-live-verification.md` — run the verification. **Nothing
   confidential goes in until it passes.**
6. `docs/backup-and-recovery.md` — set up and *test* backups.
7. Deploy the frontend with §8.1 configured.

Steps 5 and 6 are the ones under time pressure that people skip. They are the
two that matter most.

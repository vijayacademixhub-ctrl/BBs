# Supabase Setup

**Status:** no project has been created. Nothing in this document has been
applied to a live project, and no migration has been run anywhere but a local
PostgreSQL instance.

Follow this in order. Steps marked **approval required** change hosted
infrastructure and must not be carried out until you decide to proceed.

---

## 1. Before You Create Anything

The project will hold confidential institutional information: meeting
recordings, transcripts, staff records and internal decisions. Two
consequences follow, and both are easier to get right now than later.

**The region cannot be changed after creation.** Moving a project to another
region means creating a new project and migrating into it.

**The plan determines whether you have backups at all.** See §7. This is not
a detail that can be deferred: on the Free plan there is no automated backup,
and Storage objects are not covered by Supabase's backups on any plan.

## 2. Region — Verify, Do Not Assume

Your stated preference is **Mumbai, `ap-south-1`**.

`ap-south-1` (Mumbai) appears in Supabase's published list of supported AWS
regions. That is not the same as confirming it is available to your
organisation today, for the instance size you select — capacity varies.

**Verify at the point of creation.** The region dropdown in the project
creation dialog is authoritative: it lists only what you can actually choose.
If Mumbai is not offered:

- Do not silently accept the default. The default is usually a US region,
  which would place confidential institutional records outside India.
- Stop and tell me, and we will decide together. The nearest alternatives are
  `ap-southeast-1` (Singapore) and `ap-south-2` (Hyderabad, where offered),
  but choosing one is a data-residency decision for the institution, not an
  engineering convenience.

Select the **specific** region `ap-south-1`, not the "Asia Pacific" general
grouping. The general grouping lets Supabase place the project anywhere in
the area based on capacity, which defeats the purpose of choosing.

## 3. Create the Project — approval required

1. Create the project with a name such as `academicos-prod`.
2. Choose region `ap-south-1` (Mumbai), per §2.
3. Set a strong database password and store it in a password manager. It is
   shown once. It is not needed for normal application use.
4. Note the Postgres major version the project is created with, and set
   `major_version` in `supabase/config.toml` to match before applying any
   migration.
5. Record the project reference (the subdomain of the project URL).

## 4. Authentication Settings — approval required

These are security controls, not preferences. Apply all of them.

| Setting | Value | Why |
|---|---|---|
| Allow new users to sign up | **OFF** | AcademicOS has no public registration. This is the first of two controls; the second is a database trigger that refuses any user without an open invitation. |
| Confirm email | ON | Prevents an account being activated from a mistyped address. |
| Secure email change | ON | A change of address requires confirmation at both addresses. |
| Anonymous sign-ins | OFF | There is no anonymous role in this application. |
| External OAuth providers | All OFF | Each enabled provider is a route into the system that the invitation workflow does not control. |
| JWT expiry | 3600 seconds | Bounds how long a stolen token is useful. |
| Refresh token rotation | ON | A reused refresh token invalidates the session, which turns token theft into a detectable event. |
| Session timebox | 168 hours | A session cannot outlive a working week. |
| Session inactivity timeout | 8 hours | A forgotten signed-in device stops being useful overnight. |

The repository's `supabase/config.toml` carries the same values for local
development. **The dashboard settings govern the hosted project**; the two
are configured separately, and setting one does not set the other.

## 5. Keys — Which Is Which

Supabase issues two kinds of key, and confusing them is the single most
damaging mistake available here.

| Key | Where it belongs | What it does |
|---|---|---|
| **Publishable / anon** (`sb_publishable_…`, or the legacy `anon` JWT) | `VITE_SUPABASE_PUBLISHABLE_KEY` in the frontend | Designed to be public. Grants nothing on its own: every row it reaches is filtered by Row Level Security against the signed-in user's token. |
| **Secret / service_role** (`sb_secret_…`, or the legacy `service_role` JWT) | The AI service's environment, on the server, only | **Bypasses Row Level Security entirely.** Anyone holding it can read every recording, transcript and daily report in the system. |

Rules that follow from this:

- The secret key must never be given a `VITE_` prefix. Vite inlines every
  `VITE_` variable into the published JavaScript bundle, so doing so publishes
  it to anyone who opens the site.
- The secret key must never appear in `apps/web`, in any committed file, or
  in a log.
- `apps/web/src/lib/supabase/client.ts` throws during development if a key
  that looks like a secret has been placed in the publishable variable. That
  guard is a safety net, not a substitute for care.

If a secret key is ever exposed, rotate it in the dashboard immediately. A
leaked publishable key is not an emergency; a leaked secret key is.

Both key formats work with `@supabase/supabase-js` v2. New projects are
issued the `sb_publishable_` / `sb_secret_` format; the older JWT-shaped keys
remain valid on existing projects. Use whichever the dashboard shows you, and
put it in the matching variable.

## 6. Apply the Migrations — approval required

Migrations live in `supabase/migrations/` and are applied in filename order.
Apply them to the hosted project only after §3–§5 are complete.

With the Supabase CLI and Docker available:

```bash
supabase link --project-ref <your-project-ref>
```

```bash
supabase db push
```

Without Docker, the same files can be applied with any PostgreSQL client,
in filename order, using the project's connection string.

After applying, confirm in the dashboard that:

- all four buckets exist and every one shows as **private**
- Row Level Security is enabled on every table in `public`
- the Advisors page reports no "RLS disabled" or "exposed table" findings

## 7. Backups — Read Before Choosing a Plan

Two facts from Supabase's own documentation, both of which matter here:

**Automated daily backups are a Pro, Team or Enterprise feature.** Free plan
projects get none. Supabase's recommendation for Free projects is to export
regularly with `supabase db dump` and keep off-site copies. For a system
holding institutional records, relying on that discipline alone is a
meaningful risk.

**Supabase's database backups do not include Storage objects.** The database
holds only metadata about files. Restoring a database backup does not restore
a deleted recording. Audio therefore needs its own backup arrangement on
every plan, which is covered in `docs/migration-and-backup.md`.

Also note: deleting a project permanently removes its backups too. There is
no recovery from a deleted project.

Point-in-Time Recovery is a paid add-on on top of Pro (roughly USD 100/month
for a 7-day window at the time of writing, plus the Pro plan itself and a
compute add-on). It is almost certainly not warranted for a ten-person
internal system; scheduled logical dumps are.

**This is a decision for you, not for me.** My recommendation is Pro for the
daily backups if the recordings are genuinely institutional records, and
Free with a disciplined scheduled `db dump` if the project is still being
evaluated. Either way, Storage needs separate backup.

## 8. First Account

Registration is closed, which creates a chicken-and-egg problem for the first
account. The database handles it: the invitation trigger permits a user to be
created when the instance has no profiles at all. That exemption lasts only
until the first profile exists.

1. Create the first user in the dashboard (Authentication → Users → Add user).
2. Insert the matching `profiles` row and a `team_members` row with role
   `super_admin`, using the SQL editor.
3. From then on, every further account is created through an invitation
   raised by that Super Admin. A second attempt to create a user directly
   will be refused by the database.

## 9. Verify the Deployment

After the first account exists, confirm the controls are actually in force
rather than assuming they are:

- Sign out, then request a table directly with the publishable key and no
  session. It must be refused.
- Sign in as an ordinary member and confirm that `audit_logs` returns nothing.
- Confirm that a member who was not invited to a meeting cannot read its
  transcript.

These are the same properties the local suite checks (`npm run test:db`, 95
tests). Running them against the hosted project proves the deployment
matches, which the local suite cannot.

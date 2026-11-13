# Migrations, Backup and Recovery

---

## 1. Local Development

Two routes. Use the first where Docker is available; the second exists
because it is not always.

### 1.1 Supabase CLI (preferred)

Requires Docker Desktop.

```bash
supabase start
```

```bash
supabase db reset
```

`db reset` drops the local database, replays every migration in order, and
runs `supabase/seed.sql` if present. It is the closest local equivalent to a
clean deployment.

### 1.2 Plain PostgreSQL (no Docker)

The migrations are ordinary SQL and need nothing Supabase-specific to apply,
provided the pieces Supabase normally supplies are present. A test harness
creates exactly those: the `anon` / `authenticated` / `service_role` roles,
the `auth` schema with `auth.uid()`, and the `storage` tables.

```bash
createdb academicos_dev
```

```bash
ACADEMICOS_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/academicos_dev npm run db:reset
```

The harness lives in `supabase/tests/harness/` and is **never** applied to a
Supabase project: it would conflict with the real thing.

What the harness reproduces faithfully: `auth.uid()` reads the same
`request.jwt.claims` setting PostgREST populates, so a policy that passes
locally passes for the same reason in production. What it does not
reproduce: GoTrue's own logic, signed-URL issuance, Storage API behaviour and
rate limits. Those are verified against the hosted project (see
`docs/supabase-setup.md` §9).

## 2. Running the Tests

```bash
npm run test:db
```

95 tests covering anonymous access, suspension, participation-based content
access, cross-team isolation, privilege escalation, the AI verification gate,
audit protection, calendar secrets, storage policies, data integrity, closed
registration, the consent register and retention being inert.

```bash
npm run test:all
```

Frontend and database suites together.

## 3. Writing a Migration

- One concern per file, named `<timestamp>_<nnnn>_<subject>.sql`.
- Forward-only. **Never edit a migration that has been applied to a shared
  environment** — write a new one. A file already applied elsewhere will not
  be re-run, so an edit produces two environments that disagree while both
  believing they are up to date.
- State deletion behaviour on every foreign key explicitly.
- Enable RLS on every new table in the same migration that creates it. The
  structural test suite fails if a table exists without it, which is the
  intended safety net.
- Index every column a policy references. An unindexed policy predicate turns
  every query into a sequential scan, and the symptom — a dashboard that
  slows as data accumulates — is easy to misdiagnose as something else.

Before Milestone 2 is deployed anywhere, the migration set may still be
edited in place, because it has been applied to nothing but a local
throwaway database. After the first deployment, that stops being true.

## 4. Rollback

**There is no automatic rollback.** Supabase does not maintain down
migrations, and neither does this project. That is a deliberate choice: a
down migration that drops a column is a down migration that destroys data,
and it is usually written with less care than the migration it reverses.

The approach instead:

| Situation | Action |
|---|---|
| Migration fails partway | Each file runs in a transaction, so a failure leaves nothing applied. Fix the file and re-run. |
| Migration applied, but wrong | Write a new, corrective migration forward. Do not edit the original. |
| Migration applied and destructive | Restore from backup (§6). This is the only route, and it is why §6 matters. |

Before applying anything to a project with real data, take a dump first
(§5.1). That is the rollback plan.

## 5. Production Migration Procedure

**Requires your explicit approval each time.**

1. **Take a backup first.**
   ```bash
   supabase db dump --db-url "$PROD_DB_URL" -f pre-migration-$(date +%F-%H%M).sql
   ```
2. **Dry-run against a copy.** Restore the dump into a scratch project or a
   local database and apply the migration there. Confirm the suite passes.
3. **Choose a quiet window.** Some migrations take locks.
4. **Apply.**
   ```bash
   supabase db push
   ```
5. **Verify.** Re-run the checks in `docs/supabase-setup.md` §9 against the
   live project — in particular that RLS is still enabled everywhere and that
   the Advisors page is clean.
6. **Record it.** Note what was applied and when.

### 5.1 Manual Dump

```bash
supabase db dump --db-url "$PROD_DB_URL" -f backup-$(date +%F).sql
```

Roles and data can be dumped separately with `--role-only` and `--data-only`
if a more granular restore is wanted.

## 6. Backup Strategy

### 6.1 What Supabase Provides

Taken from Supabase's own documentation, and worth stating plainly because
the gaps matter more than the coverage:

| Plan | Automated backup |
|---|---|
| **Free** | **None.** Supabase recommends exporting regularly with `db dump` and keeping off-site copies. |
| Pro | Daily, last 7 days |
| Team | Daily, last 14 days |
| Enterprise | Daily, up to 30 days |

Point-in-Time Recovery is a paid add-on on Pro and above, priced from roughly
USD 100/month for a 7-day window, and requires a compute add-on. For a
ten-person internal system it is very unlikely to be warranted.

### 6.2 Two Gaps That Matter Here

**Storage objects are not in any Supabase backup, on any plan.** The database
backup contains metadata rows only. Restoring it does not bring back a
deleted recording. Meeting audio therefore needs its own backup arrangement
regardless of plan — this is not a Free-plan limitation, it applies to
Enterprise too.

**Deleting the project deletes the backups.** There is no recovery path from
a deleted project. Off-site copies are the only protection against that.

### 6.3 Recommended Arrangement

Given that the Windows AI host already exists, already holds the service-role
key, and already runs scheduled work:

1. **Database** — scheduled `supabase db dump` to the Windows host, kept
   off-site (an external drive or institutional storage). Daily while the
   system is in active use.
2. **Storage** — scheduled sync of the private buckets to the same place,
   using the S3-compatible Storage API. This is the part Supabase does not do
   for you.
3. **Off-site copy** — at least one copy not on the same machine and not in
   the same Supabase project. A backup that lives only on the laptop that
   generates it protects against almost nothing.
4. **Test a restore.** An untested backup is a hope. Restore into a scratch
   project once, confirm the suite passes against it, and write down how long
   it took.

Backups of this system contain confidential institutional information in
plain form. They need the same handling as the system itself: encrypted at
rest, access restricted, and not left on a shared drive.

### 6.4 Recovery Procedure

| Scenario | Steps |
|---|---|
| Accidental row deletion, recent | Restore the latest dump into a scratch database, extract the rows, re-insert into production. Do not restore the whole project for a few rows. |
| Bad migration | Restore the pre-migration dump (§5.1 step 1) into a scratch project, verify, then promote or copy back. |
| Storage object deleted | Restore from the Storage backup (§6.3 step 2). A database backup will not help. |
| Whole project lost | Create a new project in the same region, apply the migrations, restore the database dump, restore the Storage sync, re-issue keys, update the frontend environment and redeploy. |
| Project deleted | The Supabase backups are gone with it. Only the off-site copies in §6.3 remain. |

Expect downtime during any whole-project restore, proportional to database
size. For a ten-person system the database will be small; the Storage
restore will dominate, because audio is most of the bytes.

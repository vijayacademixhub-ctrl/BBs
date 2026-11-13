# Pre-Deployment Checklist

Work through this in order. Nothing here has been done.

Items marked **owner decision** are not technical and should not be decided by
whoever runs the deployment.

---

## 0. Decisions Needed Before Anything Is Created

These block deployment. The rest of the checklist assumes they are answered.

- [ ] **owner decision — Supabase plan.** Free has **no automated backups at
      all**. Pro has daily backups for seven days. Separately, and on every
      plan, Supabase backups **exclude Storage objects**, so recordings need
      their own arrangement either way. Recommendation: Pro if these are
      genuinely institutional records; Free with scheduled dumps if the system
      is still being evaluated.
- [ ] **owner decision — recording eligibility rule.** `disabled`,
      `all_participants_consented`, or `organiser_attestation`. Recording
      stays off until this is answered. See `docs/retention-and-consent.md`.
- [ ] **owner decision — retention.** Whether audio is deleted at all, after
      how long, and measured from the meeting or from transcript approval.
      Note that deleting a recording does not remove it from backups already
      taken — `docs/backup-and-recovery.md` §6.
- [ ] **owner decision — at least two Super Admins.** One person holding the
      only administrative account is a single point of failure. With
      mandatory MFA and no backup codes, a sole Super Admin losing their
      device is unrecoverable from inside the application.
- [ ] **owner decision — who owns backups, and who approves deletion.**
      Different people, different kinds of decision. Both need names.

---

## 1. Create the Project

- [ ] Confirm **`ap-south-1` (Mumbai)** appears in the region dropdown.
      **If it does not, stop.** Do not accept the default — it is a US region
      and would place confidential institutional records outside India. The
      dropdown is authoritative; published region lists are not.
- [ ] Select the **specific** region, not the "Asia Pacific" grouping. The
      grouping lets Supabase place the project anywhere in the area.
- [ ] Set a strong database password and store it in a password manager. It
      is shown once.
- [ ] Note the Postgres major version and set `major_version` in
      `supabase/config.toml` to match **before** applying any migration.
- [ ] Record the project reference.

## 2. Authentication Settings

Dashboard → Authentication. These are security controls, not preferences.

- [ ] Allow new users to sign up — **OFF**
- [ ] Confirm email — ON
- [ ] Secure email change — ON
- [ ] Anonymous sign-ins — OFF
- [ ] All external OAuth providers — OFF
- [ ] JWT expiry — 3600 seconds
- [ ] Refresh token rotation — ON
- [ ] Session timebox — 168 hours
- [ ] Session inactivity timeout — 8 hours
- [ ] MFA → TOTP enrolment — **Enabled**
- [ ] MFA → TOTP verification — **Enabled** (disabling it locks out every
      enrolled user rather than relaxing the requirement)
- [ ] MFA → Phone factors — Disabled

`supabase/config.toml` carries the same values for local development. The
dashboard governs the hosted project; setting one does not set the other.

## 3. Apply the Migrations

- [ ] `supabase link --project-ref <ref>`
- [ ] `supabase db push` — 16 migrations
- [ ] Confirm all four buckets exist and every one shows **private**
- [ ] Confirm RLS is enabled on every table in `public`
- [ ] Confirm the Advisors page reports no "RLS disabled" or "exposed table"
      findings

## 4. Create the First Accounts

- [ ] Create the first user in the dashboard. The invitation trigger permits
      this only while no profile exists.
- [ ] Insert the matching `profiles` row and a `team_members` row with role
      `super_admin`.
- [ ] Sign in and complete MFA enrolment.
- [ ] **Create the second Super Admin** through the invitation workflow, and
      have them enrol. Do not defer this.
- [ ] Confirm that creating a user directly in the dashboard is now **refused**
      by the database.

## 5. Verify What Could Not Be Tested Locally

This is the part that closes the gaps in `docs/security-hardening-report.md`
§10. It takes about fifteen minutes.

### Authentication

- [ ] Valid email and password signs in and reaches the MFA challenge
- [ ] Invalid password is refused, and the message does not reveal whether the
      account exists
- [ ] An incorrect TOTP code is refused
- [ ] A correct TOTP code issues an `aal2` session — decode the access token
      and confirm `"aal": "aal2"`
- [ ] **Before verifying MFA**, confirm the application shows no meetings,
      tasks or transcripts. This is the central claim of the hardening pass.
- [ ] Sign out in one tab; confirm another tab loses access
- [ ] Suspend a test account; confirm it is refused at next request

### Signed URLs

- [ ] Open a recording; confirm it plays
- [ ] Copy the signed URL, wait 70 seconds, open it in a private window —
      **it must fail**
- [ ] Open the same URL in a private window immediately — it will work, which
      is expected: the URL is a bearer credential. This confirms why it must
      never be logged or shared.
- [ ] Confirm an `access_recording` row appeared in `audit_logs`
- [ ] Request a recording as a non-participant; confirm refusal
- [ ] Attempt to fetch an object without any signature; confirm refusal

### Access control

- [ ] Sign in as an ordinary member; confirm `audit_logs` returns nothing
- [ ] Confirm a member cannot read a transcript of a meeting they did not
      attend
- [ ] Confirm a coordinator cannot either
- [ ] Sign out entirely and request a table with the publishable key; confirm
      refusal

## 6. Backups — Before Any Real Data

Nothing below exists yet. All of it is in `docs/backup-and-recovery.md`.

- [ ] Generate a backup encryption key; store it in **two** places, neither of
      them only the machine that makes the backups
- [ ] Choose the off-site location — not the Windows host, not the same
      Supabase project, not a personal cloud account
- [ ] Schedule the daily database dump
- [ ] Schedule the daily Storage sync — **nothing else backs recordings up**
- [ ] Take one full backup
- [ ] **Restore it into a scratch project and confirm the database suite
      passes against it.** Write down how long it took; that is the number
      you will need when something has actually gone wrong.
- [ ] Record the named owner and the weekly check

## 7. Application Deployment

- [ ] Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the
      Cloudflare Pages environment
- [ ] Confirm **no** service-role or `sb_secret_` key appears in any `VITE_`
      variable. That key bypasses Row Level Security and `VITE_` variables are
      compiled into the published JavaScript.
- [ ] Restrict CORS to the deployed origin
- [ ] Deploy and confirm the demonstration-data labelling has disappeared,
      which is how you know it is using real data
- [ ] Confirm the login page no longer says there is no backend

## 8. Before Real Institutional Data

Do not skip to this step. Everything above should be green first.

- [ ] Every account has MFA enrolled — verify, do not assume
- [ ] At least two Super Admins exist and both have enrolled
- [ ] More than one person can reach the Supabase dashboard, each with their
      own MFA and recovery codes stored physically
- [ ] A restore has actually been performed and verified
- [ ] The consent policy is approved and recorded in `app_settings`
- [ ] The retention policy is either approved and recorded, or explicitly
      left pending — not left ambiguous
- [ ] The team has been told that recordings are confidential institutional
      records, and what that means for sharing them

---

## What This Checklist Deliberately Does Not Do

It does not enable recording. `recording_enabled` stays `false` until the
consent policy is approved, and that is an institutional decision rather than
a deployment step.

It does not set a retention period. No period is configured anywhere, and a
database constraint prevents one being enabled without a recorded approver.

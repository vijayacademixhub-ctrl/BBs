# AcademicOS

An AI-powered academic operations platform for research and coursework
teams: meeting management, local microphone recording, automatic
transcription, human-verified AI extraction of decisions and action items,
task and daily-work tracking, and calendar integration.

**Current status: ready for a controlled evaluation deployment, pending
approval.** Not ready for institutional records — see
[docs/m3-deployment-readiness.md](docs/m3-deployment-readiness.md).
The database schema, authentication, mandatory multi-factor authentication,
Row Level Security, private storage and audit logging are built and tested
against local PostgreSQL — 196 database tests. No Supabase project has been
created, so the application still runs on local demonstration data and says
so wherever it matters.

---

## Installation

Tested on Windows 11, macOS and Linux. Node.js 20 or later is required;
Node 22 LTS is recommended.

### 1. Install Node.js (Windows)

Download the LTS installer from <https://nodejs.org> and run it, accepting
the defaults. Then open **Windows PowerShell** and confirm:

```bash
node --version
```

Any version from `v20` upward is fine.

### 2. Get the code

```bash
git clone https://github.com/vijayacademixhub-ctrl/BBs.git
```

```bash
cd BBs
```

### 3. Install dependencies

Run this from the repository root, not from inside `apps/web`:

```bash
npm install
```

### 4. Start the application

```bash
npm run dev
```

Open <http://localhost:5173>. The dashboard loads with demonstration data.

To stop the server, press `Ctrl` + `C` in the terminal.

### Environment configuration

Milestone 1 requires no environment file. From Milestone 2 onward, copy
`.env.example` to `.env` and fill in the values. `.env` is git-ignored and
must never be committed.

---

## Available commands

Run all of these from the repository root.

| Command | Purpose |
|---|---|
| `npm run dev` | Development server with hot reload on port 5173 |
| `npm run build` | Production build into `apps/web/dist` |
| `npm run preview` | Serve the production build on port 4173 |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | TypeScript check, no emit |
| `npm run verify:m1` | Browser verification of the Milestone 1 acceptance criteria |
| `npm run test:db` | Database security suite — 216 tests against PostgreSQL |
| `npm run db:evaluate` | Local evaluation environment: two synthetic teams, access matrix |
| `npm run verify:deployment` | Live verification against a real Supabase project |
| `npm run test:all` | Frontend and database suites together |
| `npm run db:reset` | Rebuild a local database from the migration files |

`npm run verify:m1` and `npm run verify:m2` drive the real interface in a
headless browser. Both require `npm run preview` running in another terminal,
and Playwright with Chromium installed.

`npm run test:db` requires a PostgreSQL instance. It builds the schema from
the real migration files rather than a snapshot, so a passing run says
something about what would actually be deployed. Set
`ACADEMICOS_TEST_DATABASE_URL` if your instance is not at the default.

---

## Two modes

With no backend configured, the application runs on local demonstration data
and labels it as such on every screen. The login page says there is nothing
to sign in to rather than redirecting past itself.

With `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set, it uses
real authentication and real rows, and the demonstration labelling disappears.
Nothing in between: the application never claims a session it does not have.

## What works today

Meeting scheduling, editing and removal; task creation, assignment, filtering
and status changes; daily work entries; notifications; dark mode; and a
responsive layout for desktop, tablet and mobile. Data is held in the
browser's local storage, is specific to one device, and can be reset from
**System status**.

### What is deliberately not working

Recording, transcription, AI extraction, the verification centre, the
assistant and calendar synchronisation are not built. Their pages are
reachable from the navigation and state plainly that they are not yet
implemented. Nothing in the interface simulates a successful AI result.

---

## Architecture

| Document | Contents |
|---|---|
| [docs/architecture.md](docs/architecture.md) | System design, modules, folder structure, navigation, API surface, security, deployment |
| [docs/database-architecture.md](docs/database-architecture.md) | Entity relationships, key DDL, RLS policies, the AI approval gate |
| [docs/implementation-plan.md](docs/implementation-plan.md) | Milestones M0–M8, timeline, cost, risks |
| [docs/security-model.md](docs/security-model.md) | Who can access what, how it is enforced, what is verified and what is not |
| [docs/security-hardening-report.md](docs/security-hardening-report.md) | Pre-deployment hardening: two defects found and fixed, what remains unmet |
| [docs/mfa-setup.md](docs/mfa-setup.md) | Mandatory two-factor authentication, and what recovery does and does not exist |
| [docs/backup-and-recovery.md](docs/backup-and-recovery.md) | Backup plan for all four data classes, restore procedures, responsibilities |
| [docs/pre-deployment-checklist.md](docs/pre-deployment-checklist.md) | Ordered steps and owner decisions before anything is deployed |
| [docs/m3-deployment-guide.md](docs/m3-deployment-guide.md) | Creating the Supabase project: ownership, region, plan, auth, storage, keys |
| [docs/m3-migration-runbook.md](docs/m3-migration-runbook.md) | All 17 migrations: purpose, dependencies, validation query, rollback |
| [docs/administrator-provisioning.md](docs/administrator-provisioning.md) | Creating the two Super Admin accounts securely |
| [docs/m3-live-verification.md](docs/m3-live-verification.md) | What must pass before confidential data is entered |
| [docs/m3-evaluation-plan.md](docs/m3-evaluation-plan.md) | How to evaluate the system, in three phases |
| [docs/m3-deployment-readiness.md](docs/m3-deployment-readiness.md) | Readiness assessment, defects found, outstanding risks |
| [docs/sample-data-test-plan.md](docs/sample-data-test-plan.md) | The synthetic dataset and what loading it found |
| [docs/account-ownership-transfer.md](docs/account-ownership-transfer.md) | Personal ownership risks and the transfer procedure |
| [docs/supabase-setup.md](docs/supabase-setup.md) | Project creation, region, keys, auth settings, deployment checks |
| [docs/retention-and-consent.md](docs/retention-and-consent.md) | Both policies are unapproved; what exists and what you need to decide |
| [docs/migration-and-backup.md](docs/migration-and-backup.md) | Local setup, migration procedure, rollback, backup and recovery |
| [docs/milestone-1-report.md](docs/milestone-1-report.md) | Milestone 1: what was built and how it was verified |
| [docs/milestone-2-report.md](docs/milestone-2-report.md) | Milestone 2: what was built, two defects the tests caught, what remains |
| [docs/reverse-engineering-analysis.md](docs/reverse-engineering-analysis.md) | Reference analysis — framework retained; no source materials were available |

### Intended stack

React, Vite, TypeScript, Tailwind and shadcn-compatible components on
Cloudflare Pages; Supabase for PostgreSQL, authentication, storage and
realtime; a Python FastAPI service running faster-whisper and Ollama with
Qwen3 on a local Windows host, reached through a Cloudflare Tunnel.

### Governing design rules

1. The web client never calls the AI service directly. AI work is queued in
   PostgreSQL and pulled by the worker when it is available, so the
   application keeps working while the Windows host is offline.
2. AI output never becomes an official task or calendar event without human
   approval, enforced by a database trigger rather than application code.
3. Authorisation is enforced by Row Level Security. Frontend role checks are
   presentation only.
4. The AI assistant retrieves using the requesting user's credentials, so it
   cannot surface meetings that user is not entitled to read.
5. Sample and unverified AI content are always labelled as such.

### Changing the visual design

Every colour in the application resolves to a CSS custom property declared
in `apps/web/src/styles/tokens.css`. No component contains a literal colour.
To adopt a reference design, replace the values in that one file; the
components do not change.

---

## Security

No API keys or secrets are committed to this repository. `.env` is
git-ignored, and `.env.example` contains placeholder names only.

Variables prefixed `VITE_` are embedded in the published browser bundle and
must never hold a secret. The Supabase **publishable** key belongs there and
is designed to be public; the **service-role** key bypasses Row Level
Security entirely and belongs only in the AI service's server-side
environment.

Authorisation is enforced by PostgreSQL, not by the browser. Deleting every
role check in the frontend would not give any user access to one additional
row.

Two-factor authentication is mandatory and is enforced the same way: a
restrictive RLS policy on every table requires a verified second factor, so a
password-only session can reach no confidential record whatever the interface
allows. Supabase issues no backup codes, so recovery is administrator-assisted
— read [docs/mfa-setup.md](docs/mfa-setup.md) §4 before the first account is
created.

See [docs/security-model.md](docs/security-model.md) and
[docs/security-hardening-report.md](docs/security-hardening-report.md).

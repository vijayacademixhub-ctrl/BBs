# AcademicOS

An AI-powered academic operations platform for research and coursework
teams: meeting management, local microphone recording, automatic
transcription, human-verified AI extraction of decisions and action items,
task and daily-work tracking, and calendar integration.

**Current status: Milestone 1 complete.** The web application runs on local
demonstration data. No backend, authentication or AI service is connected
yet, and the interface says so wherever it matters.

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

`npm run verify:m1` drives the real interface in a headless browser and
checks the acceptance criteria end to end. It requires `npm run preview` to
be running in another terminal, and Playwright with Chromium installed.

---

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
| [docs/milestone-1-report.md](docs/milestone-1-report.md) | What was built, how it was verified, what remains |
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
git-ignored, and `.env.example` contains placeholder names only. Variables
prefixed `VITE_` are embedded in the published browser bundle and must never
hold a secret; the Supabase service-role key and all OAuth client secrets
belong to the server-side AI service only.

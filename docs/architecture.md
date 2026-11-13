# AcademicOS — System Architecture

**Version:** 0.1 (proposal, pending approval)
**Date:** 2026-11-13
**Scope:** Team of 10, single institution, expandable

---

## 1. Architectural Overview

AcademicOS is composed of three independently deployable units. The
separation is deliberate: the three units have fundamentally different
availability characteristics, and the design must not allow the weakest of
them to degrade the others.

| Unit | Technology | Hosting | Availability |
|---|---|---|---|
| Web client | React, Vite, TypeScript, Tailwind, shadcn/ui | Cloudflare Pages | High (CDN) |
| Data platform | Supabase — PostgreSQL, Auth, Storage, Realtime | Supabase cloud | High (managed) |
| AI service | Python, FastAPI, faster-whisper, Ollama | Windows machine, exposed via Cloudflare Tunnel | **Low and intermittent** |

### 1.1 The Governing Constraint

The AI service runs on a personal Windows machine. That machine will be
switched off, will sleep, will lose network connectivity, and will be
unavailable during examinations and travel. Any design in which the user
interface makes a synchronous call to that machine will produce an
application that appears broken for large parts of the week.

The architecture therefore follows one rule above all others:

> **The web client never calls the AI service directly. All AI work is
> queued in PostgreSQL and pulled by the AI service when it is available.**

This single decision produces several desirable properties:

- Recording and uploading work whether or not the laptop is on.
- Job state is durable; a machine restart loses no work.
- The AI service needs no inbound public endpoint for the core pipeline,
  which materially reduces the attack surface.
- The AI host can be replaced, duplicated or moved to a cloud GPU later
  without any client change.

### 1.2 Data Flow — Recording to Approved Task

```
Browser (MediaRecorder)
   │  audio blob
   ▼
Supabase Storage  ──  private bucket "recordings", signed upload URL
   │
   ▼
recordings row  ──▶  ai_processing_jobs row (status: queued)
                             │
                             │  polled by worker (outbound only)
                             ▼
                     AI Service (Windows)
                       1. download audio (service role, short-lived URL)
                       2. faster-whisper  → transcripts + transcript_segments
                       3. Ollama / Qwen3  → ai_extractions (pending_verification)
                       4. delete local temp file
                             │
                             ▼
                     Verification Centre (human review — REQUIRED)
                             │  approve
                             ▼
                     tasks / action_items / calendar_events
```

The human approval gate between extraction and task creation is not a
courtesy; it is enforced in the database (§6.4). An extraction that has not
been approved cannot become a task, and no code path in the AI service is
granted the ability to bypass this.

---

## 2. Frontend Architecture

### 2.1 Stack

React 18 with Vite and TypeScript in strict mode. Tailwind CSS for styling
with shadcn/ui components copied into the repository (not installed as a
dependency), which is what makes re-theming to a reference design feasible.
React Router for routing, TanStack Query for all server state, React Hook
Form with Zod resolvers for every form, Lucide for icons.

State is divided strictly. Server state lives in TanStack Query and is never
duplicated into React state. Client state (open dialogs, filter selections,
recorder state machine) lives in component state or a small number of
context providers. There is no global store; at this scale one would add
indirection without benefit.

### 2.2 Proposed Folder Structure

```
academicos/
├── apps/
│   ├── web/                        # React PWA
│   │   ├── src/
│   │   │   ├── app/                # router, providers, root layout
│   │   │   ├── components/
│   │   │   │   ├── ui/             # shadcn primitives (generated)
│   │   │   │   ├── layout/         # AppShell, Sidebar, Header
│   │   │   │   └── common/         # EmptyState, ErrorState, DataTable…
│   │   │   ├── features/           # one folder per module (§3)
│   │   │   │   ├── dashboard/
│   │   │   │   ├── meetings/
│   │   │   │   ├── recorder/
│   │   │   │   ├── transcripts/
│   │   │   │   ├── verification/
│   │   │   │   ├── tasks/
│   │   │   │   ├── daily-work/
│   │   │   │   ├── calendar/
│   │   │   │   ├── notifications/
│   │   │   │   ├── assistant/
│   │   │   │   └── admin/
│   │   │   ├── lib/                # supabase client, api client, utils
│   │   │   ├── hooks/
│   │   │   └── types/              # generated DB types + domain types
│   │   └── public/                 # PWA manifest, icons, service worker
│   └── ai-service/                 # FastAPI + worker
│       ├── app/
│       │   ├── api/                # HTTP routes (assistant, health, admin)
│       │   ├── worker/             # job poller, pipeline stages
│       │   ├── providers/          # AIProvider abstraction (§5)
│       │   ├── transcription/      # faster-whisper wrapper
│       │   ├── schemas/            # Pydantic models
│       │   ├── core/               # config, security, logging
│       │   └── db/                 # supabase/postgres access
│       └── tests/
├── packages/
│   └── shared/                     # Zod schemas shared by web and docs
├── supabase/
│   ├── migrations/                 # timestamped SQL migrations
│   └── seed.sql                    # development seed data
├── docs/
└── .env.example
```

Each folder under `features/` contains its own `components/`, `hooks/`,
`api.ts` and `types.ts`. A feature may import from `components/ui`,
`components/common`, `lib` and `hooks`, but **must not** import from another
feature. Cross-feature needs are resolved by lifting the shared piece into
`components/common` or `lib`. This rule is what keeps the codebase
navigable as modules accumulate.

### 2.3 Page and Navigation Hierarchy

```
/login                              public
/auth/callback                      public
/                                   → redirect to /dashboard

(authenticated shell: sidebar + header)
/dashboard                          all roles
/meetings                           all roles — list + calendar toggle
/meetings/new                       admin, coordinator
/meetings/:id                       participants only
/meetings/:id/edit                  organiser, admin
/meetings/:id/record                participants — recorder
/meetings/:id/transcript            participants
/tasks                              all roles — "My tasks" default, team view for admin
/tasks/:id
/daily-work                         all roles — own log
/daily-work/team                    admin, coordinator
/verification                       admin, coordinator  ← gated module
/verification/:extractionId
/calendar                           all roles
/assistant                          all roles
/notifications                      all roles
/settings/profile                   all roles
/settings/preferences               all roles
/settings/calendar                  all roles — OAuth connection
/admin/users                        super admin
/admin/teams                        super admin
/admin/audit                        super admin
/admin/system                       super admin — AI provider status (§5.4)
```

Sidebar groups: **Overview** (Dashboard), **Meetings** (Meetings, Recorder,
Transcripts), **Work** (Tasks, Daily Work, Calendar), **Intelligence**
(Verification, Assistant), **Administration** (visible to admins only).

### 2.4 Required UI States

Every data-bearing view must implement four states before it is considered
complete: loading (skeleton matching final layout, not a spinner), empty
(explanatory text and the primary action), error (what failed, and a retry
control), and populated. This is an acceptance condition, not a preference.

### 2.5 Progressive Web Application

A manifest, installable icons and a service worker caching the application
shell and static assets. Offline support is limited and honestly scoped:
the shell loads offline and cached read data is displayed with a visible
"offline — showing cached data" banner. Writes are not queued offline in the
first release, because a half-working offline write path is worse than a
clearly disabled one.

**Mobile recording constraints that must be communicated in the UI:** on
iOS Safari, `MediaRecorder` produces MP4/AAC rather than WebM/Opus, and
recording halts when the screen locks or the browser is backgrounded. The
recorder must warn iOS users to keep the screen awake, and the audio
pipeline must accept both container formats. A native wrapper (Capacitor)
is the path to background recording, and is deferred to a later phase —
see §8.

---

## 3. Module Specifications

Modules A–J from the brief map to the `features/` folders listed above. The
substantive architectural notes per module:

**Dashboard (A).** Composed of independent widgets, each with its own query
and its own loading state, so that one slow query cannot block the page. A
single aggregate Postgres view backs the counts to avoid eight round trips.

**Meetings (B).** Standard CRUD. Calendar and list views read the same query
with different presentation. Participants are a join table, which is also
the access-control basis for transcripts.

**Recorder (C).** Implemented as an explicit state machine —
`idle → requesting-permission → ready → recording ⇄ paused → stopping →
uploading → done`, with `error` reachable from any state. Permission is
requested only after the consent notice is acknowledged. The UI reports
"recording" only when `MediaRecorder.state === 'recording'`; permission
denial, unsupported browsers and device-change events each have a distinct
error message. Audio is chunked and uploaded resumably so that a long
meeting does not fail at the final step.

**Transcription (D).** Asynchronous throughout. Job states are `uploaded →
queued → processing → completed | failed`, with `attempts` and `last_error`
recorded. The UI shows the job state honestly, including "waiting for the
processing service to come online" when no worker has polled recently.

**AI Intelligence (E).** Returns structured JSON validated against a Pydantic
schema; a response that fails validation is a job failure, not a partial
save. Every extracted item carries `transcript_segment_id` and a character
offset, so that the verification screen can show the exact source passage.
The prompt forbids invention; any field the model cannot ground is emitted
as `null` with `needs_clarification: true`.

**Verification Centre (F).** The control point of the whole system. Reviewer
sees the source passage, the extraction, the proposed assignee and deadline,
and the model's confidence. Actions are approve, approve-with-edits, reject,
and request re-analysis. Statuses: `pending → approved | rejected | modified
→ published`.

**Tasks and Daily Work (G).** Tasks may originate manually or from an
approved extraction; the origin is recorded and displayed, so a task's
provenance is always visible.

**Calendar (H).** Outbox pattern. Writes go to `calendar_sync_jobs` with a
unique idempotency key per (event, provider, account); a retry can never
produce a duplicate. ICS export ships first and works everywhere; Google
Calendar OAuth follows, with tokens held server-side only.

**Notifications (I).** In-app first, persisted in `notifications`, delivered
live over Supabase Realtime. Email and push are later additions behind the
same preference table.

**Assistant (J).** See §5.5 — permission-aware retrieval is the critical
requirement.

---

## 4. Authentication and Authorisation

### 4.1 Identity

Supabase Auth with email and password, plus optional Google sign-in. Each
auth user has a corresponding row in `profiles`, created by a database
trigger on `auth.users` insert. Self-service registration is **disabled**;
the Super Admin creates accounts. For a closed team of ten this is both
simpler and safer than an invitation flow with domain restrictions.

### 4.2 Roles

Three roles, held per team in `team_members.role`:

| Role | Capability |
|---|---|
| `super_admin` | Everything, including user management, audit log, system settings |
| `coordinator` | Team-wide read, meeting management, verification, task assignment |
| `member` | Own dashboard, own tasks and daily work, meetings they participate in |

Verification rights belong to `coordinator` and above. This is the only
role distinction that carries real risk, since an approver turns machine
output into institutional record.

### 4.3 Enforcement — Three Layers

Authorisation is enforced three times, and the frontend layer is explicitly
the least trusted of the three.

1. **Database (authoritative).** Row Level Security on every table. The web
   client talks to PostgREST using the user's own JWT, so every query the
   browser can issue is already constrained by policy. A compromised or
   modified frontend gains nothing.
2. **API (for the AI service).** FastAPI validates the Supabase JWT on every
   request — signature, expiry, audience — and derives the user from the
   token, never from a request body field. Cloudflare Access, where used, is
   a second gate and is never treated as sufficient on its own.
3. **Frontend (presentation only).** Role checks hide controls the user
   cannot use. They are a usability measure and provide no security.

### 4.4 Key Handling

| Key | Location | Never |
|---|---|---|
| Supabase anon/publishable key | Web client bundle | — (designed to be public) |
| Supabase service-role key | AI service environment only | In any frontend file, any committed file, any log |
| Google OAuth client secret | AI service environment only | In the browser |
| Google refresh tokens | `calendar_connections`, encrypted at rest | Returned to any client |

`.env.example` carries placeholder names and no values. A pre-commit secret
scan is recommended before the first push of real configuration.

---

## 5. AI Integration Architecture

### 5.1 Provider Abstraction

```python
class AIProvider(Protocol):
    async def complete(self, prompt: str, schema: type[BaseModel]) -> BaseModel: ...
    async def health(self) -> ProviderHealth: ...

class OllamaProvider(AIProvider): ...      # Qwen3 via http://127.0.0.1:11434
class CloudAIProvider(AIProvider): ...     # placeholder, key supplied later
```

Selection is by environment variable; no provider is referenced by name
anywhere outside `providers/`. Transcription sits behind an equivalent
`TranscriptionProvider` so that faster-whisper can be replaced by a hosted
service without touching the pipeline.

### 5.2 Configuration

```
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:4b
WHISPER_MODEL=small
WHISPER_DEVICE=cpu            # set to cuda when a GPU is available
WHISPER_COMPUTE_TYPE=int8
CLOUD_AI_API_KEY=
CLOUD_AI_MODEL=
```

No key is hardcoded. If the selected provider is unreachable, the service
reports a degraded health status and jobs remain queued; the application
continues to function for everything that is not AI-dependent.

### 5.3 Extraction Contract

The model is given the transcript with segment identifiers and is required
to return JSON conforming to a fixed schema covering summary, discussion
points, decisions, action items, responsible persons, deadlines, follow-up
meetings, important dates, academic activities, pending issues and risks.
Each item carries `source_segment_ids` and `confidence`. The system prompt
states explicitly that names, dates and owners must be quoted from the
transcript or left null — fabrication is the primary risk in this module and
is addressed at both the prompt and the schema-validation level.

### 5.4 Configuration Status Surface

`/admin/system` displays, honestly: whether a worker has polled recently,
which provider is configured, whether the model is loaded, queue depth, and
the age of the oldest queued job. Where AI results are simulated during
early milestones, the interface labels them as sample data. The brief is
explicit on this point and it is treated as a hard requirement.

### 5.5 Permission-Aware Retrieval — Security Critical

The Academic Assistant answers questions over meeting transcripts. If
retrieval runs with the service-role key, every user can read every meeting
through the assistant, regardless of RLS. This would silently defeat the
entire access-control model.

The assistant therefore performs retrieval **using the requesting user's
JWT**, so that RLS filters the candidate set before any text reaches the
model. Only content the user is already entitled to read can enter the
prompt. Citations are returned with each answer so the user can verify the
source. This constraint is non-negotiable and is to be covered by an
automated test.

---

## 6. API Surface

Supabase PostgREST serves ordinary CRUD directly, with RLS as the security
boundary; writing a REST wrapper around it would add a layer that must be
secured a second time for no benefit. FastAPI is reserved for operations
that genuinely require server-side execution.

**FastAPI endpoints:**

```
GET    /health
GET    /admin/status                       provider + queue health
POST   /jobs/claim                         worker only, internal
POST   /jobs/{id}/complete                 worker only, internal
POST   /assistant/query                    user JWT; permission-aware retrieval
POST   /meetings/{id}/reanalyse            coordinator+; enqueues a job
POST   /calendar/oauth/start               user JWT
GET    /calendar/oauth/callback            provider redirect
GET    /meetings/{id}/export.ics           user JWT
```

**Database functions (SECURITY DEFINER, audited):**

```
publish_extraction(extraction_id, edits jsonb)  → creates task/event; the
                                                   ONLY path from extraction
                                                   to official record
```

CORS is restricted to the deployed Pages origin and `localhost` in
development. Wildcard origins are not used at any point.

---

## 7. Deployment Architecture

```
          Browser (desktop / Android / iOS)
                 │               │
    HTTPS        │               │ HTTPS (assistant, ICS, OAuth only)
                 ▼               ▼
      Cloudflare Pages      Cloudflare Tunnel ── Cloudflare Access
       (static PWA)                 │
                 │                  ▼
                 │          FastAPI :8000  (bound to 127.0.0.1)
                 │                  │
                 │          Ollama :11434  (bound to 127.0.0.1)
                 ▼                  │
          Supabase  ◀───────────────┘  outbound only, service role
     Postgres · Auth · Storage · Realtime
```

Ports 8000 and 11434 bind to the loopback interface and are never exposed to
the internet; the tunnel is the only ingress and Cloudflare Access sits in
front of it. The worker's connection to Supabase is outbound, which is why
the core pipeline survives the laptop having no public address at all.

---

## 8. Mobile and Future Application Path

The brief anticipates a mobile application later. The architecture supports
this without rework, provided one discipline is maintained: **all business
logic lives in the database and the AI service, never in the React
components.** A future client is then a new presentation layer over the same
API, not a second implementation of the system.

Recommended progression:

1. **Now** — responsive PWA, installable on Android and iOS home screens.
2. **Next** — Capacitor wrapper around the same web build, giving store
   distribution, background audio recording (which Safari will not do), and
   native push notifications. Cost: a build pipeline and store accounts; no
   application rewrite.
3. **Later, only if justified** — a React Native client, if native
   performance or deep OS integration becomes necessary. This is a genuine
   second codebase and should not be undertaken without a concrete reason.

Updates: the PWA updates on deployment via the service worker, with an
"update available — reload" prompt rather than a silent swap. Capacitor
builds additionally support over-the-air web-asset updates, so store review
is required only when native code changes.

---

## 9. Testing and Quality

Business logic that must be tested before the system can be trusted:
RLS policies (a test per table asserting that a non-member is denied),
the extraction-to-task approval gate, calendar idempotency under retry,
the recorder state machine, and permission-aware assistant retrieval.
Component tests cover the four required UI states. End-to-end coverage with
Playwright is limited to the two critical paths: create a meeting through to
an approved action item, and assign a task through to completion.

---

## 10. Open Questions Requiring Your Decision

| # | Question | Blocks |
|---|---|---|
| Q1 | ~~Where are the reverse-engineering materials?~~ | **Resolved** — none available; a new design was built with a token-driven theme |
| Q2 | Does a Supabase project already exist, and in which region? | Milestone 2 |
| Q3 | ~~Recording retention period?~~ | **Resolved** — 90 days after transcript approval, subject to institutional approval; approved transcripts retained until authorised deletion |
| Q4 | ~~Meeting languages?~~ | **Resolved** — English, Kannada and Hindi including mixed speech; model kept configurable for benchmarking |
| Q5 | Is the Windows host always on, and does it have an NVIDIA GPU? | Realistic turnaround time per meeting |
| Q6 | Is there a Google Workspace domain for calendar integration? | Whether OAuth needs Google verification |
| Q7 | Must all participants consent, or only the organiser? | **Partly resolved** — consent confirmation and a visible recording indicator are required; the scope of consent is still to be confirmed |

Q1, Q3 and Q4 were resolved at the Milestone 1 approval. Q7 remains open in
part: the requirement for consent and a visible recording indicator is
settled, but whether consent must be obtained from every participant or only
recorded by the organiser is a policy matter and should be confirmed before
Milestone 3 ships.

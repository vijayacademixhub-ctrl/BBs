# AcademicOS

An AI-powered academic operations management platform for research and
coursework teams: meeting management, local microphone recording, automatic
transcription, human-verified AI extraction of decisions and action items,
task and daily-work tracking, and calendar integration.

**Current status: architecture and planning (Milestone 0). No application
code has been written yet.**

## Documents

| Document | Contents |
|---|---|
| [docs/architecture.md](docs/architecture.md) | System design, module specifications, folder structure, navigation hierarchy, API surface, security model, deployment, open questions |
| [docs/database-architecture.md](docs/database-architecture.md) | Entity relationships, key table definitions, RLS policy design, storage, audit |
| [docs/implementation-plan.md](docs/implementation-plan.md) | Milestones M0–M8, timeline, cost position, risk register |
| [docs/reverse-engineering-analysis.md](docs/reverse-engineering-analysis.md) | Analysis of the reference application — **framework only; awaiting source materials** |

## Intended Stack

React · Vite · TypeScript · Tailwind · shadcn/ui on Cloudflare Pages ·
Supabase (PostgreSQL, Auth, Storage, Realtime) · FastAPI with faster-whisper
and Ollama/Qwen3 on a local Windows host behind a Cloudflare Tunnel.

## Governing Design Rules

1. The web client never calls the AI service directly. AI work is queued in
   PostgreSQL and pulled by the worker when it is available.
2. AI output never becomes an official task or calendar event without human
   approval, and this is enforced by a database trigger rather than by
   application code.
3. Authorisation is enforced by Row Level Security. Frontend role checks are
   presentation only.
4. The AI assistant retrieves using the requesting user's credentials, so
   that it cannot surface meetings the user is not entitled to read.
5. Sample and simulated data are always labelled as such in the interface.

## Setup

Setup instructions will accompany Milestone 1.

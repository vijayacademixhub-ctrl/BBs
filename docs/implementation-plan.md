# AcademicOS — Implementation Plan

**Version:** 0.1 (proposal, pending approval)
**Date:** 2026-11-13

---

## 1. Sequencing Principle

The brief instructs that the platform is not to be built in one large
implementation, and that is correct. The sequencing below is additionally
ordered so that **each milestone leaves the system in a usable state**, and
so that the components with the highest uncertainty are reached early enough
that a problem with them does not surface after the surrounding work is
already built.

The two highest-uncertainty components are browser audio recording on iOS
and the quality of Qwen3 extraction on real academic meeting transcripts.
Both are reached by Milestone 4, well before task management, calendar
synchronisation and notifications are built on top of them.

## 2. Milestones

### M0 — Architecture and Planning *(this deliverable)*

Reverse-engineering analysis framework, system architecture, database
design, API plan, security model, deployment design, this plan.

**Status:** complete, excepting the reverse-engineering analysis, which is
blocked on source materials.

---

### M1 — Application Foundation
*Estimated 1 week. Corresponds to the brief's First Development Milestone.*

Project scaffolding; responsive application shell with sidebar, header and
user area; routing for every page in the hierarchy; the full set of
interface screens listed in the brief, operating on realistic sample data;
loading, empty and error states throughout; PWA manifest and installability.

All sample data is visibly labelled as such. No AI processing is simulated
as successful — screens that depend on AI show a clearly marked
not-yet-configured state.

**Depends on:** reverse-engineering materials for the visual design (Q1).
Without them, M1 can be built structurally and re-themed later, but the
re-theming cost is real and is the reason Q1 should be answered first.

**Acceptance:** the project runs locally; navigation works on desktop,
tablet and mobile widths; meeting, task and daily-work creation and editing
function against sample data; the recorder requests microphone permission
correctly and handles denial; no secrets are committed; setup documentation
exists.

---

### M2 — Data Platform and Authentication
*Estimated 1 week.*

Supabase project configuration; all migrations applied; RLS policies on
every table with an automated test asserting that a non-member is denied
access; profile trigger; Super Admin user management; audit logging;
replacement of all sample data with live queries through TanStack Query.

**Acceptance:** a test suite demonstrates that each role can read exactly
what it should and nothing further.

---

### M3 — Recording and Upload
*Estimated 1 week.*

Recorder state machine; consent notice preceding any permission request;
chunked resumable upload to the private bucket; recordings and job rows
created on completion; playback of stored audio; graceful behaviour on
unsupported browsers; explicit iOS guidance in the interface.

**Acceptance:** a recording made on Windows Chrome, Android Chrome and iOS
Safari is uploaded, stored and played back. The iOS limitations are
documented and surfaced to the user rather than discovered by them.

---

### M4 — Transcription
*Estimated 1 week.*

FastAPI service skeleton; JWT validation; worker loop claiming jobs with
`skip locked`; faster-whisper integration producing transcripts and
timestamped segments; temporary file cleanup; honest job status in the
interface including "processing service offline"; transcript display,
editing and export; Cloudflare Tunnel configured with loopback-bound ports.

**Acceptance:** a real recorded meeting produces a readable transcript, and
the queue survives the host machine being shut down mid-job.

---

### M5 — Extraction and Verification Centre
*Estimated 1.5 weeks.*

Provider abstraction with the Ollama implementation; the extraction schema
and prompt; schema validation treated as a job failure on non-conformance;
segment-level source references; the verification interface with source
passage display, approve, edit, reject and re-analyse; the database approval
trigger and its test.

**Acceptance:** the approval gate is demonstrated to be unbypassable — an
attempt to insert a task from an unapproved extraction is rejected by
PostgreSQL. Extraction quality is reviewed against three real transcripts
before proceeding, and the prompt is tuned on the basis of that review.

This is the milestone most likely to require iteration. The estimate assumes
one round of prompt revision after seeing real output.

---

### M6 — Tasks and Daily Work
*Estimated 1 week.*

Task lifecycle with comments, attachments and history; assignment;
provenance display for AI-originated tasks; daily work logs; team workload
overview; dashboard widgets against live data.

---

### M7 — Calendar
*Estimated 1 week.*

ICS export first, which works on every device without OAuth. Then Google
Calendar: backend OAuth flow, encrypted token storage, the outbox with
idempotency keys, and a retry test proving no duplicate event is produced.

---

### M8 — Notifications, Assistant, Hardening
*Estimated 1.5 weeks.*

In-app notifications over Realtime with a preference table; the Academic
Assistant with permission-aware retrieval and an automated test proving a
user cannot reach a meeting they did not attend; accessibility pass;
performance pass; deployment documentation; handover.

---

## 3. Indicative Timeline

Approximately nine to ten weeks of focused work for a single developer. For
a part-time effort alongside an MBA third semester, a realistic calendar
expectation is three to four months, and the milestone boundaries are placed
so that work can pause at any of them without leaving the system in a
half-built state.

## 4. Cost Position

| Component | Cost | Note |
|---|---|---|
| Cloudflare Pages | Free | Generous for this scale |
| Cloudflare Tunnel | Free | |
| Supabase Free tier | Free | 500 MB database, 1 GB storage |
| Ollama, Qwen3, faster-whisper | Free | Local, open weights |
| Windows host | Already owned | Electricity only |

The one genuine limit is Supabase Storage. At roughly 15 MB per hour of
Opus-encoded mono audio, 1 GB holds approximately 65 hours of meetings. For
ten people this is a matter of months, not weeks, but it will be reached. A
retention policy — for instance, deleting audio ninety days after the
transcript is approved, while keeping the transcript permanently — avoids
the need to pay for storage and is also the better privacy position. This
should be decided alongside Q7 rather than when the quota is exhausted.

No paid service is required for the system as designed. If a cloud AI
provider is adopted later, the provider abstraction means the only change is
configuration, and the cost becomes per-token rather than fixed.

## 5. Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Reference materials never arrive | Visual design diverges from expectation; rework | Design tokens isolated in the Tailwind theme; shadcn components re-theme centrally |
| iOS Safari recording limitations | Mobile recording unreliable for long meetings | Documented in the UI from M3; Capacitor wrapper is the known remedy |
| Qwen3-4B extraction quality insufficient | Verification becomes rewriting rather than approving | Larger local model, or the cloud provider path, both already supported by the abstraction |
| Windows host unavailable for extended periods | Transcription backlog | Queue is durable; UI reports honestly; a cloud GPU is a configuration change |
| Multilingual or code-mixed speech | Poor transcript accuracy | Depends on Q4; a larger Whisper model substantially improves this |
| Recording without clear institutional consent | Governance exposure | Q7 settled before M3 ships |

## 6. What Is Needed From You Before M1 Begins

1. The reverse-engineering materials, or confirmation that none exist and
   the interface should be designed from the specification alone. Either
   answer unblocks the work; the absence of an answer does not.
2. Answers to Q4 (meeting language) and Q7 (consent and retention policy).
3. Confirmation of the Supabase project position (Q2).

Questions Q3, Q5 and Q6 can be answered later without delaying M1.

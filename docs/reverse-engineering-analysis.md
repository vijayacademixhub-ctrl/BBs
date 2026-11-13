# AcademicOS — Reverse-Engineering Analysis

**Status:** Awaiting source materials
**Last updated:** 2026-11-13
**Author:** Architecture phase (Milestone 0)

---

## 1. Purpose of this Document

This document is intended to record the analysis of the reference
application that AcademicOS is to be modelled upon. It is the controlling
reference for visual design, navigation structure, component inventory and
feature parity. All subsequent design decisions in
`docs/architecture.md` and `docs/database-architecture.md` are expected to
be traceable back to findings recorded here.

## 2. Inspection Performed

A full inspection of the repository `vijayacademixhub-ctrl/BBs` was carried
out on 2026-11-13 at commit-zero state. The following was examined:

| Inspection target | Method | Result |
|---|---|---|
| Working tree | Recursive directory listing | Empty (no tracked or untracked files) |
| Git history | `git log`, `git count-objects` | No commits; zero objects in the object database |
| Remote branches | `git ls-remote origin` | No refs present on the remote |
| Stashes | `git stash list` | None |
| Session upload area | Filesystem scan of workspace and home directory | No uploaded screenshots, archives or documents |

### 2.1 Finding

**No reference materials are present.** The repository contains only an
initialised `.git` directory. There is no source code, no screenshot set, no
design export, no API documentation and no database dump available to this
session. The reverse-engineering input described in the development brief
has not reached the workspace.

This is a statement of fact about the environment, not an inference about
the work already carried out. It is entirely possible that the reverse
engineering was completed and stored elsewhere — on a local machine, in a
different repository, or in a design tool.

## 3. Consequence for the Project

Sections 4 through 9 of this document cannot be completed until materials
are supplied. They are retained below as an unfilled analysis framework so
that the structure of the deliverable is fixed in advance and can be
completed in a single pass once inputs arrive.

Critically, the brief instructs that the reference design must be preserved
and must **not** be replaced with a generic SaaS dashboard. That instruction
cannot be honoured without the reference. Accordingly:

- No visual design decisions have been locked in at this stage.
- The architecture documents deliberately specify *structure* (data model,
  API surface, permission model, AI pipeline) rather than *appearance*.
  Structure is stable against the arrival of a reference design; appearance
  is not.
- The component library choice (shadcn/ui on Tailwind) is retained because
  it is design-token driven and can be re-themed to match a reference
  without rewriting components. This is the main mitigation available.

## 4. Features Identified

*To be completed on receipt of materials.*

Each feature is to be recorded as: feature name, entry point, user roles
with access, inputs, outputs, dependencies, and whether it is in scope for
AcademicOS.

## 5. UI Component Inventory

*To be completed on receipt of materials.*

Each component is to be recorded as: component name, where it appears,
variants and states observed, props implied by the variation, and the
shadcn/ui primitive it maps to.

## 6. Page Structure and Navigation Hierarchy

*To be completed on receipt of materials.*

To be captured as a route tree with layout nesting, together with which
routes are public, authenticated, or role-restricted.

## 7. Design Tokens

*To be completed on receipt of materials.*

To be captured as: type scale and font families, colour palette with
semantic role per colour (surface, muted, border, primary, destructive,
success, warning), spacing scale, radius scale, shadow scale, icon set and
icon sizing, and breakpoint values. These are to be written directly into
the Tailwind theme so that extraction is a one-time cost.

## 8. User Workflows

*To be completed on receipt of materials.*

To be captured as step sequences for each primary task, noting the screens
traversed, the validation encountered, and the terminal states.

## 9. Gap Analysis

*To be completed on receipt of materials.*

To be captured as a three-column assessment: present in reference and
required; present in reference but out of scope; required by AcademicOS but
absent from the reference. The third column is expected to be large, since
recording, transcription, AI extraction and the verification workflow are
new capability rather than reproduced capability.

---

## 10. Materials Required

To complete this document, any subset of the following would be sufficient,
in descending order of usefulness:

1. **The reference source code** — committed to a branch of this repository,
   or supplied as an archive. This is by far the most valuable input, since
   it yields the component inventory, the routing tree and the design tokens
   directly rather than by estimation.
2. **A full screenshot set** — one capture per screen, at desktop width, in
   both default and populated states. Mobile captures additionally if the
   reference has a distinct mobile layout.
3. **Design-tool export** — a Figma file link, from which tokens and
   component structure can be read programmatically.
4. **The live URL**, if the reference is publicly reachable.
5. **API documentation or a database schema dump**, which would allow the
   data model in `docs/database-architecture.md` to be reconciled against
   an existing one rather than designed from first principles.

A single ZIP archive committed to the repository, or pushed to a branch, is
the most direct route.

## 11. Assumptions Recorded in the Absence of Materials

The following assumptions have been made so that architecture work could
proceed. Each is flagged for revision once the reference is available.

| # | Assumption | Revisable |
|---|---|---|
| A1 | The reference is a dashboard-style web application with a persistent left sidebar, a top header carrying user identity, and a content region. | Yes — the entire shell is isolated in one layout component. |
| A2 | The reference does not already implement recording, transcription or AI extraction; these are new build. | Yes |
| A3 | No existing database schema must be preserved for compatibility. | Yes, but costly to revise — see §10.5. |
| A4 | The reference imposes no constraint preventing the use of React, Tailwind and shadcn/ui. | Yes |

Assumption A3 is the expensive one. If an existing schema must be matched,
it should be supplied before Milestone 2 begins, not after.

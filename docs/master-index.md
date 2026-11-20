# The Master Index

## 1. What changed, and why

The team's Master Index arrived as a workbook of five sheets: a document
index, a work allocation, a weekly review, a source map and a partly started
programme structure. It is a good workbook. It has three problems that no
amount of care in a spreadsheet fixes.

It opens onto a wall of rows. The questions people actually arrive with —
what has no owner, what is overdue, what changed since Friday, where is the
document about admissions — are not answerable by looking at it; they are
answerable by reading it.

It keeps no history. A value that moved cannot be explained afterwards, and
when several people edit the same file, a correction and an accident look
identical.

It grows by hand. Every new thing the team needs to record is a new column
somewhere, and columns added under pressure end up inconsistent between
sheets.

The module in this application is built around those three problems, not
around reproducing the workbook.

## 2. The register

A register is a named collection of records over a field list that the
register itself carries. The document index is one; work allocation is
another; anything the team adds later is another again.

This indirection is the whole design. Because the field list is data rather
than a database table, a new column is an action in the interface rather than
a migration and a release. The team said more will be added; this is what
makes that cheap.

Records hold their values keyed by field id. A field's id never changes, so
renaming a column changes its label and nothing else, and no record has to be
rewritten.

### 2.1 Registers as imported

| Register | Group | Records | From |
|---|---|---|---|
| Document Master Index | Records | 33 | the `Master Index` sheet |
| Work Allocation | Work | 26 | the `Work Allocation` sheet |
| Weekly Review | Work | 1 | the `Weekly Review` sheet |
| Source Map | Governance | 41 | the `Source Map` sheet |
| Programme Structure | Academics | 2 | `Sheet1` |

Drive hyperlinks were carried across from the workbook's cells, so a link
opens the same folder it opened in Excel. The import is reproducible:
`scripts/import_master_index.py` reads `docs/source-data/Master_Index.xlsx`
and regenerates `apps/web/src/lib/sample/registry-seed.ts`.

The workbook's **Member Summary** sheet was not imported. It was a sheet of
formulas counting the allocation sheet, and it is now computed on the page
from the records themselves, so it cannot disagree with them.

## 3. The hub, and why it does not show the index

`/master-index` opens on the registers, not on their contents: a card per
register with its record count, what is incomplete, what is overdue and when
it last changed, above one search box that covers every column of every
register at once.

This is deliberate and is the main departure from the workbook. Opening
directly onto a table is what made the workbook something to be read rather
than used. A register opens when someone chooses it.

## 4. Editing

Click a cell, type, press Enter. Escape abandons the change; in a paragraph
field, Enter inserts a line break and Ctrl+Enter commits.

Each commit saves on its own rather than behind a Save button. A shared index
is edited in passing — between meetings, on a phone — and an unsaved buffer
is how corrections get lost.

Every change is recorded with its before and after value, and the recent ones
appear on the hub. This is an aid to the team, not the audit trail; the
authoritative trail is `public.audit_logs`, written by a database trigger.

## 5. Adding columns and registers

**Columns.** *Columns* on any register. Give the column a name and a type —
short text, paragraph, choice, date, link, number, percentage — and it
appears in the grid immediately.

Two rules are enforced rather than left to care. A column that came from the
workbook can be hidden but not deleted, because everyone depends on those and
a mistaken deletion would be felt at once. Deleting a column you added
removes the column, not the values: putting it back brings the content with
it.

**Registers.** *New register* on the hub. It starts with a Title and a Notes
column; add the rest as they are needed.

A choice column keeps a value that is in the data but not in its options
list, rather than silently replacing it. Imported data rarely matches a tidy
list, and discarding what does not fit is how an import quietly loses
information.

## 6. The separate window

**Separate window** opens one register in a real operating-system window,
which can sit beside a meeting or on a second screen. It is not a modal and
not a second tab.

The window has no application navigation: it exists to hold one register, and
a navigation tree would invite someone to wander out of it into a window with
no way back. It is still behind sign-in and the second factor — the URL is no
way around either.

The window is named after its register, so asking for the same one twice
brings the existing window forward instead of opening a second editable view
of the same records.

A standalone build using the in-memory router has no real URLs and so cannot
address a second window. The button reports that rather than opening
something broken.

## 7. Where it appears elsewhere

**The dashboard** reports total records, open items, missing information and
overdue, and lists the registers with something outstanding. Those figures
come from the same `computeHealth` the registers themselves use, so the two
cannot disagree.

**The calendar** includes every dated row in every register alongside
meetings and task deadlines. A due date in Work Allocation is a commitment
nobody saw until someone opened that register; now it appears with everything
else and can be exported or blocked.

## 8. Where the data lives

Without a backend, registers live in the browser's local storage: specific to
one device, and not shared. The interface says so on every screen.

With Supabase configured, they live in `registers`, `register_fields`,
`register_records` and `register_record_changes` (migration 0019). Row Level
Security scopes them to the team: every member can read and edit the
registers, which is deliberate and differs from meeting content — an index
only one person can correct goes stale. Deleting a register is narrower, and
a register imported from the workbook cannot be deleted at all.

Loading the workbook into a fresh database is an explicit action rather than
something that happens on startup, so a second copy cannot appear beside one
a colleague has already begun editing.

## 9. Verifying it

```bash
npm run build
```

```bash
npm run preview
```

```bash
npm run verify:registry
```

Thirty checks against the real interface, including that an inline edit
survives a reload, that a column added at runtime reaches the grid, that a
workbook column cannot be deleted, and that the separate window shows the
same records.

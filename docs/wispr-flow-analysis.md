# Reverse-engineering analysis — Wispr Flow

**Source material:** one screenshot of the Wispr Flow desktop application,
supplied 23-Nov-2026.
**Purpose:** decide which of its ideas are worth taking into AcademicOS.
**Status:** analysis complete; three features adopted, four declined.

This supersedes nothing in
[reverse-engineering-analysis.md](reverse-engineering-analysis.md), which
records that no reference material was available at Milestone 0. This is the
first time any has been.

---

## 1. What the screenshot shows

A dictation application built around a global hotkey. The left rail lists
**Dictation, Notetaker, Insights, Dictionary, Snippets, Style, Transforms,
Scratchpad**. The main panel is a reverse-chronological list of dictations,
each a timestamp and a line of text, with copy, flag and overflow actions.
The right panel shows **total words, words per minute, day streak**, and a
**Voice Profile** that unlocks after a word count.

A setup checklist sits bottom-left: *Try Notetaker, Connect calendar, Import
your past meetings, Set up MCP.*

## 2. What is worth taking, and what is not

The test applied was not "is this a good feature" but "does this solve a
problem this team actually has". Four of the eight did not.

| Their feature | Verdict | Reasoning |
|---|---|---|
| **Dictionary** | **Adopted** | The strongest item by some distance. Our own test transcribed *Karshima* as *Kashima*. Speech models fail on unfamiliar proper nouns in predictable ways, and naming them beforehand is the one intervention that reliably fixes it. The team's vocabulary is full of such names — Karshima, Hepsi, Lalbagh, OBE, TLEP, WOW. |
| **Transforms** | **Adopted, narrowed** | Rewriting a raw transcript into minutes is work this team does by hand every week. Taken as a fixed list rather than a free instruction — see §4. |
| **Insights** | **Adopted, reinterpreted** | Taken as a page, rejected as a concept — see §3. |
| **Snippets** | **Adopted as data only** | Saved phrases are plainly useful for recurring remarks. Implemented as a register; no insertion UI yet, so it is a shared phrasebook rather than a text expander. |
| Dictation anywhere | Declined for now | Wispr's central feature and genuinely good, but it needs a global hotkey and OS integration that a web application cannot have. Dictating into a specific field is possible and may be worth doing later. |
| Style / Voice Profile | Declined | Learning an individual's speaking style serves a personal writing assistant. Institutional minutes should read the same whoever recorded them. |
| Scratchpad | Declined | A notes area with no structure, next to a system whose whole argument is that structure is what makes a note findable six weeks later. |
| Day streak | **Declined, firmly** | See §3. |

## 3. Insights: the same screen, a different premise

The right-hand panel of the screenshot counts words, words per minute and
consecutive days. These are engagement metrics. They measure how much
somebody used the product, which is the vendor's interest rather than the
user's.

The adopted version keeps the shape and changes what is counted. It reports
how much of the index has an owner, how many meetings left a written record
rather than only a memory, how many extracted figures carry a stated date,
and — the figure that matters most — **what proportion of the figures a model
proposed a person has actually checked**.

A day streak was declined on its own terms. Attaching a reward to recording
daily work creates a reason to file an entry on a day when nothing happened,
and the entry is then worth less than the silence it replaced. The same
objection applies to words per minute: it rewards talking.

## 4. Transforms: a closed list, deliberately

Wispr's Transforms appear to accept a user's own instruction. Ours does not.
Five are defined in the code — tidy the wording, format as minutes, condense
to points, translate to English, make it formal — and the endpoint refuses
anything else.

Two reasons. An endpoint that takes an arbitrary instruction and a block of
text is a general-purpose model proxy on a public URL, usable by anyone who
finds it, at the project's expense. And every one of these prompts carries
the same explicit prohibition: **never add, remove, round or reword a number,
a date, a name or a decision.** The failure that matters is not a clumsy
rewrite; it is a model tidying a transcript by rounding 62% to 60%, or
resolving "next Friday" into a date nobody said — after which it reads as
what was decided in the meeting. A free-text instruction cannot carry that
guarantee.

The interface says so too: *wording only, the previous version is kept until
you leave this screen.*

## 5. The setup checklist

The one piece of interaction design worth copying outright. Wispr shows
progress through *Try Notetaker, Connect calendar, Import past meetings, Set
up MCP* — unobtrusive, and it makes the unfinished parts of setup visible
rather than leaving them to be discovered.

AcademicOS has exactly this problem: the calendar is unconnected, Drive
synchronisation is waiting on a service account, eleven accounts still carry
placeholder names, and fifteen passwords are unchanged. These are currently
recorded in the README, which is the wrong place for them, because nobody
reads a README twice.

**Not built.** It is the most valuable remaining item from this analysis.

## 6. What was built

| Feature | Where |
|---|---|
| Dictionary | A register, `vocabulary`, seeded with 20 terms. Its contents are sent to the transcription model before it listens. |
| Transforms | `api/transform.ts`, five fixed rewrites, offered on the capture review screen. |
| Insights | `/insights`, computed from the same records every other screen reads. |
| Snippets | A register, `snippets`. Data only. |

The Dictionary is the one to watch. Add a row whenever the transcription
mishears a name — the **Heard as** column is there to record what it got
wrong, so the pattern is visible later.

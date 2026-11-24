# Capture without keeping audio

## 1. The decision

Meeting audio is never stored. A capture session holds the microphone stream
in the browser, transcribes it as it goes, and discards each piece as soon as
its text comes back. What is kept is the note: the transcript, the data
points taken from it, the decisions and the actions.

This replaces the earlier design, in which audio was uploaded to a private
bucket and a transcript derived from it afterwards. That design is described
in `docs/architecture.md` and in the migrations; §5 below says what remains
of it.

## 2. How the claim is made true

It would be easy to say "we don't keep the audio" and leave a path that does.
Four separate things prevent it.

**The audio is never whole.** The recorder is restarted every forty seconds
rather than left running with a timeslice, so each segment is a complete,
self-contained file. The reason is technical — a WebM stream is only
decodable from its header, so timeslice chunks after the first cannot be
transcribed on their own — but the consequence is the one that matters: at no
point does a recording of the whole meeting exist anywhere. The only audio in
memory is the segment being recorded now.

It also keeps each request under the platform's body limit, which an hour of
audio would exceed.

**The server writes nothing.** `/api/transcribe` receives a segment, forwards
it to the transcription provider and returns the text. There is no storage
client in that function, no filesystem write and no database handle. The
buffer goes out of scope when the request ends.

**The database refuses the claim.** `meeting_notes.audio_retained` is
constrained to `false`. A row asserting that audio was kept cannot be
inserted. No column in `meeting_notes`, `meeting_note_data_points` or
`meeting_note_items` holds or references an audio file.

**A test checks the stored shape.** `npm run verify:capture` records with a
real microphone against a stand-in transcription endpoint, then reads what
was actually stored and asserts that no field name resembles audio, a
recording, a blob or a file, and that no blob URL appears anywhere in the
note.

## 3. What a session looks like

Consent first: the meeting is chosen, the spoken language is set, and
confirmation is given that everyone present has been told. The microphone is
requested only after that, never before.

While recording, the transcript grows on screen as each segment returns.
Pausing closes the segment in progress, so nothing is held while paused.
Stopping flushes the final segment and releases the microphone.

Then the note is assembled: the transcript can be corrected, a summary
written, and the data points entered. With an AI key configured, data points,
decisions and actions can be proposed from the transcript; everything the
model proposes is marked unverified and carries the passage it came from, and
a person has to confirm each one. That is the same gate the database applies
to AI-derived tasks and calendar events, enforced by a trigger rather than by
the correctness of application code.

## 4. Working without keys

Writing or pasting a transcript works with nothing configured at all, and
data points can always be entered by hand. That is not a fallback bolted on;
it is the path the team can use today, with recording becoming available when
`TRANSCRIPTION_API_KEY` is set on the deployment.

The interface asks `/api/status` what this deployment can do and says plainly
when something is unavailable, rather than offering a button that fails. The
status endpoint reports only whether a credential is present — never its
value, length or prefix.

Keys live in the deployment's server environment. None may be prefixed
`VITE_`: anything with that prefix is compiled into the browser bundle and
published.

## 5. What remains of the earlier design

The `recordings`, `transcripts` and `transcript_segments` tables and the
`meeting-recordings` storage bucket still exist in the schema. The
application writes to none of them.

They were not dropped in migration 0019 for one reason: the access-control
suite covers them in detail — who may read a recording, what a storage policy
permits, what a cross-team session can reach — and dropping the tables means
deleting those tests. That belongs in its own change, where the tests are
rewritten against what replaced them rather than removed to make a migration
apply.

Until then the position is: dormant, unused, and documented as such. Anyone
auditing this system should know those tables are there and that nothing
fills them. `app_settings` records the decision under
`capture.audio_retention`.

## 6. Consent and retention

The retention policy tables remain unapproved and disabled, as
`docs/retention-and-consent.md` describes. This change does not alter that —
it reduces what there is to retain. There is no audio retention period to
approve because there is no audio.

Transcripts and data points are institutional records and are retained. The
consent step says exactly that, rather than the vaguer claim that a meeting
is "being recorded".

## 7. Verifying it

```bash
npm run build
```

```bash
xvfb-run -a npm run verify:capture
```

Twenty checks with a real microphone: that recording is blocked before
consent, that a segment is sent on pause and transcribed, that segments join
in order, that the microphone is released, and that the stored note carries
the transcript and no audio of any kind.

Headless Chromium has no audio device, which is why a virtual display is
needed on Linux. On a desktop machine, `npm run verify:capture` is enough.

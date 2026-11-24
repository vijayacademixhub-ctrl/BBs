# Deploying to Vercel

## 1. What gets deployed

Two things, from one repository:

- the browser application, built by `npm run build` into `apps/web/dist`;
- four functions in `/api`, which hold the keys the browser must not see —
  `status`, `transcribe`, `extract` and `calendar/block`.

`vercel.json` sets the build command, the output directory and a single-page
rewrite so that a deep link such as `/master-index/work-allocation` serves the
application rather than a 404. Requests beginning `/api/` are excluded from
that rewrite, so the functions keep working.

The same file sets `X-Content-Type-Options`, `Referrer-Policy`,
`X-Frame-Options`, a `Permissions-Policy` that allows the microphone only to
this origin, and `Cache-Control: no-store` on every API response.

## 2. Creating the project

In the Vercel dashboard: **Add New → Project**, import
`vijayacademixhub-ctrl/BBs`, and deploy. Every setting that matters is in
`vercel.json`, so nothing needs to be filled in; leave the framework preset
as **Other**.

### 2.1 The production branch

The repository's default branch is what Vercel treats as production. The work
described in these documents is on `claude/exciting-davinci-brt4gr`. Until
that branch is either merged into the default branch or set as the project's
production branch (**Settings → Git → Production Branch**), the production
URL will serve the older code and a deployment from this branch will appear
as a preview.

A preview deployment is fully functional — same build, same functions, its
own URL.

## 3. Environment variables

**Settings → Environment Variables.** None of these may be prefixed `VITE_`:
anything with that prefix is compiled into the browser bundle and published
to anyone who opens the site.

| Variable | Needed for | Notes |
|---|---|---|
| `TRANSCRIPTION_API_KEY` | recording | Any OpenAI-compatible transcription endpoint |
| `TRANSCRIPTION_API_URL` | optional | Defaults to OpenAI's |
| `TRANSCRIPTION_MODEL` | optional | Defaults to `whisper-1` |
| `AI_API_KEY` | proposing data points | Transcript in, JSON out |
| `AI_API_URL`, `AI_MODEL` | optional | Defaults to OpenAI's and `gpt-4o-mini` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | calendar blocking | See `docs/calendar-setup.md` |
| `GOOGLE_PRIVATE_KEY` | calendar blocking | PEM block, pasted with real line breaks |
| `GOOGLE_CALENDAR_ID` | calendar blocking | Or `primary` |
| `VITE_SUPABASE_URL` | real accounts and shared data | Public by design |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | real accounts and shared data | The publishable key, never the service-role key |

Variables are read at build and deployment time. After adding them, redeploy.

Without the two `VITE_SUPABASE_*` values the application runs on local
demonstration data, labels itself as such on every screen, and keeps each
person's edits in their own browser. That is a working state, not a broken
one — but it is not a shared index.

## 4. Who can see it

**A Vercel deployment URL is public unless protection is turned on.** The
registers carry the team's real document index: names, Drive links,
allocations. Anyone holding the URL can read all of it.

Before the link is shared, go to **Settings → Deployment Protection** and
turn on **Vercel Authentication**, which limits access to members of the
Vercel account. On the Hobby plan this covers preview deployments; protecting
a production deployment requires a paid plan. Until Supabase is configured
there is no sign-in of any kind in the application itself, so the deployment's
own protection is the only thing in front of that data.

Treat the URL as confidential until one of the two is in place.

## 5. After deploying

Check, in this order:

1. The dashboard loads and the Master Index figures are not zero.
2. A deep link works: open `/master-index/documents` directly. A 404 means
   the rewrite is not being applied.
3. `/api/status` returns JSON. If it returns the application's HTML instead,
   the functions did not deploy.
4. The Capture page reports whether transcription is configured, and the
   Calendar page whether the calendar is connected. Both should match what
   you set in §3.

## 6. Limits worth knowing

A function request body is capped at about 4.5 MB, which is why audio is
transcribed in forty-second segments rather than uploaded whole; an hour of
audio would exceed it several times over. See `docs/audio-free-capture.md`.

Hobby functions have a short execution limit. Transcribing one segment is
well inside it; transcribing a whole meeting in one request would not be,
which is a second reason the work is segmented.

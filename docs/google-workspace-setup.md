# Google setup — what you need to do

Three things want Google access: **calendar blocking**, **Drive
synchronisation**, and **signing in with a Jain University address**. The
first two share one credential; the third is separate.

All of it is free. The Calendar API, the Drive API and Google sign-in cost
nothing at the volumes this uses.

Nothing on this page is done yet, because none of it can be done without
you: these are credentials and administrative decisions. The code is built
and waiting — the moment the values land in the Vercel environment, the
features switch on without a redeployment of anything but settings.

---

## 1. One service account, for calendar and Drive

### 1.1 Create it

In the [Google Cloud console](https://console.cloud.google.com), pick or
create a project. You may use the project your Gemini key already belongs to.

Under **APIs & Services → Library**, enable both:

- **Google Calendar API**
- **Google Drive API**

Under **IAM & Admin → Service Accounts**, create a service account. Name it
something recognisable — `academicos-sync` — and give it **no project role**.
Its access comes from what you share with it, not from the project.

### 1.2 Download its key

On the service account, **Keys → Add key → Create new key → JSON**. The file
contains `client_email` and `private_key`.

Treat it like a password. Anyone holding it can read every Drive folder and
write to every calendar that has been shared with that address. Do not commit
it, and do not send it in a chat message — including to me.

### 1.3 Share the calendar with it

Create a calendar called **Baseline Builders** (Google Calendar → *Other
calendars* → *Create new calendar*). A separate calendar rather than your
personal one is the decision you already took: the app writes there and
nowhere else, so nothing it does can disturb your own diary.

In that calendar's settings, under **Share with specific people**:

- add the service account's `client_email`, permission **Make changes to
  events** — this is what lets the app write;
- add each team member, permission **See all event details** — read-only, so
  nobody can move or delete a blocked slot by accident.

That combination is what "locked" means here: one writer, everyone else
reads.

Copy the **Calendar ID** from the same settings page. It looks like
`abc123@group.calendar.google.com`.

### 1.4 Share the Drive folders with it

For each folder in the Document Master Index — or, more simply, for the one
parent folder that contains them — share it with the service account's
address, permission **Viewer**.

Viewer is enough and is the right level. Synchronisation only reads: the
modified date, the current name, and the owner. It never writes to Drive and
never downloads a file.

**Anything not shared with it is invisible to it.** That is the control, and
it is why no further restriction is needed: the service account can reach
exactly what you have handed it and nothing else in your Drive.

### 1.5 Put the values in Vercel

Vercel → the `academicos` project → **Settings → Environment Variables**:

| Name | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | the `client_email` from the JSON |
| `GOOGLE_PRIVATE_KEY` | the `private_key` from the JSON, including the `BEGIN`/`END` lines |
| `GOOGLE_CALENDAR_ID` | the calendar ID from §1.3 |

The private key is a PEM block over several lines. Paste it with its real
line breaks; the code also accepts the single-line `\n`-escaped form.

Never prefix any of these `VITE_`. That prefix publishes a value in the
browser bundle.

**Redeploy afterwards.** Environment variables are read at deployment time.

### 1.6 What then works

- **Calendar → Block** starts working. Pressing it twice cannot create two
  entries.
- **Master Index → Document Master Index → Sync from Drive** appears. It
  updates the last-updated date, records the file's current Drive name in its
  own column, and fills an owner where the register has none. It does not
  touch your document names, statuses or remarks, and it reports any link it
  could not open — usually one that was not shared.

---

## 2. Signing in with a Jain University address

This is separate from §1 and needs its own credential.

### 2.1 Check with whoever administers the Workspace

Some Google Workspace domains block third-party applications from signing
people in until an administrator allows them. If `jainuniversity.ac.in` is
configured that way, the sign-in button will fail for everybody until it is
approved. Worth asking before you build it rather than after.

### 2.2 Create an OAuth client

Google Cloud console → **APIs & Services → OAuth consent screen**. Choose
**Internal** if the project belongs to the university's Workspace — that
limits sign-in to university accounts automatically, which is probably what
you want. Choose **External** only if people outside the domain must sign in.

Then **Credentials → Create credentials → OAuth client ID → Web application**:

- **Authorised JavaScript origins:** `https://academicos-chi.vercel.app`
- **Authorised redirect URI:**
  `https://prxfztbafgbnxnglqaje.supabase.co/auth/v1/callback`

The redirect goes to Supabase, not to the site. Supabase handles the exchange
and then returns the person to the site.

### 2.3 Enable it in Supabase

Supabase dashboard → **Authentication → Sign In / Providers → Google**.
Enable it and paste the client ID and client secret.

The **Sign in with your Jain University account** button then appears on the
sign-in page by itself. It is hidden until the provider is actually enabled,
so there is never a button that leads to an error.

### 2.4 Link it to the existing accounts

Signing in with Google **identifies** someone; it does not create an account
here. For it to work, the Google address must match the `email` on their
profile.

The fifteen accounts currently use `name@bbs.local`, which no Google account
will ever match. So for each person who should use Google sign-in, change
their email — in the Supabase dashboard, in **both** `auth.users` and
`public.profiles` — to their real `@jainuniversity.ac.in` address.

Do your own account last, and keep one password account working until you
have confirmed Google sign-in succeeds. Changing every address at once and
discovering the Workspace blocks the app would lock everybody out,
yourself included.

---

## 3. The short version

| # | What | Where | Blocks |
|---|---|---|---|
| 1 | Enable Calendar API and Drive API | Google Cloud | both |
| 2 | Create a service account, download its JSON key | Google Cloud | both |
| 3 | Create the Baseline Builders calendar; share it with the service account as editor and the team as readers | Google Calendar | blocking |
| 4 | Share the Drive folders with the service account as Viewer | Google Drive | sync |
| 5 | Add the three variables, redeploy | Vercel | both |
| 6 | Ask whether the Workspace permits third-party sign-in | Jain IT | login |
| 7 | Create an OAuth client with the redirect above | Google Cloud | login |
| 8 | Enable Google in Supabase with the client ID and secret | Supabase | login |
| 9 | Change each person's email to their real address | Supabase | login |

Steps 1–5 are independent of 6–9. Doing the first group gets you calendar
blocking and Drive synchronisation without touching how anyone signs in.

# Calendar setup

## 1. What works without any credentials

Export. The **Calendar** page gathers every dated thing in the system —
meetings, task due dates, and every dated row in a Master Index register —
and writes an `.ics` file. That file opens in Google Calendar, Outlook and
Apple Calendar alike. It needs no account connection, no consent screen and
no key, and it is available today.

Use it as the working path while the rest of this page is being arranged.

## 2. Why an API key is not enough

This is the part worth reading before anything is provisioned.

A Google API key identifies a *project*, not a person. The Calendar API
accepts it only for reading data that is already public. Creating an event,
or blocking time, is a write against somebody's calendar, and Google requires
an identity that has been granted permission to make that change. An API key
carries no such identity, so the request is refused however the key is
configured.

There are two forms of credential that do work.

**A service account**, which is what this implementation uses. The service
account is an identity of its own with its own email address. You share the
calendar with that address, exactly as you would with a colleague, and give
it permission to make changes. It then writes to that one calendar and
nothing else. This suits a calendar the team shares.

**A per-user OAuth connection**, where each person signs in to Google and
grants the application access to their own calendar. This is the right answer
when the target is each person's private calendar rather than a shared one.
It is a larger piece of work — a consent screen to register and verify,
refresh tokens to store and rotate — and the database already has the tables
for it (`calendar_connections` and `calendar_credentials`, where the tokens
live behind Row Level Security with no policies at all, so no browser session
can read them). It is not built.

## 3. Setting up the service account

**3.1 Create the project and the account.** In the
[Google Cloud console](https://console.cloud.google.com), select or create a
project. Under **APIs & Services → Library**, enable the **Google Calendar
API**. Under **IAM & Admin → Service Accounts**, create a service account; no
project role is needed, because its access comes from the calendar share in
step 3.3, not from the project.

**3.2 Create a key.** On the service account, open **Keys → Add key → Create
new key → JSON** and download the file. It contains `client_email` and
`private_key`. Treat the file as a password: anyone holding it can write to
every calendar shared with that account. Do not commit it, and do not paste
it into a chat or an email.

**3.3 Share the calendar.** In Google Calendar, open the settings of the
calendar the team uses. Under **Share with specific people**, add the
service account's `client_email` address and set its permission to **Make
changes to events**. This step is what actually grants access; without it
every request returns 403 or 404.

**3.4 Set the deployment's environment.** In the Vercel project, under
**Settings → Environment Variables**, add:

| Name | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | the `client_email` from the JSON file |
| `GOOGLE_PRIVATE_KEY` | the `private_key` from the JSON file, including the `BEGIN`/`END` lines |
| `GOOGLE_CALENDAR_ID` | the calendar's ID, or `primary` |

The private key is a PEM block spanning several lines. Paste it into the
Vercel field with its real line breaks; the function also accepts the
single-line `\n`-escaped form that a local `.env` file needs.

None of these may ever be prefixed `VITE_`. Anything with that prefix is
compiled into the browser bundle and published to everyone who opens the
site.

**3.5 Redeploy.** Environment variables are read at deployment time. After
saving them, redeploy; the Calendar page will then report that it is
connected and **Block** becomes available.

## 4. What blocking does

**Block** creates an event on the shared calendar for that meeting, task or
register deadline. A deadline with no time of day is blocked for an hour from
09:00 in the browser's time zone.

Pressing **Block** twice does not create two events. The event's id is derived
from the thing being blocked rather than from the moment of the click, so the
second request carries the same id; Google refuses it and the application
reports that the time was already blocked. The same holds for a retry after a
network failure where it was unclear whether the first request arrived. This
is deliberate: a retry loop against a calendar is how a team ends up with the
same meeting in their diary four times.

Attendees are not invited. A service account cannot add attendees without
domain-wide delegation, and silently adding people to a calendar entry is not
a small side effect to take on by default.

## 5. Checking it

On the Calendar page, the notice at the top states whether the calendar is
connected. It reads that from `/api/status`, which reports only whether the
credentials are present — never their value, length or prefix, since any of
those narrows a guess.

If **Block** fails after the setup above, the message distinguishes the two
usual causes: a failure to authenticate (the email or key is wrong, or the
Calendar API is not enabled) from a refusal by the calendar itself (step 3.3
was missed, or the permission is too low).

## 6. What is not built

- Two-way synchronisation. Events are written, never read back, so a change
  made in Google Calendar is not reflected here.
- Per-user calendars, for the reasons in §2.
- Automatic blocking. Every event is created by someone pressing **Block**.
  Nothing writes to a calendar on its own, which is the right default for a
  system whose entries appear in other people's diaries.

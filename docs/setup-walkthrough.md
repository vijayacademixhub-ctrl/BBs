# Setup walkthrough — what to do, in what order

The dashboard now carries a **Finishing the setup** card that detects what is
still outstanding and disappears item by item as you deal with it. This page
is the companion to that card: the card tells you *what* is left, and this
tells you *how*, in the order that matters.

The order is not arbitrary. Two items carry a live exposure today and should
be done before anything else, however small they look. The rest can wait for
an afternoon when you have the Google console open.

| | Session | Time | Why now |
|---|---|---|---|
| 1 | Your own account | 10 min | Nothing else can be administered until this is done |
| 2 | The two live exposures | 10 min | Anyone can create an account; your Gemini key is public |
| 3 | The Google service account | 30 min | Switches on calendar blocking and Drive sync |
| 4 | Jain University sign-in | 20 min | Optional, and needs the Workspace administrator |
| 5 | Housekeeping | 15 min | Real names, a second administrator |

---

## Session 1 — Your own account

### 1.1 Sign in and enrol an authenticator app

Open <https://academicos-chi.vercel.app> and sign in as `vijay@bbs.local`.

Because your account is the Super Admin, the site will send you straight to
an enrolment screen before it shows you anything else. This is deliberate.
The Super Admin can read every meeting transcript, every register and every
person's work, and a password alone is not enough to stand in front of that.
Nobody else is asked to do this: the other fourteen accounts sign in with a
password and nothing more.

You will need an authenticator app on your phone. **Google Authenticator**,
**Microsoft Authenticator** and **Authy** all work; any app that reads a QR
code and shows a six-digit code that changes every thirty seconds will do.
Scan the code the screen shows you, then type the six digits back in.

> **If you tried this before today and saw an empty dashboard instead of the
> enrolment screen, that was a fault at my end, not yours.** The database was
> refusing to tell the site what your role was, so the site concluded you were
> an ordinary member and never offered you the enrolment screen — while
> refusing every piece of data on the grounds that you had not enrolled. It is
> fixed, and the repair is described in §6.

Keep the recovery codes the enrolment screen gives you somewhere that is not
your phone. They are the way back in if the phone is lost, and §5.2 is the
other.

### 1.2 Change your password

**Settings → Password.** Your current one was chosen by me and travelled to
you in a chat message, which means it is not a secret. Ten characters
minimum; length matters more than punctuation.

Everyone else needs to do the same thing, and the checklist counts how many
have. Send them each to the same screen.

---

## Session 2 — The two live exposures

### 2.1 Close public sign-ups

**Supabase → Authentication → Sign In / Providers → Email**, and turn
**Allow new users to sign up** off.

Right now anybody who finds the URL can create an account. They would reach
no data at all — every table refuses a profile that is not an active team
member — but they would exist, and an account that exists is an account
somebody later has to reason about. Accounts should only come from you.

### 2.2 Replace the Gemini API key

The key you sent arrived in a chat message, so treat it as public from this
moment. Go to [Google AI Studio](https://aistudio.google.com/apikey), delete
that key, and create a new one.

Then put the new value in **Vercel → `academicos` → Settings → Environment
Variables → `GEMINI_API_KEY`**, and redeploy. Paste it into the Vercel form
and nowhere else — not into a chat with me, not into a file in the
repository. A key is only worth having while it is unread.

Transcription and data point extraction stop working until the new key is in
place, so do the two halves of this in one sitting.

---

## Session 3 — The Google service account

This is the one that visibly adds features: **Calendar → Block** starts
writing real events, and **Master Index → Document Master Index → Sync from
Drive** appears. One credential covers both. All of it is free at the volume
this uses.

The full detail is in [google-workspace-setup.md](google-workspace-setup.md)
§1. The shape of it, so you know what you are walking into:

1. In the [Google Cloud console](https://console.cloud.google.com), enable
   the **Calendar API** and the **Drive API**. You can reuse the project your
   Gemini key already lives in.
2. Create a service account — call it `academicos-sync` — and give it **no
   project role**. Its reach comes from what you share with it, nothing else.
3. Download its **JSON key**. This is a password in a file. Do not commit it
   and do not send it to me.
4. Create a calendar called **Baseline Builders**. Share it with the service
   account's address as **Make changes to events**, and with each team member
   as **See all event details**. One writer, everyone else reads — that is
   what locking the calendar means in practice, and it is why the app can
   never touch your personal diary.
5. Share the Drive folder that holds the index documents with the same
   address as **Viewer**. Read-only is enough: the sync reads a modified date,
   a name and an owner, and never downloads a file or writes anything back.
6. Put three values into Vercel — `GOOGLE_SERVICE_ACCOUNT_EMAIL`,
   `GOOGLE_PRIVATE_KEY`, `GOOGLE_CALENDAR_ID` — and **redeploy**.

Two things to be careful of. Never prefix any of those names `VITE_`: that
prefix is what tells the build to publish a value in the browser bundle, so a
secret carrying it is not a secret. And environment variables are read when a
deployment is built, not when it runs, so nothing changes until you redeploy.

The sharing step is the whole access control. **Anything you have not shared
with that address is invisible to it.** There is no further restriction to
configure, because there is nothing else it can reach.

---

## Session 4 — Signing in with a Jain University address (optional)

Worth doing, but it depends on somebody else, so it is last among the
functional items. Detail in
[google-workspace-setup.md](google-workspace-setup.md) §2.

Ask whoever administers `jainuniversity.ac.in` first, before building
anything. Some Workspace domains block third-party sign-in until an
administrator approves the application, and if yours is one of them the
button fails for everyone no matter how correctly it is configured.

If it is allowed: create an **OAuth client ID** (Web application) with
`https://academicos-chi.vercel.app` as the authorised origin and
`https://prxfztbafgbnxnglqaje.supabase.co/auth/v1/callback` as the redirect —
the redirect goes to Supabase, not to the site — then enable Google in
**Supabase → Authentication → Providers** and paste the client ID and secret.

The sign-in button appears by itself once the provider is live. It stays
hidden until then, so there is never a button that leads to an error.

Note that this adds a *way in*, it does not change who people are. Each
person's email in `profiles` still has to be changed to their real university
address for their Google sign-in to land on their existing account.

---

## Session 5 — Housekeeping

### 5.1 Give the placeholder accounts real names

Eleven accounts are still called *Member 05* and so on. **Supabase → Table
Editor → profiles**, and edit `full_name`. The name is what appears against
every task, register row and meeting note, so it is worth doing before the
team starts filing work under them.

### 5.2 Enrol a second Super Admin

You are currently the only one, and that account now requires an
authenticator app. A lost or wiped phone would therefore leave nobody able to
add people, schedule meetings or administer anything — recovery codes are the
first answer, a second administrator is the better one.

**Supabase → Table Editor → team_members**, and change one person's `role` to
`super_admin`. Choose someone who will actually enrol an authenticator app,
because they will be required to before they can use the site at all.

---

## 6 What was wrong, and what changed

Recorded here because it was serious and because it explains why §1.1 may not
have worked for you until now.

Whether a second factor is required is decided by a person's role, and the
role is stored in `team_members`. Migration 0020 carved out an exception so
that an unverified Super Admin could read their own `profiles` row — the
reasoning was right, but it stopped one table short. So the sequence was:
sign in, read the profile, then try to read `team_members` to learn the role
— and be refused, because the factor was not yet verified.

Over the REST API a refusal and an absence look identical: both are an empty
list, with no error. The site therefore concluded you were an ordinary member,
for whom no second factor is required, and sent you to the dashboard. Every
query that dashboard then made was refused by the same rule. The result was
not a locked door but an empty room, with no route to the screen that would
have opened it.

Migration 0022 extends the same carve-out to `team_members`: an unverified
Super Admin may read the single membership row that is their own — their role
and their team — and nothing else. Writes are still refused, and everything
about everybody else stays refused until a factor is verified.

The test suite had asserted the broken behaviour, which is why months of
green runs never caught it. It now asserts the rule instead: the own row is
readable and carries the real role, nobody else's is, writes are refused, and
the team id the carve-out reveals opens nothing hanging off it.

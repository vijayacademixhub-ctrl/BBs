import { createSign, createHash } from 'node:crypto'

/**
 * Blocks time on a Google Calendar.
 *
 * On credentials, read this before wiring anything up: an API key cannot do
 * this. A Google API key authenticates a project, not a person, and the
 * Calendar API accepts it only for reading public data. Creating an event is
 * a write against someone's calendar and needs OAuth. For a calendar a team
 * shares, the practical form is a service account: create one, enable the
 * Calendar API, then share the calendar with the service account's address
 * and give it "Make changes to events". The alternative — a per-user OAuth
 * flow with consent screens and refresh tokens — is the right answer when
 * each person's own calendar is the target, and is a larger piece of work.
 *
 * Duplicates are prevented by deriving the event id from the caller's
 * idempotency key. Asking twice, or retrying after a network failure that
 * may or may not have succeeded, produces the same id; Google refuses the
 * second insert with 409 and this reports success, because the event the
 * caller asked for exists. That matters more than it sounds: a retry loop
 * against a calendar is how a team ends up with the same meeting in their
 * diary four times.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/calendar.events'

interface BlockRequest {
  summary?: string
  description?: string
  start?: string
  end?: string
  /** IANA zone. Google needs one alongside a local date-time. */
  timeZone?: string
  attendees?: string[]
  idempotencyKey?: string
}

export async function POST(request: Request): Promise<Response> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKey = process.env.GOOGLE_PRIVATE_KEY
  if (!email || !privateKey) {
    return json(
      {
        error: 'not_configured',
        message:
          'No Google Calendar credentials are set on this deployment. A service account is ' +
          'needed — GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY — and the calendar must ' +
          'be shared with that account. An API key cannot create events. Until then, download ' +
          'the .ics file and open it in any calendar.',
      },
      503,
    )
  }

  let body: BlockRequest
  try {
    body = (await request.json()) as BlockRequest
  } catch {
    return json({ error: 'bad_request', message: 'Expected a JSON body.' }, 400)
  }

  const summary = (body.summary ?? '').trim()
  if (!summary) return json({ error: 'bad_request', message: 'summary is required.' }, 400)
  if (!body.start || !body.end) {
    return json({ error: 'bad_request', message: 'start and end are required.' }, 400)
  }
  if (new Date(body.end) <= new Date(body.start)) {
    return json({ error: 'bad_request', message: 'end must be after start.' }, 400)
  }

  const calendarId = process.env.GOOGLE_CALENDAR_ID ?? 'primary'
  const eventId = deriveEventId(body.idempotencyKey ?? `${summary}|${body.start}|${body.end}`)

  let token: string
  try {
    token = await accessToken(email, privateKey)
  } catch (error) {
    return json(
      {
        error: 'auth_failed',
        message:
          'The service account could not be authenticated. Check the email and private key, ' +
          'and that the Calendar API is enabled for the project.',
        detail: error instanceof Error ? error.message : undefined,
      },
      502,
    )
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
  const event: Record<string, unknown> = {
    id: eventId,
    summary,
    description: body.description ?? '',
    start: timePoint(body.start, body.timeZone),
    end: timePoint(body.end, body.timeZone),
  }
  // Attendees are sent only when asked for. A service account inviting people
  // without domain-wide delegation is refused by Google, and quietly adding
  // attendees to someone's calendar entry is not a small side effect.
  if (body.attendees?.length) {
    event.attendees = body.attendees.map((attendee) => ({ email: attendee }))
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(event),
    })
  } catch (error) {
    return json(
      {
        error: 'unreachable',
        message: 'Google Calendar could not be reached.',
        detail: error instanceof Error ? error.message : undefined,
      },
      502,
    )
  }

  if (response.status === 409) {
    return json({
      status: 'already_blocked',
      eventId,
      message: 'This time was already blocked. Nothing was duplicated.',
    })
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 500)
    return json(
      {
        error: 'calendar_error',
        status: response.status,
        message:
          response.status === 403 || response.status === 404
            ? 'The calendar refused the event. Check that it is shared with the service account ' +
              'with permission to make changes to events.'
            : 'Google Calendar refused the event.',
        detail,
      },
      502,
    )
  }

  const created = (await response.json()) as { id?: string; htmlLink?: string }
  return json({
    status: 'blocked',
    eventId: created.id ?? eventId,
    link: created.htmlLink ?? null,
  })
}

/** A date-only value becomes an all-day event; anything else is a moment. */
function timePoint(value: string, timeZone?: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { date: value }
  return timeZone ? { dateTime: value, timeZone } : { dateTime: value }
}

/**
 * Google requires event ids in base32hex (0-9, a-v) of 5–1024 characters.
 * A SHA-256 hex digest satisfies that and is stable for a given key, which is
 * exactly the property the idempotency depends on.
 */
function deriveEventId(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 40)
}

async function accessToken(email: string, privateKey: string): Promise<string> {
  // Vercel's dashboard keeps real newlines, but a .env file carries \n
  // escapes; accept both rather than making the format a trap.
  const pem = privateKey.includes('\\n') ? privateKey.replace(/\\n/g, '\n') : privateKey

  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(
    JSON.stringify({
      iss: email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  )

  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  const signature = signer.sign(pem).toString('base64url')
  const assertion = `${header}.${claims}.${signature}`

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!response.ok) {
    throw new Error(`Token exchange failed (${response.status}).`)
  }
  const body = (await response.json()) as { access_token?: string }
  if (!body.access_token) throw new Error('The token response carried no access token.')
  return body.access_token
}

function base64url(value: string): string {
  return Buffer.from(value).toString('base64url')
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

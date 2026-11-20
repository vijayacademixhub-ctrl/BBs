/**
 * ICS generation.
 *
 * This works on every device with no account connection, no credentials and
 * no consent screen, which is why it is the path that exists first. A
 * downloaded .ics opens in Google Calendar, Outlook and Apple Calendar alike,
 * so the team is not blocked on a service account being provisioned.
 */

export interface CalendarEntry {
  uid: string
  summary: string
  description?: string
  location?: string
  /** ISO moment, or a yyyy-mm-dd date for an all-day entry. */
  start: string
  /** Omitted for an all-day entry, which runs to the end of its day. */
  end?: string
}

/** Folds to 75 octets as RFC 5545 requires; Outlook is strict about it. */
function fold(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = []
  let rest = line
  parts.push(rest.slice(0, 75))
  rest = rest.slice(75)
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`)
    rest = rest.slice(74)
  }
  if (rest) parts.push(` ${rest}`)
  return parts.join('\r\n')
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

function stamp(iso: string): string {
  return `${new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
}

function dateOnly(value: string): string {
  return value.replace(/-/g, '')
}

function nextDay(value: string): string {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

export function buildIcs(entries: CalendarEntry[], calendarName = 'AcademicOS'): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AcademicOS//Master Index//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ]

  const now = stamp(new Date().toISOString())

  for (const entry of entries) {
    const allDay = /^\d{4}-\d{2}-\d{2}$/.test(entry.start)
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${entry.uid}@academicos`)
    lines.push(`DTSTAMP:${now}`)

    if (allDay) {
      lines.push(`DTSTART;VALUE=DATE:${dateOnly(entry.start)}`)
      // DTEND is exclusive for an all-day event, so a one-day entry ends on
      // the following date. Getting this wrong shows the deadline on the
      // wrong day, which is worse than no entry at all.
      lines.push(`DTEND;VALUE=DATE:${nextDay(entry.start)}`)
    } else {
      lines.push(`DTSTART:${stamp(entry.start)}`)
      lines.push(`DTEND:${stamp(entry.end ?? entry.start)}`)
    }

    lines.push(fold(`SUMMARY:${escapeText(entry.summary)}`))
    if (entry.description) lines.push(fold(`DESCRIPTION:${escapeText(entry.description)}`))
    if (entry.location) lines.push(fold(`LOCATION:${escapeText(entry.location)}`))
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return `${lines.join('\r\n')}\r\n`
}

export function downloadIcs(filename: string, ics: string): void {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export class CalendarError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
    this.name = 'CalendarError'
  }

  get isNotConfigured(): boolean {
    return this.code === 'not_configured'
  }
}

export interface BlockResult {
  status: 'blocked' | 'already_blocked'
  eventId: string
  link: string | null
  message?: string
}

/**
 * Blocks time on the shared Google Calendar.
 *
 * `idempotencyKey` is what stops a retry producing a second entry. It is
 * derived from the thing being blocked rather than from the moment of the
 * click, so asking twice is harmless by construction.
 */
export async function blockTime(entry: {
  summary: string
  description?: string
  start: string
  end: string
  idempotencyKey: string
}): Promise<BlockResult> {
  const response = await fetch('/api/calendar/block', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...entry,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  })

  if (!response.ok) {
    let body: { error?: string; message?: string } = {}
    try {
      body = (await response.json()) as typeof body
    } catch {
      // Not our function answering — a static host, most likely.
    }
    throw new CalendarError(
      body.message ?? `The calendar request failed (${response.status}).`,
      body.error ?? 'request_failed',
    )
  }

  return (await response.json()) as BlockResult
}

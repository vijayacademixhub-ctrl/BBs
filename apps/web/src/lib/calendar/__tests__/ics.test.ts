import { describe, expect, it } from 'vitest'
import { buildIcs } from '../ics'

/**
 * The details here are the ones that go wrong silently: an all-day event
 * whose end date is not exclusive shows on the wrong day, and an unescaped
 * comma or newline makes the file unreadable to a strict parser — both of
 * which look fine until someone opens the file in Outlook.
 */
describe('buildIcs', () => {
  it('wraps events in a valid calendar envelope', () => {
    const ics = buildIcs([
      {
        uid: 'meeting-1',
        summary: 'Progress review',
        start: '2026-12-01T10:30:00.000Z',
        end: '2026-12-01T11:30:00.000Z',
      },
    ])

    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    expect(ics).toContain('VERSION:2.0')
    expect(ics).toContain('UID:meeting-1@academicos')
    expect(ics).toContain('DTSTART:20261201T103000Z')
    expect(ics).toContain('DTEND:20261201T113000Z')
    expect(ics).toContain('SUMMARY:Progress review')
  })

  it('ends an all-day entry on the following date, because DTEND is exclusive', () => {
    const ics = buildIcs([
      { uid: 'task-1', summary: 'Submit the report', start: '2026-12-05' },
    ])

    expect(ics).toContain('DTSTART;VALUE=DATE:20261205')
    // Not 20261205: an exclusive end on the same date is a zero-length event,
    // which calendars either hide or show on the day before.
    expect(ics).toContain('DTEND;VALUE=DATE:20261206')
  })

  it('rolls an all-day entry over a month boundary', () => {
    const ics = buildIcs([{ uid: 'task-2', summary: 'Year end', start: '2026-12-31' }])
    expect(ics).toContain('DTEND;VALUE=DATE:20270101')
  })

  it('escapes the characters that would otherwise break the file', () => {
    const ics = buildIcs([
      {
        uid: 'task-3',
        summary: 'Review: budget, staffing; and intake',
        description: 'First line\nSecond line',
        start: '2026-12-05',
      },
    ])

    expect(ics).toContain('SUMMARY:Review: budget\\, staffing\\; and intake')
    expect(ics).toContain('DESCRIPTION:First line\\nSecond line')
    // The escaped newline must not have become a real one, which would end
    // the property and corrupt everything after it.
    expect(ics).not.toContain('DESCRIPTION:First line\r\nSecond line')
  })

  it('folds a long line rather than emitting one over the limit', () => {
    const ics = buildIcs([
      { uid: 'long', summary: 'A'.repeat(300), start: '2026-12-05' },
    ])

    for (const line of ics.split('\r\n')) {
      expect(line.length).toBeLessThanOrEqual(75)
    }
    // Continuation lines begin with a space, which is how a reader rejoins them.
    expect(ics).toContain('\r\n A')
  })

  it('writes every entry it is given', () => {
    const ics = buildIcs([
      { uid: 'a', summary: 'One', start: '2026-12-05' },
      { uid: 'b', summary: 'Two', start: '2026-12-06' },
      { uid: 'c', summary: 'Three', start: '2026-12-07T09:00:00.000Z', end: '2026-12-07T10:00:00.000Z' },
    ])

    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3)
    expect(ics.match(/END:VEVENT/g)).toHaveLength(3)
  })
})

import { describe, expect, it } from 'vitest'
import { formatDuration, initialsOf, isDueToday, isOverdue, todayISODate } from '@/lib/format'
import { format, subDays, addDays } from 'date-fns'

describe('formatDuration', () => {
  it('renders minutes below an hour', () => {
    expect(formatDuration(45)).toBe('45 min')
  })
  it('renders whole hours without trailing minutes', () => {
    expect(formatDuration(120)).toBe('2 hr')
  })
  it('renders hours and minutes together', () => {
    expect(formatDuration(90)).toBe('1 hr 30 min')
  })
})

describe('initialsOf', () => {
  it('takes the first letter of the first two words', () => {
    expect(initialsOf('Vijay Mourish DG')).toBe('VM')
  })
  it('handles a single name', () => {
    expect(initialsOf('Ananya')).toBe('A')
  })
})

describe('due date helpers', () => {
  it('treats a past date as overdue', () => {
    expect(isOverdue(format(subDays(new Date(), 1), 'yyyy-MM-dd'))).toBe(true)
  })
  it('does not treat today as overdue, since the whole day remains', () => {
    expect(isOverdue(todayISODate())).toBe(false)
  })
  it('does not treat a future date as overdue', () => {
    expect(isOverdue(format(addDays(new Date(), 2), 'yyyy-MM-dd'))).toBe(false)
  })
  it('treats an absent due date as not overdue', () => {
    expect(isOverdue(undefined)).toBe(false)
  })
  it('identifies a task due today', () => {
    expect(isDueToday(todayISODate())).toBe(true)
  })
})

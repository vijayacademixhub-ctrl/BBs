import type { Register, RegisterRecord } from '@/types/registry'
import { activeRecords } from '@/lib/registry/health'

export interface SearchHit {
  register: Register
  record: RegisterRecord
  title: string
  /** The field whose value matched, and the matching text. */
  matchedLabel: string
  matchedValue: string
}

/**
 * Search across every register at once.
 *
 * This is the reason the hub does not open onto a table. The question people
 * actually arrive with is "where is the thing about X", and until now the
 * answer meant opening the workbook and reading five sheets. Matching is a
 * plain case-insensitive substring over every field: a register whose columns
 * are user-defined cannot be given a hand-tuned index, and at the scale of a
 * few thousand records there is no reason to.
 */
export function searchRegisters(
  registers: Register[],
  records: RegisterRecord[],
  query: string,
  limit = 40,
): SearchHit[] {
  const needle = query.trim().toLowerCase()
  if (needle.length < 2) return []

  const byId = new Map(registers.map((r) => [r.id, r]))
  const hits: SearchHit[] = []

  for (const record of activeRecords(records)) {
    const register = byId.get(record.registerId)
    if (!register) continue

    let matchedLabel = ''
    let matchedValue = ''

    for (const field of register.fields) {
      const value = String(record.values[field.id] ?? '')
      if (!value) continue
      if (value.toLowerCase().includes(needle)) {
        // Prefer a match on the title field: it is what the person will
        // recognise, and a match in a long remarks column is less useful as
        // the thing to show them.
        if (!matchedLabel || field.id === register.titleFieldId) {
          matchedLabel = field.label
          matchedValue = value
        }
        if (field.id === register.titleFieldId) break
      }
    }

    if (!matchedLabel) continue

    hits.push({
      register,
      record,
      title: String(record.values[register.titleFieldId] ?? '').trim() || 'Untitled record',
      matchedLabel,
      matchedValue,
    })

    if (hits.length >= limit) break
  }

  return hits
}

/** Highlights the matched run of characters without using innerHTML. */
export function splitMatch(value: string, query: string): [string, string, string] {
  const index = value.toLowerCase().indexOf(query.trim().toLowerCase())
  if (index === -1) return [value, '', '']
  return [
    value.slice(0, index),
    value.slice(index, index + query.trim().length),
    value.slice(index + query.trim().length),
  ]
}

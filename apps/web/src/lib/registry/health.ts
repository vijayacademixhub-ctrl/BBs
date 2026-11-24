import { isOverdue } from '@/lib/format'
import type { Register, RegisterHealth, RegisterRecord } from '@/types/registry'
import { COMPLETENESS_FIELDS } from './built-in'

/**
 * Derived figures for a register.
 *
 * Everything here is computed from the records on demand rather than stored.
 * The workbook kept its Member Summary as formulas over the allocation sheet
 * for the same reason: a stored count is a second version of the truth, and
 * the two drift.
 */

export function isDone(register: Register, record: RegisterRecord): boolean {
  if (!register.statusFieldId || !register.doneValues?.length) return false
  const value = record.values[register.statusFieldId]
  return Boolean(value) && register.doneValues.includes(value!)
}

export function missingFields(register: Register, record: RegisterRecord): string[] {
  const required = COMPLETENESS_FIELDS[register.slug] ?? []
  return required.filter((id) => !String(record.values[id] ?? '').trim())
}

export function activeRecords(records: RegisterRecord[]): RegisterRecord[] {
  return records.filter((r) => !r.archivedAt)
}

export function computeHealth(register: Register, records: RegisterRecord[]): RegisterHealth {
  const live = activeRecords(records)
  const done = live.filter((r) => isDone(register, r))
  const open = live.filter((r) => !isDone(register, r))

  const overdue = register.dueFieldId
    ? open.filter((r) => isOverdue(dateOf(r.values[register.dueFieldId!]))).length
    : 0

  const lastUpdatedAt = live
    .map((r) => r.updatedAt)
    .sort((a, b) => b.localeCompare(a))[0]

  return {
    registerId: register.id,
    total: live.length,
    open: register.statusFieldId ? open.length : live.length,
    done: done.length,
    overdue,
    incomplete: live.filter((r) => missingFields(register, r).length > 0).length,
    lastUpdatedAt,
  }
}

/** A date value, or undefined when the cell holds something that is not one. */
function dateOf(value: string | undefined): string | undefined {
  if (!value) return undefined
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined
}

export interface MemberLoad {
  member: string
  asPrimary: number
  asSupport: number
  notStarted: number
  inProgress: number
  completed: number
  highPriority: number
  overdue: number
  /** Share of all primary tasks, 0–1. */
  share: number
}

/**
 * Per-member workload over a register that has an owner field.
 *
 * This replaces the workbook's Member Summary sheet. It is computed rather
 * than imported, so adding a task in the application updates it immediately.
 */
export function memberLoad(register: Register, records: RegisterRecord[]): MemberLoad[] {
  const ownerField = register.ownerFieldId
  if (!ownerField) return []

  const live = activeRecords(records)
  const byMember = new Map<string, MemberLoad>()

  const blank = (member: string): MemberLoad => ({
    member,
    asPrimary: 0,
    asSupport: 0,
    notStarted: 0,
    inProgress: 0,
    completed: 0,
    highPriority: 0,
    overdue: 0,
    share: 0,
  })

  const get = (member: string) => {
    const existing = byMember.get(member)
    if (existing) return existing
    const created = blank(member)
    byMember.set(member, created)
    return created
  }

  for (const record of live) {
    const owner = String(record.values[ownerField] ?? '').trim() || 'Unassigned'
    const row = get(owner)
    row.asPrimary += 1

    const status = String(record.values[register.statusFieldId ?? ''] ?? '').trim()
    if (status === 'Completed') row.completed += 1
    else if (status === 'In Progress') row.inProgress += 1
    else if (status) row.notStarted += 1

    if (String(record.values.priority ?? '') === 'High') row.highPriority += 1
    if (register.dueFieldId && !isDone(register, record)
      && isOverdue(dateOf(record.values[register.dueFieldId]))) row.overdue += 1

    // Support is a free-text list of names in the workbook.
    for (const name of String(record.values.support ?? '').split(/[,;/]/)) {
      const trimmed = name.trim()
      if (trimmed) get(trimmed).asSupport += 1
    }
  }

  const totalPrimary = live.length || 1
  return [...byMember.values()]
    .map((row) => ({ ...row, share: row.asPrimary / totalPrimary }))
    .sort((a, b) => b.asPrimary - a.asPrimary || a.member.localeCompare(b.member))
}

/** Records grouped by a field's value, for the register's summary strip. */
export function groupCounts(records: RegisterRecord[], fieldId: string): Array<[string, number]> {
  const counts = new Map<string, number>()
  for (const record of activeRecords(records)) {
    const key = String(record.values[fieldId] ?? '').trim() || '—'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

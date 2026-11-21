import type { Register, RegisterChange, RegisterRecord } from '@/types/registry'
import type { MeetingNote } from '@/types/domain'
import { commit, delay, makeId, snapshot } from './store'
import type {
  MeetingNoteInput, RegisterFieldInput, RegisterInput, RegisterRecordInput,
} from './types'

/**
 * Register operations against the local store.
 *
 * Every write records a change line. The workbook had no history at all, so a
 * value that moved could not be explained afterwards; an index that several
 * people edit needs to be able to answer "who changed this, and from what".
 */

const CHANGE_LIMIT = 500

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return base || 'register'
}

function uniqueSlug(name: string, taken: Set<string>): string {
  const base = slugify(name)
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}

function record(change: Omit<RegisterChange, 'id' | 'at'>): RegisterChange {
  return { ...change, id: makeId('ch'), at: new Date().toISOString() }
}

/** Keeps the change log bounded; it is an aid to the team, not an audit trail.
 *  The real audit trail is public.audit_logs, written by the database. */
function pushChanges(changes: RegisterChange[]) {
  commit((db) => {
    db.registerChanges = [...changes, ...db.registerChanges].slice(0, CHANGE_LIMIT)
  })
}

/* --------------------------------------------------------------- registers */

export async function listRegisters(): Promise<Register[]> {
  return delay(structuredClone(snapshot().registers))
}

export async function createRegister(input: RegisterInput): Promise<Register> {
  const now = new Date().toISOString()
  const taken = new Set(snapshot().registers.map((r) => r.slug))
  const register: Register = {
    id: makeId('reg'),
    slug: uniqueSlug(input.name, taken),
    name: input.name,
    description: input.description,
    group: input.group,
    icon: input.icon,
    titleFieldId: 'title',
    builtIn: false,
    createdAt: now,
    updatedAt: now,
    // A new register starts with one column. Everything else is added as it
    // is needed, which is how the team actually works.
    fields: [
      { id: 'title', label: 'Title', kind: 'text', inGrid: true, builtIn: true },
      { id: 'notes', label: 'Notes', kind: 'longtext', inGrid: false, builtIn: true },
    ],
  }
  commit((db) => {
    db.registers.push(register)
  })
  return delay(structuredClone(register))
}

export async function updateRegister(id: string, patch: Partial<RegisterInput>): Promise<Register> {
  let updated: Register | undefined
  commit((db) => {
    const index = db.registers.findIndex((r) => r.id === id)
    if (index === -1) return
    updated = { ...db.registers[index]!, ...patch, updatedAt: new Date().toISOString() }
    db.registers[index] = updated
  })
  if (!updated) throw new Error(`Register ${id} was not found.`)
  return delay(structuredClone(updated))
}

export async function deleteRegister(id: string): Promise<void> {
  const register = snapshot().registers.find((r) => r.id === id)
  if (!register) throw new Error(`Register ${id} was not found.`)
  if (register.builtIn) {
    throw new Error(
      `"${register.name}" came from the Master Index workbook and cannot be deleted. ` +
        'Archive the records you no longer need instead.',
    )
  }
  commit((db) => {
    db.registers = db.registers.filter((r) => r.id !== id)
    db.registerRecords = db.registerRecords.filter((r) => r.registerId !== id)
  })
  return delay(undefined)
}

/* ------------------------------------------------------------------ fields */

export async function addRegisterField(
  registerId: string,
  field: RegisterFieldInput,
): Promise<Register> {
  let updated: Register | undefined
  const id = field.id || slugify(field.label).replace(/-/g, '_')
  commit((db) => {
    const index = db.registers.findIndex((r) => r.id === registerId)
    if (index === -1) return
    const register = db.registers[index]!
    if (register.fields.some((f) => f.id === id)) {
      throw new Error(`"${register.name}" already has a column called ${field.label}.`)
    }
    updated = {
      ...register,
      fields: [...register.fields, { ...field, id, builtIn: false }],
      updatedAt: new Date().toISOString(),
    }
    db.registers[index] = updated
  })
  if (!updated) throw new Error(`Register ${registerId} was not found.`)
  return delay(structuredClone(updated))
}

export async function updateRegisterField(
  registerId: string,
  fieldId: string,
  patch: Partial<RegisterFieldInput>,
): Promise<Register> {
  let updated: Register | undefined
  commit((db) => {
    const index = db.registers.findIndex((r) => r.id === registerId)
    if (index === -1) return
    const register = db.registers[index]!
    updated = {
      ...register,
      fields: register.fields.map((f) => (f.id === fieldId ? { ...f, ...patch, id: f.id } : f)),
      updatedAt: new Date().toISOString(),
    }
    db.registers[index] = updated
  })
  if (!updated) throw new Error(`Register ${registerId} was not found.`)
  return delay(structuredClone(updated))
}

/**
 * Removes a column.
 *
 * The values stay in the records. Deleting a column that someone had filled
 * in should not be the same thing as destroying what they wrote, so adding
 * the column back brings the content back with it.
 */
export async function removeRegisterField(registerId: string, fieldId: string): Promise<Register> {
  let updated: Register | undefined
  commit((db) => {
    const index = db.registers.findIndex((r) => r.id === registerId)
    if (index === -1) return
    const register = db.registers[index]!
    const field = register.fields.find((f) => f.id === fieldId)
    if (!field) return
    if (field.builtIn) {
      throw new Error(
        `"${field.label}" came from the workbook and cannot be removed. Hide it from the grid instead.`,
      )
    }
    updated = {
      ...register,
      fields: register.fields.filter((f) => f.id !== fieldId),
      updatedAt: new Date().toISOString(),
    }
    db.registers[index] = updated
  })
  if (!updated) throw new Error(`Register ${registerId} was not found.`)
  return delay(structuredClone(updated))
}

/* ----------------------------------------------------------------- records */

export async function listRegisterRecords(registerId?: string): Promise<RegisterRecord[]> {
  const all = snapshot().registerRecords
  const rows = registerId ? all.filter((r) => r.registerId === registerId) : all
  return delay(structuredClone(rows))
}

export async function createRegisterRecord(input: RegisterRecordInput): Promise<RegisterRecord> {
  const now = new Date().toISOString()
  const row: RegisterRecord = {
    id: makeId('rec'),
    registerId: input.registerId,
    values: { ...input.values },
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  }
  commit((db) => {
    db.registerRecords.push(row)
  })
  pushChanges([record({ registerId: row.registerId, recordId: row.id, fieldId: null, action: 'create' })])
  return delay(structuredClone(row))
}

export async function updateRegisterRecord(
  id: string,
  values: Record<string, string>,
  by?: string,
): Promise<RegisterRecord> {
  let updated: RegisterRecord | undefined
  const changes: RegisterChange[] = []

  commit((db) => {
    const index = db.registerRecords.findIndex((r) => r.id === id)
    if (index === -1) return
    const existing = db.registerRecords[index]!

    for (const [fieldId, after] of Object.entries(values)) {
      const before = existing.values[fieldId] ?? ''
      if (before === after) continue
      changes.push(
        record({
          registerId: existing.registerId,
          recordId: id,
          fieldId,
          action: 'update',
          before,
          after,
          by,
        }),
      )
    }

    updated = {
      ...existing,
      values: { ...existing.values, ...values },
      updatedAt: new Date().toISOString(),
      updatedBy: by ?? existing.updatedBy,
    }
    db.registerRecords[index] = updated
  })

  if (!updated) throw new Error(`Record ${id} was not found.`)
  if (changes.length) pushChanges(changes)
  return delay(structuredClone(updated))
}

export async function setRecordArchived(
  id: string,
  archived: boolean,
  by?: string,
): Promise<RegisterRecord> {
  let updated: RegisterRecord | undefined
  commit((db) => {
    const index = db.registerRecords.findIndex((r) => r.id === id)
    if (index === -1) return
    updated = {
      ...db.registerRecords[index]!,
      archivedAt: archived ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
      updatedBy: by,
    }
    db.registerRecords[index] = updated
  })
  if (!updated) throw new Error(`Record ${id} was not found.`)
  pushChanges([
    record({
      registerId: updated.registerId,
      recordId: id,
      fieldId: null,
      action: archived ? 'archive' : 'restore',
      by,
    }),
  ])
  return delay(structuredClone(updated))
}

export async function deleteRegisterRecord(id: string): Promise<void> {
  const existing = snapshot().registerRecords.find((r) => r.id === id)
  commit((db) => {
    db.registerRecords = db.registerRecords.filter((r) => r.id !== id)
  })
  if (existing) {
    pushChanges([
      record({ registerId: existing.registerId, recordId: id, fieldId: null, action: 'delete' }),
    ])
  }
  return delay(undefined)
}

export async function listRegisterChanges(limit = 25): Promise<RegisterChange[]> {
  return delay(structuredClone(snapshot().registerChanges.slice(0, limit)))
}

/* ----------------------------------------------------------- meeting notes */

export async function listMeetingNotes(meetingId?: string): Promise<MeetingNote[]> {
  const all = [...snapshot().meetingNotes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const rows = meetingId ? all.filter((n) => n.meetingId === meetingId) : all
  return delay(structuredClone(rows))
}

export async function createMeetingNote(input: MeetingNoteInput): Promise<MeetingNote> {
  const now = new Date().toISOString()
  const note: MeetingNote = { ...input, id: makeId('note'), createdAt: now, updatedAt: now }
  commit((db) => {
    db.meetingNotes.unshift(note)
  })
  return delay(structuredClone(note))
}

export async function updateMeetingNote(
  id: string,
  patch: Partial<MeetingNoteInput>,
): Promise<MeetingNote> {
  let updated: MeetingNote | undefined
  commit((db) => {
    const index = db.meetingNotes.findIndex((n) => n.id === id)
    if (index === -1) return
    updated = { ...db.meetingNotes[index]!, ...patch, updatedAt: new Date().toISOString() }
    db.meetingNotes[index] = updated
  })
  if (!updated) throw new Error(`Note ${id} was not found.`)
  return delay(structuredClone(updated))
}

export async function deleteMeetingNote(id: string): Promise<void> {
  commit((db) => {
    db.meetingNotes = db.meetingNotes.filter((n) => n.id !== id)
  })
  return delay(undefined)
}

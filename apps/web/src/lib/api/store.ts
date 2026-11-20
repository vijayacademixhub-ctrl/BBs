import type { DailyWorkLog, Meeting, MeetingNote, NotificationItem, Profile, Task } from '@/types/domain'
import type { Register, RegisterChange, RegisterRecord } from '@/types/registry'
import {
  SAMPLE_MEETINGS, SAMPLE_NOTIFICATIONS, SAMPLE_PROFILES, SAMPLE_TASKS, SAMPLE_WORK_LOGS,
} from '@/lib/sample/seed'
import { BUILT_IN_REGISTERS } from '@/lib/registry/built-in'
import { REGISTER_SEED_RECORDS } from '@/lib/sample/registry-seed'

/**
 * Milestone 1 data store.
 *
 * An in-memory repository persisted to localStorage, behind an asynchronous
 * interface. The asynchrony is deliberate: components are written against the
 * same loading and error semantics they will face once Supabase is introduced
 * at Milestone 2, so the swap replaces this file and nothing else.
 *
 * Nothing here is an institutional record. See docs/architecture.md §5.4.
 */

const STORAGE_KEY = 'academicos.sample.v1'
const LATENCY_MS = 180

interface Database {
  profiles: Profile[]
  meetings: Meeting[]
  tasks: Task[]
  workLogs: DailyWorkLog[]
  notifications: NotificationItem[]
  registers: Register[]
  registerRecords: RegisterRecord[]
  registerChanges: RegisterChange[]
  meetingNotes: MeetingNote[]
}

/**
 * Register records are seeded from the imported workbook. Ids are derived
 * from the register and the row's position rather than generated, so a
 * reseed produces the same ids and a stored edit is not orphaned.
 */
function seedRegisterRecords(): RegisterRecord[] {
  const now = '2026-11-20T00:00:00.000Z'
  const out: RegisterRecord[] = []
  for (const register of BUILT_IN_REGISTERS) {
    const rows = REGISTER_SEED_RECORDS[register.slug] ?? []
    rows.forEach((row, index) => {
      out.push({
        id: `${register.id}_r${String(index + 1).padStart(3, '0')}`,
        registerId: register.id,
        values: { ...row.values },
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      })
    })
  }
  return out
}

function seed(): Database {
  return {
    profiles: structuredClone(SAMPLE_PROFILES),
    meetings: structuredClone(SAMPLE_MEETINGS),
    tasks: structuredClone(SAMPLE_TASKS),
    workLogs: structuredClone(SAMPLE_WORK_LOGS),
    notifications: structuredClone(SAMPLE_NOTIFICATIONS),
    registers: structuredClone(BUILT_IN_REGISTERS),
    registerRecords: seedRegisterRecords(),
    registerChanges: [],
    meetingNotes: [],
  }
}

function load(): Database {
  if (typeof window === 'undefined') return seed()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return seed()
    const parsed = JSON.parse(raw) as Partial<Database>
    const fresh = seed()
    // Merge defensively: a seed shape change must not break a stored copy.
    // A register added to BUILT_IN_REGISTERS after someone began using the
    // application is appended to their stored set, with its seed records,
    // rather than being invisible until they reset their data.
    const storedRegisters = parsed.registers ?? []
    const knownSlugs = new Set(storedRegisters.map((r) => r.slug))
    const newRegisters = fresh.registers.filter((r) => !knownSlugs.has(r.slug))
    const newRegisterIds = new Set(newRegisters.map((r) => r.id))

    return {
      profiles: parsed.profiles ?? fresh.profiles,
      meetings: parsed.meetings ?? fresh.meetings,
      tasks: parsed.tasks ?? fresh.tasks,
      workLogs: parsed.workLogs ?? fresh.workLogs,
      notifications: parsed.notifications ?? fresh.notifications,
      registers: storedRegisters.length ? [...storedRegisters, ...newRegisters] : fresh.registers,
      registerRecords: parsed.registerRecords
        ? [...parsed.registerRecords, ...fresh.registerRecords.filter((r) => newRegisterIds.has(r.registerId))]
        : fresh.registerRecords,
      registerChanges: parsed.registerChanges ?? fresh.registerChanges,
      meetingNotes: parsed.meetingNotes ?? fresh.meetingNotes,
    }
  } catch {
    return seed()
  }
}

let db: Database = load()

function persist() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch {
    // Storage may be unavailable (private browsing, quota). The in-memory copy
    // still works for the session; silently continuing is the right behaviour.
  }
}

/** Resets the sample data to its seeded state. Exposed in Settings. */
export function resetSampleData() {
  db = seed()
  persist()
}

export function snapshot(): Database {
  return db
}

export function commit(mutate: (database: Database) => void) {
  mutate(db)
  persist()
}

export function delay<T>(value: T, ms = LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

export function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

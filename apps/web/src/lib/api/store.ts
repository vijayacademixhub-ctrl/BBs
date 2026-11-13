import type { DailyWorkLog, Meeting, NotificationItem, Profile, Task } from '@/types/domain'
import {
  SAMPLE_MEETINGS, SAMPLE_NOTIFICATIONS, SAMPLE_PROFILES, SAMPLE_TASKS, SAMPLE_WORK_LOGS,
} from '@/lib/sample/seed'

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
}

function seed(): Database {
  return {
    profiles: structuredClone(SAMPLE_PROFILES),
    meetings: structuredClone(SAMPLE_MEETINGS),
    tasks: structuredClone(SAMPLE_TASKS),
    workLogs: structuredClone(SAMPLE_WORK_LOGS),
    notifications: structuredClone(SAMPLE_NOTIFICATIONS),
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
    return {
      profiles: parsed.profiles ?? fresh.profiles,
      meetings: parsed.meetings ?? fresh.meetings,
      tasks: parsed.tasks ?? fresh.tasks,
      workLogs: parsed.workLogs ?? fresh.workLogs,
      notifications: parsed.notifications ?? fresh.notifications,
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

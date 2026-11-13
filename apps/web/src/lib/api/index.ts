import type { DailyWorkLog, Meeting, NotificationItem, Profile, Task } from '@/types/domain'
import { commit, delay, makeId, snapshot } from './store'

/**
 * The application's data access layer.
 *
 * Every component reads and writes through these functions. At Milestone 2
 * each body is replaced by a Supabase query; the signatures do not change.
 */

/* ---------------------------------------------------------------- profiles */

export async function listProfiles(): Promise<Profile[]> {
  return delay(structuredClone(snapshot().profiles))
}

/* ---------------------------------------------------------------- meetings */

export async function listMeetings(): Promise<Meeting[]> {
  const meetings = [...snapshot().meetings].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  )
  return delay(structuredClone(meetings))
}

export async function getMeeting(id: string): Promise<Meeting> {
  const found = snapshot().meetings.find((m) => m.id === id)
  if (!found) throw new Error(`Meeting ${id} was not found.`)
  return delay(structuredClone(found))
}

export type MeetingInput = Omit<Meeting, 'id' | 'hasRecording' | 'transcriptStatus'>

export async function createMeeting(input: MeetingInput): Promise<Meeting> {
  const meeting: Meeting = { ...input, id: makeId('m'), hasRecording: false, transcriptStatus: null }
  commit((db) => {
    db.meetings.push(meeting)
  })
  return delay(structuredClone(meeting))
}

export async function updateMeeting(id: string, patch: Partial<MeetingInput>): Promise<Meeting> {
  let updated: Meeting | undefined
  commit((db) => {
    const index = db.meetings.findIndex((m) => m.id === id)
    if (index === -1) return
    const existing = db.meetings[index]!
    updated = { ...existing, ...patch }
    db.meetings[index] = updated
  })
  if (!updated) throw new Error(`Meeting ${id} was not found.`)
  return delay(structuredClone(updated))
}

export async function deleteMeeting(id: string): Promise<void> {
  commit((db) => {
    db.meetings = db.meetings.filter((m) => m.id !== id)
  })
  return delay(undefined)
}

/* ------------------------------------------------------------------- tasks */

export async function listTasks(): Promise<Task[]> {
  return delay(structuredClone(snapshot().tasks))
}

export async function getTask(id: string): Promise<Task> {
  const found = snapshot().tasks.find((t) => t.id === id)
  if (!found) throw new Error(`Task ${id} was not found.`)
  return delay(structuredClone(found))
}

export type TaskInput = Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'sourceExtractionId'>

export async function createTask(input: TaskInput): Promise<Task> {
  const now = new Date().toISOString()
  const task: Task = { ...input, id: makeId('t'), createdAt: now, updatedAt: now }
  commit((db) => {
    db.tasks.unshift(task)
  })
  return delay(structuredClone(task))
}

export async function updateTask(id: string, patch: Partial<TaskInput>): Promise<Task> {
  let updated: Task | undefined
  commit((db) => {
    const index = db.tasks.findIndex((t) => t.id === id)
    if (index === -1) return
    const existing = db.tasks[index]!
    updated = { ...existing, ...patch, updatedAt: new Date().toISOString() }
    db.tasks[index] = updated
  })
  if (!updated) throw new Error(`Task ${id} was not found.`)
  return delay(structuredClone(updated))
}

export async function deleteTask(id: string): Promise<void> {
  commit((db) => {
    db.tasks = db.tasks.filter((t) => t.id !== id)
  })
  return delay(undefined)
}

/* --------------------------------------------------------------- work logs */

export async function listWorkLogs(): Promise<DailyWorkLog[]> {
  const logs = [...snapshot().workLogs].sort((a, b) => b.logDate.localeCompare(a.logDate))
  return delay(structuredClone(logs))
}

export type WorkLogInput = Omit<DailyWorkLog, 'id' | 'createdAt'>

export async function createWorkLog(input: WorkLogInput): Promise<DailyWorkLog> {
  const log: DailyWorkLog = { ...input, id: makeId('w'), createdAt: new Date().toISOString() }
  commit((db) => {
    db.workLogs.unshift(log)
  })
  return delay(structuredClone(log))
}

export async function updateWorkLog(id: string, patch: Partial<WorkLogInput>): Promise<DailyWorkLog> {
  let updated: DailyWorkLog | undefined
  commit((db) => {
    const index = db.workLogs.findIndex((w) => w.id === id)
    if (index === -1) return
    const existing = db.workLogs[index]!
    updated = { ...existing, ...patch }
    db.workLogs[index] = updated
  })
  if (!updated) throw new Error(`Work log ${id} was not found.`)
  return delay(structuredClone(updated))
}

/* ----------------------------------------------------------- notifications */

export async function listNotifications(): Promise<NotificationItem[]> {
  return delay(structuredClone(snapshot().notifications))
}

export async function markNotificationRead(id: string): Promise<void> {
  commit((db) => {
    const found = db.notifications.find((n) => n.id === id)
    if (found) found.read = true
  })
  return delay(undefined)
}

export { resetSampleData } from './store'

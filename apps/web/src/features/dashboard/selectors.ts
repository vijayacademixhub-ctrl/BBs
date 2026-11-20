import { isDueToday, isOverdue } from '@/lib/format'
import { computeHealth } from '@/lib/registry/health'
import type { DailyWorkLog, Meeting, Task } from '@/types/domain'
import type { Register, RegisterHealth, RegisterRecord } from '@/types/registry'
import { parseISO, isAfter, isSameDay, subDays } from 'date-fns'

export interface DashboardCounts {
  dueToday: number
  pending: number
  overdue: number
  completedThisWeek: number
}

export function computeCounts(tasks: Task[]): DashboardCounts {
  const weekAgo = subDays(new Date(), 7)
  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled')
  return {
    dueToday: open.filter((t) => isDueToday(t.dueDate)).length,
    pending: open.length,
    overdue: open.filter((t) => isOverdue(t.dueDate)).length,
    completedThisWeek: tasks.filter(
      (t) => t.status === 'done' && isAfter(parseISO(t.updatedAt), weekAgo),
    ).length,
  }
}

export function upcomingMeetings(meetings: Meeting[], limit = 4): Meeting[] {
  const now = new Date()
  return meetings
    .filter((m) => m.status === 'scheduled' && isAfter(parseISO(m.startsAt), now))
    .slice(0, limit)
}

export function todaysMeetings(meetings: Meeting[]): Meeting[] {
  return meetings.filter((m) => m.status !== 'cancelled' && isSameDay(parseISO(m.startsAt), new Date()))
}

export function tasksForUser(tasks: Task[], userId: string): Task[] {
  return tasks.filter((t) => t.assigneeId === userId)
}

export function priorityTasks(tasks: Task[], limit = 5): Task[] {
  const weight = { urgent: 0, high: 1, medium: 2, low: 3 } as const
  return tasks
    .filter((t) => t.status !== 'done' && t.status !== 'cancelled')
    .sort((a, b) => {
      const overdueDiff = Number(isOverdue(b.dueDate)) - Number(isOverdue(a.dueDate))
      if (overdueDiff !== 0) return overdueDiff
      const priorityDiff = weight[a.priority] - weight[b.priority]
      if (priorityDiff !== 0) return priorityDiff
      return (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')
    })
    .slice(0, limit)
}

export function recentWorkLogs(logs: DailyWorkLog[], limit = 4): DailyWorkLog[] {
  return logs.slice(0, limit)
}

/** Meetings with audio that has not yet been transcribed. */
export function awaitingProcessing(meetings: Meeting[]): Meeting[] {
  return meetings.filter((m) => m.hasRecording && m.transcriptStatus !== 'completed')
}

/**
 * Register figures for the dashboard.
 *
 * Computed from the same records the registers themselves show, through the
 * same `computeHealth`, so the dashboard cannot report a different number
 * from the page it links to.
 */
export interface RegistrySummary {
  entries: Array<{ register: Register; health: RegisterHealth }>
  records: number
  open: number
  incomplete: number
  overdue: number
}

export function registrySummary(
  registers: Register[],
  records: RegisterRecord[],
): RegistrySummary {
  const entries = registers.map((register) => ({
    register,
    health: computeHealth(register, records.filter((r) => r.registerId === register.id)),
  }))

  return {
    entries,
    records: entries.reduce((sum, e) => sum + e.health.total, 0),
    open: entries.reduce((sum, e) => sum + e.health.open, 0),
    incomplete: entries.reduce((sum, e) => sum + e.health.incomplete, 0),
    overdue: entries.reduce((sum, e) => sum + e.health.overdue, 0),
  }
}

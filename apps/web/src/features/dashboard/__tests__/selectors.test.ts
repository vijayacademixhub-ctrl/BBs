import { describe, expect, it } from 'vitest'
import { addDays, format, subDays } from 'date-fns'
import { awaitingProcessing, computeCounts, priorityTasks, upcomingMeetings } from '../selectors'
import type { Meeting, Task } from '@/types/domain'

const day = (offset: number) => format(addDays(new Date(), offset), 'yyyy-MM-dd')

function task(partial: Partial<Task> & Pick<Task, 'id'>): Task {
  return {
    title: 'Task', status: 'todo', priority: 'medium', category: 'Analysis',
    assigneeId: 'u1', createdById: 'u1', progress: 0,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...partial,
  }
}

function meeting(partial: Partial<Meeting> & Pick<Meeting, 'id'>): Meeting {
  return {
    title: 'Meeting', startsAt: addDays(new Date(), 1).toISOString(), durationMinutes: 60,
    status: 'scheduled', language: 'en', organiserId: 'u1', participantIds: ['u1'],
    agenda: [], hasRecording: false, transcriptStatus: null,
    ...partial,
  }
}

describe('computeCounts', () => {
  it('counts due today, pending, overdue and recently completed separately', () => {
    const counts = computeCounts([
      task({ id: '1', dueDate: day(0) }),
      task({ id: '2', dueDate: day(-3) }),
      task({ id: '3', dueDate: day(5) }),
      task({ id: '4', status: 'done', updatedAt: subDays(new Date(), 2).toISOString() }),
      task({ id: '5', status: 'done', updatedAt: subDays(new Date(), 30).toISOString() }),
    ])
    expect(counts.dueToday).toBe(1)
    expect(counts.overdue).toBe(1)
    expect(counts.pending).toBe(3)
    expect(counts.completedThisWeek).toBe(1)
  })

  it('excludes cancelled tasks from the pending count', () => {
    const counts = computeCounts([task({ id: '1', status: 'cancelled' })])
    expect(counts.pending).toBe(0)
  })
})

describe('priorityTasks', () => {
  it('places overdue tasks ahead of higher-priority tasks that are not yet due', () => {
    const ordered = priorityTasks([
      task({ id: 'future-urgent', priority: 'urgent', dueDate: day(5) }),
      task({ id: 'overdue-low', priority: 'low', dueDate: day(-2) }),
    ])
    expect(ordered[0]?.id).toBe('overdue-low')
  })

  it('omits completed and cancelled tasks', () => {
    const ordered = priorityTasks([
      task({ id: 'done', status: 'done' }),
      task({ id: 'open' }),
    ])
    expect(ordered.map((t) => t.id)).toEqual(['open'])
  })
})

describe('upcomingMeetings', () => {
  it('excludes past and cancelled meetings', () => {
    const result = upcomingMeetings([
      meeting({ id: 'past', startsAt: subDays(new Date(), 1).toISOString() }),
      meeting({ id: 'cancelled', status: 'cancelled' }),
      meeting({ id: 'next' }),
    ])
    expect(result.map((m) => m.id)).toEqual(['next'])
  })
})

describe('awaitingProcessing', () => {
  it('lists recordings whose transcript is not complete', () => {
    const result = awaitingProcessing([
      meeting({ id: 'queued', hasRecording: true, transcriptStatus: 'queued' }),
      meeting({ id: 'done', hasRecording: true, transcriptStatus: 'completed' }),
      meeting({ id: 'no-audio' }),
    ])
    expect(result.map((m) => m.id)).toEqual(['queued'])
  })
})

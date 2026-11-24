import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, CalendarClock, CalendarPlus, CheckSquare, Download, Library, Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/common/page-header'
import { SampleDataNotice } from '@/components/common/provenance'
import { EmptyState, LoadingRows } from '@/components/common/states'
import { useToast } from '@/components/common/toast'
import { useMeetings, useTasks } from '@/hooks/use-data'
import { useAllRegisterRecords, useRegisters } from '@/hooks/use-registry'
import { useServiceStatus } from '@/hooks/use-service-status'
import { activeRecords, isDone } from '@/lib/registry/health'
import { blockTime, buildIcs, CalendarError, downloadIcs, type CalendarEntry } from '@/lib/calendar/ics'
import { describeDay, formatDate, formatTime, isOverdue } from '@/lib/format'

/**
 * One agenda over everything that has a date.
 *
 * Meetings, task due dates and — the point of this page — the dated rows in
 * the registers. A due date sitting in the Work Allocation register is a
 * commitment nobody sees until someone opens that register, which is how the
 * workbook let deadlines pass. Here it appears alongside the meetings, can be
 * exported as an .ics, and can be blocked on the shared calendar.
 */

type Kind = 'meeting' | 'task' | 'register'

interface AgendaItem {
  id: string
  kind: Kind
  title: string
  detail?: string
  /** ISO moment for a meeting, yyyy-mm-dd for a deadline. */
  when: string
  end?: string
  href: string
  overdue: boolean
}

export function CalendarPage() {
  const meetings = useMeetings()
  const tasks = useTasks()
  const registers = useRegisters()
  const records = useAllRegisterRecords()
  const { status } = useServiceStatus()
  const { toast } = useToast()
  const [blocking, setBlocking] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<Set<string>>(new Set())

  const items = useMemo<AgendaItem[]>(() => {
    const out: AgendaItem[] = []

    for (const meeting of meetings.data ?? []) {
      if (meeting.status === 'cancelled') continue
      out.push({
        id: `meeting-${meeting.id}`,
        kind: 'meeting',
        title: meeting.title,
        detail: meeting.location ?? meeting.meetingLink,
        when: meeting.startsAt,
        end: new Date(
          new Date(meeting.startsAt).getTime() + meeting.durationMinutes * 60_000,
        ).toISOString(),
        href: `/meetings/${meeting.id}`,
        overdue: false,
      })
    }

    for (const task of tasks.data ?? []) {
      if (!task.dueDate || task.status === 'done' || task.status === 'cancelled') continue
      out.push({
        id: `task-${task.id}`,
        kind: 'task',
        title: task.title,
        detail: task.category,
        when: task.dueDate,
        href: '/tasks',
        overdue: isOverdue(task.dueDate),
      })
    }

    for (const register of registers.data ?? []) {
      if (!register.dueFieldId) continue
      for (const record of activeRecords(records.data ?? []).filter(
        (r) => r.registerId === register.id,
      )) {
        const due = String(record.values[register.dueFieldId] ?? '')
        if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) continue
        if (isDone(register, record)) continue

        const owner = register.ownerFieldId
          ? String(record.values[register.ownerFieldId] ?? '').trim()
          : ''
        out.push({
          id: `register-${record.id}`,
          kind: 'register',
          title: String(record.values[register.titleFieldId] ?? '').trim() || 'Untitled record',
          detail: [register.name, owner].filter(Boolean).join(' · '),
          when: due,
          href: `/master-index/${register.slug}`,
          overdue: isOverdue(due),
        })
      }
    }

    return out.sort((a, b) => a.when.localeCompare(b.when))
  }, [meetings.data, tasks.data, registers.data, records.data])

  const upcoming = items.filter((item) => !item.overdue)
  const overdue = items.filter((item) => item.overdue)
  const loading = meetings.isPending || tasks.isPending || registers.isPending || records.isPending

  const exportIcs = () => {
    const entries: CalendarEntry[] = items.map((item) => ({
      uid: item.id,
      summary: item.kind === 'meeting' ? item.title : `${labelFor(item.kind)}: ${item.title}`,
      description: item.detail,
      start: item.when,
      end: item.end,
    }))
    downloadIcs(`academicos-${new Date().toISOString().slice(0, 10)}.ics`, buildIcs(entries))
    toast({
      title: `${entries.length} entries exported`,
      description: 'Open the file in Google Calendar, Outlook or Apple Calendar.',
      tone: 'success',
    })
  }

  const block = async (item: AgendaItem) => {
    setBlocking(item.id)
    try {
      const isMoment = item.when.includes('T')
      const start = isMoment ? item.when : `${item.when}T09:00:00`
      const end =
        item.end ??
        new Date(new Date(start).getTime() + 60 * 60_000).toISOString()

      const result = await blockTime({
        summary: item.kind === 'meeting' ? item.title : `${labelFor(item.kind)}: ${item.title}`,
        description: [item.detail, 'Blocked from AcademicOS.'].filter(Boolean).join('\n'),
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        // Derived from what is being blocked, never from the moment of the
        // click, so pressing twice cannot produce two entries.
        idempotencyKey: item.id,
      })

      setBlocked((current) => new Set(current).add(item.id))
      toast({
        title: result.status === 'already_blocked' ? 'Already on the calendar' : 'Time blocked',
        description:
          result.status === 'already_blocked'
            ? 'This entry was already there, so nothing was duplicated.'
            : undefined,
        tone: 'success',
      })
    } catch (error) {
      toast({
        title:
          error instanceof CalendarError && error.isNotConfigured
            ? 'The calendar is not connected'
            : 'The time could not be blocked',
        description: error instanceof Error ? error.message : undefined,
        tone: 'error',
      })
    } finally {
      setBlocking(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Meetings, task deadlines and every dated row in the Master Index, in one place."
        actions={
          <>
            <Button variant="outline" onClick={exportIcs} disabled={items.length === 0}>
              <Download /> Export .ics
            </Button>
            <Button asChild>
              <Link to="/meetings/new">
                <CalendarPlus /> New meeting
              </Link>
            </Button>
          </>
        }
      />

      <SampleDataNotice />

      <ConnectionNotice configured={status.calendar.configured} />

      {loading ? (
        <LoadingRows rows={5} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nothing is dated yet"
          description="Meetings, task due dates and register deadlines all appear here once they exist."
        />
      ) : (
        <>
          {overdue.length ? (
            <Section
              title={`Overdue (${overdue.length})`}
              items={overdue}
              onBlock={(item) => void block(item)}
              blocking={blocking}
              blocked={blocked}
              canBlock={status.calendar.configured}
            />
          ) : null}
          <Section
            title={`Coming up (${upcoming.length})`}
            items={upcoming}
            onBlock={(item) => void block(item)}
            blocking={blocking}
            blocked={blocked}
            canBlock={status.calendar.configured}
          />
        </>
      )}
    </>
  )
}

function ConnectionNotice({ configured }: { configured: boolean }) {
  if (configured) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-success/40 bg-success/5 p-3 text-sm">
        <CalendarClock className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        <p>
          Connected to the shared Google Calendar. Blocking the same entry twice is refused by the
          calendar rather than creating a duplicate.
        </p>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <div className="space-y-1">
        <p>
          <span className="font-medium">Google Calendar is not connected</span>, so Block is
          unavailable. Export works now and opens in any calendar application.
        </p>
        <p className="text-muted-foreground">
          Writing to a Google Calendar cannot be done with an API key — an API key only reads
          public data. It needs a service account with the calendar shared to it, or a per-user
          OAuth connection. See <code className="rounded bg-muted px-1">docs/calendar-setup.md</code>.
        </p>
      </div>
    </div>
  )
}

function Section({
  title,
  items,
  onBlock,
  blocking,
  blocked,
  canBlock,
}: {
  title: string
  items: AgendaItem[]
  onBlock: (item: AgendaItem) => void
  blocking: string | null
  blocked: Set<string>
  canBlock: boolean
}) {
  if (items.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-3 text-center text-sm text-muted-foreground">Nothing here.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0 sm:p-0">
        <ul className="divide-y">
          {items.map((item) => {
            const Icon = item.kind === 'meeting' ? Users : item.kind === 'task' ? CheckSquare : Library
            const isMoment = item.when.includes('T')

            return (
              <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                <span
                  className={
                    item.overdue
                      ? 'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-destructive/12 text-destructive'
                      : 'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground'
                  }
                >
                  <Icon className="size-4" aria-hidden />
                </span>

                <div className="min-w-0 flex-1">
                  <Link to={item.href} className="block truncate text-sm font-medium hover:text-primary">
                    {item.title}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {isMoment
                      ? `${describeDay(item.when)} at ${formatTime(item.when)}`
                      : `${describeDay(`${item.when}T12:00:00`)} · ${formatDate(`${item.when}T12:00:00`)}`}
                    {item.detail ? ` · ${item.detail}` : ''}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={item.kind === 'register' ? 'secondary' : 'outline'}>
                    {labelFor(item.kind)}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canBlock || blocking === item.id || blocked.has(item.id)}
                    onClick={() => onBlock(item)}
                    title={
                      canBlock
                        ? 'Block this time on the shared calendar'
                        : 'Google Calendar is not connected on this deployment'
                    }
                  >
                    {blocked.has(item.id) ? 'Blocked' : blocking === item.id ? 'Blocking…' : 'Block'}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

function labelFor(kind: Kind): string {
  return kind === 'meeting' ? 'Meeting' : kind === 'task' ? 'Task' : 'Index'
}

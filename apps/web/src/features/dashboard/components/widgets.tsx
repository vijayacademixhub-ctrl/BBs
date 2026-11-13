import { Link } from 'react-router-dom'
import {
  AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Clock,
  FileAudio, MapPin, Sparkles, Video,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/common/states'
import { describeDay, formatDate, formatDuration, formatTime, isOverdue } from '@/lib/format'
import { LANGUAGE_LABEL, TASK_PRIORITY_LABEL, type DailyWorkLog, type Meeting, type Profile, type Task } from '@/types/domain'
import { cn } from '@/lib/utils'

export function UpcomingMeetings({ meetings }: { meetings: Meeting[] }) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Upcoming meetings</CardTitle>
          <CardDescription>Next scheduled sessions</CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/meetings">View all</Link>
        </Button>
      </CardHeader>
      <CardContent className="flex-1">
        {meetings.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No upcoming meetings"
            description="Scheduled meetings will appear here."
            action={
              <Button size="sm" asChild>
                <Link to="/meetings/new">Schedule a meeting</Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y">
            {meetings.map((meeting) => (
              <li key={meeting.id}>
                <Link
                  to={`/meetings/${meeting.id}`}
                  className="-mx-2 flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-muted"
                >
                  <div className="flex w-16 shrink-0 flex-col items-center rounded-md border bg-muted/50 px-1 py-1.5">
                    <span className="w-full truncate text-center text-2xs uppercase text-muted-foreground">{describeDay(meeting.startsAt)}</span>
                    <span className="text-sm font-semibold tabular-nums">{formatTime(meeting.startsAt)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{meeting.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3" /> {formatDuration(meeting.durationMinutes)}
                      </span>
                      {meeting.location ? (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <MapPin className="size-3 shrink-0" />
                          <span className="truncate">{meeting.location}</span>
                        </span>
                      ) : null}
                      {meeting.meetingLink ? (
                        <span className="inline-flex items-center gap-1"><Video className="size-3" /> Online</span>
                      ) : null}
                    </p>
                  </div>
                  <span className="shrink-0 text-2xs text-muted-foreground">
                    {meeting.participantIds.length} people
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export function PriorityTasks({ tasks, profiles }: { tasks: Task[]; profiles: Record<string, Profile> }) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Team — needs attention</CardTitle>
          <CardDescription>Across the whole team, overdue first</CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/tasks">View all</Link>
        </Button>
      </CardHeader>
      <CardContent className="flex-1">
        {tasks.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Nothing outstanding" description="All tasks are complete." />
        ) : (
          <ul className="divide-y">
            {tasks.map((task) => {
              const overdue = isOverdue(task.dueDate)
              return (
                <li key={task.id} className="flex items-start gap-3 py-2.5">
                  <span
                    className={cn(
                      'mt-1.5 size-2 shrink-0 rounded-full',
                      task.priority === 'urgent' && 'bg-destructive',
                      task.priority === 'high' && 'bg-warning',
                      task.priority === 'medium' && 'bg-info',
                      task.priority === 'low' && 'bg-muted-foreground/50',
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{task.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{profiles[task.assigneeId]?.fullName ?? 'Unassigned'}</span>
                      <span aria-hidden>·</span>
                      <span>{TASK_PRIORITY_LABEL[task.priority]}</span>
                      {task.dueDate ? (
                        <>
                          <span aria-hidden>·</span>
                          <span className={cn(overdue && 'font-medium text-destructive')}>
                            {overdue ? 'Overdue — ' : 'Due '}
                            {formatDate(`${task.dueDate}T00:00:00`)}
                          </span>
                        </>
                      ) : null}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export function TeamActivity({ logs, profiles }: { logs: DailyWorkLog[]; profiles: Record<string, Profile> }) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Team activity</CardTitle>
          <CardDescription>Most recent daily work entries</CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/daily-work">View all</Link>
        </Button>
      </CardHeader>
      <CardContent className="flex-1">
        {logs.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No entries yet" description="Daily work entries will appear here." />
        ) : (
          <ul className="space-y-3">
            {logs.map((log) => (
              <li key={log.id} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-medium">{profiles[log.profileId]?.fullName ?? 'Unknown'}</p>
                  <span className="shrink-0 text-2xs text-muted-foreground">
                    {formatDate(`${log.logDate}T00:00:00`)}
                  </span>
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">{log.completed}</p>
                {log.challenges ? (
                  <p className="inline-flex items-start gap-1 text-xs text-warning">
                    <AlertTriangle className="mt-px size-3 shrink-0" />
                    <span className="line-clamp-1">{log.challenges}</span>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * AI pipeline status.
 *
 * The AI service is not connected during Milestone 1. This widget reports
 * that plainly rather than displaying fabricated extractions, which the
 * brief forbids and which would make the verification workflow look complete
 * when it is not.
 */
export function ProcessingStatus({ pending }: { pending: Meeting[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-ai" /> AI processing
        </CardTitle>
        <CardDescription>Transcription and meeting analysis</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-2.5 rounded-md border border-ai/30 bg-ai-muted px-3 py-2.5">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-ai" aria-hidden />
          <div className="space-y-0.5 text-sm">
            <p className="font-medium text-ai">Not configured</p>
            <p className="text-foreground/75">
              The transcription and analysis service is not connected yet. Recordings remain queued and are processed
              once it comes online — no work is lost.
            </p>
          </div>
        </div>

        {pending.length > 0 ? (
          <ul className="space-y-1.5">
            {pending.map((meeting) => (
              <li key={meeting.id} className="flex items-center gap-2 text-sm">
                <FileAudio className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{meeting.title}</span>
                <Badge variant="outline">{meeting.transcriptStatus ?? 'queued'}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No recordings are waiting to be processed.</p>
        )}

        <p className="text-xs text-muted-foreground">
          Audio languages configured: {LANGUAGE_LABEL.mixed}.
        </p>
      </CardContent>
    </Card>
  )
}

import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarPlus, CheckCircle2, CircleDot, ListTodo } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/common/page-header'
import { SampleDataNotice } from '@/components/common/provenance'
import { ErrorState, LoadingCards, LoadingRows } from '@/components/common/states'
import { useCurrentUser, useMeetings, useProfileMap, useTasks, useWorkLogs } from '@/hooks/use-data'
import { formatLongDate } from '@/lib/format'
import { StatCard } from './components/stat-card'
import { PriorityTasks, ProcessingStatus, TeamActivity, UpcomingMeetings } from './components/widgets'
import {
  awaitingProcessing, computeCounts, priorityTasks, recentWorkLogs, tasksForUser, upcomingMeetings,
} from './selectors'

export function DashboardPage() {
  const meetings = useMeetings()
  const tasks = useTasks()
  const workLogs = useWorkLogs()
  const profiles = useProfileMap()
  const { data: user } = useCurrentUser()

  const firstName = user?.fullName.split(' ')[0] ?? ''
  const myTasks = tasksForUser(tasks.data ?? [], user?.id ?? '')
  const counts = computeCounts(myTasks)

  return (
    <>
      <PageHeader
        title={firstName ? `Good day, ${firstName}` : 'Dashboard'}
        description={formatLongDate()}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/daily-work"><ListTodo /> Log today's work</Link>
            </Button>
            <Button asChild>
              <Link to="/meetings/new"><CalendarPlus /> New meeting</Link>
            </Button>
          </>
        }
      />

      <SampleDataNotice />

      {tasks.isPending ? (
        <LoadingCards />
      ) : tasks.isError ? (
        <ErrorState
          title="Tasks could not be loaded"
          description={tasks.error instanceof Error ? tasks.error.message : undefined}
          onRetry={() => void tasks.refetch()}
        />
      ) : (
        <section className="space-y-2" aria-labelledby="your-work">
          <h2 id="your-work" className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Your work
          </h2>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard label="Due today" value={counts.dueToday} icon={CircleDot} to="/tasks" />
            <StatCard label="Pending" value={counts.pending} icon={ListTodo} to="/tasks" />
            <StatCard label="Overdue" value={counts.overdue} icon={AlertTriangle} tone="destructive" to="/tasks" />
            <StatCard
              label="Completed"
              value={counts.completedThisWeek}
              icon={CheckCircle2}
              tone="success"
              hint="Last 7 days"
            />
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {meetings.isPending ? (
          <LoadingRows rows={4} />
        ) : meetings.isError ? (
          <ErrorState title="Meetings could not be loaded" onRetry={() => void meetings.refetch()} />
        ) : (
          <UpcomingMeetings meetings={upcomingMeetings(meetings.data)} />
        )}

        {tasks.isPending ? (
          <LoadingRows rows={4} />
        ) : tasks.isError ? (
          <ErrorState title="Tasks could not be loaded" onRetry={() => void tasks.refetch()} />
        ) : (
          <PriorityTasks tasks={priorityTasks(tasks.data)} profiles={profiles} />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {workLogs.isPending ? (
          <LoadingRows rows={3} />
        ) : workLogs.isError ? (
          <ErrorState title="Daily work could not be loaded" onRetry={() => void workLogs.refetch()} />
        ) : (
          <TeamActivity logs={recentWorkLogs(workLogs.data)} profiles={profiles} />
        )}

        {meetings.isPending ? (
          <LoadingRows rows={3} />
        ) : (
          <ProcessingStatus pending={awaitingProcessing(meetings.data ?? [])} />
        )}
      </div>
    </>
  )
}

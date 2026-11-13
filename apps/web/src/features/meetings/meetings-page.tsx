import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, CalendarPlus, Clock, MapPin, Mic, Search, Video } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/common/page-header'
import { SampleDataNotice } from '@/components/common/provenance'
import { EmptyState, ErrorState, LoadingRows } from '@/components/common/states'
import { useMeetings, useProfileMap } from '@/hooks/use-data'
import { describeDay, formatDate, formatDuration, formatTime } from '@/lib/format'
import { MEETING_STATUS_LABEL, type Meeting, type MeetingStatus } from '@/types/domain'
import { isPast, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'

type Scope = 'upcoming' | 'past' | 'all'

const STATUS_VARIANT: Record<MeetingStatus, 'info' | 'warning' | 'success' | 'outline'> = {
  scheduled: 'info',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'outline',
}

function MeetingRow({ meeting, participantCount }: { meeting: Meeting; participantCount: number }) {
  return (
    <Link
      to={`/meetings/${meeting.id}`}
      className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted sm:flex-row sm:items-center sm:gap-4"
    >
      <div className="flex w-full shrink-0 items-center gap-2 sm:w-28 sm:flex-col sm:items-start sm:gap-0.5">
        <span className="text-sm font-medium">{describeDay(meeting.startsAt)}</span>
        <span className="text-sm text-muted-foreground tabular-nums">{formatTime(meeting.startsAt)}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn('truncate font-medium', meeting.status === 'cancelled' && 'line-through opacity-60')}>
            {meeting.title}
          </p>
          {meeting.hasRecording ? (
            <Badge variant="ai"><Mic aria-hidden /> Recorded</Badge>
          ) : null}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Clock className="size-3" /> {formatDuration(meeting.durationMinutes)}</span>
          {meeting.location ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="size-3 shrink-0" /><span className="truncate">{meeting.location}</span>
            </span>
          ) : null}
          {meeting.meetingLink ? <span className="inline-flex items-center gap-1"><Video className="size-3" /> Online</span> : null}
          <span>{participantCount} participants</span>
        </p>
      </div>

      <Badge variant={STATUS_VARIANT[meeting.status]} className="shrink-0 self-start sm:self-center">
        {MEETING_STATUS_LABEL[meeting.status]}
      </Badge>
    </Link>
  )
}

export function MeetingsPage() {
  const { data, isPending, isError, error, refetch } = useMeetings()
  const profiles = useProfileMap()
  const [scope, setScope] = useState<Scope>('upcoming')
  const [status, setStatus] = useState<MeetingStatus | 'all'>('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (data ?? []).filter((meeting) => {
      const past = isPast(parseISO(meeting.startsAt))
      if (scope === 'upcoming' && past) return false
      if (scope === 'past' && !past) return false
      if (status !== 'all' && meeting.status !== status) return false
      if (term && !`${meeting.title} ${meeting.description ?? ''} ${meeting.location ?? ''}`.toLowerCase().includes(term)) {
        return false
      }
      return true
    })
  }, [data, scope, status, search])

  const grouped = useMemo(() => {
    const map = new Map<string, Meeting[]>()
    for (const meeting of filtered) {
      const key = meeting.startsAt.slice(0, 10)
      map.set(key, [...(map.get(key) ?? []), meeting])
    }
    return [...map.entries()]
  }, [filtered])

  return (
    <>
      <PageHeader
        title="Meetings"
        description="Schedule, review and record team meetings"
        actions={
          <Button asChild>
            <Link to="/meetings/new"><CalendarPlus /> New meeting</Link>
          </Button>
        }
      />

      <SampleDataNotice />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="past">Past</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search meetings"
            className="pl-8"
            aria-label="Search meetings"
          />
        </div>

        <Select value={status} onValueChange={(v) => setStatus(v as MeetingStatus | 'all')}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(MEETING_STATUS_LABEL) as MeetingStatus[]).map((key) => (
              <SelectItem key={key} value={key}>{MEETING_STATUS_LABEL[key]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isPending ? (
        <LoadingRows rows={5} />
      ) : isError ? (
        <ErrorState
          title="Meetings could not be loaded"
          description={error instanceof Error ? error.message : undefined}
          onRetry={() => void refetch()}
        />
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No meetings match this view"
          description={search || status !== 'all' ? 'Try clearing the search or status filter.' : 'Schedule a meeting to get started.'}
          action={
            <Button size="sm" asChild>
              <Link to="/meetings/new">Schedule a meeting</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, meetings]) => (
            <div key={date} className="space-y-1.5">
              <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {formatDate(`${date}T00:00:00`)}
              </h2>
              <Card>
                <CardContent className="divide-y p-0">
                  {meetings.map((meeting) => (
                    <MeetingRow
                      key={meeting.id}
                      meeting={meeting}
                      participantCount={meeting.participantIds.filter((id) => profiles[id]).length || meeting.participantIds.length}
                    />
                  ))}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

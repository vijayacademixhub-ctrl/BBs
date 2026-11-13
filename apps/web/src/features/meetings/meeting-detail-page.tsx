import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarClock, Clock, Globe, MapPin, Mic, Pencil, Trash2, Users, Video } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { PageHeader } from '@/components/common/page-header'
import { ErrorState, LoadingRows } from '@/components/common/states'
import { useToast } from '@/components/common/toast'
import { useDeleteMeeting, useMeeting, useProfileMap } from '@/hooks/use-data'
import { formatDateTime, formatDuration, initialsOf } from '@/lib/format'
import { LANGUAGE_LABEL, MEETING_STATUS_LABEL } from '@/types/domain'

export function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data, isPending, isError, error, refetch } = useMeeting(id)
  const profiles = useProfileMap()
  const deleteMeeting = useDeleteMeeting()
  const [confirmOpen, setConfirmOpen] = useState(false)

  if (isPending) return <LoadingRows rows={6} />
  if (isError || !data) {
    return (
      <ErrorState
        title="Meeting could not be loaded"
        description={error instanceof Error ? error.message : 'The meeting may have been removed.'}
        onRetry={() => void refetch()}
      />
    )
  }

  const organiser = profiles[data.organiserId]

  async function handleDelete() {
    if (!id) return
    try {
      await deleteMeeting.mutateAsync(id)
      toast({ title: 'Meeting removed', tone: 'success' })
      navigate('/meetings')
    } catch (err) {
      toast({
        title: 'The meeting could not be removed',
        description: err instanceof Error ? err.message : undefined,
        tone: 'error',
      })
    }
  }

  return (
    <>
      <PageHeader
        title={data.title}
        description={formatDateTime(data.startsAt)}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/meetings"><ArrowLeft /> Back</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/meetings/${data.id}/edit`}><Pencil /> Edit</Link>
            </Button>
            <Button variant="outline" onClick={() => setConfirmOpen(true)}>
              <Trash2 /> Remove
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={data.status === 'completed' ? 'success' : data.status === 'cancelled' ? 'outline' : 'info'}>
          {MEETING_STATUS_LABEL[data.status]}
        </Badge>
        <Badge variant="secondary"><Globe aria-hidden /> {LANGUAGE_LABEL[data.language]}</Badge>
        {data.hasRecording ? <Badge variant="ai"><Mic aria-hidden /> Recording captured</Badge> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {data.description ? (
            <Card>
              <CardHeader><CardTitle>Description</CardTitle></CardHeader>
              <CardContent><p className="text-sm leading-relaxed text-foreground/80">{data.description}</p></CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Agenda</CardTitle>
              <CardDescription>{data.agenda.length} item{data.agenda.length === 1 ? '' : 's'}</CardDescription>
            </CardHeader>
            <CardContent>
              {data.agenda.length === 0 ? (
                <p className="text-sm text-muted-foreground">No agenda has been recorded for this meeting.</p>
              ) : (
                <ol className="space-y-2">
                  {data.agenda.map((item, index) => (
                    <li key={item} className="flex gap-3 text-sm">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-2xs font-semibold tabular-nums text-muted-foreground">
                        {index + 1}
                      </span>
                      <span className="min-w-0">{item}</span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Mic className="size-4" /> Recording and transcript</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              {data.hasRecording ? (
                <p>
                  A recording exists for this meeting and is queued for processing. Transcription begins once the
                  processing service is online; the status is shown on the dashboard.
                </p>
              ) : (
                <p>No recording has been captured for this meeting.</p>
              )}
              <p>
                Recording and transcription are scheduled for Milestones 3 and 4. Participant consent is confirmed
                before any microphone access is requested.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-start gap-2.5">
                <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span>{formatDateTime(data.startsAt)}</span>
              </div>
              <div className="flex items-start gap-2.5">
                <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span>{formatDuration(data.durationMinutes)}</span>
              </div>
              {data.location ? (
                <div className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 break-words">{data.location}</span>
                </div>
              ) : null}
              {data.meetingLink ? (
                <div className="flex items-start gap-2.5">
                  <Video className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <a
                    href={data.meetingLink}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="min-w-0 break-all text-primary underline-offset-4 hover:underline"
                  >
                    {data.meetingLink}
                  </a>
                </div>
              ) : null}
              {organiser ? (
                <div className="flex items-start gap-2.5">
                  <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span>Organised by {organiser.fullName}</span>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Participants</CardTitle>
              <CardDescription>{data.participantIds.length} invited</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5">
                {data.participantIds.map((participantId) => {
                  const profile = profiles[participantId]
                  return (
                    <li key={participantId} className="flex items-center gap-2.5">
                      <Avatar>
                        <AvatarFallback>{profile ? initialsOf(profile.fullName) : '··'}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{profile?.fullName ?? 'Unknown participant'}</p>
                        <p className="truncate text-xs text-muted-foreground">{profile?.designation ?? ''}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this meeting?</DialogTitle>
            <DialogDescription>
              “{data.title}” will be removed from the sample data. This cannot be undone, though the sample data can be
              reset from System status.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMeeting.isPending}>
              {deleteMeeting.isPending ? 'Removing…' : 'Remove meeting'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

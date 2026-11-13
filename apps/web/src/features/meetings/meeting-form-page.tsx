import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/common/page-header'
import { ErrorState, LoadingRows } from '@/components/common/states'
import { useToast } from '@/components/common/toast'
import { useCreateMeeting, useCurrentUser, useMeeting, useProfiles, useUpdateMeeting } from '@/hooks/use-data'
import { todayISODate } from '@/lib/format'
import { LANGUAGE_LABEL, MEETING_STATUS_LABEL, type MeetingLanguage, type MeetingStatus } from '@/types/domain'
import { agendaToLines, linesToAgenda, meetingFormSchema, type MeetingFormValues } from './schema'
import { cn } from '@/lib/utils'

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-destructive">{message}</p>
}

export function MeetingFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: profiles } = useProfiles()
  const { data: currentUser } = useCurrentUser()
  const existing = useMeeting(mode === 'edit' ? id : undefined)
  const createMeeting = useCreateMeeting()
  const updateMeeting = useUpdateMeeting()

  const form = useForm<MeetingFormValues>({
    resolver: zodResolver(meetingFormSchema),
    defaultValues: {
      title: '',
      description: '',
      date: todayISODate(),
      time: '10:00',
      durationMinutes: 60,
      language: 'mixed',
      location: '',
      meetingLink: '',
      status: 'scheduled',
      agenda: '',
      participantIds: currentUser ? [currentUser.id] : [],
    },
  })

  const { register, handleSubmit, formState, setValue, watch, reset } = form
  const participantIds = watch('participantIds')

  useEffect(() => {
    if (mode === 'edit' && existing.data) {
      const m = existing.data
      const starts = new Date(m.startsAt)
      reset({
        title: m.title,
        description: m.description ?? '',
        date: `${starts.getFullYear()}-${String(starts.getMonth() + 1).padStart(2, '0')}-${String(starts.getDate()).padStart(2, '0')}`,
        time: `${String(starts.getHours()).padStart(2, '0')}:${String(starts.getMinutes()).padStart(2, '0')}`,
        durationMinutes: m.durationMinutes,
        language: m.language,
        location: m.location ?? '',
        meetingLink: m.meetingLink ?? '',
        status: m.status,
        agenda: agendaToLines(m.agenda),
        participantIds: m.participantIds,
      })
    }
  }, [mode, existing.data, reset])

  useEffect(() => {
    if (mode === 'create' && currentUser && participantIds.length === 0) {
      setValue('participantIds', [currentUser.id])
    }
  }, [mode, currentUser, participantIds.length, setValue])

  function toggleParticipant(profileId: string) {
    const next = participantIds.includes(profileId)
      ? participantIds.filter((p) => p !== profileId)
      : [...participantIds, profileId]
    setValue('participantIds', next, { shouldValidate: true })
  }

  const onSubmit = handleSubmit(async (values) => {
    const startsAt = new Date(`${values.date}T${values.time}:00`).toISOString()
    const payload = {
      title: values.title,
      description: values.description?.trim() || undefined,
      startsAt,
      durationMinutes: values.durationMinutes,
      location: values.location?.trim() || undefined,
      meetingLink: values.meetingLink?.trim() || undefined,
      status: values.status,
      language: values.language,
      organiserId: existing.data?.organiserId ?? currentUser?.id ?? 'u1',
      participantIds: values.participantIds,
      agenda: linesToAgenda(values.agenda),
    }

    try {
      if (mode === 'edit' && id) {
        await updateMeeting.mutateAsync({ id, patch: payload })
        toast({ title: 'Meeting updated', tone: 'success' })
        navigate(`/meetings/${id}`)
      } else {
        const created = await createMeeting.mutateAsync(payload)
        toast({ title: 'Meeting scheduled', description: created.title, tone: 'success' })
        navigate(`/meetings/${created.id}`)
      }
    } catch (err) {
      toast({
        title: mode === 'edit' ? 'The meeting could not be updated' : 'The meeting could not be scheduled',
        description: err instanceof Error ? err.message : 'Please try again.',
        tone: 'error',
      })
    }
  })

  if (mode === 'edit' && existing.isPending) return <LoadingRows rows={6} />
  if (mode === 'edit' && existing.isError) {
    return (
      <ErrorState
        title="Meeting could not be loaded"
        description={existing.error instanceof Error ? existing.error.message : undefined}
        onRetry={() => void existing.refetch()}
      />
    )
  }

  const saving = createMeeting.isPending || updateMeeting.isPending

  return (
    <>
      <PageHeader
        title={mode === 'edit' ? 'Edit meeting' : 'New meeting'}
        description={mode === 'edit' ? 'Update the meeting details' : 'Schedule a meeting and invite participants'}
        actions={
          <Button variant="outline" asChild>
            <Link to={mode === 'edit' && id ? `/meetings/${id}` : '/meetings'}><ArrowLeft /> Cancel</Link>
          </Button>
        }
      />

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Meeting details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                {...register('title')}
                aria-invalid={Boolean(formState.errors.title)}
                placeholder="Weekly research progress review"
              />
              <FieldError message={formState.errors.title?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" {...register('description')} placeholder="Purpose and context for the meeting" />
              <FieldError message={formState.errors.description?.message} />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="date">Date</Label>
                <Input id="date" type="date" {...register('date')} aria-invalid={Boolean(formState.errors.date)} />
                <FieldError message={formState.errors.date?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="time">Start time</Label>
                <Input id="time" type="time" {...register('time')} aria-invalid={Boolean(formState.errors.time)} />
                <FieldError message={formState.errors.time?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="durationMinutes">Duration (minutes)</Label>
                <Input
                  id="durationMinutes"
                  type="number"
                  min={5}
                  step={5}
                  {...register('durationMinutes', { valueAsNumber: true })}
                  aria-invalid={Boolean(formState.errors.durationMinutes)}
                />
                <FieldError message={formState.errors.durationMinutes?.message} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="location">Location</Label>
                <Input id="location" {...register('location')} placeholder="Seminar Room 2, Block B" aria-invalid={Boolean(formState.errors.location)} />
                <FieldError message={formState.errors.location?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meetingLink">Online meeting link</Label>
                <Input id="meetingLink" type="url" {...register('meetingLink')} placeholder="https://meet.example.com/…" aria-invalid={Boolean(formState.errors.meetingLink)} />
                <FieldError message={formState.errors.meetingLink?.message} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="language">Expected language</Label>
                <Select value={watch('language')} onValueChange={(v) => setValue('language', v as MeetingLanguage)}>
                  <SelectTrigger id="language"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(LANGUAGE_LABEL) as MeetingLanguage[]).map((key) => (
                      <SelectItem key={key} value={key}>{LANGUAGE_LABEL[key]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Used to select the transcription model once that service is connected.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <Select value={watch('status')} onValueChange={(v) => setValue('status', v as MeetingStatus)}>
                  <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(MEETING_STATUS_LABEL) as MeetingStatus[]).map((key) => (
                      <SelectItem key={key} value={key}>{MEETING_STATUS_LABEL[key]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agenda</CardTitle>
            <CardDescription>One item per line</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              id="agenda"
              rows={5}
              {...register('agenda')}
              placeholder={'Response rate by cluster\nNon-response follow-up plan\nNext week allocation'}
            />
            <FieldError message={formState.errors.agenda?.message} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Participants</CardTitle>
            <CardDescription>
              Participation also determines who may read the transcript of this meeting.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid gap-1.5 sm:grid-cols-2">
              {(profiles ?? []).map((profile) => {
                const checked = participantIds.includes(profile.id)
                return (
                  <label
                    key={profile.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors',
                      checked ? 'border-primary/40 bg-accent' : 'hover:bg-muted',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleParticipant(profile.id)}
                      className="size-4 accent-[hsl(var(--primary))]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{profile.fullName}</span>
                      <span className="block truncate text-xs text-muted-foreground">{profile.designation}</span>
                    </span>
                  </label>
                )
              })}
            </div>
            <FieldError message={formState.errors.participantIds?.message} />
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" asChild>
            <Link to={mode === 'edit' && id ? `/meetings/${id}` : '/meetings'}>Cancel</Link>
          </Button>
          <Button type="submit" disabled={saving}>
            <Save /> {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Schedule meeting'}
          </Button>
        </div>
      </form>
    </>
  )
}

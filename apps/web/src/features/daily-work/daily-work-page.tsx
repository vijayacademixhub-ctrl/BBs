import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, ClipboardList, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/common/page-header'
import { SampleDataNotice } from '@/components/common/provenance'
import { EmptyState, ErrorState, LoadingRows } from '@/components/common/states'
import { useToast } from '@/components/common/toast'
import { useCreateWorkLog, useCurrentUser, useProfileMap, useWorkLogs } from '@/hooks/use-data'
import { formatDate, todayISODate } from '@/lib/format'
import type { DailyWorkLog } from '@/types/domain'
import { workLogSchema, type WorkLogFormValues } from './schema'

type Scope = 'mine' | 'team'

function Section({ label, value }: { label: string; value?: string }) {
  if (!value?.trim()) return null
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/85">{value}</p>
    </div>
  )
}

function LogCard({ log, authorName, showAuthor }: { log: DailyWorkLog; authorName: string; showAuthor: boolean }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="min-w-0">
          <CardTitle>{formatDate(`${log.logDate}T00:00:00`)}</CardTitle>
          {showAuthor ? <CardDescription>{authorName}</CardDescription> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Section label="Completed" value={log.completed} />
        <Section label="In progress" value={log.inProgress} />
        <Section label="Pending" value={log.pending} />
        {log.challenges?.trim() ? (
          <div className="flex gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <div className="min-w-0 space-y-0.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-warning">Challenges</p>
              <p className="whitespace-pre-line text-sm text-foreground/85">{log.challenges}</p>
            </div>
          </div>
        ) : null}
        <Section label="Plan for next day" value={log.nextDayPlan} />
      </CardContent>
    </Card>
  )
}

export function DailyWorkPage() {
  const { data, isPending, isError, error, refetch } = useWorkLogs()
  const profiles = useProfileMap()
  const { data: currentUser } = useCurrentUser()
  const createWorkLog = useCreateWorkLog()
  const { toast } = useToast()
  const [scope, setScope] = useState<Scope>('mine')
  const [open, setOpen] = useState(false)

  const { register, handleSubmit, formState, reset } = useForm<WorkLogFormValues>({
    resolver: zodResolver(workLogSchema),
    defaultValues: {
      logDate: todayISODate(), completed: '', inProgress: '', pending: '', challenges: '', nextDayPlan: '',
    },
  })

  const visible = useMemo(() => {
    if (scope === 'mine') return (data ?? []).filter((log) => log.profileId === currentUser?.id)
    return data ?? []
  }, [data, scope, currentUser])

  const onSubmit = handleSubmit(async (values) => {
    if (!currentUser) return
    try {
      await createWorkLog.mutateAsync({
        profileId: currentUser.id,
        logDate: values.logDate,
        completed: values.completed,
        inProgress: values.inProgress,
        pending: values.pending,
        challenges: values.challenges?.trim() || undefined,
        nextDayPlan: values.nextDayPlan?.trim() || undefined,
      })
      toast({ title: 'Daily work recorded', tone: 'success' })
      setOpen(false)
      reset({ logDate: todayISODate(), completed: '', inProgress: '', pending: '', challenges: '', nextDayPlan: '' })
    } catch (err) {
      toast({
        title: 'The entry could not be saved',
        description: err instanceof Error ? err.message : 'Please try again.',
        tone: 'error',
      })
    }
  })

  return (
    <>
      <PageHeader
        title="Daily work"
        description="What was completed, what is in progress, and what is blocked"
        actions={<Button onClick={() => setOpen(true)}><Plus /> New entry</Button>}
      />

      <SampleDataNotice />

      <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
        <TabsList>
          <TabsTrigger value="mine">My entries</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>
      </Tabs>

      {isPending ? (
        <LoadingRows rows={3} />
      ) : isError ? (
        <ErrorState
          title="Daily work could not be loaded"
          description={error instanceof Error ? error.message : undefined}
          onRetry={() => void refetch()}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={scope === 'mine' ? 'No entries yet' : 'No team entries yet'}
          description={
            scope === 'mine'
              ? 'Record what you worked on today to build a progress history.'
              : 'Entries submitted by the team will appear here.'
          }
          action={scope === 'mine' ? <Button size="sm" onClick={() => setOpen(true)}><Plus /> New entry</Button> : undefined}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((log) => (
            <LogCard
              key={log.id}
              log={log}
              authorName={profiles[log.profileId]?.fullName ?? 'Unknown'}
              showAuthor={scope === 'team'}
            />
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Record daily work</DialogTitle>
            <DialogDescription>A short entry is enough. This builds the progress history for the project.</DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="log-date">Date</Label>
              <Input id="log-date" type="date" {...register('logDate')} aria-invalid={Boolean(formState.errors.logDate)} />
              {formState.errors.logDate ? (
                <p className="text-xs text-destructive">{formState.errors.logDate.message}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="log-completed">Work completed</Label>
              <Textarea id="log-completed" {...register('completed')} aria-invalid={Boolean(formState.errors.completed)} />
              {formState.errors.completed ? (
                <p className="text-xs text-destructive">{formState.errors.completed.message}</p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="log-progress">In progress</Label>
                <Textarea id="log-progress" {...register('inProgress')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="log-pending">Pending</Label>
                <Textarea id="log-pending" {...register('pending')} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="log-challenges">Challenges</Label>
              <Textarea id="log-challenges" {...register('challenges')} placeholder="Anything blocking progress" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="log-plan">Plan for the next day</Label>
              <Textarea id="log-plan" {...register('nextDayPlan')} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createWorkLog.isPending}>
                {createWorkLog.isPending ? 'Saving…' : 'Save entry'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

import { useMemo, useState } from 'react'
import { CheckSquare, ListFilter, Plus, Search, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/common/page-header'
import { SampleDataNotice } from '@/components/common/provenance'
import { EmptyState, ErrorState, LoadingRows } from '@/components/common/states'
import { useToast } from '@/components/common/toast'
import { useCurrentUser, useProfileMap, useTasks, useUpdateTask } from '@/hooks/use-data'
import { formatDate, isOverdue } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  TASK_PRIORITY_LABEL, TASK_STATUS_LABEL, type Task, type TaskPriority, type TaskStatus,
} from '@/types/domain'
import { TaskDialog } from './task-dialog'

type Scope = 'mine' | 'team'

const STATUS_VARIANT: Record<TaskStatus, 'outline' | 'info' | 'warning' | 'success'> = {
  todo: 'outline',
  in_progress: 'info',
  blocked: 'warning',
  done: 'success',
  cancelled: 'outline',
}

const NEXT_STATUS: Partial<Record<TaskStatus, TaskStatus>> = {
  todo: 'in_progress',
  in_progress: 'done',
  blocked: 'in_progress',
}

function TaskRow({
  task,
  assigneeName,
  onEdit,
  onAdvance,
  busy,
}: {
  task: Task
  assigneeName: string
  onEdit: () => void
  onAdvance: (next: TaskStatus) => void
  busy: boolean
}) {
  const overdue = isOverdue(task.dueDate) && task.status !== 'done' && task.status !== 'cancelled'
  const next = NEXT_STATUS[task.status]

  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <span
        className={cn(
          'mt-1 size-2 shrink-0 rounded-full sm:mt-0',
          task.priority === 'urgent' && 'bg-destructive',
          task.priority === 'high' && 'bg-warning',
          task.priority === 'medium' && 'bg-info',
          task.priority === 'low' && 'bg-muted-foreground/50',
        )}
        aria-hidden
      />

      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn('truncate font-medium', task.status === 'done' && 'text-muted-foreground line-through')}>
            {task.title}
          </p>
          {task.sourceExtractionId ? (
            <Badge variant="ai"><Sparkles aria-hidden /> From meeting analysis</Badge>
          ) : null}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{assigneeName}</span>
          <span aria-hidden>·</span>
          <span>{task.category}</span>
          <span aria-hidden>·</span>
          <span>{TASK_PRIORITY_LABEL[task.priority]}</span>
          {task.dueDate ? (
            <>
              <span aria-hidden>·</span>
              <span className={cn(overdue && 'font-medium text-destructive')}>
                {overdue ? 'Overdue — ' : 'Due '}{formatDate(`${task.dueDate}T00:00:00`)}
              </span>
            </>
          ) : null}
        </p>
      </button>

      <div className="flex shrink-0 items-center gap-2">
        {task.status !== 'done' && task.status !== 'cancelled' ? (
          <div className="hidden w-24 md:block" title={`${task.progress}% complete`}>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${task.progress}%` }} />
            </div>
          </div>
        ) : null}

        <Badge variant={STATUS_VARIANT[task.status]}>{TASK_STATUS_LABEL[task.status]}</Badge>

        {next ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onAdvance(next)}>
            {next === 'done' ? 'Complete' : 'Start'}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function TasksPage() {
  const { data, isPending, isError, error, refetch } = useTasks()
  const profiles = useProfileMap()
  const { data: currentUser } = useCurrentUser()
  const updateTask = useUpdateTask()
  const { toast } = useToast()

  const [scope, setScope] = useState<Scope>('mine')
  const [status, setStatus] = useState<TaskStatus | 'open' | 'all'>('open')
  const [priority, setPriority] = useState<TaskPriority | 'all'>('all')
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Task | undefined>()

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (data ?? []).filter((task) => {
      if (scope === 'mine' && task.assigneeId !== currentUser?.id) return false
      if (status === 'open' && (task.status === 'done' || task.status === 'cancelled')) return false
      if (status !== 'open' && status !== 'all' && task.status !== status) return false
      if (priority !== 'all' && task.priority !== priority) return false
      if (term && !`${task.title} ${task.description ?? ''} ${task.category}`.toLowerCase().includes(term)) return false
      return true
    })
  }, [data, scope, status, priority, search, currentUser])

  async function advance(task: Task, next: TaskStatus) {
    try {
      await updateTask.mutateAsync({
        id: task.id,
        patch: { status: next, progress: next === 'done' ? 100 : Math.max(task.progress, 10) },
      })
      toast({ title: next === 'done' ? 'Task completed' : 'Task started', description: task.title, tone: 'success' })
    } catch (err) {
      toast({
        title: 'The task could not be updated',
        description: err instanceof Error ? err.message : undefined,
        tone: 'error',
      })
    }
  }

  function openNew() {
    setEditing(undefined)
    setDialogOpen(true)
  }

  function openEdit(task: Task) {
    setEditing(task)
    setDialogOpen(true)
  }

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Assigned work, deadlines and progress"
        actions={<Button onClick={openNew}><Plus /> New task</Button>}
      />

      <SampleDataNotice />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
          <TabsList>
            <TabsTrigger value="mine">My tasks</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks"
            className="pl-8"
            aria-label="Search tasks"
          />
        </div>

        <div className="flex gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus | 'open' | 'all')}>
            <SelectTrigger className="w-full sm:w-40" aria-label="Filter by status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="all">All statuses</SelectItem>
              {(Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{TASK_STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority | 'all')}>
            <SelectTrigger className="w-full sm:w-36" aria-label="Filter by priority"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              {(Object.keys(TASK_PRIORITY_LABEL) as TaskPriority[]).map((p) => (
                <SelectItem key={p} value={p}>{TASK_PRIORITY_LABEL[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isPending ? (
        <LoadingRows rows={6} />
      ) : isError ? (
        <ErrorState
          title="Tasks could not be loaded"
          description={error instanceof Error ? error.message : undefined}
          onRetry={() => void refetch()}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={search || status !== 'open' || priority !== 'all' ? ListFilter : CheckSquare}
          title={search || priority !== 'all' ? 'No tasks match these filters' : 'No open tasks'}
          description={
            search || priority !== 'all'
              ? 'Try clearing the search or filters.'
              : scope === 'mine'
                ? 'Nothing is currently assigned to you.'
                : 'The team has no open tasks.'
          }
          action={<Button size="sm" onClick={openNew}><Plus /> New task</Button>}
        />
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {filtered.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                assigneeName={profiles[task.assigneeId]?.fullName ?? 'Unassigned'}
                onEdit={() => openEdit(task)}
                onAdvance={(next) => void advance(task, next)}
                busy={updateTask.isPending}
              />
            ))}
          </CardContent>
        </Card>
      )}

      <TaskDialog open={dialogOpen} onOpenChange={setDialogOpen} task={editing} />
    </>
  )
}

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/common/toast'
import { useCreateTask, useCurrentUser, useProfiles, useUpdateTask } from '@/hooks/use-data'
import {
  TASK_PRIORITY_LABEL, TASK_STATUS_LABEL, type Task, type TaskPriority, type TaskStatus,
} from '@/types/domain'
import { TASK_CATEGORIES, taskFormSchema, type TaskFormValues } from './schema'

export function TaskDialog({
  open,
  onOpenChange,
  task,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  task?: Task
}) {
  const { toast } = useToast()
  const { data: profiles } = useProfiles()
  const { data: currentUser } = useCurrentUser()
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const isEdit = Boolean(task)

  const { register, handleSubmit, formState, reset, setValue, watch } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: '', description: '', status: 'todo', priority: 'medium',
      category: 'Analysis', dueDate: '', assigneeId: currentUser?.id ?? '', progress: 0,
    },
  })

  useEffect(() => {
    if (!open) return
    reset(
      task
        ? {
            title: task.title,
            description: task.description ?? '',
            status: task.status,
            priority: task.priority,
            category: task.category,
            dueDate: task.dueDate ?? '',
            assigneeId: task.assigneeId,
            progress: task.progress,
          }
        : {
            title: '', description: '', status: 'todo', priority: 'medium',
            category: 'Analysis', dueDate: '', assigneeId: currentUser?.id ?? '', progress: 0,
          },
    )
  }, [open, task, currentUser, reset])

  const onSubmit = handleSubmit(async (values) => {
    const payload = {
      title: values.title,
      description: values.description?.trim() || undefined,
      status: values.status,
      priority: values.priority,
      category: values.category,
      dueDate: values.dueDate || undefined,
      assigneeId: values.assigneeId,
      createdById: task?.createdById ?? currentUser?.id ?? 'u1',
      progress: values.status === 'done' ? 100 : values.progress,
      meetingId: task?.meetingId,
    }

    try {
      if (task) {
        await updateTask.mutateAsync({ id: task.id, patch: payload })
        toast({ title: 'Task updated', tone: 'success' })
      } else {
        await createTask.mutateAsync(payload)
        toast({ title: 'Task created', description: payload.title, tone: 'success' })
      }
      onOpenChange(false)
    } catch (err) {
      toast({
        title: task ? 'The task could not be updated' : 'The task could not be created',
        description: err instanceof Error ? err.message : 'Please try again.',
        tone: 'error',
      })
    }
  })

  const saving = createTask.isPending || updateTask.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit task' : 'New task'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update the task details and progress.' : 'Create a task and assign it to a team member.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Title</Label>
            <Input id="task-title" {...register('title')} aria-invalid={Boolean(formState.errors.title)} />
            {formState.errors.title ? <p className="text-xs text-destructive">{formState.errors.title.message}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-description">Description</Label>
            <Textarea id="task-description" {...register('description')} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="task-assignee">Assignee</Label>
              <Select value={watch('assigneeId')} onValueChange={(v) => setValue('assigneeId', v, { shouldValidate: true })}>
                <SelectTrigger id="task-assignee"><SelectValue placeholder="Choose a team member" /></SelectTrigger>
                <SelectContent>
                  {(profiles ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formState.errors.assigneeId ? (
                <p className="text-xs text-destructive">{formState.errors.assigneeId.message}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-category">Category</Label>
              <Select value={watch('category')} onValueChange={(v) => setValue('category', v, { shouldValidate: true })}>
                <SelectTrigger id="task-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-status">Status</Label>
              <Select value={watch('status')} onValueChange={(v) => setValue('status', v as TaskStatus)}>
                <SelectTrigger id="task-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{TASK_STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-priority">Priority</Label>
              <Select value={watch('priority')} onValueChange={(v) => setValue('priority', v as TaskPriority)}>
                <SelectTrigger id="task-priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TASK_PRIORITY_LABEL) as TaskPriority[]).map((p) => (
                    <SelectItem key={p} value={p}>{TASK_PRIORITY_LABEL[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-due">Due date</Label>
              <Input id="task-due" type="date" {...register('dueDate')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-progress">Progress (%)</Label>
            <Input
              id="task-progress"
              type="number"
              min={0}
              max={100}
              step={5}
              {...register('progress', { valueAsNumber: true })}
              aria-invalid={Boolean(formState.errors.progress)}
            />
            {formState.errors.progress ? (
              <p className="text-xs text-destructive">{formState.errors.progress.message}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

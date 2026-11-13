import { z } from 'zod'

export const taskFormSchema = z.object({
  title: z.string().trim().min(3, 'Give the task a title of at least 3 characters.').max(160),
  description: z.string().trim().max(1000).optional(),
  status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'cancelled']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  category: z.string().trim().min(1, 'Choose a category.').max(60),
  dueDate: z.string().optional(),
  assigneeId: z.string().min(1, 'Choose an assignee.'),
  progress: z.number({ error: 'Enter a progress percentage.' }).int().min(0, 'Progress cannot be below 0.').max(100, 'Progress cannot exceed 100.'),
})

export type TaskFormValues = z.infer<typeof taskFormSchema>

export const TASK_CATEGORIES = [
  'Instrument', 'Analysis', 'Writing', 'Fieldwork', 'Data',
  'Methodology', 'Analytics', 'Administration',
] as const

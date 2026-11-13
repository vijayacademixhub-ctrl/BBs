import { z } from 'zod'

export const workLogSchema = z.object({
  logDate: z.string().min(1, 'Choose a date.'),
  completed: z.string().trim().min(10, 'Describe what was completed, in at least 10 characters.').max(2000),
  inProgress: z.string().trim().max(2000),
  pending: z.string().trim().max(2000),
  challenges: z.string().trim().max(2000).optional(),
  nextDayPlan: z.string().trim().max(2000).optional(),
})

export type WorkLogFormValues = z.infer<typeof workLogSchema>

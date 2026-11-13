import { z } from 'zod'

export const meetingFormSchema = z
  .object({
    title: z.string().trim().min(3, 'Give the meeting a title of at least 3 characters.').max(160),
    description: z.string().trim().max(1000).optional(),
    date: z.string().min(1, 'Choose a date.'),
    time: z.string().min(1, 'Choose a start time.'),
    durationMinutes: z
      .number({ error: 'Enter the duration in minutes.' })
      .int('Duration must be a whole number of minutes.')
      .min(5, 'A meeting must be at least 5 minutes.')
      .max(480, 'A meeting cannot exceed 8 hours.'),
    language: z.enum(['en', 'kn', 'hi', 'mixed']),
    location: z.string().trim().max(200).optional(),
    meetingLink: z.union([z.string().url('Enter a valid URL, including https://'), z.literal('')]).optional(),
    status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']),
    agenda: z.string().trim().max(2000).optional(),
    participantIds: z.array(z.string()).min(1, 'Select at least one participant.'),
  })
  .refine((v) => Boolean(v.location?.trim()) || Boolean(v.meetingLink?.trim()), {
    message: 'Provide either a location or an online meeting link.',
    path: ['location'],
  })

export type MeetingFormValues = z.infer<typeof meetingFormSchema>

/** Agenda is edited as one item per line and stored as an array. */
export function agendaToLines(agenda: string[]): string {
  return agenda.join('\n')
}

export function linesToAgenda(text: string | undefined): string[] {
  return (text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

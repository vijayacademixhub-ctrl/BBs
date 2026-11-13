/**
 * Domain types for AcademicOS.
 *
 * These mirror the schema in docs/database-architecture.md. When Supabase is
 * introduced at Milestone 2, generated database types replace the field
 * definitions here and these remain as the application-level view model, so
 * components do not change.
 */

export type AppRole = 'super_admin' | 'coordinator' | 'member'
export type MeetingStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type JobStatus = 'uploaded' | 'queued' | 'processing' | 'completed' | 'failed'
export type VerificationState = 'pending' | 'approved' | 'rejected' | 'modified' | 'published'

/** Spoken languages supported by the transcription pipeline (decision 2). */
export type MeetingLanguage = 'en' | 'kn' | 'hi' | 'mixed'

export interface Profile {
  id: string
  fullName: string
  email: string
  role: AppRole
  designation: string
  avatarUrl?: string
}

export interface Meeting {
  id: string
  title: string
  description?: string
  startsAt: string
  durationMinutes: number
  location?: string
  meetingLink?: string
  status: MeetingStatus
  language: MeetingLanguage
  organiserId: string
  participantIds: string[]
  agenda: string[]
  hasRecording: boolean
  /** Null until a transcript exists. Milestone 1 never fabricates one. */
  transcriptStatus: JobStatus | null
}

export interface Task {
  id: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  category: string
  dueDate?: string
  assigneeId: string
  createdById: string
  progress: number
  /** Set when the task originated from a verified AI extraction. */
  sourceExtractionId?: string
  meetingId?: string
  createdAt: string
  updatedAt: string
}

export interface DailyWorkLog {
  id: string
  profileId: string
  logDate: string
  completed: string
  inProgress: string
  pending: string
  challenges?: string
  nextDayPlan?: string
  createdAt: string
}

export interface NotificationItem {
  id: string
  title: string
  body?: string
  createdAt: string
  read: boolean
  kind: 'meeting' | 'task' | 'verification' | 'transcript' | 'system'
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Completed',
  cancelled: 'Cancelled',
}

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
}

export const MEETING_STATUS_LABEL: Record<MeetingStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const LANGUAGE_LABEL: Record<MeetingLanguage, string> = {
  en: 'English',
  kn: 'Kannada',
  hi: 'Hindi',
  mixed: 'Mixed (English / Kannada / Hindi)',
}

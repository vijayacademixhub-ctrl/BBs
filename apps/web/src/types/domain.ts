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

/**
 * A single quantitative or factual point taken out of a meeting.
 *
 * Data points are the reason the meeting module exists: the audio is a means
 * of getting to them and is not kept. A point carries the passage it came
 * from so a reader can check it against the transcript rather than trusting
 * the extraction.
 */
export interface MeetingDataPoint {
  id: string
  label: string
  value: string
  unit?: string
  /** The sentence in the transcript this came from. */
  evidence?: string
  /** Who or what produced it, and whether a person has checked it. */
  origin: 'person' | 'ai'
  verified: boolean
}

export type NoteSource = 'live_capture' | 'pasted_transcript' | 'manual'

/**
 * The record a meeting leaves behind.
 *
 * Audio is never part of it. A capture session holds the microphone stream in
 * the browser only, sends it to the transcription endpoint, and discards it;
 * what is stored is this note — the transcript text, the data points, the
 * decisions and the actions.
 */
export interface MeetingNote {
  id: string
  meetingId: string
  title: string
  source: NoteSource
  language: MeetingLanguage
  /** Plain transcript text. Empty when the note was written by hand. */
  transcript: string
  /** Model that produced the transcript, when one did. */
  transcriptModel?: string
  summary?: string
  dataPoints: MeetingDataPoint[]
  decisions: string[]
  actionItems: string[]
  /** Minutes of audio processed. Recorded so the cost and length of a session
   *  is auditable even though the audio itself is gone. */
  capturedMinutes?: number
  /** Always false, and stored so the claim is visible in the data and not
   *  only in the interface. */
  audioRetained: false
  createdBy?: string
  createdAt: string
  updatedAt: string
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

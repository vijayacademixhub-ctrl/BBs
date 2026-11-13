import { getSupabase } from '@/lib/supabase/client'
import type {
  DailyWorkLog, Meeting, NotificationItem, Profile, Task,
} from '@/types/domain'
import type { MeetingInput, TaskInput, WorkLogInput } from './types'

/**
 * Supabase implementation of the data access layer.
 *
 * Every function here issues a query that Row Level Security will filter.
 * None of them pass a team or user identifier for the purpose of restricting
 * results — the database does that from the caller's JWT. Where an id does
 * appear it is because the row needs it, not because it is acting as a
 * permission check; a filter written in the browser is a suggestion, not a
 * control.
 */

type Row = Record<string, unknown>

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`)
}

/* --------------------------------------------------------------- mapping */

function toProfile(row: Row): Profile {
  return {
    id: row.id as string,
    email: row.email as string,
    fullName: row.full_name as string,
    designation: (row.designation as string) ?? '',
    avatarUrl: (row.avatar_url as string) ?? undefined,
    role: ((row.team_members as Row[] | null)?.[0]?.role as Profile['role']) ?? 'member',
  }
}

function toMeeting(row: Row): Meeting {
  const participants = (row.meeting_participants as Row[] | null) ?? []
  const agenda = ((row.meeting_agendas as Row[] | null) ?? [])
    .slice()
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map((a) => a.item as string)
  const recordings = (row.recordings as Row[] | null) ?? []

  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string) ?? undefined,
    startsAt: row.starts_at as string,
    durationMinutes: row.duration_minutes as number,
    location: (row.location as string) ?? undefined,
    meetingLink: (row.meeting_link as string) ?? undefined,
    status: row.status as Meeting['status'],
    language: row.language as Meeting['language'],
    organiserId: row.organiser_id as string,
    participantIds: participants.map((p) => p.profile_id as string),
    agenda,
    hasRecording: recordings.length > 0,
    // Left null unless a transcript genuinely exists. Nothing here invents a
    // processing state the AI service has not reported.
    transcriptStatus: null,
  }
}

function toTask(row: Row): Task {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string) ?? undefined,
    status: row.status as Task['status'],
    priority: row.priority as Task['priority'],
    category: row.category as string,
    dueDate: (row.due_date as string) ?? undefined,
    assigneeId: (row.assignee_id as string) ?? '',
    createdById: (row.created_by as string) ?? '',
    progress: row.progress as number,
    sourceExtractionId: (row.source_extraction_id as string) ?? undefined,
    meetingId: (row.meeting_id as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function toWorkLog(row: Row): DailyWorkLog {
  return {
    id: row.id as string,
    profileId: row.profile_id as string,
    logDate: row.log_date as string,
    completed: row.completed as string,
    inProgress: (row.in_progress as string) ?? '',
    pending: (row.pending as string) ?? '',
    challenges: (row.challenges as string) ?? undefined,
    nextDayPlan: (row.next_day_plan as string) ?? undefined,
    createdAt: row.created_at as string,
  }
}

function toNotification(row: Row): NotificationItem {
  return {
    id: row.id as string,
    title: row.title as string,
    body: (row.body as string) ?? undefined,
    createdAt: row.created_at as string,
    read: row.read_at !== null,
    kind: row.kind as NotificationItem['kind'],
  }
}

/* ------------------------------------------------------------------ team */

/**
 * The caller's team.
 *
 * Reads it rather than accepting it as an argument, so a caller cannot act on
 * a team they are not in. RLS would refuse such a write anyway; this makes
 * the attempt impossible to express.
 */
async function currentTeamId(): Promise<string> {
  const { data, error } = await getSupabase()
    .from('team_members')
    .select('team_id')
    .limit(1)
    .maybeSingle()
  fail('Could not determine your team', error)
  if (!data) throw new Error('Your account is not a member of any team.')
  return data.team_id as string
}

/* -------------------------------------------------------------- profiles */

export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('id, email, full_name, designation, avatar_url, team_members(role)')
    .eq('status', 'active')
    .order('full_name')
  fail('Could not load the team', error)
  return (data ?? []).map(toProfile)
}

/* -------------------------------------------------------------- meetings */

const MEETING_SELECT =
  'id, title, description, starts_at, duration_minutes, location, meeting_link, status, ' +
  'language, confidentiality, organiser_id, meeting_participants(profile_id), ' +
  'meeting_agendas(item, position), recordings(id)'

export async function listMeetings(): Promise<Meeting[]> {
  const { data, error } = await getSupabase()
    .from('meetings')
    .select(MEETING_SELECT)
    .order('starts_at', { ascending: true })
  fail('Could not load meetings', error)
  return (data ?? []).map((row) => toMeeting(row as unknown as Row))
}

export async function getMeeting(id: string): Promise<Meeting> {
  const { data, error } = await getSupabase()
    .from('meetings')
    .select(MEETING_SELECT)
    .eq('id', id)
    .maybeSingle()
  fail('Could not load the meeting', error)
  // A missing row and a forbidden row are indistinguishable here, and that is
  // correct: telling the caller a meeting exists but is off-limits leaks the
  // fact of its existence.
  if (!data) throw new Error('This meeting does not exist, or you do not have access to it.')
  return toMeeting(data as unknown as Row)
}

export async function createMeeting(input: MeetingInput): Promise<Meeting> {
  const supabase = getSupabase()
  const teamId = await currentTeamId()
  const { data, error } = await supabase.rpc('create_meeting', {
    p_team_id: teamId,
    p_title: input.title,
    p_starts_at: input.startsAt,
    p_duration: input.durationMinutes,
    p_description: input.description ?? null,
    p_location: input.location ?? null,
    p_meeting_link: input.meetingLink ?? null,
    p_language: input.language,
    p_confidentiality: 'internal',
    p_participants: input.participantIds,
    p_agenda: input.agenda,
  })
  fail('Could not create the meeting', error)
  return getMeeting(data as string)
}

export async function updateMeeting(id: string, patch: Partial<MeetingInput>): Promise<Meeting> {
  const supabase = getSupabase()

  const fields: Row = {}
  if (patch.title !== undefined) fields.title = patch.title
  if (patch.description !== undefined) fields.description = patch.description ?? null
  if (patch.startsAt !== undefined) fields.starts_at = patch.startsAt
  if (patch.durationMinutes !== undefined) fields.duration_minutes = patch.durationMinutes
  if (patch.location !== undefined) fields.location = patch.location ?? null
  if (patch.meetingLink !== undefined) fields.meeting_link = patch.meetingLink ?? null
  if (patch.status !== undefined) fields.status = patch.status
  if (patch.language !== undefined) fields.language = patch.language

  if (Object.keys(fields).length > 0) {
    const { error } = await supabase.from('meetings').update(fields).eq('id', id)
    fail('Could not update the meeting', error)
  }

  if (patch.agenda) {
    const { error } = await supabase.rpc('replace_meeting_agenda', {
      p_meeting_id: id,
      p_agenda: patch.agenda,
    })
    fail('Could not update the agenda', error)
  }

  if (patch.participantIds) {
    const { error } = await supabase.rpc('replace_meeting_participants', {
      p_meeting_id: id,
      p_participants: patch.participantIds,
    })
    fail('Could not update the participants', error)
  }

  return getMeeting(id)
}

export async function deleteMeeting(id: string): Promise<void> {
  const { error } = await getSupabase().from('meetings').delete().eq('id', id)
  fail('Could not remove the meeting', error)
}

/* ----------------------------------------------------------------- tasks */

const TASK_SELECT =
  'id, title, description, status, priority, category, due_date, assignee_id, created_by, ' +
  'progress, meeting_id, source_extraction_id, created_at, updated_at'

export async function listTasks(): Promise<Task[]> {
  const { data, error } = await getSupabase()
    .from('tasks')
    .select(TASK_SELECT)
    .order('created_at', { ascending: false })
  fail('Could not load tasks', error)
  return (data ?? []).map((row) => toTask(row as unknown as Row))
}

export async function getTask(id: string): Promise<Task> {
  const { data, error } = await getSupabase()
    .from('tasks')
    .select(TASK_SELECT)
    .eq('id', id)
    .maybeSingle()
  fail('Could not load the task', error)
  if (!data) throw new Error('This task does not exist, or you do not have access to it.')
  return toTask(data as unknown as Row)
}

export async function createTask(input: TaskInput): Promise<Task> {
  const teamId = await currentTeamId()
  const { data: user } = await getSupabase().auth.getUser()
  const { data, error } = await getSupabase()
    .from('tasks')
    .insert({
      team_id: teamId,
      title: input.title,
      description: input.description ?? null,
      status: input.status,
      priority: input.priority,
      category: input.category,
      due_date: input.dueDate ?? null,
      assignee_id: input.assigneeId || null,
      // The policy requires created_by to be the caller, so this is checked
      // by the database rather than trusted from here.
      created_by: user.user?.id ?? null,
      progress: input.progress,
      meeting_id: input.meetingId ?? null,
    })
    .select(TASK_SELECT)
    .single()
  fail('Could not create the task', error)
  return toTask(data as unknown as Row)
}

export async function updateTask(id: string, patch: Partial<TaskInput>): Promise<Task> {
  const fields: Row = {}
  if (patch.title !== undefined) fields.title = patch.title
  if (patch.description !== undefined) fields.description = patch.description ?? null
  if (patch.status !== undefined) fields.status = patch.status
  if (patch.priority !== undefined) fields.priority = patch.priority
  if (patch.category !== undefined) fields.category = patch.category
  if (patch.dueDate !== undefined) fields.due_date = patch.dueDate ?? null
  if (patch.assigneeId !== undefined) fields.assignee_id = patch.assigneeId || null
  if (patch.progress !== undefined) fields.progress = patch.progress
  if (patch.meetingId !== undefined) fields.meeting_id = patch.meetingId ?? null

  const { data, error } = await getSupabase()
    .from('tasks')
    .update(fields)
    .eq('id', id)
    .select(TASK_SELECT)
    .maybeSingle()
  fail('Could not update the task', error)
  if (!data) throw new Error('You do not have permission to change this task.')
  return toTask(data as unknown as Row)
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await getSupabase().from('tasks').delete().eq('id', id)
  fail('Could not remove the task', error)
}

/* ------------------------------------------------------------- work logs */

const WORK_LOG_SELECT =
  'id, profile_id, log_date, completed, in_progress, pending, challenges, next_day_plan, created_at'

export async function listWorkLogs(): Promise<DailyWorkLog[]> {
  const { data, error } = await getSupabase()
    .from('daily_work_logs')
    .select(WORK_LOG_SELECT)
    .order('log_date', { ascending: false })
  fail('Could not load daily work', error)
  return (data ?? []).map((row) => toWorkLog(row as unknown as Row))
}

export async function createWorkLog(input: WorkLogInput): Promise<DailyWorkLog> {
  const teamId = await currentTeamId()
  const { data, error } = await getSupabase()
    .from('daily_work_logs')
    .insert({
      team_id: teamId,
      profile_id: input.profileId,
      log_date: input.logDate,
      completed: input.completed,
      in_progress: input.inProgress,
      pending: input.pending,
      challenges: input.challenges ?? null,
      next_day_plan: input.nextDayPlan ?? null,
    })
    .select(WORK_LOG_SELECT)
    .single()
  if (error?.code === '23505') {
    throw new Error('An entry already exists for that date. Edit the existing entry instead.')
  }
  fail('Could not save the entry', error)
  return toWorkLog(data as unknown as Row)
}

export async function updateWorkLog(
  id: string,
  patch: Partial<WorkLogInput>,
): Promise<DailyWorkLog> {
  const fields: Row = {}
  if (patch.logDate !== undefined) fields.log_date = patch.logDate
  if (patch.completed !== undefined) fields.completed = patch.completed
  if (patch.inProgress !== undefined) fields.in_progress = patch.inProgress
  if (patch.pending !== undefined) fields.pending = patch.pending
  if (patch.challenges !== undefined) fields.challenges = patch.challenges ?? null
  if (patch.nextDayPlan !== undefined) fields.next_day_plan = patch.nextDayPlan ?? null

  const { data, error } = await getSupabase()
    .from('daily_work_logs')
    .update(fields)
    .eq('id', id)
    .select(WORK_LOG_SELECT)
    .maybeSingle()
  fail('Could not update the entry', error)
  if (!data) throw new Error('You can only edit your own daily work entries.')
  return toWorkLog(data as unknown as Row)
}

/* --------------------------------------------------------- notifications */

export async function listNotifications(): Promise<NotificationItem[]> {
  const { data, error } = await getSupabase()
    .from('notifications')
    .select('id, kind, title, body, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  fail('Could not load notifications', error)
  return (data ?? []).map((row) => toNotification(row as unknown as Row))
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
  fail('Could not update the notification', error)
}

export function resetSampleData(): void {
  throw new Error('Sample data cannot be reset while the application is connected to a database.')
}

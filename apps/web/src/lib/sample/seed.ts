import type { DailyWorkLog, Meeting, NotificationItem, Profile, Task } from '@/types/domain'

/**
 * Demonstration data for Milestone 1.
 *
 * Dates are generated relative to today so the dashboard remains meaningful
 * whenever the application is opened. Everything produced here is labelled as
 * sample content in the interface; none of it represents AI output.
 */

const DAY = 86_400_000

function at(dayOffset: number, hour: number, minute = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

function dateOnly(dayOffset: number): string {
  const d = new Date(Date.now() + dayOffset * DAY)
  return d.toISOString().slice(0, 10)
}

export const SAMPLE_PROFILES: Profile[] = [
  { id: 'u1', fullName: 'Vijay Mourish DG', email: 'vijay@example.ac.in', role: 'super_admin', designation: 'Research Lead' },
  { id: 'u2', fullName: 'Ananya Rao', email: 'ananya@example.ac.in', role: 'coordinator', designation: 'Project Coordinator' },
  { id: 'u3', fullName: 'Karthik Narayan', email: 'karthik@example.ac.in', role: 'coordinator', designation: 'Data Lead' },
  { id: 'u4', fullName: 'Shreya Iyer', email: 'shreya@example.ac.in', role: 'member', designation: 'Research Associate' },
  { id: 'u5', fullName: 'Mohammed Faiz', email: 'faiz@example.ac.in', role: 'member', designation: 'Research Associate' },
  { id: 'u6', fullName: 'Divya Prakash', email: 'divya@example.ac.in', role: 'member', designation: 'Analyst' },
  { id: 'u7', fullName: 'Rohan Mehta', email: 'rohan@example.ac.in', role: 'member', designation: 'Analyst' },
  { id: 'u8', fullName: 'Priya Venkatesh', email: 'priya@example.ac.in', role: 'member', designation: 'Documentation' },
  { id: 'u9', fullName: 'Aditya Kulkarni', email: 'aditya@example.ac.in', role: 'member', designation: 'Survey Operations' },
  { id: 'u10', fullName: 'Nandini Shetty', email: 'nandini@example.ac.in', role: 'member', designation: 'Survey Operations' },
]

/** The signed-in user for Milestone 1. Replaced by Supabase Auth at M2. */
export const CURRENT_USER_ID = 'u1'

export const SAMPLE_MEETINGS: Meeting[] = [
  {
    id: 'm1',
    title: 'Weekly research progress review',
    description: 'Review of questionnaire distribution progress and the current response rate across all three sampling clusters.',
    startsAt: at(0, 10, 30),
    durationMinutes: 60,
    location: 'Seminar Room 2, Block B',
    status: 'scheduled',
    language: 'mixed',
    organiserId: 'u1',
    participantIds: ['u1', 'u2', 'u3', 'u4', 'u5'],
    agenda: ['Response rate by cluster', 'Non-response follow-up plan', 'Data entry backlog', 'Next week allocation'],
    hasRecording: false,
    transcriptStatus: null,
  },
  {
    id: 'm2',
    title: 'Questionnaire instrument finalisation',
    description: 'Closing discussion on the 32-item instrument before pilot distribution.',
    startsAt: at(0, 15, 0),
    durationMinutes: 45,
    meetingLink: 'https://meet.example.com/academicos-instrument',
    status: 'scheduled',
    language: 'en',
    organiserId: 'u2',
    participantIds: ['u1', 'u2', 'u4', 'u8'],
    agenda: ['Section C wording', 'Likert scale consistency', 'Pilot sample size'],
    hasRecording: false,
    transcriptStatus: null,
  },
  {
    id: 'm3',
    title: 'Supervisor consultation — methodology chapter',
    startsAt: at(1, 11, 0),
    durationMinutes: 30,
    location: 'Faculty Office 114',
    status: 'scheduled',
    language: 'en',
    organiserId: 'u1',
    participantIds: ['u1', 'u2'],
    agenda: ['Sampling justification', 'Reliability testing approach'],
    hasRecording: false,
    transcriptStatus: null,
  },
  {
    id: 'm4',
    title: 'Data collection team briefing',
    description: 'Field protocol walkthrough for the survey operations team.',
    startsAt: at(2, 9, 30),
    durationMinutes: 45,
    location: 'Computer Lab 1',
    status: 'scheduled',
    language: 'mixed',
    organiserId: 'u3',
    participantIds: ['u3', 'u6', 'u7', 'u9', 'u10'],
    agenda: ['Field protocol', 'Consent script', 'Daily reporting format'],
    hasRecording: false,
    transcriptStatus: null,
  },
  {
    id: 'm5',
    title: 'Literature review consolidation',
    description: 'Merging the four reviewer summaries into a single chapter draft.',
    startsAt: at(-2, 14, 0),
    durationMinutes: 90,
    location: 'Library Discussion Room',
    status: 'completed',
    language: 'en',
    organiserId: 'u1',
    participantIds: ['u1', 'u2', 'u4', 'u8'],
    agenda: ['Thematic grouping', 'Citation gaps', 'APA consistency pass'],
    hasRecording: true,
    transcriptStatus: 'queued',
  },
  {
    id: 'm6',
    title: 'Analytics tooling review',
    description: 'Comparison of the current Excel workflow against a SQL-based pipeline.',
    startsAt: at(-4, 16, 0),
    durationMinutes: 60,
    meetingLink: 'https://meet.example.com/academicos-tooling',
    status: 'completed',
    language: 'en',
    organiserId: 'u3',
    participantIds: ['u1', 'u3', 'u6', 'u7'],
    agenda: ['Current workflow bottlenecks', 'SQL migration effort', 'Training requirement'],
    hasRecording: true,
    transcriptStatus: 'queued',
  },
  {
    id: 'm7',
    title: 'Mid-semester review preparation',
    startsAt: at(-7, 10, 0),
    durationMinutes: 60,
    location: 'Seminar Room 2, Block B',
    status: 'completed',
    language: 'mixed',
    organiserId: 'u2',
    participantIds: ['u1', 'u2', 'u3', 'u4', 'u5', 'u8'],
    agenda: ['Deliverable status', 'Presentation allocation'],
    hasRecording: false,
    transcriptStatus: null,
  },
  {
    id: 'm8',
    title: 'Pilot study debrief',
    description: 'Cancelled — rescheduled pending pilot completion.',
    startsAt: at(-1, 15, 30),
    durationMinutes: 45,
    location: 'Seminar Room 1',
    status: 'cancelled',
    language: 'en',
    organiserId: 'u1',
    participantIds: ['u1', 'u2', 'u4'],
    agenda: ['Pilot response quality'],
    hasRecording: false,
    transcriptStatus: null,
  },
]

export const SAMPLE_TASKS: Task[] = [
  { id: 't1', title: 'Finalise Section C of the questionnaire', description: 'Rewrite items 18–24 for consistent Likert phrasing.', status: 'in_progress', priority: 'high', category: 'Instrument', dueDate: dateOnly(0), assigneeId: 'u1', createdById: 'u2', progress: 60, meetingId: 'm2', createdAt: at(-3, 9), updatedAt: at(-1, 17) },
  { id: 't2', title: 'Compile cluster-wise response rate table', status: 'todo', priority: 'high', category: 'Analysis', dueDate: dateOnly(0), assigneeId: 'u1', createdById: 'u1', progress: 0, createdAt: at(-2, 11), updatedAt: at(-2, 11) },
  { id: 't3', title: 'APA consistency pass on Chapter 2', description: 'Reconcile all in-text citations against the reference list.', status: 'in_progress', priority: 'medium', category: 'Writing', dueDate: dateOnly(1), assigneeId: 'u8', createdById: 'u1', progress: 40, meetingId: 'm5', createdAt: at(-5, 10), updatedAt: at(0, 9) },
  { id: 't4', title: 'Prepare field consent script in Kannada', status: 'todo', priority: 'urgent', category: 'Fieldwork', dueDate: dateOnly(-1), assigneeId: 'u9', createdById: 'u3', progress: 0, createdAt: at(-6, 14), updatedAt: at(-6, 14) },
  { id: 't5', title: 'Data entry backlog — cluster 3', status: 'blocked', priority: 'high', category: 'Data', dueDate: dateOnly(-2), assigneeId: 'u6', createdById: 'u3', progress: 25, createdAt: at(-8, 9), updatedAt: at(-2, 16) },
  { id: 't6', title: 'Draft reliability testing procedure', status: 'todo', priority: 'medium', category: 'Methodology', dueDate: dateOnly(3), assigneeId: 'u2', createdById: 'u1', progress: 0, meetingId: 'm3', createdAt: at(-1, 12), updatedAt: at(-1, 12) },
  { id: 't7', title: 'Set up SQL staging tables for survey responses', status: 'in_progress', priority: 'medium', category: 'Analytics', dueDate: dateOnly(4), assigneeId: 'u7', createdById: 'u3', progress: 55, meetingId: 'm6', createdAt: at(-4, 17), updatedAt: at(0, 11) },
  { id: 't8', title: 'Summarise the four reviewer literature notes', status: 'done', priority: 'medium', category: 'Writing', dueDate: dateOnly(-3), assigneeId: 'u4', createdById: 'u1', progress: 100, meetingId: 'm5', createdAt: at(-9, 10), updatedAt: at(-3, 15) },
  { id: 't9', title: 'Book seminar room for mid-semester review', status: 'done', priority: 'low', category: 'Administration', dueDate: dateOnly(-5), assigneeId: 'u8', createdById: 'u2', progress: 100, createdAt: at(-10, 9), updatedAt: at(-5, 11) },
  { id: 't10', title: 'Verify sampling frame against enrolment register', status: 'todo', priority: 'high', category: 'Methodology', dueDate: dateOnly(2), assigneeId: 'u5', createdById: 'u1', progress: 0, createdAt: at(-2, 15), updatedAt: at(-2, 15) },
  { id: 't11', title: 'Clean and code open-ended responses', status: 'todo', priority: 'medium', category: 'Data', dueDate: dateOnly(6), assigneeId: 'u10', createdById: 'u3', progress: 0, createdAt: at(-1, 10), updatedAt: at(-1, 10) },
  { id: 't12', title: 'Update project Gantt chart', status: 'todo', priority: 'low', category: 'Administration', dueDate: dateOnly(5), assigneeId: 'u2', createdById: 'u2', progress: 0, createdAt: at(0, 8), updatedAt: at(0, 8) },
  { id: 't13', title: 'Pilot distribution to 30 respondents', status: 'in_progress', priority: 'urgent', category: 'Fieldwork', dueDate: dateOnly(1), assigneeId: 'u9', createdById: 'u1', progress: 70, createdAt: at(-4, 9), updatedAt: at(0, 10) },
  { id: 't14', title: 'Draft internship report Chapter 3', status: 'in_progress', priority: 'high', category: 'Writing', dueDate: dateOnly(7), assigneeId: 'u1', createdById: 'u1', progress: 35, createdAt: at(-6, 20), updatedAt: at(-1, 21) },
  { id: 't15', title: 'Cross-check Hindi translation of items 1–17', status: 'todo', priority: 'medium', category: 'Instrument', dueDate: dateOnly(-1), assigneeId: 'u5', createdById: 'u2', progress: 0, createdAt: at(-5, 13), updatedAt: at(-5, 13) },
  { id: 't16', title: 'Archive cluster 1 raw response sheets', status: 'done', priority: 'low', category: 'Data', dueDate: dateOnly(-4), assigneeId: 'u6', createdById: 'u3', progress: 100, createdAt: at(-11, 11), updatedAt: at(-4, 14) },
]

export const SAMPLE_WORK_LOGS: DailyWorkLog[] = [
  { id: 'w1', profileId: 'u1', logDate: dateOnly(-1), completed: 'Reviewed reviewer summaries for Chapter 2 and merged the thematic groupings into a single outline.', inProgress: 'Rewriting Section C of the questionnaire for Likert consistency.', pending: 'Cluster-wise response rate table.', challenges: 'Two reviewer summaries use different thematic labels for the same construct, which needs reconciliation before the merge is final.', nextDayPlan: 'Complete Section C and circulate for comment before the afternoon meeting.', createdAt: at(-1, 18) },
  { id: 'w2', profileId: 'u1', logDate: dateOnly(-2), completed: 'Literature review consolidation meeting; allocated the APA consistency pass.', inProgress: 'Chapter 3 draft of the internship report.', pending: 'Reliability testing procedure.', nextDayPlan: 'Begin the Section C rewrite.', createdAt: at(-2, 19) },
  { id: 'w3', profileId: 'u4', logDate: dateOnly(-1), completed: 'Finished summarising all four reviewer literature notes and handed them to the documentation lead.', inProgress: 'Supporting the sampling frame verification.', pending: 'Awaiting the enrolment register extract.', challenges: 'The enrolment register has not yet been released by the office.', nextDayPlan: 'Follow up on the register request.', createdAt: at(-1, 17, 30) },
  { id: 'w4', profileId: 'u6', logDate: dateOnly(-1), completed: 'Entered 48 responses from cluster 2.', inProgress: 'Cluster 3 data entry.', pending: 'Cluster 3 backlog — blocked.', challenges: 'Eighteen response sheets from cluster 3 have illegible sections and need the field team to re-confirm.', nextDayPlan: 'Raise the illegible sheets with survey operations.', createdAt: at(-1, 18, 15) },
  { id: 'w5', profileId: 'u9', logDate: dateOnly(-1), completed: 'Distributed the pilot questionnaire to 21 of the 30 target respondents.', inProgress: 'Remaining nine pilot distributions.', pending: 'Kannada consent script.', challenges: 'The Kannada consent script is overdue and is holding up distribution in two locations.', nextDayPlan: 'Complete the consent script and finish distribution.', createdAt: at(-1, 19, 45) },
  { id: 'w6', profileId: 'u7', logDate: dateOnly(-2), completed: 'Drafted the SQL staging schema for survey responses.', inProgress: 'Loading the cluster 1 extract into the staging tables.', pending: 'Validation queries.', nextDayPlan: 'Write the validation query set.', createdAt: at(-2, 20) },
]

export const SAMPLE_NOTIFICATIONS: NotificationItem[] = [
  { id: 'n1', title: 'Task overdue: Prepare field consent script in Kannada', body: 'Assigned to Aditya Kulkarni, due yesterday.', createdAt: at(0, 8, 15), read: false, kind: 'task' },
  { id: 'n2', title: 'Meeting today at 10:30', body: 'Weekly research progress review, Seminar Room 2.', createdAt: at(0, 7, 30), read: false, kind: 'meeting' },
  { id: 'n3', title: 'Task blocked: Data entry backlog — cluster 3', body: 'Divya Prakash reported illegible response sheets.', createdAt: at(-1, 16, 40), read: false, kind: 'task' },
  { id: 'n4', title: 'Recording awaiting processing', body: 'Literature review consolidation — queued until the processing service is online.', createdAt: at(-2, 15, 40), read: true, kind: 'transcript' },
  { id: 'n5', title: 'Task completed: Summarise the four reviewer literature notes', body: 'Marked complete by Shreya Iyer.', createdAt: at(-3, 15, 10), read: true, kind: 'task' },
]

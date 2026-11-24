import type { DailyWorkLog, Meeting, NotificationItem, Profile, Task } from '@/types/domain'

/**
 * Starting content when no backend is configured.
 *
 * There is deliberately almost none. An earlier version of this file carried
 * invented meetings, tasks, colleagues and daily reports to make the
 * interface look populated during development. They were removed on the
 * owner's instruction on 20-Nov-2026: fabricated names and figures sitting
 * beside the team's real Master Index is exactly the confusion this project
 * has otherwise been careful to avoid, and once real accounts exist there is
 * nothing for them to demonstrate.
 *
 * What survives is the single profile of whoever is using the application
 * without a backend, so that assigning a task has somebody to assign it to.
 * The registers — the real content, imported from the team's workbook — live
 * in registry-seed.ts and are untouched by this.
 */

/** The signed-in user when there is no backend. Mirrors SAMPLE_PROFILE in
 *  features/auth/auth-context.tsx, which is the authority for identity. */
export const SAMPLE_PROFILES: Profile[] = [
  {
    id: 'u1',
    fullName: 'Vijay Mourish DG',
    email: 'vijay@example.ac.in',
    role: 'super_admin',
    designation: 'Research Lead',
  },
]

export const CURRENT_USER_ID = 'u1'

/**
 * Empty, and meant to stay that way.
 *
 * A meeting, a task or a daily report is an institutional record. Without a
 * backend the application has none, and it should say so by showing none
 * rather than by showing plausible ones with a label attached.
 */
export const SAMPLE_MEETINGS: Meeting[] = []
export const SAMPLE_TASKS: Task[] = []
export const SAMPLE_WORK_LOGS: DailyWorkLog[] = []
export const SAMPLE_NOTIFICATIONS: NotificationItem[] = []

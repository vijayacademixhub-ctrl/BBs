import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, createMemoryRouter, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/app-shell'
import { LoginPage } from '@/features/auth/login-page'
import { MfaPage } from '@/features/auth/mfa-page'
import { RequireAuth, RequireRole } from '@/features/auth/route-guards'
import { LoadingRows } from '@/components/common/states'
import { DashboardPage } from '@/features/dashboard/dashboard-page'

/**
 * Routes are split so that the initial download is the shell and the
 * dashboard only. Everything else arrives when it is first opened, which
 * matters on a mobile connection.
 */
const MeetingsPage = lazy(() => import('@/features/meetings/meetings-page').then((m) => ({ default: m.MeetingsPage })))
const MeetingFormPage = lazy(() => import('@/features/meetings/meeting-form-page').then((m) => ({ default: m.MeetingFormPage })))
const MeetingDetailPage = lazy(() => import('@/features/meetings/meeting-detail-page').then((m) => ({ default: m.MeetingDetailPage })))
const TasksPage = lazy(() => import('@/features/tasks/tasks-page').then((m) => ({ default: m.TasksPage })))
const DailyWorkPage = lazy(() => import('@/features/daily-work/daily-work-page').then((m) => ({ default: m.DailyWorkPage })))
const NotificationsPage = lazy(() => import('@/features/notifications/notifications-page').then((m) => ({ default: m.NotificationsPage })))
const SettingsPage = lazy(() => import('@/features/settings/settings-page').then((m) => ({ default: m.SettingsPage })))
const SystemStatusPage = lazy(() => import('@/features/system/system-status-page').then((m) => ({ default: m.SystemStatusPage })))
const NotFoundPage = lazy(() => import('@/features/system/not-found-page').then((m) => ({ default: m.NotFoundPage })))
const PlannedPage = lazy(() => import('@/features/system/planned-page').then((m) => ({ default: m.PlannedPage })))

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingRows rows={5} />}>{children}</Suspense>
}

/**
 * The router factory.
 *
 * Normal builds use the browser history, so URLs are real and shareable.
 *
 * A standalone build (VITE_ROUTER=memory) keeps routing entirely in memory.
 * That is for hosts which serve the files statically with no single-page
 * fallback, where a request for /dashboard would be a 404. Navigation inside
 * the application works identically; only deep links and the address bar are
 * given up, which is the right trade when the alternative is a broken route.
 */
const createRouter =
  (import.meta.env.VITE_ROUTER as string | undefined) === 'memory'
    ? createMemoryRouter
    : createBrowserRouter

export const router = createRouter([
  { path: '/login', element: <LoginPage /> },
  // Outside the shell: a session at aal1 can reach no application data, so
  // rendering the navigation around this page would be misleading.
  { path: '/mfa', element: <MfaPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },

      { path: 'meetings', element: <Lazy><MeetingsPage /></Lazy> },
      { path: 'meetings/new', element: <Lazy><MeetingFormPage mode="create" /></Lazy> },
      { path: 'meetings/:id', element: <Lazy><MeetingDetailPage /></Lazy> },
      { path: 'meetings/:id/edit', element: <Lazy><MeetingFormPage mode="edit" /></Lazy> },

      { path: 'tasks', element: <Lazy><TasksPage /></Lazy> },
      { path: 'daily-work', element: <Lazy><DailyWorkPage /></Lazy> },

      {
        path: 'recorder',
        element: (
          <Lazy>
            <PlannedPage
              title="Meeting Recorder"
              milestone="Milestone 3"
              description="Browser microphone recording with an explicit consent step before any permission request."
              capabilities={[
                'Participant consent confirmation shown before the microphone is requested',
                'Start, pause, resume and stop, with a visible recording indicator throughout',
                'Honest permission handling — recording is never reported as active unless it is',
                'Chunked, resumable upload so a long meeting does not fail at the final step',
                'Clear guidance for iOS, where Safari stops recording when the screen locks',
              ]}
            />
          </Lazy>
        ),
      },
      {
        path: 'transcripts',
        element: (
          <Lazy>
            <PlannedPage
              title="Transcripts"
              milestone="Milestone 4"
              description="Automatic speech transcription for English, Kannada and Hindi, including mixed-language discussion."
              capabilities={[
                'Timestamped transcript segments linked to the source audio',
                'Transcription model configurable so accuracy can be benchmarked before it is fixed',
                'Transcript editing and export',
                'Job status reported honestly, including when the processing service is offline',
              ]}
            />
          </Lazy>
        ),
      },
      {
        path: 'calendar',
        element: (
          <Lazy>
            <PlannedPage
              title="Calendar"
              milestone="Milestone 7"
              description="Meeting and deadline synchronisation, beginning with ICS export."
              capabilities={[
                'ICS export, which works on every device without any account connection',
                'Google Calendar synchronisation with credentials held on the server',
                'Duplicate-safe event creation through an outbox with idempotency keys',
                'Reminders for verified action items only',
              ]}
            />
          </Lazy>
        ),
      },
      {
        path: 'verification',
        element: (
          <RequireRole roles={['super_admin', 'coordinator']}>
          <Lazy>
            <PlannedPage
              title="Verification Centre"
              milestone="Milestone 5"
              description="Human review of AI-extracted decisions, action items and deadlines before they become official."
              capabilities={[
                'Side-by-side display of the extracted item and its source passage in the transcript',
                'Approve, edit, reject, or request re-analysis',
                'Items with no stated owner or deadline shown as unstated, never guessed',
                'Database-level enforcement: an unapproved extraction cannot become a task or calendar event',
              ]}
            />
          </Lazy>
          </RequireRole>
        ),
      },
      {
        path: 'assistant',
        element: (
          <Lazy>
            <PlannedPage
              title="Academic Assistant"
              milestone="Milestone 8"
              description="Questions answered from past meetings and authorised documents."
              capabilities={[
                'Search across meeting transcripts and decisions',
                'Generated meeting minutes and daily summaries',
                'Answers cite the meeting and passage they came from',
                'Retrieval restricted to meetings the asking user is entitled to read',
              ]}
            />
          </Lazy>
        ),
      },
      {
        path: 'admin/users',
        element: (
          <RequireRole roles={['super_admin']}>
          <Lazy>
            <PlannedPage
              title="Team Management"
              milestone="Milestone 2"
              description="Account creation and role assignment, available to the Super Admin."
              capabilities={[
                'Create team member accounts and assign roles',
                'Deactivate accounts without deleting their contribution history',
                'Audit log of every role change',
              ]}
            />
          </Lazy>
          </RequireRole>
        ),
      },
      {
        path: 'admin/reports',
        element: (
          <Lazy>
            <PlannedPage
              title="Reports"
              milestone="Milestone 6"
              description="Team workload, task completion and meeting activity reporting."
              capabilities={[
                'Workload distribution across the team',
                'Task completion and overdue trends',
                'Daily work submission compliance',
                'Export for inclusion in academic reporting',
              ]}
            />
          </Lazy>
        ),
      },
      {
        path: 'admin/system',
        element: (
          <RequireRole roles={['super_admin']}>
            <Lazy><SystemStatusPage /></Lazy>
          </RequireRole>
        ),
      },

      { path: 'notifications', element: <Lazy><NotificationsPage /></Lazy> },
      { path: 'settings', element: <Lazy><SettingsPage /></Lazy> },

      { path: '*', element: <Lazy><NotFoundPage /></Lazy> },
    ],
  },
])

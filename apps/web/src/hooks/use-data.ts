import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type { Profile } from '@/types/domain'
import { useAuth } from '@/features/auth/auth-context'

export function useProfiles() {
  return useQuery({ queryKey: queryKeys.profiles, queryFn: api.listProfiles })
}

/** Lookup map keyed by profile id, for rendering assignee names. */
export function useProfileMap(): Record<string, Profile> {
  const { data } = useProfiles()
  return Object.fromEntries((data ?? []).map((p) => [p.id, p]))
}

/**
 * The signed-in user.
 *
 * Comes from the authentication provider, not from the data layer: in
 * Supabase mode this is the JWT subject, which is the same identity the
 * database applies its policies to. Reading it from a list of profiles would
 * invite the two to disagree.
 */
export function useCurrentUser() {
  const { profile, status } = useAuth()
  return {
    data: profile ?? undefined,
    isPending: status === 'loading',
    isError: status === 'error',
  }
}

export function useMeetings() {
  return useQuery({ queryKey: queryKeys.meetings, queryFn: api.listMeetings })
}

export function useMeeting(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.meeting(id ?? ''),
    queryFn: () => api.getMeeting(id!),
    enabled: Boolean(id),
  })
}

export function useCreateMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createMeeting,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.meetings }),
  })
}

export function useUpdateMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<api.MeetingInput> }) => api.updateMeeting(id, patch),
    onSuccess: (meeting) => {
      qc.invalidateQueries({ queryKey: queryKeys.meetings })
      qc.invalidateQueries({ queryKey: queryKeys.meeting(meeting.id) })
    },
  })
}

export function useDeleteMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.deleteMeeting,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.meetings }),
  })
}

export function useTasks() {
  return useQuery({ queryKey: queryKeys.tasks, queryFn: api.listTasks })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createTask,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tasks }),
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<api.TaskInput> }) => api.updateTask(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tasks }),
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.deleteTask,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tasks }),
  })
}

export function useWorkLogs() {
  return useQuery({ queryKey: queryKeys.workLogs, queryFn: api.listWorkLogs })
}

export function useCreateWorkLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createWorkLog,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workLogs }),
  })
}

export function useUpdateWorkLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<api.WorkLogInput> }) => api.updateWorkLog(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workLogs }),
  })
}

export function useNotifications() {
  return useQuery({ queryKey: queryKeys.notifications, queryFn: api.listNotifications })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.markNotificationRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notifications }),
  })
}

export const queryKeys = {
  profiles: ['profiles'] as const,
  meetings: ['meetings'] as const,
  meeting: (id: string) => ['meetings', id] as const,
  tasks: ['tasks'] as const,
  task: (id: string) => ['tasks', id] as const,
  workLogs: ['work-logs'] as const,
  notifications: ['notifications'] as const,
}

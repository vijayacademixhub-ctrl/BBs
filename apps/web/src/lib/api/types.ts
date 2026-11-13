import type { DailyWorkLog, Meeting, Task } from '@/types/domain'

/**
 * The data access contract.
 *
 * Both the sample store and the Supabase repository implement these exactly,
 * so the rest of the application cannot tell which is in use.
 */
export type MeetingInput = Omit<Meeting, 'id' | 'hasRecording' | 'transcriptStatus'>
export type TaskInput = Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'sourceExtractionId'>
export type WorkLogInput = Omit<DailyWorkLog, 'id' | 'createdAt'>

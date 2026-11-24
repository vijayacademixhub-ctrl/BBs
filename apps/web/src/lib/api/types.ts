import type { DailyWorkLog, Meeting, MeetingNote, Task } from '@/types/domain'
import type { Register, RegisterField } from '@/types/registry'

/**
 * The data access contract.
 *
 * Both the sample store and the Supabase repository implement these exactly,
 * so the rest of the application cannot tell which is in use.
 */
export type MeetingInput = Omit<Meeting, 'id' | 'hasRecording' | 'transcriptStatus'>
export type TaskInput = Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'sourceExtractionId'>
export type WorkLogInput = Omit<DailyWorkLog, 'id' | 'createdAt'>

export type RegisterInput = Pick<Register, 'name' | 'description' | 'group' | 'icon'> &
  Partial<Pick<Register, 'statusFieldId' | 'ownerFieldId' | 'dueFieldId' | 'doneValues' | 'titleFieldId'>>

export type RegisterFieldInput = Omit<RegisterField, 'builtIn'>

export interface RegisterRecordInput {
  registerId: string
  values: Record<string, string>
}

export type MeetingNoteInput = Omit<MeetingNote, 'id' | 'createdAt' | 'updatedAt'>

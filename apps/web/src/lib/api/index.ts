import { isSupabaseConfigured } from '@/lib/supabase/client'
import * as sample from './sample-repository'
import * as supabase from './supabase-repository'
import * as registrySample from './registry-sample'
import * as registrySupabase from './registry-supabase'

/**
 * The application's single data access point.
 *
 * Which implementation is in force depends only on whether a backend is
 * configured. Nothing above this line knows the difference, which is what
 * allowed the Milestone 1 interface to be carried over unchanged.
 *
 * The choice is made once, from build-time configuration, rather than per
 * call: a mode that could change mid-session would be a source of subtle
 * bugs and of exactly the sort of ambiguity about what is real that this
 * project has been careful to avoid.
 */

const repository = isSupabaseConfigured ? supabase : sample

export const dataSource: 'supabase' | 'sample' = isSupabaseConfigured ? 'supabase' : 'sample'

export const listProfiles = repository.listProfiles
export const listMeetings = repository.listMeetings
export const getMeeting = repository.getMeeting
export const createMeeting = repository.createMeeting
export const updateMeeting = repository.updateMeeting
export const deleteMeeting = repository.deleteMeeting
export const listTasks = repository.listTasks
export const getTask = repository.getTask
export const createTask = repository.createTask
export const updateTask = repository.updateTask
export const deleteTask = repository.deleteTask
export const listWorkLogs = repository.listWorkLogs
export const createWorkLog = repository.createWorkLog
export const updateWorkLog = repository.updateWorkLog
export const listNotifications = repository.listNotifications
export const markNotificationRead = repository.markNotificationRead
export const resetSampleData = repository.resetSampleData

/**
 * The register module, chosen the same way and for the same reason.
 *
 * Kept in its own pair of files because it is the one part of the data layer
 * whose shape is itself data: a register carries its field list, so the
 * mapping between jsonb values and the grid lives here rather than being
 * spread across components.
 */
const registry = isSupabaseConfigured ? registrySupabase : registrySample

export const listRegisters = registry.listRegisters
export const createRegister = registry.createRegister
export const updateRegister = registry.updateRegister
export const deleteRegister = registry.deleteRegister
export const addRegisterField = registry.addRegisterField
export const updateRegisterField = registry.updateRegisterField
export const removeRegisterField = registry.removeRegisterField
export const listRegisterRecords = registry.listRegisterRecords
export const createRegisterRecord = registry.createRegisterRecord
export const updateRegisterRecord = registry.updateRegisterRecord
export const setRecordArchived = registry.setRecordArchived
export const deleteRegisterRecord = registry.deleteRegisterRecord
export const listRegisterChanges = registry.listRegisterChanges

export const listMeetingNotes = registry.listMeetingNotes
export const createMeetingNote = registry.createMeetingNote
export const updateMeetingNote = registry.updateMeetingNote
export const deleteMeetingNote = registry.deleteMeetingNote

/** Only meaningful with a backend: loads the workbook registers into it. */
export const importWorkbookRegisters = isSupabaseConfigured
  ? registrySupabase.importWorkbookRegisters
  : async () => {
      throw new Error(
        'The workbook registers are already loaded locally. This import applies to a connected database.',
      )
    }

export type {
  MeetingInput, TaskInput, WorkLogInput,
  RegisterInput, RegisterFieldInput, RegisterRecordInput, MeetingNoteInput,
} from './types'

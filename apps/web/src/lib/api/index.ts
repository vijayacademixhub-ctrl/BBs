import { isSupabaseConfigured } from '@/lib/supabase/client'
import * as sample from './sample-repository'
import * as supabase from './supabase-repository'

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

export type { MeetingInput, TaskInput, WorkLogInput } from './types'

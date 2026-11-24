import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type { Register, RegisterField } from '@/types/registry'

/**
 * Register hooks.
 *
 * Record writes invalidate both the record list and the change log, because
 * an edit is only finished when the history shows it. Register writes
 * additionally invalidate the register list, since a column change alters
 * every grid drawn from it.
 */

export function useRegisters() {
  return useQuery({ queryKey: queryKeys.registers, queryFn: api.listRegisters })
}

/** A register by its URL slug. Returns undefined while the list is loading. */
export function useRegister(slug: string | undefined) {
  const { data, ...rest } = useRegisters()
  return {
    ...rest,
    data: slug ? data?.find((r) => r.slug === slug) : undefined,
    registers: data,
  }
}

export function useRegisterRecords(registerId?: string) {
  return useQuery({
    queryKey: queryKeys.registerRecords(registerId),
    queryFn: () => api.listRegisterRecords(registerId),
  })
}

/** Every record across every register, for the hub's summary figures. */
export function useAllRegisterRecords() {
  return useQuery({
    queryKey: queryKeys.registerRecords(),
    queryFn: () => api.listRegisterRecords(),
  })
}

export function useRegisterChanges(limit = 25) {
  return useQuery({
    queryKey: queryKeys.registerChanges,
    queryFn: () => api.listRegisterChanges(limit),
  })
}

function useRecordInvalidation() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: ['register-records'] })
    void qc.invalidateQueries({ queryKey: queryKeys.registerChanges })
  }
}

function useRegisterInvalidation() {
  const qc = useQueryClient()
  const invalidateRecords = useRecordInvalidation()
  return () => {
    void qc.invalidateQueries({ queryKey: queryKeys.registers })
    invalidateRecords()
  }
}

export function useCreateRegister() {
  const invalidate = useRegisterInvalidation()
  return useMutation({ mutationFn: api.createRegister, onSuccess: invalidate })
}

export function useUpdateRegister() {
  const invalidate = useRegisterInvalidation()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<api.RegisterInput> }) =>
      api.updateRegister(id, patch),
    onSuccess: invalidate,
  })
}

export function useDeleteRegister() {
  const invalidate = useRegisterInvalidation()
  return useMutation({ mutationFn: api.deleteRegister, onSuccess: invalidate })
}

export function useAddRegisterField() {
  const invalidate = useRegisterInvalidation()
  return useMutation({
    mutationFn: ({ registerId, field }: { registerId: string; field: api.RegisterFieldInput }) =>
      api.addRegisterField(registerId, field),
    onSuccess: invalidate,
  })
}

export function useUpdateRegisterField() {
  const invalidate = useRegisterInvalidation()
  return useMutation({
    mutationFn: ({ registerId, fieldId, patch }: {
      registerId: string
      fieldId: string
      patch: Partial<RegisterField>
    }) => api.updateRegisterField(registerId, fieldId, patch),
    onSuccess: invalidate,
  })
}

export function useRemoveRegisterField() {
  const invalidate = useRegisterInvalidation()
  return useMutation({
    mutationFn: ({ registerId, fieldId }: { registerId: string; fieldId: string }) =>
      api.removeRegisterField(registerId, fieldId),
    onSuccess: invalidate,
  })
}

export function useCreateRecord() {
  const invalidate = useRecordInvalidation()
  return useMutation({ mutationFn: api.createRegisterRecord, onSuccess: invalidate })
}

export function useUpdateRecord() {
  const invalidate = useRecordInvalidation()
  return useMutation({
    mutationFn: ({ id, values, by }: { id: string; values: Record<string, string>; by?: string }) =>
      api.updateRegisterRecord(id, values, by),
    onSuccess: invalidate,
  })
}

export function useSetRecordArchived() {
  const invalidate = useRecordInvalidation()
  return useMutation({
    mutationFn: ({ id, archived, by }: { id: string; archived: boolean; by?: string }) =>
      api.setRecordArchived(id, archived, by),
    onSuccess: invalidate,
  })
}

export function useDeleteRecord() {
  const invalidate = useRecordInvalidation()
  return useMutation({ mutationFn: api.deleteRegisterRecord, onSuccess: invalidate })
}

/* --------------------------------------------------------- meeting notes */

export function useMeetingNotes(meetingId?: string) {
  return useQuery({
    queryKey: queryKeys.meetingNotes(meetingId),
    queryFn: () => api.listMeetingNotes(meetingId),
  })
}

export function useCreateMeetingNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createMeetingNote,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['meeting-notes'] }),
  })
}

export function useUpdateMeetingNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<api.MeetingNoteInput> }) =>
      api.updateMeetingNote(id, patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['meeting-notes'] }),
  })
}

export function useDeleteMeetingNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.deleteMeetingNote,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['meeting-notes'] }),
  })
}

/** Registers grouped for the hub, in a stable order. */
export function groupRegisters(registers: Register[]): Array<[string, Register[]]> {
  const groups = new Map<string, Register[]>()
  for (const register of registers) {
    const list = groups.get(register.group) ?? []
    list.push(register)
    groups.set(register.group, list)
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

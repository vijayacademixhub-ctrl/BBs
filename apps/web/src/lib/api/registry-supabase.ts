import { getSupabase } from '@/lib/supabase/client'
import type { MeetingDataPoint, MeetingNote } from '@/types/domain'
import type { Register, RegisterChange, RegisterField, RegisterRecord } from '@/types/registry'
import { BUILT_IN_REGISTERS } from '@/lib/registry/built-in'
import { REGISTER_SEED_RECORDS } from '@/lib/sample/registry-seed'
import type {
  MeetingNoteInput, RegisterFieldInput, RegisterInput, RegisterRecordInput,
} from './types'

/**
 * Register and meeting-note operations against Supabase.
 *
 * Reads and writes are filtered by the policies in migration 0019. Nothing
 * here passes a team id to restrict what comes back; the database does that
 * from the caller's token. Where a team id is written it is because the row
 * needs one, and it is read from the caller's own membership rather than
 * accepted as an argument, so acting on another team cannot be expressed.
 */

type Row = Record<string, unknown>

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`)
}

const REGISTER_SELECT = `
  id, slug, name, description, group_name, icon, title_field_id, status_field_id,
  owner_field_id, due_field_id, updated_field_id, done_values, built_in,
  created_at, updated_at,
  register_fields (id, field_key, label, kind, options, in_grid, help, built_in, position)
`

function toField(row: Row): RegisterField {
  return {
    id: row.field_key as string,
    label: row.label as string,
    kind: row.kind as RegisterField['kind'],
    options: ((row.options as string[] | null) ?? []).length
      ? (row.options as string[])
      : undefined,
    inGrid: row.in_grid as boolean,
    help: (row.help as string) || undefined,
    builtIn: row.built_in as boolean,
  }
}

function toRegister(row: Row): Register {
  const fields = ((row.register_fields as Row[] | null) ?? [])
    .slice()
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map(toField)

  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    description: (row.description as string) ?? '',
    group: (row.group_name as string) ?? 'General',
    icon: (row.icon as string) ?? 'table',
    fields,
    titleFieldId: row.title_field_id as string,
    statusFieldId: (row.status_field_id as string) ?? undefined,
    ownerFieldId: (row.owner_field_id as string) ?? undefined,
    dueFieldId: (row.due_field_id as string) ?? undefined,
    updatedFieldId: (row.updated_field_id as string) ?? undefined,
    doneValues: ((row.done_values as string[] | null) ?? []).length
      ? (row.done_values as string[])
      : undefined,
    builtIn: row.built_in as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function toRecord(row: Row): RegisterRecord {
  return {
    id: row.id as string,
    registerId: row.register_id as string,
    values: ((row.values as Record<string, string> | null) ?? {}),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    updatedBy: (row.updated_by as string) ?? undefined,
    archivedAt: (row.archived_at as string) ?? null,
  }
}

async function currentTeamId(): Promise<string> {
  const { data, error } = await getSupabase()
    .from('team_members')
    .select('team_id')
    .limit(1)
    .maybeSingle()
  fail('Could not determine your team', error)
  if (!data) throw new Error('Your account is not a member of any team.')
  return (data as unknown as Row).team_id as string
}

async function currentProfileId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getUser()
  return data.user?.id ?? null
}

/* --------------------------------------------------------------- registers */

export async function listRegisters(): Promise<Register[]> {
  const { data, error } = await getSupabase()
    .from('registers')
    .select(REGISTER_SELECT)
    .order('group_name')
    .order('name')
  fail('Could not load the registers', error)
  return (data ?? []).map((row) => toRegister(row as unknown as Row))
}

export async function createRegister(input: RegisterInput): Promise<Register> {
  const teamId = await currentTeamId()
  const client = getSupabase()

  const { data, error } = await client
    .from('registers')
    .insert({
      team_id: teamId,
      slug: slugify(input.name),
      name: input.name,
      description: input.description,
      group_name: input.group,
      icon: input.icon,
      title_field_id: 'title',
      built_in: false,
      created_by: await currentProfileId(),
    })
    .select('id')
    .single()
  fail('Could not create the register', error)
  const registerId = (data as unknown as Row).id as string

  const { error: fieldError } = await client.from('register_fields').insert([
    { register_id: registerId, field_key: 'title', label: 'Title', kind: 'text', in_grid: true, built_in: true, position: 0 },
    { register_id: registerId, field_key: 'notes', label: 'Notes', kind: 'longtext', in_grid: false, built_in: true, position: 1 },
  ])
  fail('Could not create the register columns', fieldError)

  return getRegister(registerId)
}

async function getRegister(id: string): Promise<Register> {
  const { data, error } = await getSupabase()
    .from('registers')
    .select(REGISTER_SELECT)
    .eq('id', id)
    .maybeSingle()
  fail('Could not load the register', error)
  if (!data) throw new Error(`Register ${id} was not found.`)
  return toRegister(data as unknown as Row)
}

export async function updateRegister(id: string, patch: Partial<RegisterInput>): Promise<Register> {
  const fields: Row = {}
  if (patch.name !== undefined) fields.name = patch.name
  if (patch.description !== undefined) fields.description = patch.description
  if (patch.group !== undefined) fields.group_name = patch.group
  if (patch.icon !== undefined) fields.icon = patch.icon
  if (patch.statusFieldId !== undefined) fields.status_field_id = patch.statusFieldId ?? null
  if (patch.ownerFieldId !== undefined) fields.owner_field_id = patch.ownerFieldId ?? null
  if (patch.dueFieldId !== undefined) fields.due_field_id = patch.dueFieldId ?? null
  if (patch.titleFieldId !== undefined) fields.title_field_id = patch.titleFieldId
  if (patch.doneValues !== undefined) fields.done_values = patch.doneValues ?? []

  const { error } = await getSupabase().from('registers').update(fields).eq('id', id)
  fail('Could not update the register', error)
  return getRegister(id)
}

export async function deleteRegister(id: string): Promise<void> {
  const { error } = await getSupabase().from('registers').delete().eq('id', id)
  fail('Could not delete the register', error)
}

/* ------------------------------------------------------------------ fields */

export async function addRegisterField(
  registerId: string,
  field: RegisterFieldInput,
): Promise<Register> {
  const { count } = await getSupabase()
    .from('register_fields')
    .select('id', { count: 'exact', head: true })
    .eq('register_id', registerId)

  const { error } = await getSupabase().from('register_fields').insert({
    register_id: registerId,
    field_key: field.id || slugify(field.label).replace(/-/g, '_'),
    label: field.label,
    kind: field.kind,
    options: field.options ?? [],
    in_grid: field.inGrid ?? true,
    help: field.help ?? '',
    built_in: false,
    position: count ?? 0,
  })
  fail('Could not add the column', error)
  return getRegister(registerId)
}

export async function updateRegisterField(
  registerId: string,
  fieldId: string,
  patch: Partial<RegisterFieldInput>,
): Promise<Register> {
  const fields: Row = {}
  if (patch.label !== undefined) fields.label = patch.label
  if (patch.kind !== undefined) fields.kind = patch.kind
  if (patch.options !== undefined) fields.options = patch.options ?? []
  if (patch.inGrid !== undefined) fields.in_grid = patch.inGrid
  if (patch.help !== undefined) fields.help = patch.help ?? ''

  const { error } = await getSupabase()
    .from('register_fields')
    .update(fields)
    .eq('register_id', registerId)
    .eq('field_key', fieldId)
  fail('Could not update the column', error)
  return getRegister(registerId)
}

export async function removeRegisterField(registerId: string, fieldId: string): Promise<Register> {
  // Only the column definition goes. The values stay in each record's jsonb,
  // so adding the column back restores what people had written in it.
  const { error } = await getSupabase()
    .from('register_fields')
    .delete()
    .eq('register_id', registerId)
    .eq('field_key', fieldId)
    .eq('built_in', false)
  fail('Could not remove the column', error)
  return getRegister(registerId)
}

/* ----------------------------------------------------------------- records */

export async function listRegisterRecords(registerId?: string): Promise<RegisterRecord[]> {
  let query = getSupabase()
    .from('register_records')
    .select('id, register_id, values, archived_at, updated_by, created_at, updated_at')
    .order('created_at')
  if (registerId) query = query.eq('register_id', registerId)
  const { data, error } = await query
  fail('Could not load the records', error)
  return (data ?? []).map((row) => toRecord(row as unknown as Row))
}

export async function createRegisterRecord(input: RegisterRecordInput): Promise<RegisterRecord> {
  const profileId = await currentProfileId()
  const { data, error } = await getSupabase()
    .from('register_records')
    .insert({
      register_id: input.registerId,
      values: input.values,
      created_by: profileId,
      updated_by: profileId,
    })
    .select('id, register_id, values, archived_at, updated_by, created_at, updated_at')
    .single()
  fail('Could not add the record', error)
  const created = toRecord(data as unknown as Row)

  await logChange([{
    register_id: created.registerId,
    record_id: created.id,
    field_key: null,
    action: 'create',
    changed_by: profileId,
  }])
  return created
}

export async function updateRegisterRecord(
  id: string,
  values: Record<string, string>,
  by?: string,
): Promise<RegisterRecord> {
  const client = getSupabase()
  const { data: existing, error: readError } = await client
    .from('register_records')
    .select('id, register_id, values, archived_at, updated_by, created_at, updated_at')
    .eq('id', id)
    .maybeSingle()
  fail('Could not load the record', readError)
  if (!existing) throw new Error(`Record ${id} was not found.`)
  const before = toRecord(existing as unknown as Row)

  const { data, error } = await client
    .from('register_records')
    .update({ values: { ...before.values, ...values }, updated_by: by ?? (await currentProfileId()) })
    .eq('id', id)
    .select('id, register_id, values, archived_at, updated_by, created_at, updated_at')
    .single()
  fail('Could not save the change', error)

  const changes = Object.entries(values)
    .filter(([fieldId, after]) => (before.values[fieldId] ?? '') !== after)
    .map(([fieldId, after]) => ({
      register_id: before.registerId,
      record_id: id,
      field_key: fieldId,
      action: 'update' as const,
      before_value: before.values[fieldId] ?? '',
      after_value: after,
      changed_by: by ?? null,
    }))
  if (changes.length) await logChange(changes)

  return toRecord(data as unknown as Row)
}

export async function setRecordArchived(
  id: string,
  archived: boolean,
  by?: string,
): Promise<RegisterRecord> {
  const { data, error } = await getSupabase()
    .from('register_records')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
    .select('id, register_id, values, archived_at, updated_by, created_at, updated_at')
    .single()
  fail('Could not archive the record', error)
  const row = toRecord(data as unknown as Row)
  await logChange([{
    register_id: row.registerId,
    record_id: id,
    field_key: null,
    action: archived ? 'archive' : 'restore',
    changed_by: by ?? null,
  }])
  return row
}

export async function deleteRegisterRecord(id: string): Promise<void> {
  const { error } = await getSupabase().from('register_records').delete().eq('id', id)
  fail('Could not delete the record', error)
}

async function logChange(rows: Row[]): Promise<void> {
  // History is an aid, not the audit trail: a failure to write it must not
  // undo an edit the user has already been told succeeded. The authoritative
  // trail is public.audit_logs, written by a database trigger.
  await getSupabase().from('register_record_changes').insert(rows)
}

export async function listRegisterChanges(limit = 25): Promise<RegisterChange[]> {
  const { data, error } = await getSupabase()
    .from('register_record_changes')
    .select('id, register_id, record_id, field_key, action, before_value, after_value, changed_at, changed_by')
    .order('changed_at', { ascending: false })
    .limit(limit)
  fail('Could not load the change history', error)
  return (data ?? []).map((raw) => {
    const row = raw as unknown as Row
    return {
      id: row.id as string,
      registerId: row.register_id as string,
      recordId: row.record_id as string,
      fieldId: (row.field_key as string) ?? null,
      action: row.action as RegisterChange['action'],
      before: (row.before_value as string) ?? undefined,
      after: (row.after_value as string) ?? undefined,
      at: row.changed_at as string,
      by: (row.changed_by as string) ?? undefined,
    }
  })
}

/* ----------------------------------------------------------- meeting notes */

const NOTE_SELECT = `
  id, meeting_id, title, source, language, transcript, transcript_model, summary,
  captured_minutes, audio_retained, created_by, created_at, updated_at,
  meeting_note_data_points (id, label, value, unit, evidence, origin, verified, position),
  meeting_note_items (id, kind, content, position)
`

function toNote(row: Row): MeetingNote {
  const points = ((row.meeting_note_data_points as Row[] | null) ?? [])
    .slice()
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map<MeetingDataPoint>((p) => ({
      id: p.id as string,
      label: p.label as string,
      value: p.value as string,
      unit: (p.unit as string) ?? undefined,
      evidence: (p.evidence as string) ?? undefined,
      origin: p.origin as MeetingDataPoint['origin'],
      verified: p.verified as boolean,
    }))

  const items = ((row.meeting_note_items as Row[] | null) ?? [])
    .slice()
    .sort((a, b) => Number(a.position) - Number(b.position))

  return {
    id: row.id as string,
    meetingId: row.meeting_id as string,
    title: row.title as string,
    source: row.source as MeetingNote['source'],
    language: row.language as MeetingNote['language'],
    transcript: (row.transcript as string) ?? '',
    transcriptModel: (row.transcript_model as string) ?? undefined,
    summary: (row.summary as string) ?? undefined,
    dataPoints: points,
    decisions: items.filter((i) => i.kind === 'decision').map((i) => i.content as string),
    actionItems: items.filter((i) => i.kind === 'action').map((i) => i.content as string),
    capturedMinutes: row.captured_minutes ? Number(row.captured_minutes) : undefined,
    audioRetained: false,
    createdBy: (row.created_by as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export async function listMeetingNotes(meetingId?: string): Promise<MeetingNote[]> {
  let query = getSupabase().from('meeting_notes').select(NOTE_SELECT)
    .order('created_at', { ascending: false })
  if (meetingId) query = query.eq('meeting_id', meetingId)
  const { data, error } = await query
  fail('Could not load the meeting notes', error)
  return (data ?? []).map((row) => toNote(row as unknown as Row))
}

export async function createMeetingNote(input: MeetingNoteInput): Promise<MeetingNote> {
  const client = getSupabase()
  const { data, error } = await client
    .from('meeting_notes')
    .insert({
      meeting_id: input.meetingId,
      title: input.title,
      source: input.source,
      language: input.language,
      transcript: input.transcript,
      transcript_model: input.transcriptModel ?? null,
      summary: input.summary ?? null,
      captured_minutes: input.capturedMinutes ?? null,
      // Never anything else: the column is constrained to false, so an
      // attempt to claim retained audio is refused by the database.
      audio_retained: false,
      created_by: await currentProfileId(),
    })
    .select('id')
    .single()
  fail('Could not save the note', error)
  const noteId = (data as unknown as Row).id as string

  await writeNoteChildren(noteId, input)
  const notes = await listMeetingNotes(input.meetingId)
  const saved = notes.find((n) => n.id === noteId)
  if (!saved) throw new Error('The note was saved but could not be read back.')
  return saved
}

async function writeNoteChildren(noteId: string, input: MeetingNoteInput): Promise<void> {
  const client = getSupabase()

  if (input.dataPoints.length) {
    const { error } = await client.from('meeting_note_data_points').insert(
      input.dataPoints.map((p, index) => ({
        note_id: noteId,
        label: p.label,
        value: p.value,
        unit: p.unit ?? null,
        evidence: p.evidence ?? null,
        origin: p.origin,
        verified: p.verified,
        position: index,
      })),
    )
    fail('Could not save the data points', error)
  }

  const items = [
    ...input.decisions.map((content, index) => ({ note_id: noteId, kind: 'decision', content, position: index })),
    ...input.actionItems.map((content, index) => ({ note_id: noteId, kind: 'action', content, position: index })),
  ]
  if (items.length) {
    const { error } = await client.from('meeting_note_items').insert(items)
    fail('Could not save the decisions and actions', error)
  }
}

export async function updateMeetingNote(
  id: string,
  patch: Partial<MeetingNoteInput>,
): Promise<MeetingNote> {
  const client = getSupabase()
  const fields: Row = {}
  if (patch.title !== undefined) fields.title = patch.title
  if (patch.summary !== undefined) fields.summary = patch.summary ?? null
  if (patch.transcript !== undefined) fields.transcript = patch.transcript
  if (patch.language !== undefined) fields.language = patch.language

  if (Object.keys(fields).length) {
    const { error } = await client.from('meeting_notes').update(fields).eq('id', id)
    fail('Could not update the note', error)
  }

  // Children are replaced wholesale when supplied: a note is edited as one
  // document, and reconciling individual rows would be a worse trade than
  // rewriting a handful of them.
  if (patch.dataPoints || patch.decisions || patch.actionItems) {
    const { data } = await client.from('meeting_notes').select('meeting_id').eq('id', id).maybeSingle()
    const meetingId = ((data as unknown as Row | null)?.meeting_id as string) ?? ''
    await client.from('meeting_note_data_points').delete().eq('note_id', id)
    await client.from('meeting_note_items').delete().eq('note_id', id)
    await writeNoteChildren(id, {
      meetingId,
      title: patch.title ?? '',
      source: patch.source ?? 'manual',
      language: patch.language ?? 'mixed',
      transcript: patch.transcript ?? '',
      dataPoints: patch.dataPoints ?? [],
      decisions: patch.decisions ?? [],
      actionItems: patch.actionItems ?? [],
      audioRetained: false,
    })
  }

  const { data, error } = await client.from('meeting_notes').select(NOTE_SELECT).eq('id', id).maybeSingle()
  fail('Could not read the note back', error)
  if (!data) throw new Error(`Note ${id} was not found.`)
  return toNote(data as unknown as Row)
}

export async function deleteMeetingNote(id: string): Promise<void> {
  const { error } = await getSupabase().from('meeting_notes').delete().eq('id', id)
  fail('Could not delete the note', error)
}

/* ------------------------------------------------------------------- setup */

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'register'
  )
}

/**
 * Creates the workbook's registers in a database that has none.
 *
 * Offered as an explicit action in System status rather than run on startup.
 * Importing a shared index is a decision someone should take knowingly, and
 * doing it automatically would risk a second copy appearing beside one a
 * colleague had already loaded and begun editing.
 */
export async function importWorkbookRegisters(): Promise<{ registers: number; records: number }> {
  const teamId = await currentTeamId()
  const profileId = await currentProfileId()
  const client = getSupabase()

  const existing = await listRegisters()
  const existingSlugs = new Set(existing.map((r) => r.slug))

  let registers = 0
  let records = 0

  for (const definition of BUILT_IN_REGISTERS) {
    if (existingSlugs.has(definition.slug)) continue

    const { data, error } = await client
      .from('registers')
      .insert({
        team_id: teamId,
        slug: definition.slug,
        name: definition.name,
        description: definition.description,
        group_name: definition.group,
        icon: definition.icon,
        title_field_id: definition.titleFieldId,
        status_field_id: definition.statusFieldId ?? null,
        owner_field_id: definition.ownerFieldId ?? null,
        due_field_id: definition.dueFieldId ?? null,
        updated_field_id: definition.updatedFieldId ?? null,
        done_values: definition.doneValues ?? [],
        // Written by the service role path only; the insert policy refuses
        // built_in from a browser session, so this import marks them false and
        // protection comes from the application until an administrator runs
        // the server-side import.
        built_in: false,
        created_by: profileId,
      })
      .select('id')
      .single()
    fail(`Could not create the ${definition.name} register`, error)
    const registerId = (data as unknown as Row).id as string
    registers += 1

    const { error: fieldError } = await client.from('register_fields').insert(
      definition.fields.map((field, index) => ({
        register_id: registerId,
        field_key: field.id,
        label: field.label,
        kind: field.kind,
        options: field.options ?? [],
        in_grid: field.inGrid ?? true,
        help: field.help ?? '',
        built_in: true,
        position: index,
      })),
    )
    fail(`Could not create the ${definition.name} columns`, fieldError)

    const rows = REGISTER_SEED_RECORDS[definition.slug] ?? []
    if (rows.length) {
      const { error: recordError } = await client.from('register_records').insert(
        rows.map((row) => ({
          register_id: registerId,
          values: row.values,
          created_by: profileId,
          updated_by: profileId,
        })),
      )
      fail(`Could not import the ${definition.name} records`, recordError)
      records += rows.length
    }
  }

  return { registers, records }
}

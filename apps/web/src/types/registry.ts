/**
 * The register model.
 *
 * The Master Index is not held as a fixed table. It is held as a set of
 * *registers*, each one a named collection of records over a field list that
 * the register itself carries. That indirection is the whole point: a new
 * column, or an entirely new register, is data rather than a code change, so
 * the structures the team keeps adding to the workbook can be added here
 * without a release.
 *
 * Records store their values in a map keyed by field id. A field removed from
 * a register leaves its values in place rather than deleting them, so
 * removing a column by mistake is recoverable.
 */

export type FieldKind =
  | 'text'
  | 'longtext'
  | 'select'
  | 'date'
  | 'url'
  | 'number'
  | 'percent'

export interface RegisterField {
  /** Stable key used in `RegisterRecord.values`. Never renamed. */
  id: string
  label: string
  kind: FieldKind
  /** Permitted values for `select`. Editing is not restricted to them: an
   *  unrecognised value from the workbook is kept and shown, not discarded. */
  options?: string[]
  /** Shown in the grid by default. Hidden fields remain editable in the row
   *  editor, which is how a register with thirty columns stays readable. */
  inGrid?: boolean
  help?: string
  /** Seeded fields cannot be deleted, only hidden. Added fields can. */
  builtIn?: boolean
}

export interface Register {
  id: string
  /** URL segment. Stable; the display name can change without breaking links. */
  slug: string
  name: string
  description: string
  /** Module grouping on the registry hub. */
  group: string
  /** Lucide icon name, resolved through `REGISTER_ICONS`. */
  icon: string
  fields: RegisterField[]
  /** Field shown as the record's heading. */
  titleFieldId: string
  /** Optional roles, used to compute status counts and due dates generically.
   *  A register that has none simply reports a record count. */
  statusFieldId?: string
  ownerFieldId?: string
  dueFieldId?: string
  updatedFieldId?: string
  /** Status values that mean the record needs no further work. */
  doneValues?: string[]
  builtIn: boolean
  createdAt: string
  updatedAt: string
}

export type FieldValue = string

export interface RegisterRecord {
  id: string
  registerId: string
  values: Record<string, FieldValue>
  createdAt: string
  updatedAt: string
  /** Profile id of the last editor, when known. */
  updatedBy?: string
  /** Archived records are kept and excluded from counts, never deleted
   *  silently. */
  archivedAt?: string | null
}

/** One line of the change history kept for every edit. */
export interface RegisterChange {
  id: string
  registerId: string
  recordId: string
  fieldId: string | null
  /** 'create' and 'archive' carry no field. */
  action: 'create' | 'update' | 'archive' | 'restore' | 'delete'
  before?: string
  after?: string
  at: string
  by?: string
}

export interface RegisterHealth {
  registerId: string
  total: number
  /** Records whose status field is not one of `doneValues`. Equals `total`
   *  when the register has no status field. */
  open: number
  done: number
  overdue: number
  /** Records with no value in a required-looking field: no owner, or a link
   *  column left empty. Surfaced because an index with holes is the problem
   *  the index exists to solve. */
  incomplete: number
  lastUpdatedAt?: string
}

export const FIELD_KIND_LABEL: Record<FieldKind, string> = {
  text: 'Short text',
  longtext: 'Paragraph',
  select: 'Choice',
  date: 'Date',
  url: 'Link',
  number: 'Number',
  percent: 'Percentage',
}

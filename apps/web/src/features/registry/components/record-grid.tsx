import { useState } from 'react'
import { AlertCircle, ArchiveRestore, Archive, ArrowDown, ArrowUp, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { isDone, missingFields } from '@/lib/registry/health'
import type { Register, RegisterRecord } from '@/types/registry'
import { CellDisplay, CellEditor } from './cell-editor'

/**
 * The editable grid.
 *
 * Columns come from the register, so this component never knows what a
 * register contains — which is what allows a column added at runtime to
 * appear here with no code change.
 *
 * Only one cell is in edit mode at a time. Each commit is saved on its own
 * rather than batched behind a Save button: a shared index is edited in
 * passing, often on a phone between meetings, and an unsaved buffer is how
 * corrections get lost.
 */

export interface GridProps {
  register: Register
  records: RegisterRecord[]
  onCommitCell: (recordId: string, fieldId: string, value: string) => void
  onOpenRecord: (record: RegisterRecord) => void
  onToggleArchive: (record: RegisterRecord) => void
  /** Pending record ids, shown as saving. */
  savingIds?: Set<string>
  sort: { fieldId: string; direction: 'asc' | 'desc' } | null
  onSort: (fieldId: string) => void
  readOnly?: boolean
}

export function RecordGrid({
  register,
  records,
  onCommitCell,
  onOpenRecord,
  onToggleArchive,
  savingIds,
  sort,
  onSort,
  readOnly = false,
}: GridProps) {
  const [editing, setEditing] = useState<{ recordId: string; fieldId: string } | null>(null)
  const columns = register.fields.filter((f) => f.inGrid !== false)

  return (
    <div className="scrollbar-thin overflow-x-auto rounded-lg border bg-card">
      <table data-testid="record-grid" className="w-full min-w-max border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
          <tr>
            <th scope="col" className="w-10 border-b px-2 py-2 text-left text-xs font-medium text-muted-foreground">
              <span className="sr-only">Row status</span>
            </th>
            {columns.map((field) => {
              const active = sort?.fieldId === field.id
              return (
                <th
                  key={field.id}
                  scope="col"
                  className="border-b px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  <button
                    type="button"
                    onClick={() => onSort(field.id)}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    title={field.help ? `${field.label} — ${field.help}` : `Sort by ${field.label}`}
                  >
                    {field.label}
                    {active
                      ? sort.direction === 'asc'
                        ? <ArrowUp className="size-3" aria-hidden />
                        : <ArrowDown className="size-3" aria-hidden />
                      : null}
                  </button>
                </th>
              )
            })}
            <th scope="col" className="w-20 border-b px-2 py-2 text-right text-xs font-medium text-muted-foreground">
              <span className="sr-only">Record actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const missing = missingFields(register, record)
            const saving = savingIds?.has(record.id)
            const complete = isDone(register, record)

            return (
              <tr
                key={record.id}
                className={cn(
                  'border-b last:border-b-0 hover:bg-muted/40',
                  record.archivedAt && 'opacity-55',
                  saving && 'animate-pulse',
                )}
              >
                <td className="px-2 py-1.5 align-top">
                  {record.archivedAt ? (
                    <Archive className="size-3.5 text-muted-foreground" aria-label="Archived" />
                  ) : missing.length ? (
                    <span title={`Not filled in: ${missing.join(', ')}`}>
                      <AlertCircle
                        className="size-3.5 text-warning"
                        aria-label={`Incomplete: ${missing.join(', ')} not filled in`}
                      />
                    </span>
                  ) : complete ? (
                    <span className="block size-2 rounded-full bg-success" aria-label="Complete" />
                  ) : null}
                </td>

                {columns.map((field) => {
                  const value = String(record.values[field.id] ?? '')
                  const isEditing =
                    editing?.recordId === record.id && editing.fieldId === field.id

                  return (
                    <td
                      key={field.id}
                      className={cn(
                        'max-w-xs px-3 py-1.5 align-top',
                        field.kind === 'longtext' && 'max-w-sm',
                        !readOnly && !isEditing && 'cursor-text',
                      )}
                      onClick={() => {
                        if (readOnly || isEditing) return
                        setEditing({ recordId: record.id, fieldId: field.id })
                      }}
                    >
                      {isEditing ? (
                        <CellEditor
                          field={field}
                          value={value}
                          onCommit={(next) => {
                            setEditing(null)
                            onCommitCell(record.id, field.id, next)
                          }}
                          onCancel={() => setEditing(null)}
                        />
                      ) : (
                        <div className="line-clamp-3 min-h-5">
                          <CellDisplay field={field} value={value} />
                        </div>
                      )}
                    </td>
                  )
                })}

                <td className="px-2 py-1.5 align-top">
                  <div className="flex items-center justify-end gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => onOpenRecord(record)}
                      title="Open the full record"
                    >
                      <Pencil className="size-3.5" />
                      <span className="sr-only">Open record</span>
                    </Button>
                    {!readOnly ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => onToggleArchive(record)}
                        title={record.archivedAt ? 'Restore this record' : 'Archive this record'}
                      >
                        {record.archivedAt ? (
                          <ArchiveRestore className="size-3.5" />
                        ) : (
                          <Archive className="size-3.5" />
                        )}
                        <span className="sr-only">
                          {record.archivedAt ? 'Restore' : 'Archive'}
                        </span>
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {records.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          No records match the current filter.
        </p>
      ) : null}
    </div>
  )
}

/** The count strip above the grid. */
export function GridSummary({
  shown,
  total,
  incomplete,
  archived,
}: {
  shown: number
  total: number
  incomplete: number
  archived: number
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>
        Showing <span className="font-medium text-foreground tabular-nums">{shown}</span> of{' '}
        <span className="tabular-nums">{total}</span>
      </span>
      {incomplete > 0 ? (
        <Badge variant="warning">
          <AlertCircle aria-hidden /> {incomplete} incomplete
        </Badge>
      ) : null}
      {archived > 0 ? <Badge variant="outline">{archived} archived</Badge> : null}
    </div>
  )
}

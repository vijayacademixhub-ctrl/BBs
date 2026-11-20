import { useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import type { Register, RegisterField, RegisterRecord } from '@/types/registry'

/**
 * The whole record on one form.
 *
 * The grid shows the columns worth scanning; this shows all of them, which is
 * where a register with many fields stays usable. It is also how a record is
 * created, so a new line starts with every column in front of the person
 * rather than appearing empty in the grid for them to find.
 */
export function RecordDialog({
  open,
  onOpenChange,
  register,
  record,
  onSave,
  onDelete,
  saving,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  register: Register
  /** Omitted when creating. */
  record?: RegisterRecord
  onSave: (values: Record<string, string>) => void
  onDelete?: () => void
  saving?: boolean
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const isNew = !record

  useEffect(() => {
    if (!open) return
    const initial: Record<string, string> = {}
    for (const field of register.fields) {
      initial[field.id] = String(record?.values[field.id] ?? '')
    }
    setValues(initial)
  }, [open, record, register.fields])

  const title = useMemo(
    () => String(record?.values[register.titleFieldId] ?? '').trim(),
    [record, register.titleFieldId],
  )

  const set = (fieldId: string, value: string) =>
    setValues((current) => ({ ...current, [fieldId]: value }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isNew ? `New ${register.name.toLowerCase()} record` : title || 'Record'}</DialogTitle>
          <DialogDescription>
            {isNew
              ? `Added to ${register.name}. Every column is optional — fill in what you know and complete it later.`
              : `In ${register.name}. Changes are saved when you choose Save.`}
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            onSave(values)
          }}
          id="record-form"
        >
          {register.fields.map((field) => (
            <FieldInput
              key={field.id}
              field={field}
              value={values[field.id] ?? ''}
              onChange={(next) => set(field.id, next)}
            />
          ))}
        </form>

        {record ? (
          <p className="text-xs text-muted-foreground">
            Last changed {new Date(record.updatedAt).toLocaleString()}
            {record.archivedAt ? ' · archived' : ''}
          </p>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {record && onDelete ? (
              <Button type="button" variant="ghost" onClick={onDelete} className="text-destructive">
                <Trash2 /> Delete permanently
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="record-form" disabled={saving}>
              {saving ? 'Saving…' : isNew ? 'Add record' : 'Save'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: RegisterField
  value: string
  onChange: (value: string) => void
}) {
  const id = `field-${field.id}`
  const wide = field.kind === 'longtext'

  return (
    <div className={wide ? 'space-y-1.5 sm:col-span-2' : 'space-y-1.5'}>
      <div className="flex items-center gap-2">
        <Label htmlFor={id}>{field.label}</Label>
        {field.builtIn === false ? (
          <Badge variant="outline" className="text-[10px]">added</Badge>
        ) : null}
      </div>

      {field.kind === 'longtext' ? (
        <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : field.kind === 'select' && field.options?.length ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm"
        >
          <option value="">—</option>
          {(value && !field.options.includes(value) ? [value, ...field.options] : field.options).map(
            (option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ),
          )}
        </select>
      ) : (
        <Input
          id={id}
          type={
            field.kind === 'date'
              ? 'date'
              : field.kind === 'number' || field.kind === 'percent'
                ? 'number'
                : field.kind === 'url'
                  ? 'url'
                  : 'text'
          }
          inputMode={field.kind === 'number' || field.kind === 'percent' ? 'numeric' : undefined}
          value={value}
          placeholder={field.kind === 'url' ? 'https://…' : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {field.help ? <p className="text-xs text-muted-foreground">{field.help}</p> : null}
    </div>
  )
}

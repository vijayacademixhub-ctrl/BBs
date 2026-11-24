import { useState } from 'react'
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/components/common/toast'
import { useAddRegisterField, useRemoveRegisterField, useUpdateRegisterField } from '@/hooks/use-registry'
import { FIELD_KIND_LABEL, type FieldKind, type Register } from '@/types/registry'

/**
 * Columns.
 *
 * The team's index grows a column whenever something new needs recording, so
 * this exists to make that a thirty-second action rather than a request. Two
 * rules are enforced rather than left to care:
 *
 *   * A column that came from the workbook can be hidden but not deleted.
 *     People depend on those, and a mistaken deletion would be felt by
 *     everyone at once.
 *   * Deleting an added column removes the column, not the values. Putting it
 *     back brings the content with it.
 */
export function FieldManager({
  open,
  onOpenChange,
  register,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  register: Register
}) {
  const { toast } = useToast()
  const addField = useAddRegisterField()
  const updateField = useUpdateRegisterField()
  const removeField = useRemoveRegisterField()

  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<FieldKind>('text')
  const [options, setOptions] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = label.trim()
    if (!trimmed) return

    try {
      await addField.mutateAsync({
        registerId: register.id,
        field: {
          id: '',
          label: trimmed,
          kind,
          inGrid: true,
          options:
            kind === 'select'
              ? options.split(',').map((o) => o.trim()).filter(Boolean)
              : undefined,
        },
      })
      toast({ title: `Added the ${trimmed} column`, tone: 'success' })
      setLabel('')
      setOptions('')
      setKind('text')
    } catch (error) {
      toast({
        title: 'The column could not be added',
        description: error instanceof Error ? error.message : undefined,
        tone: 'error',
      })
    }
  }

  const toggleVisible = async (fieldId: string, inGrid: boolean) => {
    try {
      await updateField.mutateAsync({ registerId: register.id, fieldId, patch: { inGrid } })
    } catch (error) {
      toast({
        title: 'The column could not be changed',
        description: error instanceof Error ? error.message : undefined,
        tone: 'error',
      })
    }
  }

  const remove = async (fieldId: string, fieldLabel: string) => {
    try {
      await removeField.mutateAsync({ registerId: register.id, fieldId })
      toast({
        title: `Removed the ${fieldLabel} column`,
        description: 'The values are kept. Adding the column back restores them.',
        tone: 'success',
      })
    } catch (error) {
      toast({
        title: 'The column could not be removed',
        description: error instanceof Error ? error.message : undefined,
        tone: 'error',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Columns in {register.name}</DialogTitle>
          <DialogDescription>
            Add a column when something new needs recording. Columns from the workbook can be
            hidden from the grid but not deleted.
          </DialogDescription>
        </DialogHeader>

        <ul className="divide-y rounded-md border">
          {register.fields.map((field) => (
            <li key={field.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{field.label}</span>
                  {field.builtIn ? (
                    <Badge variant="outline" className="text-[10px]">from workbook</Badge>
                  ) : (
                    <Badge variant="default" className="text-[10px]">added</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {FIELD_KIND_LABEL[field.kind]}
                  {field.options?.length ? ` · ${field.options.length} choices` : ''}
                </p>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                title={field.inGrid === false ? 'Show in the grid' : 'Hide from the grid'}
                onClick={() => void toggleVisible(field.id, field.inGrid === false)}
              >
                {field.inGrid === false ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                <span className="sr-only">
                  {field.inGrid === false ? 'Show in grid' : 'Hide from grid'}
                </span>
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-destructive disabled:text-muted-foreground"
                disabled={field.builtIn}
                title={
                  field.builtIn
                    ? 'This column came from the workbook and cannot be deleted'
                    : 'Remove this column'
                }
                onClick={() => void remove(field.id, field.label)}
              >
                <Trash2 className="size-4" />
                <span className="sr-only">Remove column</span>
              </Button>
            </li>
          ))}
        </ul>

        <Separator />

        <form className="space-y-3" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-field-label">New column</Label>
              <Input
                id="new-field-label"
                value={label}
                placeholder="Approval status"
                onChange={(event) => setLabel(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-field-kind">Type</Label>
              <select
                id="new-field-kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as FieldKind)}
                className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm"
              >
                {Object.entries(FIELD_KIND_LABEL).map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {kind === 'select' ? (
            <div className="space-y-1.5">
              <Label htmlFor="new-field-options">Choices</Label>
              <Input
                id="new-field-options"
                value={options}
                placeholder="Pending, Approved, Rejected"
                onChange={(event) => setOptions(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Separated by commas. A value already in the data is kept even if it is not listed.
              </p>
            </div>
          ) : null}

          <Button type="submit" disabled={!label.trim() || addField.isPending}>
            <Plus /> {addField.isPending ? 'Adding…' : 'Add column'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

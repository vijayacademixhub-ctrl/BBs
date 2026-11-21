import { useEffect, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Input, Textarea } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'
import type { RegisterField } from '@/types/registry'

/**
 * One cell, read and write.
 *
 * Editing starts on a single click and commits on blur or Enter; Escape
 * abandons the change. That is the behaviour of the spreadsheet this replaces,
 * and anything slower — a dialog per value — would be a reason to go back to
 * the spreadsheet.
 *
 * A paragraph field commits on Ctrl+Enter instead, because Enter has to insert
 * a line break in a field whose purpose is multi-line text.
 */

export function CellDisplay({ field, value }: { field: RegisterField; value: string }) {
  if (!value) {
    return <span className="text-muted-foreground/60">—</span>
  }

  if (field.kind === 'url') {
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
        className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
      >
        <span className="truncate">{linkLabel(value)}</span>
        <ExternalLink className="size-3 shrink-0" aria-hidden />
      </a>
    )
  }

  if (field.kind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return <span className="tabular-nums">{formatDate(`${value}T00:00:00`)}</span>
  }

  if (field.kind === 'percent') {
    const n = Number(value)
    return <span className="tabular-nums">{Number.isFinite(n) ? `${n}%` : value}</span>
  }

  if (field.kind === 'number') {
    return <span className="tabular-nums">{value}</span>
  }

  return <span className="whitespace-pre-wrap">{value}</span>
}

/** "drive.google.com/…/1vGDU3" rather than 120 characters of query string. */
function linkLabel(value: string): string {
  try {
    const url = new URL(value)
    const tail = url.pathname.split('/').filter(Boolean).pop() ?? ''
    const short = tail.length > 10 ? `${tail.slice(0, 8)}…` : tail
    return short ? `${url.hostname}/${short}` : url.hostname
  } catch {
    return value
  }
}

export function CellEditor({
  field,
  value,
  onCommit,
  onCancel,
}: {
  field: RegisterField
  value: string
  onCommit: (next: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(value)
  const committed = useRef(false)

  const commit = () => {
    if (committed.current) return
    committed.current = true
    if (draft === value) onCancel()
    else onCommit(draft)
  }

  const cancel = () => {
    if (committed.current) return
    committed.current = true
    onCancel()
  }

  const keyHandler = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
      return
    }
    if (event.key === 'Enter') {
      const multiline = field.kind === 'longtext'
      if (!multiline || event.ctrlKey || event.metaKey) {
        event.preventDefault()
        commit()
      }
    }
  }

  if (field.kind === 'select' && field.options?.length) {
    return (
      <SelectCell
        options={field.options}
        value={value}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    )
  }

  if (field.kind === 'longtext') {
    return (
      <Textarea
        autoFocus
        value={draft}
        aria-label={field.label}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={keyHandler}
        className="min-h-[76px] w-full min-w-56 text-sm"
      />
    )
  }

  return (
    <Input
      autoFocus
      type={field.kind === 'date' ? 'date' : field.kind === 'number' || field.kind === 'percent' ? 'number' : 'text'}
      value={draft}
      aria-label={field.label}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={keyHandler}
      className="h-8 w-full min-w-32 text-sm"
    />
  )
}

/**
 * A choice cell.
 *
 * A native select is used rather than the Radix one: it opens on the first
 * click with the keyboard already working, which matters when someone is
 * moving down a column setting statuses. A value the workbook contained but
 * the options list does not is kept as an extra entry rather than being
 * silently replaced.
 */
function SelectCell({
  options,
  value,
  onCommit,
  onCancel,
}: {
  options: string[]
  value: string
  onCommit: (next: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLSelectElement>(null)
  const all = value && !options.includes(value) ? [value, ...options] : options

  useEffect(() => {
    ref.current?.focus()
  }, [])

  return (
    <select
      ref={ref}
      value={value}
      className={cn(
        'h-8 w-full min-w-32 rounded-md border border-input bg-card px-2 text-sm shadow-sm',
        'focus:outline-none focus:ring-2 focus:ring-ring',
      )}
      onChange={(event) => onCommit(event.target.value)}
      onBlur={onCancel}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
      }}
    >
      <option value="">—</option>
      {all.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  )
}

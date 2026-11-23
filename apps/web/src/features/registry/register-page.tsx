import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, Columns3, Download, ExternalLink, FolderSync, Plus, Search, Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/common/page-header'
import { SampleDataNotice } from '@/components/common/provenance'
import { EmptyState, ErrorState, LoadingRows } from '@/components/common/states'
import { useToast } from '@/components/common/toast'
import { useCurrentUser } from '@/hooks/use-data'
import {
  useCreateRecord, useDeleteRecord, useRegister, useRegisterRecords,
  useSetRecordArchived, useUpdateRecord,
} from '@/hooks/use-registry'
import { activeRecords, computeHealth, memberLoad, missingFields } from '@/lib/registry/health'
import { csvFilename, downloadCsv, recordsToCsv } from '@/lib/registry/export'
import type { Register, RegisterRecord } from '@/types/registry'
import { FieldManager } from './components/field-manager'
import { RecordDialog } from './components/record-dialog'
import { GridSummary, RecordGrid } from './components/record-grid'
import { registerIcon } from './icons'
import { useServiceStatus } from '@/hooks/use-service-status'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { canOpenWindow, openRegisterWindow } from './window'

/**
 * One register, as an editable grid.
 *
 * Reached from the hub or opened directly in its own window; the same
 * component serves both, with `standalone` only removing the navigation that
 * a separate window has nowhere to go back to.
 */
export function RegisterPage({ standalone = false }: { standalone?: boolean }) {
  const { slug } = useParams<{ slug: string }>()
  const { data: register, isPending, isError, registers } = useRegister(slug)

  if (isPending) return <LoadingRows rows={6} />
  if (isError) return <ErrorState title="The register could not be loaded" />

  if (!register) {
    return (
      <EmptyState
        title="No such register"
        description={
          registers?.length
            ? 'It may have been renamed or removed. Open the Master Index to see what is there.'
            : 'No registers have been created yet.'
        }
        action={
          <Button asChild variant="outline">
            <Link to="/master-index">Open the Master Index</Link>
          </Button>
        }
      />
    )
  }

  return <RegisterView register={register} standalone={standalone} />
}

function RegisterView({ register, standalone }: { register: Register; standalone: boolean }) {
  const { toast } = useToast()
  const { data: user } = useCurrentUser()
  const records = useRegisterRecords(register.id)
  const updateRecord = useUpdateRecord()
  const createRecord = useCreateRecord()
  const setArchived = useSetRecordArchived()
  const deleteRecord = useDeleteRecord()

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [onlyIncomplete, setOnlyIncomplete] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [sort, setSort] = useState<{ fieldId: string; direction: 'asc' | 'desc' } | null>(null)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [editing, setEditing] = useState<RegisterRecord | null>(null)
  const [creating, setCreating] = useState(false)
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())

  const all = records.data ?? []
  const Icon = registerIcon(register.icon)

  const statusField = register.statusFieldId
    ? register.fields.find((f) => f.id === register.statusFieldId)
    : undefined
  const ownerField = register.ownerFieldId
    ? register.fields.find((f) => f.id === register.ownerFieldId)
    : undefined

  const statusValues = useMemo(() => distinct(all, register.statusFieldId), [all, register.statusFieldId])
  const ownerValues = useMemo(() => distinct(all, register.ownerFieldId), [all, register.ownerFieldId])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    let rows = showArchived ? all : activeRecords(all)

    if (needle) {
      rows = rows.filter((record) =>
        register.fields.some((field) =>
          String(record.values[field.id] ?? '').toLowerCase().includes(needle),
        ),
      )
    }
    if (statusFilter && register.statusFieldId) {
      rows = rows.filter((r) => String(r.values[register.statusFieldId!] ?? '') === statusFilter)
    }
    if (ownerFilter && register.ownerFieldId) {
      rows = rows.filter((r) => String(r.values[register.ownerFieldId!] ?? '') === ownerFilter)
    }
    if (onlyIncomplete) {
      rows = rows.filter((r) => missingFields(register, r).length > 0)
    }

    if (sort) {
      const { fieldId, direction } = sort
      rows = [...rows].sort((a, b) => {
        const left = String(a.values[fieldId] ?? '')
        const right = String(b.values[fieldId] ?? '')
        // Empty cells sort last in both directions: a blank is an absence, not
        // a value that belongs at one end of the order.
        if (!left && right) return 1
        if (left && !right) return -1
        const result = left.localeCompare(right, undefined, { numeric: true })
        return direction === 'asc' ? result : -result
      })
    }

    return rows
  }, [all, query, statusFilter, ownerFilter, onlyIncomplete, showArchived, sort, register])

  const health = useMemo(() => computeHealth(register, all), [register, all])
  const loads = useMemo(() => memberLoad(register, all), [register, all])

  const markSaving = (id: string, saving: boolean) =>
    setSavingIds((current) => {
      const next = new Set(current)
      if (saving) next.add(id)
      else next.delete(id)
      return next
    })

  const commitCell = async (recordId: string, fieldId: string, value: string) => {
    markSaving(recordId, true)
    try {
      await updateRecord.mutateAsync({ id: recordId, values: { [fieldId]: value }, by: user?.id })
    } catch (error) {
      toast({
        title: 'The change was not saved',
        description: error instanceof Error ? error.message : undefined,
        tone: 'error',
      })
    } finally {
      markSaving(recordId, false)
    }
  }

  const toggleSort = (fieldId: string) =>
    setSort((current) =>
      current?.fieldId === fieldId
        ? current.direction === 'asc'
          ? { fieldId, direction: 'desc' }
          : null
        : { fieldId, direction: 'asc' },
    )

  const toggleArchive = async (record: RegisterRecord) => {
    try {
      await setArchived.mutateAsync({
        id: record.id,
        archived: !record.archivedAt,
        by: user?.id,
      })
      toast({
        title: record.archivedAt ? 'Record restored' : 'Record archived',
        description: record.archivedAt
          ? undefined
          : 'It is excluded from the counts and can be restored at any time.',
        tone: 'success',
      })
    } catch (error) {
      toast({
        title: 'That could not be changed',
        description: error instanceof Error ? error.message : undefined,
        tone: 'error',
      })
    }
  }

  return (
    <>
      <PageHeader
        title={register.name}
        description={register.description}
        actions={
          <>
            {!standalone && canOpenWindow() ? (
              <Button
                variant="outline"
                onClick={() => {
                  const opened = openRegisterWindow(register.slug)
                  if (!opened) {
                    toast({
                      title: 'The window was blocked',
                      description:
                        'Your browser stopped the pop-up. Allow pop-ups for this site and try again.',
                      tone: 'error',
                    })
                  }
                }}
              >
                <ExternalLink /> Separate window
              </Button>
            ) : null}
            {register.slug === 'documents' ? <DriveSyncButton /> : null}
            <Button variant="outline" onClick={() => setColumnsOpen(true)}>
              <Columns3 /> Columns
            </Button>
            <Button
              variant="outline"
              onClick={() => downloadCsv(csvFilename(register), recordsToCsv(register, all))}
            >
              <Download /> Export
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus /> Add record
            </Button>
          </>
        }
      />

      {standalone ? null : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/master-index" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" /> Master Index
          </Link>
          <span aria-hidden>/</span>
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <Icon className="size-3.5" /> {register.name}
          </span>
        </div>
      )}

      <SampleDataNotice />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label="Records" value={health.total} />
        <Figure
          label={register.statusFieldId ? 'Open' : 'Active'}
          value={health.open}
        />
        <Figure label="Incomplete" value={health.incomplete} tone={health.incomplete ? 'warning' : 'default'} />
        <Figure label="Overdue" value={health.overdue} tone={health.overdue ? 'destructive' : 'default'} />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1 space-y-1.5">
          <label htmlFor="register-search" className="text-xs font-medium text-muted-foreground">
            Search this register
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              id="register-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Any column"
              className="pl-8"
            />
          </div>
        </div>

        {statusField ? (
          <FilterSelect
            id="filter-status"
            label={statusField.label}
            value={statusFilter}
            values={statusValues}
            onChange={setStatusFilter}
          />
        ) : null}

        {ownerField ? (
          <FilterSelect
            id="filter-owner"
            label={ownerField.label}
            value={ownerFilter}
            values={ownerValues}
            onChange={setOwnerFilter}
          />
        ) : null}

        <div className="flex gap-2">
          <Button
            variant={onlyIncomplete ? 'default' : 'outline'}
            onClick={() => setOnlyIncomplete((v) => !v)}
          >
            Incomplete only
          </Button>
          <Button
            variant={showArchived ? 'default' : 'outline'}
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? 'Hiding nothing' : 'Show archived'}
          </Button>
        </div>
      </div>

      <GridSummary
        shown={filtered.length}
        total={health.total}
        incomplete={health.incomplete}
        archived={all.length - health.total}
      />

      {records.isPending ? (
        <LoadingRows rows={6} />
      ) : records.isError ? (
        <ErrorState
          title="The records could not be loaded"
          onRetry={() => void records.refetch()}
        />
      ) : all.length === 0 ? (
        <EmptyState
          title={`${register.name} is empty`}
          description="Add the first record, or add the columns you need first."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus /> Add record
            </Button>
          }
        />
      ) : (
        <RecordGrid
          register={register}
          records={filtered}
          onCommitCell={(recordId, fieldId, value) => void commitCell(recordId, fieldId, value)}
          onOpenRecord={setEditing}
          onToggleArchive={(record) => void toggleArchive(record)}
          savingIds={savingIds}
          sort={sort}
          onSort={toggleSort}
        />
      )}

      {/* The workload panel replaces the workbook's Member Summary sheet, and
          only means something for a register that assigns dated work to
          people. For the document index, "not started" and "overdue" would be
          counting nothing. */}
      {loads.length > 1 && register.statusFieldId && register.dueFieldId && register.ownerFieldId ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4" /> Load by {ownerField?.label.toLowerCase() ?? 'owner'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 sm:p-0">
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full min-w-max text-sm">
                <thead>
                  <tr className="border-y bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="px-4 py-2 text-left">Name</th>
                    <th scope="col" className="px-3 py-2 text-right">Owned</th>
                    <th scope="col" className="px-3 py-2 text-right">Supporting</th>
                    <th scope="col" className="px-3 py-2 text-right">Not started</th>
                    <th scope="col" className="px-3 py-2 text-right">In progress</th>
                    <th scope="col" className="px-3 py-2 text-right">Completed</th>
                    <th scope="col" className="px-3 py-2 text-right">High priority</th>
                    <th scope="col" className="px-4 py-2 text-right">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {loads.map((row) => (
                    <tr key={row.member} className="border-b last:border-b-0">
                      <td className="px-4 py-1.5">
                        {row.member}
                        {row.member === 'Unassigned' ? (
                          <Badge variant="warning" className="ml-2">needs an owner</Badge>
                        ) : null}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{row.asPrimary}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{row.asSupport}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{row.notStarted}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{row.inProgress}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{row.completed}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{row.highPriority}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">
                        {Math.round(row.share * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-4 py-3 text-xs text-muted-foreground">
              Counted from the records above each time this page is drawn, so it cannot disagree
              with them.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <FieldManager open={columnsOpen} onOpenChange={setColumnsOpen} register={register} />

      <RecordDialog
        open={creating}
        onOpenChange={setCreating}
        register={register}
        saving={createRecord.isPending}
        onSave={async (values) => {
          try {
            await createRecord.mutateAsync({ registerId: register.id, values })
            setCreating(false)
            toast({ title: 'Record added', tone: 'success' })
          } catch (error) {
            toast({
              title: 'The record was not added',
              description: error instanceof Error ? error.message : undefined,
              tone: 'error',
            })
          }
        }}
      />

      <RecordDialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        register={register}
        record={editing ?? undefined}
        saving={updateRecord.isPending}
        onSave={async (values) => {
          if (!editing) return
          try {
            await updateRecord.mutateAsync({ id: editing.id, values, by: user?.id })
            setEditing(null)
            toast({ title: 'Saved', tone: 'success' })
          } catch (error) {
            toast({
              title: 'The change was not saved',
              description: error instanceof Error ? error.message : undefined,
              tone: 'error',
            })
          }
        }}
        onDelete={async () => {
          if (!editing) return
          try {
            await deleteRecord.mutateAsync(editing.id)
            setEditing(null)
            toast({ title: 'Record deleted', tone: 'success' })
          } catch (error) {
            toast({
              title: 'The record was not deleted',
              description: error instanceof Error ? error.message : undefined,
              tone: 'error',
            })
          }
        }}
      />
    </>
  )
}

/**
 * Refreshes the document index from Drive.
 *
 * Offered only on the document register, and only when the deployment has a
 * service account — a button that always fails teaches people to ignore
 * buttons. The work happens server-side; see api/drive-sync.ts for what it
 * will and will not overwrite.
 */
function DriveSyncButton() {
  const { toast } = useToast()
  const { status } = useServiceStatus()
  const [busy, setBusy] = useState(false)

  if (!status.drive.configured || !isSupabaseConfigured) return null

  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          const { data } = await getSupabase().auth.getSession()
          const token = data.session?.access_token
          if (!token) throw new Error('Sign in again before synchronising.')

          const response = await fetch('/api/drive-sync', {
            method: 'POST',
            headers: { authorization: `Bearer ${token}` },
          })
          const body = (await response.json()) as {
            checked?: number
            updated?: number
            unreachable?: number
            problems?: string[]
            message?: string
          }
          if (!response.ok) throw new Error(body.message ?? 'The synchronisation failed.')

          toast({
            title: `${body.updated ?? 0} of ${body.checked ?? 0} documents updated from Drive`,
            description: body.unreachable
              ? `${body.unreachable} could not be opened — probably not shared with the service account.`
              : undefined,
            tone: body.unreachable ? 'info' : 'success',
          })
        } catch (error) {
          toast({
            title: 'Drive synchronisation failed',
            description: error instanceof Error ? error.message : undefined,
            tone: 'error',
          })
        } finally {
          setBusy(false)
        }
      }}
      title="Read the modified date, name and owner of each linked file from Google Drive"
    >
      <FolderSync /> {busy ? 'Syncing…' : 'Sync from Drive'}
    </Button>
  )
}

function Figure({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: number
  tone?: 'default' | 'warning' | 'destructive'
}) {
  return (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          tone === 'warning'
            ? 'mt-0.5 text-xl font-semibold tabular-nums text-warning'
            : tone === 'destructive'
              ? 'mt-0.5 text-xl font-semibold tabular-nums text-destructive'
              : 'mt-0.5 text-xl font-semibold tabular-nums'
        }
      >
        {value}
      </p>
    </Card>
  )
}

function FilterSelect({
  id,
  label,
  value,
  values,
  onChange,
}: {
  id: string
  label: string
  value: string
  values: string[]
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="flex h-9 min-w-36 rounded-md border border-input bg-card px-3 text-sm shadow-sm"
      >
        <option value="">All</option>
        {values.map((option) => (
          <option key={option} value={option}>
            {option || '—'}
          </option>
        ))}
      </select>
    </div>
  )
}

function distinct(records: RegisterRecord[], fieldId: string | undefined): string[] {
  if (!fieldId) return []
  const values = new Set<string>()
  for (const record of records) {
    const value = String(record.values[fieldId] ?? '').trim()
    if (value) values.add(value)
  }
  return [...values].sort((a, b) => a.localeCompare(b))
}

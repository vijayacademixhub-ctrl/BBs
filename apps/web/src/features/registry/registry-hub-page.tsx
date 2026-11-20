import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, CircleDot, Clock, Database, ExternalLink, FileWarning, History,
  LayoutGrid, Plus, Search,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/common/page-header'
import { SampleDataNotice } from '@/components/common/provenance'
import { EmptyState, ErrorState, LoadingCards, LoadingRows } from '@/components/common/states'
import { useToast } from '@/components/common/toast'
import {
  groupRegisters, useAllRegisterRecords, useCreateRegister, useRegisterChanges, useRegisters,
} from '@/hooks/use-registry'
import { dataSource, importWorkbookRegisters } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'
import { computeHealth } from '@/lib/registry/health'
import { formatRelative } from '@/lib/format'
import type { Register, RegisterRecord } from '@/types/registry'
import { ICON_CHOICES, registerIcon } from './icons'
import { searchRegisters, splitMatch } from './search'
import { canOpenWindow, openRegisterWindow } from './window'

/**
 * The Master Index hub.
 *
 * It deliberately does not open onto the index itself. The workbook did, and
 * the result was a wall of rows that answered no question without scrolling:
 * what is unowned, what is overdue, what changed since Friday, where is the
 * document about X. Those are what this page answers, and a register opens
 * only when someone chooses it.
 *
 * The modules are listed from the registers, so one created at runtime
 * appears here with no change to this file.
 */
export function RegistryHubPage() {
  const registers = useRegisters()
  const records = useAllRegisterRecords()
  const changes = useRegisterChanges(12)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)

  const all = registers.data ?? []
  const rows = records.data ?? []

  const health = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeHealth>>()
    for (const register of all) {
      map.set(register.id, computeHealth(register, rows.filter((r) => r.registerId === register.id)))
    }
    return map
  }, [all, rows])

  const totals = useMemo(() => {
    let records_ = 0
    let open = 0
    let overdue = 0
    let incomplete = 0
    for (const value of health.values()) {
      records_ += value.total
      open += value.open
      overdue += value.overdue
      incomplete += value.incomplete
    }
    return { records: records_, open, overdue, incomplete }
  }, [health])

  const hits = useMemo(() => searchRegisters(all, rows, query), [all, rows, query])
  const searching = query.trim().length >= 2

  return (
    <>
      <PageHeader
        title="Master Index"
        description="Every register the team keeps, with what needs attention in each."
        actions={
          <>
            {canOpenWindow() ? (
              <Button variant="outline" onClick={() => openRegisterWindow('documents')}>
                <ExternalLink /> Separate window
              </Button>
            ) : null}
            <Button onClick={() => setCreating(true)}>
              <Plus /> New register
            </Button>
          </>
        }
      />

      <SampleDataNotice />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search across every register — a document, a task, a name, a note"
          className="h-11 pl-9 text-base"
          aria-label="Search every register"
        />
      </div>

      {searching ? (
        <SearchResults hits={hits} query={query} onClear={() => setQuery('')} />
      ) : (
        <>
          {registers.isPending ? (
            <LoadingCards />
          ) : (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Total label="Records" value={totals.records} icon={Database} />
              <Total label="Open items" value={totals.open} icon={CircleDot} />
              <Total
                label="Missing information"
                value={totals.incomplete}
                icon={FileWarning}
                tone={totals.incomplete ? 'warning' : 'default'}
              />
              <Total
                label="Overdue"
                value={totals.overdue}
                icon={AlertTriangle}
                tone={totals.overdue ? 'destructive' : 'default'}
              />
            </div>
          )}

          {registers.isError ? (
            <ErrorState
              title="The registers could not be loaded"
              onRetry={() => void registers.refetch()}
            />
          ) : registers.isPending ? (
            <LoadingRows rows={4} />
          ) : all.length === 0 ? (
            <EmptyState
              icon={LayoutGrid}
              title="No registers yet"
              description={
                dataSource === 'supabase'
                  ? 'Load the five registers from the team\'s Master Index workbook, or start an empty one.'
                  : 'A register is a table the team keeps — documents, allocations, reviews. Create the first one.'
              }
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {dataSource === 'supabase' ? <ImportWorkbookButton /> : null}
                  <Button variant={dataSource === 'supabase' ? 'outline' : 'default'} onClick={() => setCreating(true)}>
                    <Plus /> New register
                  </Button>
                </div>
              }
            />
          ) : (
            <section className="space-y-2" aria-labelledby="registers">
              <h2
                id="registers"
                className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Registers
              </h2>
              {/* One grid rather than a section per group. The groups carry
                  few registers each today, and a section apiece left a column
                  of lonely cards; the group is shown on the card instead, so
                  the modules read as a set and stay dense as more are added. */}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {groupRegisters(all).flatMap(([, items]) =>
                  items.map((register) => (
                    <RegisterCard
                      key={register.id}
                      register={register}
                      health={health.get(register.id)}
                    />
                  )),
                )}
              </div>
            </section>
          )}

          <RecentChanges
            changes={changes.data ?? []}
            registers={all}
            records={rows}
            loading={changes.isPending}
          />
        </>
      )}

      <NewRegisterDialog open={creating} onOpenChange={setCreating} />
    </>
  )
}

/**
 * Loads the workbook's registers into a database that has none.
 *
 * Offered rather than run on startup: importing a shared index is a decision
 * someone takes knowingly, and doing it automatically risks a second copy
 * appearing beside one a colleague has already begun editing.
 */
function ImportWorkbookButton() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)

  return (
    <Button
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          const result = await importWorkbookRegisters()
          await queryClient.invalidateQueries({ queryKey: ['registers'] })
          await queryClient.invalidateQueries({ queryKey: ['register-records'] })
          toast({
            title: `${result.registers} registers loaded`,
            description: `${result.records} records imported from the workbook.`,
            tone: 'success',
          })
        } catch (error) {
          toast({
            title: 'The workbook could not be imported',
            description: error instanceof Error ? error.message : undefined,
            tone: 'error',
          })
        } finally {
          setBusy(false)
        }
      }}
    >
      <Database /> {busy ? 'Importing…' : 'Import the Master Index workbook'}
    </Button>
  )
}

function Total({
  label,
  value,
  icon: Icon,
  tone = 'default',
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  tone?: 'default' | 'warning' | 'destructive'
}) {
  const toneClass =
    tone === 'warning'
      ? 'bg-warning/12 text-warning'
      : tone === 'destructive'
        ? 'bg-destructive/12 text-destructive'
        : 'bg-accent text-accent-foreground'

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums leading-none">{value}</p>
        </div>
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-md ${toneClass}`}>
          <Icon className="size-[18px]" />
        </span>
      </div>
    </Card>
  )
}

function RegisterCard({
  register,
  health,
}: {
  register: Register
  health?: ReturnType<typeof computeHealth>
}) {
  const Icon = registerIcon(register.icon)

  return (
    <Card className="flex h-full flex-col transition-colors hover:border-primary/40">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <Icon className="size-[18px]" />
          </span>
          <div className="flex items-center gap-1">
            <Badge variant="secondary">{register.group}</Badge>
            {register.builtIn ? null : <Badge variant="outline">added</Badge>}
            {canOpenWindow() ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                title={`Open ${register.name} in a separate window`}
                onClick={() => openRegisterWindow(register.slug)}
              >
                <ExternalLink className="size-3.5" />
                <span className="sr-only">Open in a separate window</span>
              </Button>
            ) : null}
          </div>
        </div>
        <CardTitle className="mt-2">
          <Link to={`/master-index/${register.slug}`} className="hover:text-primary">
            {register.name}
          </Link>
        </CardTitle>
        <p className="line-clamp-2 text-sm text-muted-foreground">{register.description}</p>
      </CardHeader>

      <CardContent className="mt-auto space-y-3">
        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-xs text-muted-foreground">Records</dt>
            <dd className="font-medium tabular-nums">{health?.total ?? 0}</dd>
          </div>
          {register.statusFieldId ? (
            <div className="flex items-baseline gap-1.5">
              <dt className="text-xs text-muted-foreground">Open</dt>
              <dd className="font-medium tabular-nums">{health?.open ?? 0}</dd>
            </div>
          ) : null}
          <div className="flex items-baseline gap-1.5">
            <dt className="text-xs text-muted-foreground">Columns</dt>
            <dd className="font-medium tabular-nums">{register.fields.length}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center gap-1.5">
          {health?.overdue ? (
            <Badge variant="destructive">
              <AlertTriangle aria-hidden /> {health.overdue} overdue
            </Badge>
          ) : null}
          {health?.incomplete ? (
            <Badge variant="warning">
              <FileWarning aria-hidden /> {health.incomplete} to complete
            </Badge>
          ) : null}
          {!health?.overdue && !health?.incomplete && health?.total ? (
            <Badge variant="success">Nothing outstanding</Badge>
          ) : null}
        </div>

        {health?.lastUpdatedAt ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3" aria-hidden /> Changed {formatRelative(health.lastUpdatedAt)}
          </p>
        ) : null}

        <Button asChild variant="outline" className="w-full">
          <Link to={`/master-index/${register.slug}`}>Open and edit</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function SearchResults({
  hits,
  query,
  onClear,
}: {
  hits: ReturnType<typeof searchRegisters>
  query: string
  onClear: () => void
}) {
  if (hits.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title={`Nothing matches "${query.trim()}"`}
        description="Searching covers every column of every register, including archived records' columns."
        action={<Button variant="outline" onClick={onClear}>Clear the search</Button>}
      />
    )
  }

  return (
    <section className="space-y-2" aria-label="Search results">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {hits.length} {hits.length === 1 ? 'match' : 'matches'}
      </p>
      <ul className="divide-y rounded-lg border bg-card">
        {hits.map((hit) => {
          const [before, match, after] = splitMatch(hit.matchedValue, query)
          const Icon = registerIcon(hit.register.icon)
          return (
            <li key={`${hit.register.id}-${hit.record.id}`}>
              <Link
                to={`/master-index/${hit.register.slug}`}
                className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40"
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{hit.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    <span className="font-medium">{hit.matchedLabel}:</span> {before}
                    <mark className="rounded bg-warning/25 px-0.5 text-foreground">{match}</mark>
                    {after}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0">{hit.register.name}</Badge>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function RecentChanges({
  changes,
  registers,
  records,
  loading,
}: {
  changes: Array<{
    id: string
    registerId: string
    recordId: string
    fieldId: string | null
    action: string
    before?: string
    after?: string
    at: string
  }>
  registers: Register[]
  records: RegisterRecord[]
  loading: boolean
}) {
  const registerById = new Map(registers.map((r) => [r.id, r]))
  const recordById = new Map(records.map((r) => [r.id, r]))

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <History className="size-4" /> Recent changes
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Every edit to a register, with what it was before. The workbook kept none of this.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <LoadingRows rows={3} />
        ) : changes.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No edits yet. Changes appear here as the team makes them.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {changes.map((change) => {
              const register = registerById.get(change.registerId)
              const record = recordById.get(change.recordId)
              const field = register?.fields.find((f) => f.id === change.fieldId)
              const title = register
                ? String(record?.values[register.titleFieldId] ?? '').trim() || 'a record'
                : 'a record'

              return (
                <li key={change.id} className="flex items-start gap-2.5 text-sm">
                  <span className="mt-1.5 block size-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate">
                      {change.action === 'update' && field ? (
                        <>
                          <span className="font-medium">{field.label}</span> on{' '}
                          <span className="font-medium">{title}</span>
                        </>
                      ) : (
                        <>
                          <span className="capitalize">{change.action}d</span>{' '}
                          <span className="font-medium">{title}</span>
                        </>
                      )}
                      {register ? (
                        <span className="text-muted-foreground"> · {register.name}</span>
                      ) : null}
                    </p>
                    {change.action === 'update' ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {change.before ? `"${change.before}"` : 'empty'} →{' '}
                        {change.after ? `"${change.after}"` : 'empty'}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">{formatRelative(change.at)}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function NewRegisterDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { toast } = useToast()
  const createRegister = useCreateRegister()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [group, setGroup] = useState('Records')
  const [icon, setIcon] = useState('table')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    try {
      await createRegister.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        group: group.trim() || 'General',
        icon,
      })
      toast({
        title: `${name.trim()} created`,
        description: 'It starts with a Title and a Notes column. Add the rest from Columns.',
        tone: 'success',
      })
      onOpenChange(false)
      setName('')
      setDescription('')
    } catch (error) {
      toast({
        title: 'The register was not created',
        description: error instanceof Error ? error.message : undefined,
        tone: 'error',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New register</DialogTitle>
          <DialogDescription>
            A register is one of the tables the team keeps. It starts with a Title column; add
            the columns it needs afterwards, whenever they are needed.
          </DialogDescription>
        </DialogHeader>

        <form id="new-register-form" className="space-y-3" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="register-name">Name</Label>
            <Input
              id="register-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Event Calendar"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="register-description">What it holds</Label>
            <Textarea
              id="register-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Every BBA event for the year, with its date, owner and approval state."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="register-group">Group</Label>
              <Input
                id="register-group"
                value={group}
                onChange={(event) => setGroup(event.target.value)}
                placeholder="Records"
              />
              <p className="text-xs text-muted-foreground">
                Registers are grouped under this heading on the hub.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="register-icon">Icon</Label>
              <select
                id="register-icon"
                value={icon}
                onChange={(event) => setIcon(event.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm"
              >
                {ICON_CHOICES.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="new-register-form" disabled={!name.trim() || createRegister.isPending}>
            {createRegister.isPending ? 'Creating…' : 'Create register'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

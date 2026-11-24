import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart3, CalendarCheck, CheckSquare, FileText, Library, Mic, Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState, LoadingCards, LoadingRows } from '@/components/common/states'
import { useMeetings, useProfiles, useTasks, useWorkLogs } from '@/hooks/use-data'
import { useAllRegisterRecords, useMeetingNotes, useRegisterChanges, useRegisters } from '@/hooks/use-registry'
import { activeRecords, memberLoad } from '@/lib/registry/health'
import { formatRelative } from '@/lib/format'

/**
 * What the team has actually produced.
 *
 * Deliberately not a page of vanity figures. A word count tells nobody
 * anything; what is worth knowing is how much of the index has an owner, how
 * many meetings left a written record rather than only a memory, and how
 * many of the figures taken out of those meetings a person has checked.
 *
 * Everything is computed from the same records the other screens show, so
 * nothing here can disagree with them.
 */
export function InsightsPage() {
  const registers = useRegisters()
  const records = useAllRegisterRecords()
  const notes = useMeetingNotes()
  const meetings = useMeetings()
  const tasks = useTasks()
  const workLogs = useWorkLogs()
  const profiles = useProfiles()
  const changes = useRegisterChanges(200)

  const loading =
    registers.isPending || records.isPending || notes.isPending || meetings.isPending

  const figures = useMemo(() => {
    const live = activeRecords(records.data ?? [])
    const allNotes = notes.data ?? []

    const dataPoints = allNotes.flatMap((note) => note.dataPoints)
    const fromModel = dataPoints.filter((point) => point.origin === 'ai')
    const checked = fromModel.filter((point) => point.verified)
    const dated = dataPoints.filter((point) => point.date)

    const transcribedMinutes = allNotes.reduce((sum, note) => sum + (note.capturedMinutes ?? 0), 0)
    const transcriptWords = allNotes.reduce(
      (sum, note) => sum + note.transcript.trim().split(/\s+/).filter(Boolean).length,
      0,
    )

    const meetingsWithNotes = new Set(allNotes.map((note) => note.meetingId)).size
    const heldMeetings = (meetings.data ?? []).filter((m) => m.status !== 'cancelled').length

    return {
      records: live.length,
      registers: (registers.data ?? []).length,
      notes: allNotes.length,
      meetingsWithNotes,
      heldMeetings,
      dataPoints: dataPoints.length,
      dated: dated.length,
      fromModel: fromModel.length,
      checked: checked.length,
      transcribedMinutes,
      transcriptWords,
      decisions: allNotes.reduce((sum, note) => sum + note.decisions.length, 0),
      actions: allNotes.reduce((sum, note) => sum + note.actionItems.length, 0),
    }
  }, [records.data, notes.data, meetings.data, registers.data])

  /** Who is carrying the allocation, from the register rather than a guess. */
  const load = useMemo(() => {
    const allocation = (registers.data ?? []).find((r) => r.slug === 'work-allocation')
    if (!allocation) return []
    return memberLoad(
      allocation,
      (records.data ?? []).filter((r) => r.registerId === allocation.id),
    )
  }, [registers.data, records.data])

  /** Who has edited the index recently. The change log names a profile id;
   *  an edit made before sign-in existed has none and is counted as unknown. */
  const editors = useMemo(() => {
    const names = new Map((profiles.data ?? []).map((p) => [p.id, p.fullName]))
    const counts = new Map<string, number>()
    for (const change of changes.data ?? []) {
      const who = change.by ? (names.get(change.by) ?? 'Someone else') : 'Not recorded'
      counts.set(who, (counts.get(who) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [changes.data, profiles.data])

  const verifiedShare = figures.fromModel === 0 ? 1 : figures.checked / figures.fromModel

  return (
    <>
      <PageHeader
        title="Insights"
        description="What the team has recorded, and how much of it has been checked."
      />

      {loading ? (
        <LoadingCards />
      ) : (
        <>
          <section className="space-y-2" aria-labelledby="index-figures">
            <h2 id="index-figures" className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              The index
            </h2>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Figure label="Records" value={figures.records} icon={Library} to="/master-index" />
              <Figure label="Registers" value={figures.registers} icon={BarChart3} to="/master-index" />
              <Figure label="Open tasks" value={(tasks.data ?? []).filter((t) => t.status !== 'done' && t.status !== 'cancelled').length} icon={CheckSquare} to="/tasks" />
              <Figure label="Daily entries" value={(workLogs.data ?? []).length} icon={CalendarCheck} to="/daily-work" />
            </div>
          </section>

          <section className="space-y-2" aria-labelledby="meeting-figures">
            <h2 id="meeting-figures" className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Meetings captured
            </h2>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Figure label="Notes written" value={figures.notes} icon={FileText} to="/notes" />
              <Figure
                label="Minutes transcribed"
                value={Math.round(figures.transcribedMinutes)}
                icon={Mic}
                to="/capture"
                hint="No audio kept"
              />
              <Figure label="Data points" value={figures.dataPoints} icon={BarChart3} to="/notes" hint={`${figures.dated} carry a date`} />
              <Figure label="Decisions recorded" value={figures.decisions} icon={CheckSquare} to="/notes" />
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>How much has been checked</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Figures a model proposed are not facts until a person confirms them against the
                  transcript.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {figures.fromModel === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">
                    Nothing has been proposed by a model yet. Every data point so far was entered
                    by hand, which counts as checked.
                  </p>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between">
                      <span className="text-2xl font-semibold tabular-nums">
                        {figures.checked} of {figures.fromModel}
                      </span>
                      <Badge variant={verifiedShare === 1 ? 'success' : 'ai'}>
                        {Math.round(verifiedShare * 100)}% verified
                      </Badge>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={verifiedShare === 1 ? 'h-full bg-success' : 'h-full bg-ai'}
                        style={{ width: `${Math.round(verifiedShare * 100)}%` }}
                      />
                    </div>
                    {verifiedShare < 1 ? (
                      <p className="text-sm text-muted-foreground">
                        {figures.fromModel - figures.checked} proposed figures are still
                        unverified. They are shown as such wherever they appear.
                      </p>
                    ) : null}
                  </>
                )}

                <dl className="grid grid-cols-2 gap-3 border-t pt-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Meetings with a written record</dt>
                    <dd className="text-lg font-semibold tabular-nums">
                      {figures.meetingsWithNotes} of {figures.heldMeetings}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Transcript words kept</dt>
                    <dd className="text-lg font-semibold tabular-nums">{figures.transcriptWords}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Users className="size-4" /> Who is carrying the allocation
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Counted from Work Allocation each time this page is drawn.
                </p>
              </CardHeader>
              <CardContent>
                {load.length === 0 ? (
                  <EmptyState title="No allocation yet" description="Work Allocation has no records." />
                ) : (
                  <ul className="space-y-2">
                    {load.slice(0, 8).map((row) => (
                      <li key={row.member} className="space-y-1">
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="truncate">
                            {row.member}
                            {row.member === 'Unassigned' ? (
                              <Badge variant="warning" className="ml-2">needs an owner</Badge>
                            ) : null}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {row.asPrimary} owned · {row.completed} done
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className={row.member === 'Unassigned' ? 'h-full bg-warning' : 'h-full bg-primary'}
                            style={{ width: `${Math.round(row.share * 100)}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Who is keeping the index up to date</CardTitle>
              <p className="text-sm text-muted-foreground">
                Edits recorded in the change log, most recent {(changes.data ?? []).length} changes.
              </p>
            </CardHeader>
            <CardContent>
              {changes.isPending ? (
                <LoadingRows rows={3} />
              ) : editors.length === 0 ? (
                <p className="py-3 text-center text-sm text-muted-foreground">
                  No edits recorded yet.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {editors.map(([who, count]) => (
                    <li key={who} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate">{who}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {count} {count === 1 ? 'change' : 'changes'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {(changes.data ?? []).length > 0 ? (
                <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                  Most recent change {formatRelative(changes.data![0]!.at)}.{' '}
                  <Link to="/master-index" className="text-primary hover:underline">
                    See them on the Master Index
                  </Link>
                  .
                </p>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}

function Figure({
  label,
  value,
  icon: Icon,
  to,
  hint,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  to: string
  hint?: string
}) {
  return (
    <Link to={to} className="rounded-lg">
      <Card className="p-4 transition-colors hover:border-primary/40">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums leading-none">{value}</p>
            {hint ? <p className="mt-1.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
          </div>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <Icon className="size-[18px]" />
          </span>
        </div>
      </Card>
    </Link>
  )
}

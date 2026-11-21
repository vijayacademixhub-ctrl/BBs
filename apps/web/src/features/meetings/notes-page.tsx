import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Mic, Search, ShieldCheck, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState, ErrorState, LoadingRows } from '@/components/common/states'
import { useToast } from '@/components/common/toast'
import { useMeetings } from '@/hooks/use-data'
import { useDeleteMeetingNote, useMeetingNotes } from '@/hooks/use-registry'
import { formatDateTime } from '@/lib/format'
import type { MeetingNote } from '@/types/domain'

const SOURCE_LABEL: Record<MeetingNote['source'], string> = {
  live_capture: 'Captured live',
  pasted_transcript: 'Transcript pasted',
  manual: 'Written by hand',
}

/**
 * Meeting notes.
 *
 * What used to be the Transcripts page. The rename is not cosmetic: there is
 * no audio to have a transcript *of* any more, so what is kept is the note —
 * the text, the figures taken out of it, the decisions and the actions.
 */
export function MeetingNotesPage() {
  const notes = useMeetingNotes()
  const meetings = useMeetings()
  const deleteNote = useDeleteMeetingNote()
  const { toast } = useToast()
  const [query, setQuery] = useState('')

  const meetingTitle = useMemo(
    () => new Map((meetings.data ?? []).map((m) => [m.id, m.title])),
    [meetings.data],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return notes.data ?? []
    return (notes.data ?? []).filter(
      (note) =>
        note.title.toLowerCase().includes(needle) ||
        note.transcript.toLowerCase().includes(needle) ||
        note.summary?.toLowerCase().includes(needle) ||
        note.dataPoints.some(
          (p) =>
            p.label.toLowerCase().includes(needle) || p.value.toLowerCase().includes(needle),
        ),
    )
  }, [notes.data, query])

  return (
    <>
      <PageHeader
        title="Meeting notes"
        description="What each meeting produced: the transcript, the figures and what was decided."
        actions={
          <Button asChild>
            <Link to="/capture">
              <Mic /> Capture a meeting
            </Link>
          </Button>
        }
      />

      <div className="flex items-start gap-2.5 rounded-lg border border-success/40 bg-success/5 p-3 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        <p>
          No audio is held for any of these. Each note is the text and the data points; the
          recording was discarded as it was transcribed.
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search the notes, the transcripts and the data points"
          className="pl-8"
          aria-label="Search meeting notes"
        />
      </div>

      {notes.isPending ? (
        <LoadingRows rows={3} />
      ) : notes.isError ? (
        <ErrorState title="The notes could not be loaded" onRetry={() => void notes.refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={query ? 'Nothing matches that' : 'No notes yet'}
          description={
            query
              ? 'Try a different word.'
              : 'Capture a meeting, or write up one that has already happened.'
          }
          action={
            <Button asChild>
              <Link to="/capture">
                <Mic /> Capture a meeting
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((note) => (
            <Card key={note.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle>{note.title}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {meetingTitle.get(note.meetingId) ?? 'Meeting removed'} ·{' '}
                      {formatDateTime(note.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline">{SOURCE_LABEL[note.source]}</Badge>
                    {note.capturedMinutes ? (
                      <Badge variant="secondary">{note.capturedMinutes.toFixed(1)} min</Badge>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive"
                      title="Delete this note"
                      onClick={async () => {
                        try {
                          await deleteNote.mutateAsync(note.id)
                          toast({ title: 'Note deleted', tone: 'success' })
                        } catch (error) {
                          toast({
                            title: 'The note was not deleted',
                            description: error instanceof Error ? error.message : undefined,
                            tone: 'error',
                          })
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">Delete note</span>
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {note.summary ? <p className="text-sm">{note.summary}</p> : null}

                {note.dataPoints.length ? (
                  <div className="space-y-1.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Data points
                    </h3>
                    <ul className="grid gap-1.5 sm:grid-cols-2">
                      {note.dataPoints.map((point) => (
                        <li
                          key={point.id}
                          className="flex items-baseline justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                        >
                          <span className="min-w-0 truncate text-muted-foreground">
                            {point.label}
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5 font-medium tabular-nums">
                            {point.value}
                            {point.unit ? (
                              <span className="text-muted-foreground">{point.unit}</span>
                            ) : null}
                            {point.origin === 'ai' && !point.verified ? (
                              <Badge variant="ai">unverified</Badge>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {note.decisions.length ? (
                  <ListBlock title="Decisions" items={note.decisions} />
                ) : null}
                {note.actionItems.length ? (
                  <ListBlock title="Action items" items={note.actionItems} />
                ) : null}

                {note.transcript ? (
                  <details className="rounded-md border">
                    <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                      Transcript ({note.transcript.trim().split(/\s+/).length} words)
                      {note.transcriptModel ? (
                        <span className="ml-2 font-normal text-muted-foreground">
                          {note.transcriptModel}
                        </span>
                      ) : null}
                    </summary>
                    <p className="whitespace-pre-wrap px-3 pb-3 text-sm leading-relaxed">
                      {note.transcript}
                    </p>
                  </details>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <ul className="space-y-1 text-sm">
        {items.map((item, index) => (
          <li key={index} className="flex gap-2">
            <span className="mt-1.5 block size-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

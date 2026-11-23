import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, CircleStop, Mic, Pause, Play, Plus, Save, ShieldCheck, Trash2, Waves,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/states'
import { useToast } from '@/components/common/toast'
import { useCurrentUser, useMeetings } from '@/hooks/use-data'
import { useCreateMeetingNote, useRegister, useRegisterRecords } from '@/hooks/use-registry'
import { useServiceStatus } from '@/hooks/use-service-status'
import {
  applyTransform, extractFromTranscript, fetchTransforms, ServiceError, transcribeSegment,
  type TransformOption,
} from '@/lib/capture/service'
import {
  formatElapsed, isCaptureSupported, SegmentedRecorder, SEGMENT_SECONDS,
} from '@/lib/capture/segmented-recorder'
import type { DataPointDateKind, MeetingDataPoint, MeetingLanguage, NoteSource } from '@/types/domain'
import { DATE_KIND_LABEL, LANGUAGE_LABEL } from '@/types/domain'

/**
 * Meeting capture.
 *
 * The decision this page implements: a meeting leaves behind its transcript
 * and its data points, and no audio. The microphone stream is held in the
 * browser, transcribed a segment at a time, and each segment is released as
 * soon as its text comes back. No audio file is uploaded, stored or
 * downloadable, and there is no code path on this page that could produce
 * one.
 *
 * Everything here also works without a transcription key: a transcript can be
 * pasted or typed, and data points entered by hand. That is not a fallback
 * bolted on — it is the path the team can use today, with recording becoming
 * available when the key is set.
 */

type Phase = 'consent' | 'live' | 'review'

export function CapturePage() {
  const [params] = useSearchParams()
  const { toast } = useToast()
  const { data: user } = useCurrentUser()
  const meetings = useMeetings()
  const createNote = useCreateMeetingNote()
  const { status, isPending: statusPending } = useServiceStatus()

  const [phase, setPhase] = useState<Phase>('consent')
  const [meetingId, setMeetingId] = useState(params.get('meeting') ?? '')
  const [language, setLanguage] = useState<MeetingLanguage>('mixed')
  const [consentGiven, setConsentGiven] = useState(false)

  const [transcript, setTranscript] = useState('')
  const [source, setSource] = useState<NoteSource>('manual')
  const [transcriptModel, setTranscriptModel] = useState<string | undefined>()
  const [elapsed, setElapsed] = useState(0)
  const [segmentsDone, setSegmentsDone] = useState(0)
  const [segmentsSilent, setSegmentsSilent] = useState(0)
  const [pendingSegments, setPendingSegments] = useState(0)
  const [recorderState, setRecorderState] = useState<'idle' | 'recording' | 'paused' | 'stopping' | 'stopped'>('idle')
  const [captureError, setCaptureError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [dataPoints, setDataPoints] = useState<MeetingDataPoint[]>([])
  const [decisions, setDecisions] = useState<string[]>([])
  const [actionItems, setActionItems] = useState<string[]>([])
  const [extracting, setExtracting] = useState(false)

  // The team's Dictionary, handed to the model before it listens. Without it
  // the transcription spells unfamiliar names the way they sound.
  const vocabularyRegister = useRegister('vocabulary')
  const vocabularyRecords = useRegisterRecords(vocabularyRegister.data?.id)
  const vocabulary = useMemo(
    () =>
      (vocabularyRecords.data ?? [])
        .filter((record) => !record.archivedAt)
        .map((record) => String(record.values.term ?? '').trim())
        .filter(Boolean),
    [vocabularyRecords.data],
  )

  const [transforms, setTransforms] = useState<TransformOption[]>([])
  const [transforming, setTransforming] = useState<string | null>(null)

  useEffect(() => {
    void fetchTransforms().then(setTransforms)
  }, [])

  const recorderRef = useRef<SegmentedRecorder | null>(null)
  const tickRef = useRef<number | null>(null)

  const meeting = meetings.data?.find((m) => m.id === meetingId)
  const canRecord = isCaptureSupported() && status.transcription.configured

  useEffect(() => {
    if (meeting && !title) setTitle(`Notes — ${meeting.title}`)
  }, [meeting, title])

  // Releasing the microphone when the page goes away is not tidiness: a
  // recorder left running is a live microphone the person can no longer see.
  useEffect(() => () => {
    recorderRef.current?.abandon()
    if (tickRef.current !== null) window.clearInterval(tickRef.current)
  }, [])

  const handleSegment = useCallback(
    async ({ blob }: { blob: Blob }) => {
      setPendingSegments((n) => n + 1)
      try {
        const result = await transcribeSegment(blob, language, vocabularyRef.current)
        if (result.text.trim()) {
          setTranscript((current) => (current ? `${current} ${result.text.trim()}` : result.text.trim()))
        }
        // A silent segment is counted but does not claim a model: saying it
        // was transcribed by one would be untrue.
        if (!result.skipped) {
          setTranscriptModel(result.model)
          setSegmentsDone((n) => n + 1)
        } else {
          setSegmentsSilent((n) => n + 1)
        }
      } catch (error) {
        const message =
          error instanceof ServiceError && error.isNotConfigured
            ? 'Transcription is not configured on this deployment, so this segment was not transcribed. The audio has been discarded.'
            : error instanceof Error
              ? error.message
              : 'A segment could not be transcribed.'
        setCaptureError(message)
      } finally {
        // Whether or not the transcript came back, this is where the audio
        // stops existing: no reference is kept on either path.
        setPendingSegments((n) => Math.max(0, n - 1))
      }
    },
    [language],
  )

  // Read through a ref: the handler is created once when recording starts and
  // must not be rebuilt every time the dictionary query settles.
  const vocabularyRef = useRef<string[]>([])
  vocabularyRef.current = vocabulary

  const startRecording = async () => {
    setCaptureError(null)
    const recorder = new SegmentedRecorder({
      onSegment: handleSegment,
      onError: (error) => setCaptureError(error.message),
      onStateChange: setRecorderState,
    })
    recorderRef.current = recorder

    try {
      await recorder.start()
      setSource('live_capture')
      setPhase('live')
      const startedAt = Date.now()
      tickRef.current = window.setInterval(() => {
        setElapsed((Date.now() - startedAt) / 1000)
      }, 500)
    } catch (error) {
      recorderRef.current = null
      setCaptureError(
        error instanceof Error
          ? error.name === 'NotAllowedError'
            ? 'Permission to use the microphone was refused, so recording has not started.'
            : error.name === 'NotFoundError' || error.name === 'NotSupportedError'
              ? 'No microphone is available to this browser. You can still write or paste a transcript.'
              : error.message
          : 'The microphone could not be opened.',
      )
    }
  }

  const stopRecording = async () => {
    if (tickRef.current !== null) window.clearInterval(tickRef.current)
    await recorderRef.current?.stop()
    recorderRef.current = null
    setPhase('review')
  }

  const runExtraction = async () => {
    if (!transcript.trim()) return
    setExtracting(true)
    try {
      const result = await extractFromTranscript(transcript)
      setSummary((current) => current || result.summary)
      setDataPoints((current) => [
        ...current,
        ...result.dataPoints.map((point, index) => ({
          id: `ai_${Date.now()}_${index}`,
          label: point.label,
          value: point.value,
          unit: point.unit,
          date: point.date,
          dateKind: point.dateKind,
          evidence: point.evidence,
          // Marked as the model's, and unverified, so nothing it produced can
          // be mistaken for something a person checked.
          origin: 'ai' as const,
          verified: false,
        })),
      ])
      setDecisions((current) => [...current, ...result.decisions])
      setActionItems((current) => [
        ...current,
        // An owner and a deadline are folded into the line rather than
        // dropped, since they are usually the part that matters.
        ...result.actionItems.map((item) =>
          [item.action, item.owner ? `— ${item.owner}` : '', item.dueDate ? `(by ${item.dueDate})` : '']
            .filter(Boolean)
            .join(' '),
        ),
      ])
      const dated = result.dataPoints.filter((point) => point.date).length
      toast({
        title: `${result.dataPoints.length} data points proposed`,
        description: `${dated} carry a stated date. Each is unverified until you confirm it.`,
        tone: 'info',
      })
    } catch (error) {
      toast({
        title:
          error instanceof ServiceError && error.isNotConfigured
            ? 'Extraction is not configured'
            : 'The extraction failed',
        description: error instanceof Error ? error.message : undefined,
        tone: 'error',
      })
    } finally {
      setExtracting(false)
    }
  }

  const runTransform = async (id: string) => {
    if (!transcript.trim()) return
    setTransforming(id)
    try {
      const rewritten = await applyTransform(transcript, id)
      if (rewritten.trim()) {
        setTranscript(rewritten.trim())
        toast({
          title: 'Transcript rewritten',
          description: 'Check it before saving — the wording changed, nothing else should have.',
          tone: 'info',
        })
      }
    } catch (error) {
      toast({
        title: 'The transcript was not rewritten',
        description: error instanceof Error ? error.message : undefined,
        tone: 'error',
      })
    } finally {
      setTransforming(null)
    }
  }

  const save = async () => {
    if (!meetingId) {
      toast({ title: 'Choose which meeting these notes belong to', tone: 'error' })
      return
    }
    try {
      await createNote.mutateAsync({
        meetingId,
        title: title.trim() || `Notes — ${meeting?.title ?? 'meeting'}`,
        source,
        language,
        transcript: transcript.trim(),
        transcriptModel,
        summary: summary.trim() || undefined,
        dataPoints,
        decisions: decisions.filter((d) => d.trim()),
        actionItems: actionItems.filter((a) => a.trim()),
        capturedMinutes: elapsed ? Number((elapsed / 60).toFixed(2)) : undefined,
        audioRetained: false,
        createdBy: user?.id,
      })
      toast({
        title: 'Notes saved',
        description: 'The transcript and data points are stored. No audio was kept.',
        tone: 'success',
      })
      setPhase('consent')
      setTranscript('')
      setDataPoints([])
      setDecisions([])
      setActionItems([])
      setSummary('')
      setElapsed(0)
      setSegmentsDone(0)
      setSegmentsSilent(0)
    } catch (error) {
      toast({
        title: 'The notes were not saved',
        description: error instanceof Error ? error.message : undefined,
        tone: 'error',
      })
    }
  }

  const wordCount = useMemo(
    () => transcript.trim().split(/\s+/).filter(Boolean).length,
    [transcript],
  )

  return (
    <>
      <PageHeader
        title="Meeting capture"
        description="Transcript and data points are kept. The audio is not."
        actions={
          <Button variant="outline" asChild>
            <Link to="/meetings">All meetings</Link>
          </Button>
        }
      />

      <AudioPolicyNotice />

      {phase === 'consent' ? (
        <Card>
          <CardHeader>
            <CardTitle>Before the microphone is opened</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="capture-meeting">Meeting</Label>
                <select
                  id="capture-meeting"
                  value={meetingId}
                  onChange={(event) => setMeetingId(event.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm"
                >
                  <option value="">Choose a meeting…</option>
                  {(meetings.data ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="capture-language">Spoken language</Label>
                <select
                  id="capture-language"
                  value={language}
                  onChange={(event) => setLanguage(event.target.value as MeetingLanguage)}
                  className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm"
                >
                  {Object.entries(LANGUAGE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex items-start gap-2.5 rounded-md border bg-muted/30 p-3 text-sm">
              <input
                type="checkbox"
                checked={consentGiven}
                onChange={(event) => setConsentGiven(event.target.checked)}
                className="mt-0.5 size-4"
              />
              <span>
                Everyone present has been told the meeting is being transcribed, and that the
                transcript and the figures taken from it will be kept while the audio is not.
              </span>
            </label>

            {captureError ? (
              <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {captureError}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void startRecording()}
                disabled={!consentGiven || !meetingId || !canRecord}
              >
                <Mic /> Start recording
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSource('pasted_transcript')
                  setPhase('review')
                }}
                disabled={!meetingId}
              >
                Write or paste a transcript instead
              </Button>
            </div>

            {statusPending ? null : !isCaptureSupported() ? (
              <p className="text-sm text-muted-foreground">
                This browser cannot record audio. You can still write or paste a transcript, and
                enter the data points by hand.
              </p>
            ) : !status.transcription.configured ? (
              <p className="text-sm text-muted-foreground">
                Recording is unavailable because no transcription key is set on this deployment.
                Set <code className="rounded bg-muted px-1">TRANSCRIPTION_API_KEY</code> in the
                project environment to enable it. Writing or pasting a transcript works now.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Transcribed by {status.transcription.model} in {SEGMENT_SECONDS}-second segments.
                Each segment is discarded as soon as its text comes back.
                {vocabulary.length > 0
                  ? ` ${vocabulary.length} terms from the Dictionary are given to it first.`
                  : ' Add names it mishears to the Dictionary register to improve it.'}
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {phase === 'live' ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <span
                  className={
                    recorderState === 'recording'
                      ? 'size-2.5 animate-pulse rounded-full bg-destructive'
                      : 'size-2.5 rounded-full bg-muted-foreground'
                  }
                  aria-hidden
                />
                {recorderState === 'recording' ? 'Recording' : recorderState === 'paused' ? 'Paused' : 'Finishing'}
                <span className="tabular-nums text-muted-foreground">{formatElapsed(elapsed)}</span>
              </CardTitle>

              <div className="flex gap-2">
                {recorderState === 'recording' ? (
                  <Button variant="outline" onClick={() => recorderRef.current?.pause()}>
                    <Pause /> Pause
                  </Button>
                ) : recorderState === 'paused' ? (
                  <Button variant="outline" onClick={() => recorderRef.current?.resume()}>
                    <Play /> Resume
                  </Button>
                ) : null}
                <Button onClick={() => void stopRecording()}>
                  <CircleStop /> Stop and review
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">
                <Waves aria-hidden /> {segmentsDone} segments transcribed
              </Badge>
              {pendingSegments > 0 ? (
                <Badge variant="info">{pendingSegments} in flight</Badge>
              ) : null}
              {segmentsSilent > 0 ? (
                <Badge variant="outline">{segmentsSilent} silent, not sent</Badge>
              ) : null}
              <span>{wordCount} words so far</span>
            </div>

            {captureError ? (
              <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-sm text-warning">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {captureError}
              </p>
            ) : null}

            <div className="max-h-64 overflow-y-auto rounded-md border bg-muted/20 p-3 text-sm leading-relaxed">
              {transcript || (
                <span className="text-muted-foreground">
                  The transcript appears here as each segment comes back.
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {phase === 'review' ? (
        <ReviewPanel
          title={title}
          setTitle={setTitle}
          summary={summary}
          setSummary={setSummary}
          transcript={transcript}
          setTranscript={setTranscript}
          dataPoints={dataPoints}
          setDataPoints={setDataPoints}
          decisions={decisions}
          setDecisions={setDecisions}
          actionItems={actionItems}
          setActionItems={setActionItems}
          onExtract={() => void runExtraction()}
          extracting={extracting}
          transforms={transforms}
          transforming={transforming}
          onTransform={(id) => void runTransform(id)}
          vocabularyCount={vocabulary.length}
          extractionConfigured={status.extraction.configured}
          onSave={() => void save()}
          saving={createNote.isPending}
          capturedMinutes={elapsed / 60}
          onBack={() => setPhase('consent')}
        />
      ) : null}
    </>
  )
}

function AudioPolicyNotice() {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-success/40 bg-success/5 p-3 text-sm">
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
      <p>
        <span className="font-medium">No audio is kept.</span> The microphone stream stays in this
        browser and is transcribed in short segments; each is discarded once its text returns.
        Nothing is uploaded to storage, the database column that would record retained audio is
        constrained to false, and there is no way to download a recording afterwards — because
        none exists.
      </p>
    </div>
  )
}

function ReviewPanel(props: {
  title: string
  setTitle: (v: string) => void
  summary: string
  setSummary: (v: string) => void
  transcript: string
  setTranscript: (v: string) => void
  dataPoints: MeetingDataPoint[]
  setDataPoints: React.Dispatch<React.SetStateAction<MeetingDataPoint[]>>
  decisions: string[]
  setDecisions: React.Dispatch<React.SetStateAction<string[]>>
  actionItems: string[]
  setActionItems: React.Dispatch<React.SetStateAction<string[]>>
  onExtract: () => void
  extracting: boolean
  extractionConfigured: boolean
  transforms: TransformOption[]
  transforming: string | null
  onTransform: (id: string) => void
  vocabularyCount: number
  onSave: () => void
  saving: boolean
  capturedMinutes: number
  onBack: () => void
}) {
  const unverified = props.dataPoints.filter((p) => !p.verified).length

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>The note</CardTitle>
          <p className="text-sm text-muted-foreground">
            {props.capturedMinutes >= 0.1
              ? `${props.capturedMinutes.toFixed(1)} minutes were transcribed. The audio is gone.`
              : 'Write or paste the transcript, then take the data points out of it.'}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="note-title">Title</Label>
            <Input
              id="note-title"
              value={props.title}
              onChange={(event) => props.setTitle(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note-transcript">Transcript</Label>
            <Textarea
              id="note-transcript"
              value={props.transcript}
              onChange={(event) => props.setTranscript(event.target.value)}
              className="min-h-40 font-[inherit]"
              placeholder="Paste or type what was said."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note-summary">Summary</Label>
            <Textarea
              id="note-summary"
              value={props.summary}
              onChange={(event) => props.setSummary(event.target.value)}
              placeholder="Two or three sentences."
            />
          </div>

          {props.transforms.length > 0 ? (
            <div className="space-y-1.5">
              <Label>Rewrite the transcript</Label>
              <div className="flex flex-wrap gap-2">
                {props.transforms.map((option) => (
                  <Button
                    key={option.id}
                    variant="outline"
                    size="sm"
                    disabled={!props.transcript.trim() || Boolean(props.transforming)}
                    onClick={() => props.onTransform(option.id)}
                  >
                    {props.transforming === option.id ? 'Rewriting…' : option.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Wording only. Figures, dates, names and decisions are left exactly as they were
                said, and the previous version is kept until you leave this screen.
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={props.onExtract}
              disabled={!props.transcript.trim() || props.extracting}
              title={
                props.extractionConfigured
                  ? 'Propose data points, decisions and actions from the transcript'
                  : 'No AI key is set on this deployment'
              }
            >
              {props.extracting ? 'Reading the transcript…' : 'Propose data points'}
            </Button>
            {!props.extractionConfigured ? (
              <p className="self-center text-xs text-muted-foreground">
                Automatic proposals need an AI key on the deployment. Points can be added by hand.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Data points</CardTitle>
            {unverified > 0 ? (
              <Badge variant="ai">{unverified} unverified</Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            The figures this meeting produced. These are what the Master Index and the reports
            draw on, so each one a model proposed has to be confirmed by a person.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {props.dataPoints.length === 0 ? (
            <EmptyState
              title="No data points yet"
              description="Add the figures that were stated — counts, dates, deadlines, targets."
            />
          ) : (
            <ul className="space-y-2">
              {props.dataPoints.map((point, index) => (
                <li key={point.id} className="rounded-md border p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <Input
                      value={point.label}
                      aria-label={`Data point ${index + 1} label`}
                      placeholder="What was measured"
                      onChange={(event) =>
                        props.setDataPoints((current) =>
                          current.map((p) =>
                            p.id === point.id ? { ...p, label: event.target.value } : p,
                          ),
                        )
                      }
                    />
                    <Input
                      value={point.value}
                      aria-label={`Data point ${index + 1} value`}
                      placeholder="The figure"
                      onChange={(event) =>
                        props.setDataPoints((current) =>
                          current.map((p) =>
                            p.id === point.id ? { ...p, value: event.target.value } : p,
                          ),
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 text-destructive"
                      onClick={() =>
                        props.setDataPoints((current) => current.filter((p) => p.id !== point.id))
                      }
                      title="Remove this data point"
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">Remove</span>
                    </Button>
                  </div>

                  {/* The date the figure belongs to. Left empty when none was
                      stated — an invented date reads as precision that is not
                      there. */}
                  <div className="mt-2 grid gap-2 sm:grid-cols-[auto_1fr_1fr]">
                    <select
                      value={point.dateKind ?? 'as_of'}
                      aria-label={`Data point ${index + 1} date meaning`}
                      onChange={(event) =>
                        props.setDataPoints((current) =>
                          current.map((p) =>
                            p.id === point.id
                              ? { ...p, dateKind: event.target.value as DataPointDateKind }
                              : p,
                          ),
                        )
                      }
                      className="h-9 rounded-md border border-input bg-card px-2 text-sm shadow-sm"
                    >
                      {Object.entries(DATE_KIND_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="date"
                      value={point.date ?? ''}
                      aria-label={`Data point ${index + 1} date`}
                      onChange={(event) =>
                        props.setDataPoints((current) =>
                          current.map((p) =>
                            p.id === point.id
                              ? { ...p, date: event.target.value || undefined }
                              : p,
                          ),
                        )
                      }
                    />
                    <Input
                      value={point.unit ?? ''}
                      aria-label={`Data point ${index + 1} unit`}
                      placeholder="Unit, if any"
                      onChange={(event) =>
                        props.setDataPoints((current) =>
                          current.map((p) =>
                            p.id === point.id
                              ? { ...p, unit: event.target.value || undefined }
                              : p,
                          ),
                        )
                      }
                    />
                  </div>

                  {point.evidence ? (
                    <p className="mt-2 border-l-2 border-muted pl-2 text-xs italic text-muted-foreground">
                      “{point.evidence}”
                    </p>
                  ) : null}

                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant={point.origin === 'ai' ? 'ai' : 'secondary'}>
                      {point.origin === 'ai' ? 'proposed by the model' : 'entered by hand'}
                    </Badge>
                    {point.origin === 'ai' ? (
                      <label className="flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={point.verified}
                          onChange={(event) =>
                            props.setDataPoints((current) =>
                              current.map((p) =>
                                p.id === point.id ? { ...p, verified: event.target.checked } : p,
                              ),
                            )
                          }
                          className="size-3.5"
                        />
                        I have checked this against the transcript
                      </label>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Button
            variant="outline"
            onClick={() =>
              props.setDataPoints((current) => [
                ...current,
                {
                  id: `manual_${Date.now()}`,
                  label: '',
                  value: '',
                  origin: 'person',
                  verified: true,
                },
              ])
            }
          >
            <Plus /> Add a data point
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <StringListCard
          title="Decisions"
          description="What the meeting settled."
          items={props.decisions}
          setItems={props.setDecisions}
          placeholder="The committee agreed to…"
        />
        <StringListCard
          title="Action items"
          description="What someone is to do next."
          items={props.actionItems}
          setItems={props.setActionItems}
          placeholder="Collect the monthly reports from…"
        />
      </div>

      <Separator />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" onClick={props.onBack}>
          Back
        </Button>
        <Button onClick={props.onSave} disabled={props.saving}>
          <Save /> {props.saving ? 'Saving…' : 'Save notes'}
        </Button>
      </div>
    </>
  )
}

function StringListCard({
  title,
  description,
  items,
  setItems,
  placeholder,
}: {
  title: string
  description: string
  items: string[]
  setItems: React.Dispatch<React.SetStateAction<string[]>>
  placeholder: string
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex gap-2">
            <Textarea
              value={item}
              aria-label={`${title} ${index + 1}`}
              onChange={(event) =>
                setItems((current) => current.map((v, i) => (i === index ? event.target.value : v)))
              }
              className="min-h-[52px]"
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-9 shrink-0 text-destructive"
              onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
              title={`Remove ${title.toLowerCase().replace(/s$/, '')}`}
            >
              <Trash2 className="size-4" />
              <span className="sr-only">Remove</span>
            </Button>
          </div>
        ))}
        <Button variant="outline" onClick={() => setItems((current) => [...current, ''])}>
          <Plus /> Add
        </Button>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">{placeholder}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

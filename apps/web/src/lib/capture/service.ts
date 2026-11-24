import type { MeetingDataPoint, MeetingLanguage } from '@/types/domain'
import { hasAudibleContent, toWav16kMono } from './wav'

/**
 * The server-side endpoints.
 *
 * Every one of these is a function on the deployment, never a direct call to
 * a provider, because the key must not be in the browser. If a key is absent
 * the endpoint says so with a 503 and a `not_configured` code, and the
 * interface reports that rather than failing vaguely or pretending.
 */

export interface ServiceStatus {
  transcription: { configured: boolean; model: string | null }
  extraction: { configured: boolean; model: string | null }
  calendar: { configured: boolean; calendarId: string | null }
  /** Drive and calendar share one service account, so they arrive together. */
  drive: { configured: boolean }
  audioRetention: 'never_stored'
}

/** Used when the status endpoint is unreachable — a static build, a local
 *  `vite preview`, or an offline deployment. Claiming anything is configured
 *  in that case would be a guess. */
export const UNCONFIGURED: ServiceStatus = {
  transcription: { configured: false, model: null },
  extraction: { configured: false, model: null },
  calendar: { configured: false, calendarId: null },
  drive: { configured: false },
  audioRetention: 'never_stored',
}

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ServiceError'
  }

  get isNotConfigured(): boolean {
    return this.code === 'not_configured'
  }
}

async function failure(response: Response): Promise<ServiceError> {
  let body: { error?: string; message?: string; detail?: string } = {}
  try {
    body = (await response.json()) as typeof body
  } catch {
    // A non-JSON body means something other than our function answered —
    // most often a static host with no functions at all.
  }
  return new ServiceError(
    body.message ?? `The request failed (${response.status}).`,
    body.error ?? 'request_failed',
    response.status,
  )
}

export async function fetchServiceStatus(): Promise<ServiceStatus> {
  try {
    const response = await fetch('/api/status', { headers: { accept: 'application/json' } })
    if (!response.ok) return UNCONFIGURED
    const body = (await response.json()) as ServiceStatus
    // Trust the shape only as far as the fields we read.
    return {
      transcription: {
        configured: Boolean(body.transcription?.configured),
        model: body.transcription?.model ?? null,
      },
      extraction: {
        configured: Boolean(body.extraction?.configured),
        model: body.extraction?.model ?? null,
      },
      calendar: {
        configured: Boolean(body.calendar?.configured),
        calendarId: body.calendar?.calendarId ?? null,
      },
      drive: { configured: Boolean(body.drive?.configured) },
      audioRetention: 'never_stored',
    }
  } catch {
    return UNCONFIGURED
  }
}

/**
 * Sends one audio segment and gets its text back.
 *
 * The segment is converted to 16 kHz mono WAV first, because the
 * transcription model cannot read the WebM that Chrome records and because
 * the conversion cuts the size enough to stay inside the request limit.
 *
 * Neither blob is retained here. Both go out of scope when this resolves,
 * which is what keeps the amount of audio in existence to one segment.
 */
export async function transcribeSegment(
  blob: Blob,
  language: MeetingLanguage,
  vocabulary: string[] = [],
): Promise<{ text: string; model: string; skipped?: boolean }> {
  const wav = await toWav16kMono(blob)

  // A silent segment is not worth a request, and a model asked to transcribe
  // silence will sometimes describe it instead of returning nothing.
  if (!(await hasAudibleContent(wav))) {
    return { text: '', model: 'none', skipped: true }
  }

  const headers: Record<string, string> = { 'content-type': 'audio/wav' }
  if (vocabulary.length > 0) {
    // Encoded because these are proper nouns in several scripts, and a raw
    // header may carry only Latin-1.
    headers['x-vocabulary'] = encodeURIComponent(vocabulary.slice(0, 120).join('|'))
  }

  const response = await fetch(`/api/transcribe?language=${encodeURIComponent(language)}`, {
    method: 'POST',
    headers,
    body: wav,
  })
  if (!response.ok) throw await failure(response)
  const body = (await response.json()) as { text?: string; model?: string }
  return { text: body.text ?? '', model: body.model ?? 'unknown' }
}

export interface ExtractedAction {
  action: string
  owner?: string
  dueDate?: string
}

export interface ExtractionResult {
  summary: string
  dataPoints: Array<Omit<MeetingDataPoint, 'id' | 'origin' | 'verified'>>
  decisions: string[]
  actionItems: ExtractedAction[]
  model: string
}

export async function extractFromTranscript(transcript: string): Promise<ExtractionResult> {
  const response = await fetch('/api/extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transcript }),
  })
  if (!response.ok) throw await failure(response)
  const body = (await response.json()) as ExtractionResult
  return {
    summary: body.summary ?? '',
    dataPoints: Array.isArray(body.dataPoints) ? body.dataPoints : [],
    decisions: Array.isArray(body.decisions) ? body.decisions : [],
    actionItems: Array.isArray(body.actionItems) ? body.actionItems : [],
    model: body.model ?? 'unknown',
  }
}

/* -------------------------------------------------------------- transforms */

export interface TransformOption {
  id: string
  label: string
}

/** The transforms this deployment offers. Asked for rather than hard-coded,
 *  so the list cannot drift from the one the endpoint will accept. */
export async function fetchTransforms(): Promise<TransformOption[]> {
  try {
    const response = await fetch('/api/transform')
    if (!response.ok) return []
    const body = (await response.json()) as { transforms?: TransformOption[]; configured?: boolean }
    return body.configured ? (body.transforms ?? []) : []
  } catch {
    return []
  }
}

export async function applyTransform(text: string, transform: string): Promise<string> {
  const response = await fetch('/api/transform', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, transform }),
  })
  if (!response.ok) throw await failure(response)
  const body = (await response.json()) as { text?: string }
  return body.text ?? ''
}

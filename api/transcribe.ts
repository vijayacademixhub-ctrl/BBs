/**
 * Transcribes one audio segment and keeps nothing.
 *
 * The contract this endpoint exists to honour: audio is never stored. It is
 * received in memory, forwarded to the transcription provider, and the buffer
 * goes out of scope when the request ends. Nothing is written to disk, to a
 * database, or to object storage, and there is no code path here that could.
 * The transcript goes back to the browser, which decides what to keep.
 *
 * Audio arrives in segments rather than as a whole meeting, for two reasons.
 * A serverless request body is capped at about 4.5 MB, which an hour of audio
 * exceeds; and a segment that has been transcribed can be discarded while the
 * meeting is still running, so the amount of audio in existence at any moment
 * is a few seconds' worth rather than the whole conversation.
 *
 * The key is read from the server environment. It must never be given a VITE_
 * prefix: that would compile it into the browser bundle and publish it.
 */

const DEFAULT_URL = 'https://api.openai.com/v1/audio/transcriptions'
const DEFAULT_MODEL = 'whisper-1'

/** Comfortably inside the platform's body limit, with room for overhead. */
const MAX_BYTES = 4 * 1024 * 1024

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Use POST.' }, 405)
  }

  const key = process.env.TRANSCRIPTION_API_KEY
  if (!key) {
    return json(
      {
        error: 'not_configured',
        message:
          'No transcription key is set on this deployment. Set TRANSCRIPTION_API_KEY in the ' +
          'project environment. Until then, a transcript can be pasted in by hand.',
      },
      503,
    )
  }

  const audio = await request.arrayBuffer()
  if (audio.byteLength === 0) {
    return json({ error: 'empty', message: 'The request carried no audio.' }, 400)
  }
  if (audio.byteLength > MAX_BYTES) {
    return json(
      {
        error: 'too_large',
        message: `Segment is ${Math.round(audio.byteLength / 1024)} kB; the limit is ${MAX_BYTES / 1024} kB. Record in shorter segments.`,
      },
      413,
    )
  }

  const contentType = request.headers.get('content-type') ?? 'audio/webm'
  const language = new URL(request.url).searchParams.get('language') ?? undefined

  const form = new FormData()
  form.append('file', new Blob([audio], { type: contentType }), fileNameFor(contentType))
  form.append('model', process.env.TRANSCRIPTION_MODEL ?? DEFAULT_MODEL)
  form.append('response_format', 'json')
  // Only pass a language when the caller asked for one. 'mixed' is this
  // team's normal case — English, Kannada and Hindi in one meeting — and
  // forcing a single language there makes the result worse, not better.
  if (language && language !== 'mixed' && language !== 'auto') {
    form.append('language', language)
  }

  let upstream: Response
  try {
    upstream = await fetch(process.env.TRANSCRIPTION_API_URL ?? DEFAULT_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}` },
      body: form,
    })
  } catch (error) {
    return json(
      {
        error: 'unreachable',
        message: 'The transcription service could not be reached.',
        detail: error instanceof Error ? error.message : undefined,
      },
      502,
    )
  }

  if (!upstream.ok) {
    // The provider's own message is passed through because it is usually the
    // actionable part — an expired key, a rejected format, a rate limit — but
    // it is truncated so an unexpected response cannot become the page.
    const detail = (await upstream.text().catch(() => '')).slice(0, 500)
    return json(
      {
        error: 'provider_error',
        status: upstream.status,
        message: 'The transcription service refused the segment.',
        detail,
      },
      502,
    )
  }

  const result = (await upstream.json()) as { text?: string }
  return json({
    text: result.text ?? '',
    model: process.env.TRANSCRIPTION_MODEL ?? DEFAULT_MODEL,
    audioRetained: false,
    bytesProcessed: audio.byteLength,
  })
}

/** Providers dispatch on the extension, so it has to match the container. */
function fileNameFor(contentType: string): string {
  if (contentType.includes('ogg')) return 'segment.ogg'
  if (contentType.includes('mp4') || contentType.includes('m4a')) return 'segment.mp4'
  if (contentType.includes('mpeg')) return 'segment.mp3'
  if (contentType.includes('wav')) return 'segment.wav'
  return 'segment.webm'
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

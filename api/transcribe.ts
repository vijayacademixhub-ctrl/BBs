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
 * Two providers are supported and chosen by which key is present. Gemini is
 * preferred because one key then covers both transcription and extraction.
 * An OpenAI-compatible endpoint is the fallback, so the provider can change
 * without a code change.
 *
 * Keys are read from the server environment. None may ever carry a VITE_
 * prefix: that would compile the key into the browser bundle and publish it.
 */

/**
 * Purpose-built for speech, and the default for that reason. Verified against
 * this deployment's key on 20-Nov-2026 — gemini-2.5-flash, which this file
 * originally defaulted to, is no longer offered to new keys and returns 404.
 */
const GEMINI_DEFAULT_MODEL = 'gemini-3.5-transcribe'
const OPENAI_DEFAULT_URL = 'https://api.openai.com/v1/audio/transcriptions'
const OPENAI_DEFAULT_MODEL = 'whisper-1'

/** Comfortably inside the platform's body limit, with room for base64 growth. */
const MAX_BYTES = 3 * 1024 * 1024

const LANGUAGE_HINT: Record<string, string> = {
  en: 'The speakers are using English.',
  kn: 'The speakers are using Kannada.',
  hi: 'The speakers are using Hindi.',
  mixed:
    'The speakers mix English, Kannada and Hindi, often within one sentence. ' +
    'Transcribe each phrase in the language it was spoken in, using the script of that language.',
}

export async function POST(request: Request): Promise<Response> {
  const geminiKey = process.env.GEMINI_API_KEY
  const openAiKey = process.env.TRANSCRIPTION_API_KEY

  if (!geminiKey && !openAiKey) {
    return json(
      {
        error: 'not_configured',
        message:
          'No transcription key is set on this deployment. Set GEMINI_API_KEY in the project ' +
          'environment. Until then, a transcript can be pasted in by hand.',
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
        message:
          `Segment is ${Math.round(audio.byteLength / 1024)} kB; the limit is ` +
          `${MAX_BYTES / 1024} kB. Record in shorter segments.`,
      },
      413,
    )
  }

  const url = new URL(request.url)
  const contentType = (request.headers.get('content-type') ?? 'audio/wav').split(';')[0]!.trim()
  const language = url.searchParams.get('language') ?? 'mixed'

  // Terms from the team's Dictionary register. Speech models get unfamiliar
  // proper nouns wrong in predictable ways — "Karshima" came back as
  // "Kashima" — and naming them beforehand is the one thing that reliably
  // fixes it. Sent as a header rather than in the body, because the body is
  // the audio.
  const vocabulary = parseVocabulary(request.headers.get('x-vocabulary'))

  try {
    const result = geminiKey
      ? await transcribeWithGemini(geminiKey, audio, contentType, language, vocabulary)
      : await transcribeWithOpenAi(openAiKey!, audio, contentType, language, vocabulary)

    return json({ ...result, audioRetained: false, bytesProcessed: audio.byteLength })
  } catch (error) {
    if (error instanceof ProviderError) {
      return json({ error: error.code, message: error.message, detail: error.detail }, error.status)
    }
    return json(
      {
        error: 'unreachable',
        message: 'The transcription service could not be reached.',
        detail: error instanceof Error ? error.message : undefined,
      },
      502,
    )
  }
}

/* ------------------------------------------------------------------ gemini */

/**
 * Gemini takes audio inline as base64 and returns text from the same call.
 *
 * The prompt is explicit that nothing may be added, because a model asked to
 * "transcribe" a segment that happens to be silence will otherwise narrate
 * the silence. An empty segment must come back empty.
 */
async function transcribeWithGemini(
  key: string,
  audio: ArrayBuffer,
  contentType: string,
  language: string,
  vocabulary: string[],
): Promise<{ text: string; model: string }> {
  const model = process.env.GEMINI_TRANSCRIBE_MODEL ?? GEMINI_DEFAULT_MODEL
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`

  const prompt =
    'Transcribe this audio exactly as spoken. ' +
    (LANGUAGE_HINT[language] ?? LANGUAGE_HINT.mixed) +
    vocabularyHint(vocabulary) +
    ' Return only the transcript text: no speaker labels, no timestamps, no commentary, ' +
    'and no description of the recording. If there is no intelligible speech, return nothing at all.'

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: geminiMimeType(contentType), data: toBase64(audio) } },
          ],
        },
      ],
      generationConfig: { temperature: 0, maxOutputTokens: 4096 },
    }),
  })

  if (!response.ok) {
    throw new ProviderError(
      'provider_error',
      response.status === 429
        ? 'The transcription service is rate limiting this key. The segment was not transcribed.'
        : 'The transcription service refused the segment.',
      502,
      (await response.text().catch(() => '')).slice(0, 500),
    )
  }

  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = (body.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')
    .trim()

  return { text, model }
}

/**
 * Gemini accepts a fixed set of audio containers, and WebM is not among them.
 * The browser converts each segment to 16 kHz mono WAV before sending, so
 * this normally receives audio/wav; the mapping is a guard for anything else
 * that reaches it.
 */
function geminiMimeType(contentType: string): string {
  const accepted = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/aiff', 'audio/aac', 'audio/ogg', 'audio/flac']
  if (accepted.includes(contentType)) return contentType === 'audio/mpeg' ? 'audio/mp3' : contentType
  if (contentType === 'audio/mp4' || contentType === 'audio/m4a') return 'audio/aac'
  return 'audio/wav'
}

function toBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString('base64')
}

/* ----------------------------------------------------------------- openai */

async function transcribeWithOpenAi(
  key: string,
  audio: ArrayBuffer,
  contentType: string,
  language: string,
  vocabulary: string[],
): Promise<{ text: string; model: string }> {
  const model = process.env.TRANSCRIPTION_MODEL ?? OPENAI_DEFAULT_MODEL

  const form = new FormData()
  form.append('file', new Blob([audio], { type: contentType }), fileNameFor(contentType))
  form.append('model', model)
  form.append('response_format', 'json')
  // Only pass a language when the caller asked for one. 'mixed' is this
  // team's normal case — English, Kannada and Hindi in one meeting — and
  // forcing a single language there makes the result worse, not better.
  if (language && language !== 'mixed' && language !== 'auto') {
    form.append('language', language)
  }
  // Whisper takes vocabulary as a free-text prompt rather than a list.
  if (vocabulary.length > 0) {
    form.append('prompt', `Names and terms that occur: ${vocabulary.join(', ')}.`)
  }

  const response = await fetch(process.env.TRANSCRIPTION_API_URL ?? OPENAI_DEFAULT_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}` },
    body: form,
  })

  if (!response.ok) {
    throw new ProviderError(
      'provider_error',
      'The transcription service refused the segment.',
      502,
      (await response.text().catch(() => '')).slice(0, 500),
    )
  }

  const result = (await response.json()) as { text?: string }
  return { text: result.text ?? '', model }
}

/**
 * The dictionary arrives as a header, so it is bounded hard: a header too
 * long is rejected outright by some proxies, which would make transcription
 * fail silently once the list grew.
 */
function parseVocabulary(raw: string | null): string[] {
  if (!raw) return []
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    // Not encoded, or malformed. Use it as it came rather than failing.
  }
  return decoded
    .split('|')
    .map((term) => term.trim())
    .filter((term) => term.length > 0 && term.length <= 60)
    .slice(0, 120)
}

function vocabularyHint(vocabulary: string[]): string {
  if (vocabulary.length === 0) return ''
  return (
    ' These names and terms occur in this meeting and must be spelt exactly as given: ' +
    `${vocabulary.join(', ')}.` +
    ' Do not use them for anything that does not sound like them.'
  )
}

/** Providers dispatch on the extension, so it has to match the container. */
function fileNameFor(contentType: string): string {
  if (contentType.includes('ogg')) return 'segment.ogg'
  if (contentType.includes('mp4') || contentType.includes('m4a')) return 'segment.mp4'
  if (contentType.includes('mpeg') || contentType.includes('mp3')) return 'segment.mp3'
  if (contentType.includes('webm')) return 'segment.webm'
  return 'segment.wav'
}

/* ------------------------------------------------------------------ shared */

class ProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly detail?: string,
  ) {
    super(message)
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

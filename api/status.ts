/**
 * What this deployment can actually do.
 *
 * These functions are ES modules. `api/package.json` declares
 * `"type": "module"` for this directory alone, because the compiled output is
 * ESM and Node would otherwise load it as CommonJS and fail on the first
 * `export` — which is exactly what the first deployment did. The declaration
 * is scoped here rather than at the repository root so it cannot change how
 * anything in apps/web is interpreted.
 *
 * The interface asks this on load so it can tell the truth about itself
 * rather than offering a button that fails. It reports only whether a
 * credential is present — never a value, a prefix or a length, because any of
 * those narrow a guess.
 *
 * Runs on the server, so the keys it reads are never in the browser bundle.
 *
 * Exported as a named method rather than as a default. Vercel reads a default
 * export with the Node `(req, res)` signature and ignores what it returns; a
 * named `GET` gets the Web `Request`/`Response` signature these functions are
 * written against.
 */

export async function GET(): Promise<Response> {
  // One Gemini key covers both transcription and extraction. An
  // OpenAI-compatible key for either is honoured as a fallback, so the
  // provider can be changed without a code change.
  const gemini = Boolean(process.env.GEMINI_API_KEY)
  const geminiModel = process.env.GEMINI_MODEL ?? 'gemini-3.6-flash'
  const transcribeModel = process.env.GEMINI_TRANSCRIBE_MODEL ?? 'gemini-3.5-transcribe'
  const transcription = gemini || Boolean(process.env.TRANSCRIPTION_API_KEY)
  const extraction = gemini || Boolean(process.env.AI_API_KEY)
  const calendar = Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY,
  )

  return json({
    transcription: {
      configured: transcription,
      model: !transcription
        ? null
        : gemini
          ? transcribeModel
          : (process.env.TRANSCRIPTION_MODEL ?? 'whisper-1'),
    },
    extraction: {
      configured: extraction,
      model: !extraction
        ? null
        : gemini
          ? geminiModel
          : (process.env.AI_MODEL ?? 'gpt-4o-mini'),
    },
    calendar: {
      configured: calendar,
      calendarId: calendar ? (process.env.GOOGLE_CALENDAR_ID ?? 'primary') : null,
    },
    // Stated here as well as in the interface and in the database constraint.
    // The same claim in three places, none of which can be edited without the
    // others becoming visibly inconsistent.
    audioRetention: 'never_stored',
  })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

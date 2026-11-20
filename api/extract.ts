/**
 * Summarises a transcript and takes the data points out of it.
 *
 * Everything this returns is a proposal. It is marked unverified and a person
 * has to accept it before it becomes part of a note, which is the same gate
 * the database applies to AI-derived tasks and calendar events: the trigger
 * in migration 0007 refuses an unapproved extraction, and nothing here can
 * route around it.
 *
 * Each data point carries the date it refers to, where one was stated, and
 * the passage it came from. Both matter for the same reason: a figure with no
 * date and no source reads as a current fact, and six weeks later nobody can
 * tell whether it still is.
 *
 * The model is instructed to leave a field out rather than guess it. A date
 * inferred from "next month" is worse than no date, because it looks precise.
 */

/** Verified against this deployment's key on 20-Nov-2026. */
const GEMINI_DEFAULT_MODEL = 'gemini-3.6-flash'
const OPENAI_DEFAULT_URL = 'https://api.openai.com/v1/chat/completions'
const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini'
const MAX_TRANSCRIPT = 120_000

function instructions(today: string): string {
  return `You read transcripts of academic administration meetings at an Indian business school.
The speech may mix English, Kannada and Hindi.

Today is ${today}. Use it only to resolve a date that was stated relative to today,
such as "next Friday". Never use it to invent a date that was not stated.

Return ONLY a JSON object of this shape:
{
  "summary": "three or four sentences covering what the meeting was about and what came out of it",
  "dataPoints": [
    {
      "label": "what was measured or named",
      "value": "the figure or fact exactly as stated",
      "unit": "the unit, if one was stated",
      "date": "YYYY-MM-DD, the date this point refers to or is due on",
      "dateKind": "one of: as_of, due, decided_on, event",
      "evidence": "the sentence this came from, quoted exactly from the transcript"
    }
  ],
  "decisions": ["..."],
  "actionItems": [{"action": "what is to be done", "owner": "who, if named", "dueDate": "YYYY-MM-DD, if stated"}]
}

Rules you must follow:
- A data point is a figure, count, percentage, amount, deadline, date or named
  quantity that was actually stated out loud.
- Never infer, round, convert or total a number. If it was not said, it does not go in.
- "evidence" must be text that appears in the transcript, quoted exactly.
- Omit "unit", "date", "dateKind", "owner" and "dueDate" when they were not stated.
  Do not write "N/A", "unknown" or an empty string.
- A date must be a real calendar date in YYYY-MM-DD form. If only a month was
  stated, omit the date rather than guessing a day.
- An action item must name what is to be done. Do not invent an owner or a
  deadline that was not said.
- If the transcript contains none of a category, return an empty array for it.
- Return no prose outside the JSON object.`
}

export async function POST(request: Request): Promise<Response> {
  const geminiKey = process.env.GEMINI_API_KEY
  const openAiKey = process.env.AI_API_KEY

  if (!geminiKey && !openAiKey) {
    return json(
      {
        error: 'not_configured',
        message:
          'No AI key is set on this deployment. Set GEMINI_API_KEY in the project environment. ' +
          'Data points can be entered by hand in the meantime.',
      },
      503,
    )
  }

  let body: { transcript?: string }
  try {
    body = (await request.json()) as { transcript?: string }
  } catch {
    return json({ error: 'bad_request', message: 'Expected a JSON body.' }, 400)
  }

  const transcript = (body.transcript ?? '').trim()
  if (!transcript) {
    return json({ error: 'empty', message: 'The request carried no transcript.' }, 400)
  }

  const today = new Date().toISOString().slice(0, 10)
  const prompt = instructions(today)

  try {
    const { content, model } = geminiKey
      ? await askGemini(geminiKey, prompt, transcript.slice(0, MAX_TRANSCRIPT))
      : await askOpenAi(openAiKey!, prompt, transcript.slice(0, MAX_TRANSCRIPT))

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(stripFence(content)) as Record<string, unknown>
    } catch {
      // A model that did not return JSON is a failure, not something to paper
      // over with a partial parse: half an extraction is indistinguishable
      // from a complete one once it is on the screen.
      return json(
        { error: 'unparseable', message: 'The AI service did not return usable JSON.' },
        502,
      )
    }

    return json({
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      dataPoints: normalisePoints(parsed.dataPoints),
      decisions: normaliseStrings(parsed.decisions),
      actionItems: normaliseActions(parsed.actionItems),
      model,
      verified: false,
    })
  } catch (error) {
    if (error instanceof ProviderError) {
      return json({ error: error.code, message: error.message, detail: error.detail }, error.status)
    }
    return json(
      {
        error: 'unreachable',
        message: 'The AI service could not be reached.',
        detail: error instanceof Error ? error.message : undefined,
      },
      502,
    )
  }
}

/* --------------------------------------------------------------- providers */

async function askGemini(
  key: string,
  prompt: string,
  transcript: string,
): Promise<{ content: string; model: string }> {
  const model = process.env.GEMINI_MODEL ?? GEMINI_DEFAULT_MODEL
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: prompt }] },
      contents: [{ parts: [{ text: transcript }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        maxOutputTokens: 8192,
      },
    }),
  })

  if (!response.ok) {
    throw new ProviderError(
      'provider_error',
      response.status === 429
        ? 'The AI service is rate limiting this key. Try again in a minute.'
        : 'The AI service refused the request.',
      502,
      (await response.text().catch(() => '')).slice(0, 500),
    )
  }

  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const content = (body.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')

  return { content, model }
}

async function askOpenAi(
  key: string,
  prompt: string,
  transcript: string,
): Promise<{ content: string; model: string }> {
  const model = process.env.AI_MODEL ?? OPENAI_DEFAULT_MODEL

  const response = await fetch(process.env.AI_API_URL ?? OPENAI_DEFAULT_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: transcript },
      ],
    }),
  })

  if (!response.ok) {
    throw new ProviderError(
      'provider_error',
      'The AI service refused the request.',
      502,
      (await response.text().catch(() => '')).slice(0, 500),
    )
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  return { content: body.choices?.[0]?.message?.content ?? '', model }
}

/* -------------------------------------------------------------- normalising */

/** Some models wrap JSON in a markdown fence despite being told not to. */
function stripFence(content: string): string {
  const trimmed = content.trim()
  if (!trimmed.startsWith('```')) return trimmed
  return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const DATE_KINDS = ['as_of', 'due', 'decided_on', 'event']

/** A date the model returned, or undefined. A malformed one is dropped
 *  rather than passed on: a wrong date is worse than a missing one. */
function cleanDate(value: unknown): string | undefined {
  const text = String(value ?? '').trim()
  if (!ISO_DATE.test(text)) return undefined
  const parsed = new Date(`${text}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return undefined
  // Reject a date the calendar does not have, such as 2026-02-31, which
  // JavaScript would otherwise roll forward into March.
  return parsed.toISOString().slice(0, 10) === text ? text : undefined
}

function normalisePoints(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => {
      const date = cleanDate(item.date)
      const kind = String(item.dateKind ?? '').trim()
      return {
        label: String(item.label ?? '').slice(0, 160),
        value: String(item.value ?? '').slice(0, 400),
        unit: item.unit ? String(item.unit).slice(0, 40) : undefined,
        date,
        dateKind: date && DATE_KINDS.includes(kind) ? kind : date ? 'as_of' : undefined,
        evidence: item.evidence ? String(item.evidence).slice(0, 1000) : undefined,
      }
    })
    .filter((item) => item.label && item.value)
    .slice(0, 60)
}

function normaliseStrings(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item ?? '').trim().slice(0, 500))
    .filter(Boolean)
    .slice(0, 50)
}

/** Actions may come back as plain strings from a model that ignored the
 *  shape; both forms are accepted rather than discarding the content. */
function normaliseActions(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') return { action: item.trim().slice(0, 500) }
      if (typeof item !== 'object' || item === null) return { action: '' }
      const record = item as Record<string, unknown>
      return {
        action: String(record.action ?? '').trim().slice(0, 500),
        owner: record.owner ? String(record.owner).trim().slice(0, 120) : undefined,
        dueDate: cleanDate(record.dueDate),
      }
    })
    .filter((item) => item.action)
    .slice(0, 50)
}

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

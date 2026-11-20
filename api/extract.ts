/**
 * Proposes data points, decisions and actions from a transcript.
 *
 * Everything this returns is a proposal. It is marked as unverified and a
 * person has to accept it before it becomes part of a note, which is the same
 * gate the database applies to AI-derived tasks and calendar events: the
 * trigger in migration 0007 refuses an unapproved extraction, and nothing
 * here can route around it.
 *
 * The model is instructed to return the passage each point came from and to
 * leave a field out rather than guess it. A data point with no stated number
 * is worse than no data point, because it reads as a finding.
 */

const DEFAULT_URL = 'https://api.openai.com/v1/chat/completions'
const DEFAULT_MODEL = 'gpt-4o-mini'
const MAX_TRANSCRIPT = 60_000

const SYSTEM_PROMPT = `You read transcripts of academic administration meetings at an Indian
business school. The speech may mix English, Kannada and Hindi.

Return ONLY a JSON object of this shape:
{
  "summary": "two or three sentences",
  "dataPoints": [{"label": "...", "value": "...", "unit": "...", "evidence": "the sentence this came from"}],
  "decisions": ["..."],
  "actionItems": ["..."]
}

Rules you must follow:
- A data point is a figure, date, count, deadline or named quantity that was actually stated.
- Never infer, round or convert a number. If it was not said, it does not go in.
- "evidence" must be text that appears in the transcript, quoted exactly.
- Omit "unit" when none was stated. Do not write "N/A".
- An action item must name what is to be done. Do not invent an owner or a date
  that was not said; write the action alone.
- If the transcript contains none of a category, return an empty array for it.
- Return no prose outside the JSON object.`

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Use POST.' }, 405)
  }

  const key = process.env.AI_API_KEY
  if (!key) {
    return json(
      {
        error: 'not_configured',
        message:
          'No AI key is set on this deployment. Set AI_API_KEY in the project environment. ' +
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

  let upstream: Response
  try {
    upstream = await fetch(process.env.AI_API_URL ?? DEFAULT_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL ?? DEFAULT_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: transcript.slice(0, MAX_TRANSCRIPT) },
        ],
      }),
    })
  } catch (error) {
    return json(
      {
        error: 'unreachable',
        message: 'The AI service could not be reached.',
        detail: error instanceof Error ? error.message : undefined,
      },
      502,
    )
  }

  if (!upstream.ok) {
    const detail = (await upstream.text().catch(() => '')).slice(0, 500)
    return json(
      { error: 'provider_error', status: upstream.status, message: 'The AI service refused the request.', detail },
      502,
    )
  }

  const payload = (await upstream.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = payload.choices?.[0]?.message?.content ?? ''

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(content) as Record<string, unknown>
  } catch {
    // A model that did not return JSON is a failure, not something to paper
    // over with a partial parse: half an extraction is indistinguishable from
    // a complete one once it is on the screen.
    return json(
      { error: 'unparseable', message: 'The AI service did not return usable JSON.' },
      502,
    )
  }

  return json({
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    dataPoints: normalisePoints(parsed.dataPoints),
    decisions: normaliseStrings(parsed.decisions),
    actionItems: normaliseStrings(parsed.actionItems),
    model: process.env.AI_MODEL ?? DEFAULT_MODEL,
    verified: false,
  })
}

function normalisePoints(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      label: String(item.label ?? '').slice(0, 160),
      value: String(item.value ?? '').slice(0, 400),
      unit: item.unit ? String(item.unit).slice(0, 40) : undefined,
      evidence: item.evidence ? String(item.evidence).slice(0, 1000) : undefined,
    }))
    .filter((item) => item.label && item.value)
    .slice(0, 50)
}

function normaliseStrings(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item ?? '').trim().slice(0, 500))
    .filter(Boolean)
    .slice(0, 50)
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

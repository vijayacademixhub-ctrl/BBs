/**
 * Rewrites a piece of text in a fixed, named way.
 *
 * The transforms are defined here rather than accepted from the caller.
 * An endpoint that took an arbitrary instruction and a block of text would
 * be a general-purpose model proxy on a public URL, usable by anyone who
 * found it for anything they liked, at the project's expense. A closed list
 * keeps it to the jobs the application actually has.
 *
 * Every transform rewrites wording and nothing else. Each prompt says so in
 * terms, because the failure that matters here is a model that tidies a
 * transcript by rounding a figure or inventing the date somebody "must have
 * meant" — which would then be read as what was said in the meeting.
 */

const GEMINI_DEFAULT_MODEL = 'gemini-3.6-flash'

const NEVER_INVENT =
  ' Never add, remove, round or reword a number, a date, a name or a decision. ' +
  'If something is unclear, leave it exactly as it is rather than improving it. ' +
  'Return only the rewritten text, with no preamble and no explanation.'

const TRANSFORMS: Record<string, { label: string; instruction: string }> = {
  tidy: {
    label: 'Tidy the wording',
    instruction:
      'Remove filler words, false starts, stammers and repeated words from this meeting ' +
      'transcript. Fix obvious punctuation and sentence breaks. Keep every statement, in the ' +
      'order it was said, in the speaker\'s own words.' + NEVER_INVENT,
  },
  minutes: {
    label: 'Format as minutes',
    instruction:
      'Rewrite this meeting transcript as formal minutes for an academic committee: short ' +
      'headed paragraphs covering what was discussed, in the order it happened. Use the ' +
      'impersonal register normal in Indian academic minutes. Include every point raised.' +
      NEVER_INVENT,
  },
  bullets: {
    label: 'Condense to points',
    instruction:
      'Reduce this text to a list of short points, one per line, each beginning with a dash. ' +
      'Keep every distinct point; merge only exact repetition.' + NEVER_INVENT,
  },
  english: {
    label: 'Translate to English',
    instruction:
      'Translate this text into English. It may mix English, Kannada and Hindi. Keep names, ' +
      'designations and institutional terms as they are rather than translating them.' +
      NEVER_INVENT,
  },
  formal: {
    label: 'Make it formal',
    instruction:
      'Rewrite this text in formal written English suitable for an institutional record. ' +
      'Keep it concise; do not pad it out.' + NEVER_INVENT,
  },
}

const MAX_INPUT = 60_000

export async function GET(): Promise<Response> {
  // The interface asks what exists rather than hard-coding a list that could
  // drift from this one.
  return json({
    transforms: Object.entries(TRANSFORMS).map(([id, t]) => ({ id, label: t.label })),
    configured: Boolean(process.env.GEMINI_API_KEY ?? process.env.AI_API_KEY),
  })
}

export async function POST(request: Request): Promise<Response> {
  const geminiKey = process.env.GEMINI_API_KEY
  const openAiKey = process.env.AI_API_KEY

  if (!geminiKey && !openAiKey) {
    return json(
      {
        error: 'not_configured',
        message: 'No AI key is set on this deployment, so text cannot be rewritten.',
      },
      503,
    )
  }

  let body: { text?: string; transform?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json({ error: 'bad_request', message: 'Expected a JSON body.' }, 400)
  }

  const text = (body.text ?? '').trim()
  const chosen = TRANSFORMS[body.transform ?? '']

  if (!text) return json({ error: 'empty', message: 'There is no text to rewrite.' }, 400)
  if (!chosen) {
    return json(
      {
        error: 'unknown_transform',
        message: `No such transform. Available: ${Object.keys(TRANSFORMS).join(', ')}.`,
      },
      400,
    )
  }

  try {
    const result = geminiKey
      ? await askGemini(geminiKey, chosen.instruction, text.slice(0, MAX_INPUT))
      : await askOpenAi(openAiKey!, chosen.instruction, text.slice(0, MAX_INPUT))
    return json({ text: result.text, model: result.model, transform: body.transform })
  } catch (error) {
    return json(
      {
        error: 'provider_error',
        message: 'The text could not be rewritten.',
        detail: error instanceof Error ? error.message : undefined,
      },
      502,
    )
  }
}

async function askGemini(
  key: string,
  instruction: string,
  text: string,
): Promise<{ text: string; model: string }> {
  const model = process.env.GEMINI_MODEL ?? GEMINI_DEFAULT_MODEL
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instruction }] },
        contents: [{ parts: [{ text }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 8192 },
      }),
    },
  )
  if (!response.ok) throw new Error((await response.text().catch(() => '')).slice(0, 300))

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  return {
    text: (payload.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim(),
    model,
  }
}

async function askOpenAi(
  key: string,
  instruction: string,
  text: string,
): Promise<{ text: string; model: string }> {
  const model = process.env.AI_MODEL ?? 'gpt-4o-mini'
  const response = await fetch(process.env.AI_API_URL ?? 'https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: instruction },
        { role: 'user', content: text },
      ],
    }),
  })
  if (!response.ok) throw new Error((await response.text().catch(() => '')).slice(0, 300))

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  return { text: (payload.choices?.[0]?.message?.content ?? '').trim(), model }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

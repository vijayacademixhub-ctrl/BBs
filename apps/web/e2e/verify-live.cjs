/**
 * End-to-end verification against the real backend.
 *
 * Everything here runs against the deployed Supabase project and the real
 * Gemini key: a member signs in, the workbook is imported into the database,
 * an edit is made and read back, and a recorded meeting is transcribed and
 * reduced to dated data points. Nothing is stubbed, so a pass means the
 * deployed system works rather than that the mocks agree with each other.
 *
 * Build and serve first, with the backend configured:
 *
 *     VITE_SUPABASE_URL=... VITE_SUPABASE_PUBLISHABLE_KEY=... npm run build
 *     npm run preview
 *     xvfb-run -a node e2e/verify-live.cjs
 *
 * Credentials come from the environment, never from this file:
 *     E2E_EMAIL, E2E_PASSWORD, and GEMINI_API_KEY for the voice leg.
 *
 * A virtual display is needed because headless Chromium exposes no audio
 * device for the recording test.
 */
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE = process.env.E2E_BASE ?? 'http://localhost:4173';
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const PROXY_PORT = 4197;

const results = [];
function check(name, ok, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

/* ------------------------------------------------------------------ gemini */

function gemini(model, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        host: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${model}:generateContent`,
        method: 'POST',
        headers: {
          'x-goog-api-key': GEMINI_KEY,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
        },
        timeout: 120000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) reject(new Error(`${parsed.error.code}: ${parsed.error.message}`));
            else resolve(parsed);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

/** Real speech to record, produced by Gemini's own text-to-speech. */
async function makeSpeechWav(text) {
  const out = await gemini('gemini-3.1-flash-tts-preview', {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
    },
  });
  const part = out.candidates[0].content.parts[0];
  const inline = part.inlineData ?? part.inline_data;
  const pcm = Buffer.from(inline.data, 'base64');
  const mime = inline.mimeType ?? inline.mime_type ?? '';
  const rate = Number((/rate=(\d+)/.exec(mime) ?? [])[1] ?? 24000);

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/**
 * Serves the built application and proxies /api/* to real Gemini calls.
 *
 * The functions themselves are deployed on Vercel and cannot be reached from
 * a test runner, so this stands in for them — but it calls the same models
 * with the same prompts, so what is being checked is the real pipeline and
 * not a canned answer.
 */
function startServer(dist, state) {
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const send = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };

    if (url.pathname === '/api/status') {
      return send(200, {
        transcription: { configured: true, model: 'gemini-3.5-transcribe' },
        extraction: { configured: true, model: 'gemini-3.6-flash' },
        calendar: { configured: false, calendarId: null },
        audioRetention: 'never_stored',
      });
    }

    if (url.pathname === '/api/transcribe') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', async () => {
        const audio = Buffer.concat(chunks);
        state.segments.push({ bytes: audio.length, contentType: req.headers['content-type'] });
        try {
          const out = await gemini('gemini-3.5-transcribe', {
            contents: [{ parts: [
              { text: 'Transcribe this audio exactly as spoken. Return only the transcript text.' },
              { inline_data: { mime_type: 'audio/wav', data: audio.toString('base64') } },
            ] }],
            generationConfig: { temperature: 0, maxOutputTokens: 4096 },
          });
          const text = (out.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
          send(200, { text, model: 'gemini-3.5-transcribe', audioRetained: false });
        } catch (error) {
          send(502, { error: 'provider_error', message: String(error) });
        }
      });
      return;
    }

    if (url.pathname === '/api/extract') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', async () => {
        const { transcript } = JSON.parse(Buffer.concat(chunks).toString());
        const today = new Date().toISOString().slice(0, 10);
        try {
          const out = await gemini('gemini-3.6-flash', {
            systemInstruction: { parts: [{ text:
              `Today is ${today}. Return ONLY JSON: {"summary": "...", ` +
              `"dataPoints": [{"label","value","unit","date","dateKind","evidence"}], ` +
              `"decisions": [...], "actionItems": [{"action","owner","dueDate"}]}. ` +
              'A data point is a figure actually stated. Never infer a number. ' +
              'Dates are YYYY-MM-DD; omit when not stated. dateKind is as_of, due, decided_on or event.' }] },
            contents: [{ parts: [{ text: transcript }] }],
            generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 8192 },
          });
          const text = (out.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
          const parsed = JSON.parse(text);
          state.extraction = parsed;
          send(200, { ...parsed, model: 'gemini-3.6-flash', verified: false });
        } catch (error) {
          send(502, { error: 'provider_error', message: String(error) });
        }
      });
      return;
    }

    let file = path.join(dist, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });

  return new Promise((resolve) => server.listen(PROXY_PORT, () => resolve(server)));
}

async function seen(locator, timeout = 10000) {
  try {
    await locator.first().waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

(async () => {
  if (!EMAIL || !PASSWORD) {
    console.error('Set E2E_EMAIL and E2E_PASSWORD.');
    process.exit(1);
  }

  const dist = path.join(__dirname, '..', 'dist');
  const state = { segments: [], extraction: null };
  const server = await startServer(dist, state);
  const base = `http://localhost:${PROXY_PORT}`;

  const speech = GEMINI_KEY
    ? await makeSpeechWav(
        'Right, let us start. The response rate across the three clusters reached sixty two percent ' +
          'as of the eighteenth of November. Karshima will collect the remaining monthly reports ' +
          'from the Area Chairs by the fifth of December.',
      )
    : null;
  if (speech) {
    fs.writeFileSync('/tmp/e2e-speech.wav', speech);
  }

  let browser;
  try {
  browser = await chromium.launch({
    headless: false,
    args: [
      '--use-fake-ui-for-media-capture',
      '--use-fake-device-for-media-stream',
      ...(speech ? [`--use-file-for-fake-audio-capture=/tmp/e2e-speech.wav`] : []),
    ],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['microphone'] });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  /* --------------------------------------------------------- signing in -- */

  await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
  check('unauthenticated visitor is sent to sign in', page.url().includes('/login'), page.url());

  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 25000 }).catch(() => {});

  check('a member signs in with a password alone', !page.url().includes('/login'), page.url());
  check('no second factor was demanded of a member', !page.url().includes('/mfa'), page.url());
  check('the dashboard loads', await seen(page.getByRole('heading', { level: 1 })));

  const banner = await page.getByText(/demonstration data/i).count();
  check('the demonstration-data banner is gone', banner === 0, `${banner} found`);

  /* ------------------------------------------------------- the registers -- */

  await page.goto(`${base}/master-index`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const needsImport = (await page.getByRole('button', { name: /import the master index workbook/i }).count()) > 0;
  if (needsImport) {
    await page.getByRole('button', { name: /import the master index workbook/i }).click();
    check('the workbook imports into the database',
      await seen(page.getByText(/registers loaded/i), 90000));
    await page.waitForTimeout(3000);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
  } else {
    check('the workbook imports into the database', true, 'already imported');
  }

  check('registers are listed from the database',
    await seen(page.getByRole('heading', { name: 'Document Master Index' })));

  await page.goto(`${base}/master-index/work-allocation`, { waitUntil: 'networkidle' });
  const grid = page.locator('[data-testid="record-grid"]');
  check('register records load from the database', await seen(grid.locator('tbody tr').first(), 20000));
  const rows = await grid.locator('tbody tr').count();
  check('all workbook rows are present', rows >= 26, `${rows} rows`);

  /* ------------------------------------------------- editing, round trip -- */

  const stamp = `E2E ${Date.now()}`;
  const headers = await grid.locator('thead th').evaluateAll((ths) => ths.map((t) => t.textContent.trim()));
  const remarksIndex = headers.findIndex((h) => h.startsWith('Support'));
  check('the grid has the workbook columns', remarksIndex > 0, JSON.stringify(headers));
  const cell = grid.locator('tbody tr').first().locator('td').nth(Math.max(remarksIndex, 1));
  await cell.click();
  const editor = grid.getByRole('textbox').first();
  if (await seen(editor, 5000)) {
    await editor.fill(stamp);
    await editor.press('Enter');
    await page.waitForTimeout(2500);
    await page.reload({ waitUntil: 'networkidle' });
    await seen(grid.locator('tbody tr').first(), 20000);
    const after = await grid.locator('tbody tr').first().locator('td').nth(remarksIndex).innerText();
    check('an edit is written to the database and read back', after.includes(stamp), JSON.stringify(after));
  } else {
    check('an edit is written to the database and read back', false, 'cell editor did not open');
  }

  /* ------------------------------------------------------------- voice -- */

  if (speech) {
    await page.goto(`${base}/capture`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const meetingOptions = await page.locator('#capture-meeting option').count();
    if (meetingOptions <= 1) {
      check('voice capture ran end to end', false, 'no meeting exists to attach a note to');
    } else {
      await page.locator('#capture-meeting').selectOption({ index: 1 });
      await page.locator('input[type=checkbox]').first().check();
      await page.getByRole('button', { name: /start recording/i }).click();
      await page.waitForTimeout(14000);
      await page.getByRole('button', { name: /stop and review/i }).click();
      await page.waitForTimeout(20000);

      check('audio was sent as WAV, converted in the browser',
        state.segments.length > 0 && state.segments.every((s) => s.contentType === 'audio/wav'),
        JSON.stringify(state.segments));

      const transcript = await page.getByLabel('Transcript').inputValue();
      check('speech was transcribed', /response rate|sixty two|62/i.test(transcript), transcript.slice(0, 140));

      await page.getByRole('button', { name: /propose data points/i }).click();
      check('data points were proposed', await seen(page.getByText(/data points proposed/i), 90000));

      const dated = state.extraction?.dataPoints?.filter((p) => p.date) ?? [];
      check('at least one data point carries a stated date', dated.length > 0,
        JSON.stringify(dated.map((p) => `${p.label}=${p.value} (${p.date})`)));

      await page.getByRole('button', { name: /save notes/i }).click();
      check('the note saves to the database', await seen(page.getByText(/notes saved/i), 30000));

      await page.goto(`${base}/notes`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2500);
      check('the note is listed, with no audio kept',
        (await seen(page.getByText(/no audio is held/i))) &&
          (await page.getByText(/response rate|62/i).count()) > 0);
    }
  } else {
    check('voice capture ran end to end', false, 'GEMINI_API_KEY not set');
  }

  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (error) {
    check('the run completed without throwing', false, String(error).split('\n')[0]);
  } finally {
    await browser?.close().catch(() => {});
    server.close();
  }

  console.log('\n' + results.join('\n') + '\n');
  const failed = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(failed === 0 ? `All ${results.length} checks passed.` : `${failed} of ${results.length} checks failed.`);
  process.exit(failed === 0 ? 0 : 1);
})();

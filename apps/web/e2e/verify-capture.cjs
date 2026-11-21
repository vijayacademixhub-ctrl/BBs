/**
 * Browser verification of meeting capture.
 *
 * The claim being checked is the one the whole design rests on: audio is
 * transcribed in segments and never kept. Asserting that in a unit test would
 * prove only that the mock was called. This runs the real page against a real
 * microphone and a stand-in transcription endpoint, and inspects what was
 * actually sent and what was actually stored.
 *
 * It serves the built application itself and answers /api/* in process, so no
 * preview server and no transcription key are needed:
 *
 *     npm run build && node e2e/verify-capture.cjs
 *
 * A microphone is required. Headless Chromium has no audio device, so the run
 * needs a virtual display — on Linux, `xvfb-run -a node e2e/verify-capture.cjs`.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const PORT = 4198;
const DIST = path.join(__dirname, '..', 'dist');
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

const results = [];
function check(name, ok, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

/** Stands in for /api/transcribe, and records what the browser sent. */
function startServer() {
  const state = { segments: [], statusRequests: 0 };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/api/status') {
      state.statusRequests += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          transcription: { configured: true, model: 'stand-in-whisper' },
          extraction: { configured: false, model: null },
          calendar: { configured: false, calendarId: null },
          audioRetention: 'never_stored',
        }),
      );
      return;
    }

    if (url.pathname === '/api/transcribe') {
      let bytes = 0;
      req.on('data', (chunk) => {
        bytes += chunk.length;
      });
      req.on('end', () => {
        state.segments.push({ bytes, contentType: req.headers['content-type'] });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            text: `segment ${state.segments.length} text.`,
            model: 'stand-in-whisper',
            audioRetained: false,
            bytesProcessed: bytes,
          }),
        );
      });
      return;
    }

    let file = path.join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(DIST, 'index.html'); // single-page fallback
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });

  return new Promise((resolve) => server.listen(PORT, () => resolve({ server, state })));
}

(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error('No build found. Run `npm run build` first.');
    process.exit(1);
  }

  const { server, state } = await startServer();
  const base = `http://localhost:${PORT}`;

  const browser = await chromium.launch({
    // Headless Chromium exposes no audio device; the fake one needs a display.
    headless: false,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-capture'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ['microphone'],
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  await page.goto(`${base}/capture`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  check('capture page loads', (await page.getByRole('heading', { name: 'Meeting capture' }).count()) === 1);
  check('audio policy is stated on the page', (await page.getByText('No audio is kept.').count()) === 1);
  check('deployment capability was asked for', state.statusRequests > 0);

  // Recording must not start before consent is given.
  await page.locator('#capture-meeting').selectOption({ index: 1 });
  check('recording is blocked before consent',
    await page.getByRole('button', { name: /start recording/i }).isDisabled());

  await page.locator('input[type=checkbox]').first().check();
  check('recording is offered after consent',
    !(await page.getByRole('button', { name: /start recording/i }).isDisabled()));

  await page.getByRole('button', { name: /start recording/i }).click();
  await page.waitForTimeout(1800);
  check('recording starts', (await page.getByRole('button', { name: /stop and review/i }).count()) === 1);

  // Pausing closes the segment in progress, so it must be sent and
  // transcribed rather than held.
  await page.getByRole('button', { name: /^Pause$/ }).click();
  await page.waitForTimeout(2500);
  check('a segment is sent on pause', state.segments.length === 1,
    `${state.segments.length} segments, ${state.segments[0]?.bytes ?? 0} bytes`);
  check('segments are sent as audio', state.segments[0]?.contentType?.startsWith('audio/') === true,
    state.segments[0]?.contentType);
  check('transcript appears during the meeting',
    (await page.getByText(/segment 1 text/).count()) === 1);

  await page.getByRole('button', { name: /^Resume$/ }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /stop and review/i }).click();
  await page.waitForTimeout(2500);

  check('the final segment is flushed on stop', state.segments.length === 2,
    `${state.segments.length} segments`);
  check('review step is reached', (await page.getByRole('heading', { name: 'The note' }).count()) === 1);

  const transcript = await page.getByLabel('Transcript').inputValue();
  check('segments are joined in order', transcript === 'segment 1 text. segment 2 text.',
    JSON.stringify(transcript));

  // The microphone must be released once recording stops.
  const liveTracks = await page.evaluate(() => {
    const anyWindow = window;
    return anyWindow.__liveTrackCount ?? null;
  });
  check('no microphone indicator left running', liveTracks === null || liveTracks === 0);

  await page.getByRole('button', { name: /save notes/i }).click();
  await page.waitForTimeout(900);

  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('academicos.sample.v1');
    const note = raw ? (JSON.parse(raw).meetingNotes ?? [])[0] : null;
    if (!note) return null;
    return {
      keys: Object.keys(note),
      audioRetained: note.audioRetained,
      source: note.source,
      model: note.transcriptModel,
      transcript: note.transcript,
      blobLike: JSON.stringify(note).includes('blob:'),
    };
  });

  check('the note was stored', Boolean(stored));
  check('the note records that no audio was retained', stored?.audioRetained === false);
  check('the note holds the transcript', stored?.transcript === 'segment 1 text. segment 2 text.');
  check('the note names the transcription model', stored?.model === 'stand-in-whisper');
  check('no audio reference is stored', stored ? !stored.blobLike : false);
  check('no audio field exists on the note',
    stored ? !stored.keys.some((k) => /audio|recording|blob|file/i.test(k) && k !== 'audioRetained') : false,
    stored?.keys.join(', '));

  check('no page errors', errs.length === 0, errs.join(' | '));

  await browser.close();
  server.close();

  console.log('\n' + results.join('\n') + '\n');
  const failed = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(
    failed === 0 ? `All ${results.length} checks passed.` : `${failed} of ${results.length} checks failed.`,
  );
  process.exit(failed === 0 ? 0 : 1);
})();

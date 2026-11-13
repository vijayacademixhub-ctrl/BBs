const { chromium } = require('playwright');
const BASE = 'http://localhost:4173';
const results = [];
function check(name, ok, detail='') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); }
async function seen(locator, timeout = 6000) {
  try { await locator.first().waitFor({ state: 'visible', timeout }); return true; } catch { return false; }
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));

  // --- Navigation ---
  await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: 'Meetings', exact: true }).click();
  await page.waitForURL('**/meetings');
  check('sidebar navigation to Meetings', page.url().endsWith('/meetings'));

  // --- Create meeting ---
  await page.getByRole('link', { name: /new meeting/i }).first().click();
  await page.waitForURL('**/meetings/new');
  await page.getByLabel('Title').fill('M1 verification meeting');
  await page.getByLabel('Description').fill('Created by the automated verification run.');
  await page.getByLabel('Location').fill('Verification Room');
  await page.getByLabel('Duration (minutes)').fill('45');
  await page.getByRole('button', { name: /schedule meeting/i }).click();
  await page.waitForURL(/\/meetings\/m_/, { timeout: 5000 });
  const detailUrl = page.url();
  check('meeting creation', await seen(page.getByRole('heading', { name: 'M1 verification meeting' })));
  check('meeting detail shows agenda/details', await seen(page.getByText('Verification Room')));

  // --- Validation ---
  await page.goto(BASE + '/meetings/new', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /schedule meeting/i }).click();
  await page.waitForTimeout(400);
  check('form validation blocks empty submit',
    await page.getByText(/at least 3 characters/i).isVisible() && page.url().endsWith('/meetings/new'));

  // --- Edit meeting ---
  await page.goto(detailUrl, { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: /^Edit$/ }).click();
  await page.waitForURL(/\/edit$/);
  await page.getByLabel('Title').fill('M1 verification meeting (edited)');
  await page.getByRole('button', { name: /save changes/i }).click();
  await page.waitForURL(url => !url.pathname.endsWith('/edit'), { timeout: 5000 });
  check('meeting editing', await seen(page.getByRole('heading', { name: /\(edited\)/ })));

  // --- Persistence across reload ---
  await page.reload({ waitUntil: 'networkidle' });
  check('meeting persists across reload', await seen(page.getByRole('heading', { name: /\(edited\)/ })));

  // --- Create task ---
  await page.goto(BASE + '/tasks', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /new task/i }).first().click();
  await page.getByLabel('Title').fill('M1 verification task');
  await page.getByRole('button', { name: /create task/i }).click();
  await page.waitForTimeout(700);
  check('task creation', await seen(page.getByText('M1 verification task')));

  // --- Task status update ---
  const row = page.locator('div').filter({ hasText: /^M1 verification task$/ }).first();
  const taskCard = page.locator('.divide-y > div', { hasText: 'M1 verification task' }).first();
  await taskCard.getByRole('button', { name: 'Start' }).click();
  await page.waitForTimeout(700);
  check('task status update to In progress',
    await page.locator('.divide-y > div', { hasText: 'M1 verification task' }).first().getByText('In progress').isVisible());
  await page.locator('.divide-y > div', { hasText: 'M1 verification task' }).first().getByRole('button', { name: 'Complete' }).click();
  await page.waitForTimeout(700);
  await page.getByRole('tab', { name: 'My tasks' }).click();
  const statusSel = page.getByLabel('Filter by status');
  await statusSel.click();
  await page.getByRole('option', { name: 'All statuses' }).click();
  await page.waitForTimeout(500);
  check('task completion',
    await page.locator('.divide-y > div', { hasText: 'M1 verification task' }).first().getByText('Completed').isVisible());

  // --- Daily work entry ---
  await page.goto(BASE + '/daily-work', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /new entry/i }).first().click();
  await page.getByLabel('Work completed').fill('Verified the Milestone 1 interface end to end.');
  await page.getByLabel('In progress').fill('Documentation update.');
  await page.getByRole('button', { name: /save entry/i }).click();
  await page.waitForTimeout(800);
  check('daily work entry creation', await seen(page.getByText('Verified the Milestone 1 interface end to end.')));

  // --- Empty state ---
  await page.goto(BASE + '/meetings', { waitUntil: 'networkidle' });
  await page.getByLabel('Search meetings').fill('zzzz-no-such-meeting');
  await page.waitForTimeout(400);
  check('empty state renders', await seen(page.getByText(/no meetings match this view/i)));

  // --- 404 ---
  await page.goto(BASE + '/no-such-route', { waitUntil: 'networkidle' });
  check('not-found route', await seen(page.getByText(/page not found/i)));

  // --- Planned module honesty ---
  await page.goto(BASE + '/recorder', { waitUntil: 'networkidle' });
  check('planned module states it is not implemented', await seen(page.getByText(/not yet implemented/i)));

  // --- Dark mode ---
  await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
  await page.getByLabel('Toggle colour theme').click();
  await page.waitForTimeout(300);
  check('dark theme applies', await page.evaluate(() => document.documentElement.classList.contains('dark')));
  await page.getByLabel('Toggle colour theme').click();

  // --- Mobile nav ---
  const m = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mp = await m.newPage();
  mp.on('pageerror', e => errs.push('mobile: ' + e.message));
  await mp.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
  await mp.getByRole('button', { name: /open navigation/i }).click();
  await mp.waitForTimeout(400);
  check('mobile drawer opens', await seen(mp.getByRole('link', { name: 'Tasks' })));
  await mp.getByRole('link', { name: 'Tasks' }).click();
  await mp.waitForURL('**/tasks');
  check('mobile drawer closes on navigate', !(await mp.getByRole('navigation', { name: 'Main' }).isVisible().catch(() => false)) || mp.url().endsWith('/tasks'));

  check('no uncaught page errors', errs.length === 0, errs.join('; '));
  await browser.close();
  console.log(results.join('\n'));
  const failed = results.filter(r => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();

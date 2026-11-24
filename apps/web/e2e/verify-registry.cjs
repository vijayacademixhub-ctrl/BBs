/**
 * Browser verification of the Master Index module.
 *
 * Drives the real interface rather than testing components in isolation,
 * because the claims worth checking are end-to-end ones: that an edit in the
 * grid persists, that a column added at runtime appears in the grid, and that
 * the separate window is a real window showing the same register.
 *
 * Requires `npm run preview` on port 4173.
 */
const { chromium } = require('playwright');

const BASE = 'http://localhost:4173';
const results = [];

function check(name, ok, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

async function seen(locator, timeout = 6000) {
  try {
    await locator.first().waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  /* ------------------------------------------------------------- the hub -- */

  await page.goto(BASE + '/master-index', { waitUntil: 'networkidle' });
  check('hub reachable', await seen(page.getByRole('heading', { name: 'Master Index', level: 1 })));

  // The index itself must not be on this page: the hub shows modules.
  await page.getByRole('heading', { name: 'Document Master Index' }).first().waitFor({ timeout: 8000 });
  const gridOnHub = await page.locator('table').count();
  check('hub does not display the index itself', gridOnHub === 0, `${gridOnHub} tables found`);

  check('document register card shown',
    await seen(page.getByRole('heading', { name: 'Document Master Index' })));
  check('work allocation card shown',
    await seen(page.getByRole('heading', { name: 'Work Allocation' })));
  check('registers section rendered',
    await seen(page.getByRole('heading', { name: 'Registers', level: 2 })));
  check('group shown on each card', await seen(page.getByText('Governance').first()));

  /* -------------------------------------------------------- cross search -- */

  await page.getByRole('textbox', { name: 'Search every register' }).fill('Admission');
  await page.waitForTimeout(400);
  const hits = await page.locator('mark').count();
  check('cross-register search finds matches', hits > 0, `${hits} highlighted matches`);
  await page.getByRole('textbox', { name: 'Search every register' }).fill('');

  /* --------------------------------------------------------- the register -- */

  await page.getByRole('link', { name: 'Document Master Index' }).first().click();
  await page.waitForURL('**/master-index/documents');
  check('register opens', await seen(page.getByRole('heading', { name: 'Document Master Index', level: 1 })));

  const grid = page.locator('[data-testid="record-grid"]');
  await grid.locator('tbody tr').first().waitFor({ state: 'visible', timeout: 8000 });
  const rowCount = await grid.locator('tbody tr').count();
  check('workbook records imported', rowCount >= 30, `${rowCount} rows`);

  check('drive hyperlinks carried over',
    await seen(page.locator('a[href*="drive.google.com"]').first()));

  /* ------------------------------------------------------- inline editing -- */

  // Owner column on the first row: click, type, commit with Enter.
  const ownerHeader = page.getByRole('button', { name: /^Owner$/ });
  check('sortable column headers', await seen(ownerHeader));

  const firstRow = grid.locator('tbody tr').first();
  const ownerCell = firstRow.locator('td').nth(
    await grid.locator('thead th').evaluateAll((ths) =>
      ths.findIndex((th) => th.textContent.trim().startsWith('Owner')),
    ),
  );
  await ownerCell.click();
  const ownerInput = grid.getByRole('textbox', { name: 'Owner' });
  if (await seen(ownerInput, 3000)) {
    await ownerInput.fill('Verification Owner');
    await ownerInput.press('Enter');
    await page.waitForTimeout(900);
    const committed = await ownerCell.innerText();
    check('inline edit commits', committed.includes('Verification Owner'), `cell reads ${JSON.stringify(committed)}`);

    await page.reload({ waitUntil: 'networkidle' });
    await grid.locator('tbody tr').first().waitFor({ state: 'visible', timeout: 8000 });
    const afterReload = await ownerCell.innerText();
    check('inline edit persists a reload', afterReload.includes('Verification Owner'), `cell reads ${JSON.stringify(afterReload)}`);
  } else {
    check('inline edit commits', false, 'cell editor did not open');
    check('inline edit persists a reload', false, 'skipped');
  }

  check('change history records the edit',
    await (async () => {
      await page.goto(BASE + '/master-index', { waitUntil: 'networkidle' });
      return seen(page.getByText(/Verification Owner/).first(), 4000);
    })());

  /* ------------------------------------------------------- adding a column -- */

  await page.goto(BASE + '/master-index/documents', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /columns/i }).click();
  check('column manager opens', await seen(page.getByRole('heading', { name: /Columns in/i })));
  await page.getByRole('textbox', { name: 'New column' }).fill('Approval');
  await page.getByRole('combobox', { name: 'Type' }).selectOption('select');
  await page.getByRole('textbox', { name: 'Choices' }).fill('Pending, Approved');
  await page.getByRole('button', { name: /^Add column$/ }).click();
  await page.waitForTimeout(700);
  check('column added', await seen(page.getByText('Added the Approval column')));

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('added column appears in the grid',
    await seen(page.getByRole('button', { name: /^Approval$/ })));

  check('workbook columns are protected from deletion', await (async () => {
    await page.getByRole('button', { name: /columns/i }).click();
    await seen(page.getByRole('heading', { name: /Columns in/i }));
    const rows = page.locator('li', { hasText: 'Owner' }).first();
    const deleteButton = rows.getByRole('button', { name: /remove column/i });
    const disabled = await deleteButton.isDisabled().catch(() => false);
    await page.keyboard.press('Escape');
    return disabled;
  })());

  /* --------------------------------------------------------- adding a record -- */

  await page.goto(BASE + '/master-index/documents', { waitUntil: 'networkidle' });
  const gridAgain = page.locator('[data-testid="record-grid"]');
  await gridAgain.locator('tbody tr').first().waitFor({ state: 'visible', timeout: 8000 });
  const before = await gridAgain.locator('tbody tr').count();
  await page.getByRole('button', { name: /add record/i }).first().click();
  check('record dialog opens', await seen(page.getByRole('heading', { name: /New document master index record/i })));
  await page.getByRole('textbox', { name: 'Document', exact: true }).fill('Verification test document');
  await page.getByRole('button', { name: /^Add record$/ }).click();
  await page.waitForTimeout(800);
  const after = await gridAgain.locator('tbody tr').count();
  check('record added', after === before + 1, `${before} → ${after}`);

  /* ------------------------------------------------------------ filtering -- */

  await page.getByRole('textbox', { name: 'Search this register' }).fill('Verification test');
  await page.waitForTimeout(400);
  check('in-register search filters', (await gridAgain.locator('tbody tr').count()) === 1);
  await page.getByRole('textbox', { name: 'Search this register' }).fill('');

  await page.getByRole('button', { name: /incomplete only/i }).click();
  await page.waitForTimeout(400);
  const incomplete = await gridAgain.locator('tbody tr').count();
  check('incomplete filter works', incomplete > 0 && incomplete < after, `${incomplete} rows`);
  await page.getByRole('button', { name: /incomplete only/i }).click();

  /* ------------------------------------------------------ separate window -- */

  const [popup] = await Promise.all([
    ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null),
    page.getByRole('button', { name: /separate window/i }).first().click(),
  ]);

  if (popup) {
    await popup.waitForLoadState('networkidle');
    check('separate window opens', popup.url().includes('/w/master-index/documents'), popup.url());
    check('separate window shows the register',
      await seen(popup.getByRole('heading', { name: 'Document Master Index', level: 1 })));
    check('separate window has no application sidebar',
      (await popup.getByRole('link', { name: 'Daily Work' }).count()) === 0);
    check('separate window is editable',
      await seen(popup.getByRole('button', { name: /add record/i })));
    check('separate window shares the same data',
      await seen(popup.getByText('Verification test document')));
    await popup.close();
  } else {
    check('separate window opens', false, 'no popup event');
  }

  /* --------------------------------------------------------------- export -- */

  const download = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
    page.getByRole('button', { name: /export/i }).first().click(),
  ]).then(([d]) => d);
  check('CSV export downloads', Boolean(download), download ? download.suggestedFilename() : 'no download');

  /* ------------------------------------------------------------ dashboard -- */

  await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
  check('dashboard reflects the registers',
    await seen(page.getByRole('heading', { name: /master index/i })));

  check('no page errors', errs.length === 0, errs.join(' | '));

  await browser.close();

  console.log('\n' + results.join('\n') + '\n');
  const failed = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(failed === 0 ? `All ${results.length} checks passed.` : `${failed} of ${results.length} checks failed.`);
  process.exit(failed === 0 ? 0 : 1);
})();

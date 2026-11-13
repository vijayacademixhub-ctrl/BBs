/**
 * Milestone 2 interface checks.
 *
 * Runs against the production build in sample mode (no backend configured).
 * Verifies that the application is honest about that state rather than
 * presenting a working sign-in, and that the shell still functions.
 *
 * The database-side guarantees are not checked here; they are covered by the
 * PostgreSQL suite (npm run test:db), which is where they belong.
 */
const { chromium } = require('playwright')
const BASE = 'http://localhost:4173'
const results = []
const check = (name, ok, detail = '') =>
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
const seen = async (locator, timeout = 6000) => {
  try {
    await locator.first().waitFor({ state: 'visible', timeout })
    return true
  } catch {
    return false
  }
}

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))

  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  check('login page renders', await seen(page.getByRole('heading', { name: 'Sign in' })))
  check(
    'login page states that no backend is configured rather than offering a fake sign-in',
    await seen(page.getByText(/no backend is configured/i)),
  )
  check(
    'login page states there is no self-registration',
    await seen(page.getByText(/no self-registration/i)),
  )

  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForTimeout(400)
  check(
    'empty sign-in is refused by validation',
    await seen(page.getByText(/enter your email address/i)),
  )

  await page.getByLabel('Email address').fill('someone@example.ac.in')
  await page.getByLabel('Password').fill('whatever')
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForTimeout(600)
  check(
    'sign-in attempt with no backend reports the truth and does not succeed',
    (await seen(page.getByRole('alert'))) && page.url().includes('/login'),
  )

  await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' })
  check('dashboard still reachable in sample mode', await seen(page.getByText(/good day|dashboard/i)))
  check(
    'demonstration data is still labelled',
    await seen(page.getByText(/demonstration data/i)),
  )

  await page.goto(BASE + '/admin/system', { waitUntil: 'networkidle' })
  check('role-gated admin route renders for the sample Super Admin', await seen(page.getByText(/system status/i)))

  check('no uncaught page errors', errs.length === 0, errs.join('; '))

  await browser.close()
  console.log(results.join('\n'))
  const failed = results.filter((r) => r.startsWith('FAIL')).length
  console.log(`\n${results.length - failed}/${results.length} checks passed`)
  process.exit(failed ? 1 : 0)
})()

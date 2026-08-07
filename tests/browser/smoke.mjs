/**
 * Browser smoke test: the flows that jsdom cannot judge.
 *
 * Three bugs in this app were invisible to the unit suite — pointer capture
 * swallowing a click, history/popstate closing a sheet the instant it opened, and
 * effect double-invocation under StrictMode. All three needed a real engine with
 * real event and history semantics.
 *
 * It runs against the DEV server on purpose: StrictMode only double-invokes effects
 * in development, and that is precisely where this class of bug appears.
 *
 * Everything waits on a condition rather than on a timer. A fixed sleep passes on a
 * fast laptop and fails on a loaded CI runner, which tells you nothing about the app.
 *
 *   npm run test:browser
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const PORT = Number(process.env.SMOKE_PORT ?? 4181)
/**
 * 127.0.0.1 rather than localhost, on both ends. localhost can resolve to ::1 while
 * the server listens on IPv4 only (or the reverse), and the failure looks exactly
 * like a server that never started.
 */
const HOST = '127.0.0.1'
const APP_URL = `http://${HOST}:${PORT}/`
/** Generous, because this only bounds a failure — a pass never waits this long. */
const TIMEOUT = 15_000

// The local binary, not npx: npx resolution can reach for the network, and in CI
// that turns a missing dev server into a mystery.
const viteBin = fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url))
const server = spawn(process.execPath, [viteBin, '--host', HOST, '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverLog = ''
server.stdout.on('data', (d) => (serverLog += d))
server.stderr.on('data', (d) => (serverLog += d))

const stopServer = () => {
  if (!server.killed) server.kill('SIGTERM')
}
process.on('exit', stopServer)
process.on('SIGINT', () => {
  stopServer()
  process.exit(130)
})

async function waitForServer(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs
  let lastError = ''
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`dev server exited with code ${server.exitCode}\n${serverLog}`)
    }
    try {
      const res = await fetch(APP_URL)
      if (res.ok) {
        console.log(`dev server ready on ${APP_URL}`)
        return
      }
      lastError = `HTTP ${res.status}`
    } catch (e) {
      lastError = e.message
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(
    `dev server did not answer on ${APP_URL} within ${timeoutMs / 1000}s (last error: ${lastError})\n` +
      `--- server output ---\n${serverLog || '(nothing)'}`,
  )
}

const results = []
const consoleErrors = []

const expect = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

async function check(what, fn) {
  try {
    await fn()
    results.push({ ok: true, what })
    console.log(`  ok    ${what}`)
  } catch (e) {
    results.push({ ok: false, what, why: e.message })
    console.log(`  FAIL  ${what}`)
    for (const line of e.message.split('\n').slice(0, 6)) console.log(`        ${line}`)
  }
}

await waitForServer()

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(`console: ${m.text()}`)
})

const sheet = page.locator('[role="dialog"]')
/** Waits for the sheet to be on screen, not merely in the DOM. */
const sheetVisible = () => sheet.first().waitFor({ state: 'visible', timeout: TIMEOUT })
const sheetGone = () => sheet.first().waitFor({ state: 'detached', timeout: TIMEOUT })
const seen = (locator) => locator.first().waitFor({ state: 'visible', timeout: TIMEOUT })

/** Dismisses the cold-start add sheet, which opens when nothing is logged today. */
async function dismissAnySheet() {
  if (await sheet.count()) {
    await page.locator('.sheet-backdrop').first().click()
    await sheetGone()
  }
}

console.log(`\nbrowser smoke test against ${APP_URL}\n`)

await page.goto(APP_URL, { waitUntil: 'networkidle' })
// The FAB only renders once the store has finished reading IndexedDB.
await seen(page.getByRole('button', { name: 'Add expense' }))
await dismissAnySheet()

await check('the add sheet opens from the floating button', async () => {
  await page.getByRole('button', { name: 'Add expense' }).click()
  await sheetVisible()
})

await check('amount, category and Save logs an expense without navigating away', async () => {
  await page.getByRole('button', { name: '1', exact: true }).click()
  await page.getByRole('button', { name: '2', exact: true }).click()
  await page.getByRole('radio', { name: /Groceries/ }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  // The inline confirmation clears itself after 1.5s, so wait on it directly.
  await seen(page.getByText(/^Saved €12$/))
  expect((await sheet.count()) === 1, 'the sheet closed itself instead of staying open')
})

// The close button sits inside the drag zone; capturing the pointer there used to
// swallow its click entirely.
await check('the close icon dismisses the sheet', async () => {
  await page.getByRole('button', { name: 'Close' }).click()
  await sheetGone()
})

await check('the expense reaches the Home list', async () => {
  await seen(page.locator('.expense-row').filter({ hasText: 'Groceries' }))
  await seen(page.getByText('€12').first())
})

await check('a row opens the edit sheet, which offers Delete', async () => {
  await page.locator('.expense-row').first().click()
  await sheetVisible()
  await seen(page.getByRole('button', { name: 'Delete expense' }))
})

await check('Escape closes the edit sheet', async () => {
  await page.keyboard.press('Escape')
  await sheetGone()
})

// The point of the history integration: back closes the sheet, not the app.
await check('the back gesture closes the sheet and stays in the app', async () => {
  await page.locator('.expense-row').first().click()
  await sheetVisible()
  await page.goBack()
  await sheetGone()
  await seen(page.getByRole('button', { name: 'Add expense' }))
})

// Tabs are a flat switcher, so they replace the history entry instead of stacking.
// Otherwise Android's back button would have to walk through every tab visited
// before it could leave the app.
await check('switching tabs does not pile up history entries', async () => {
  const before = await page.evaluate(() => history.length)
  for (const tab of ['History', 'Insights', 'Settings', 'Today', 'History']) {
    await page.getByRole('button', { name: tab }).click()
    await seen(page.getByRole('button', { name: tab }))
  }
  const after = await page.evaluate(() => history.length)
  expect(after === before, `history grew from ${before} to ${after} across five tab switches`)
})

await page.getByRole('button', { name: 'Settings' }).click()
await seen(page.locator('.cat-main').first())

// StrictMode's double-invoked effect used to pop the shared history entry, and the
// popstate that came back closed this in the frame it opened.
await check('a category row opens the editor, and it stays open', async () => {
  await page.locator('.cat-main').first().click()
  await sheetVisible()
  await seen(page.getByRole('button', { name: 'Save changes' }))
  // Still there a moment later: an overlay that dismisses itself is the bug.
  await page.waitForTimeout(500)
  expect((await sheet.count()) === 1, 'the editor closed itself')
})

await check('the colour swatch is inside the tap target', async () => {
  await page.keyboard.press('Escape')
  await sheetGone()
  await page.locator('.cat-swatch').first().click()
  await sheetVisible()
  await page.keyboard.press('Escape')
  await sheetGone()
})

await check('setting a cap turns on the Home meter with the right figure', async () => {
  await page.locator('.cat-main').first().click()
  await sheetVisible()
  await page.getByLabel(/Monthly cap/).fill('100')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await sheetGone()

  await page.getByRole('button', { name: 'Today' }).click()
  const meter = page.getByRole('progressbar')
  await seen(meter)
  // €100 cap against the €12 logged above.
  await seen(page.getByText('€88 left'))
})

await page.getByRole('button', { name: 'Settings' }).click()
await seen(page.getByRole('button', { name: 'Delete all data' }))

await check('the delete-everything confirmation opens and stays open', async () => {
  await page.getByRole('button', { name: 'Delete all data' }).click()
  await sheetVisible()
  const keep = page.getByRole('button', { name: 'Keep my data' })
  await seen(keep)
  await keep.click()
  await sheetGone()
})

await check('Insights draws its charts and switches one to a table', async () => {
  await page.getByRole('button', { name: 'Insights' }).click()
  const frame = page.getByRole('region', { name: 'Where it went' })
  await seen(frame)
  await frame.getByRole('button', { name: 'Table' }).click()
  await seen(frame.getByRole('table'))
})

await check('data survives a reload', async () => {
  await page.goto(APP_URL, { waitUntil: 'networkidle' })
  await seen(page.getByRole('button', { name: 'Add expense' }))
  await dismissAnySheet()
  await seen(page.locator('.expense-row').filter({ hasText: 'Groceries' }))
})

await check('nothing was logged to the console', () => {
  expect(consoleErrors.length === 0, consoleErrors.join('\n'))
})

await browser.close()
stopServer()

const failed = results.filter((r) => !r.ok)
if (failed.length) {
  console.log('\nfailures:')
  for (const f of failed) console.log(`  ${f.what}\n    ${f.why.split('\n')[0]}`)
}
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)

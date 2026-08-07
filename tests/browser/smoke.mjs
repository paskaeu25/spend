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
 *   npm run test:browser
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const PORT = 4181
const URL = `http://localhost:${PORT}/`

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
})
const stopServer = () => {
  if (!server.killed) server.kill('SIGTERM')
}
process.on('exit', stopServer)
process.on('SIGINT', () => {
  stopServer()
  process.exit(130)
})

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(URL)
      if (res.ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`dev server did not come up on ${URL}`)
}

const results = []
let currentErrors = []

const expect = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

async function check(what, fn) {
  try {
    await fn()
    results.push({ ok: true, what })
    console.log(`  ok    ${what}`)
  } catch (e) {
    results.push({ ok: false, what, why: e.message.split('\n')[0] })
    console.log(`  FAIL  ${what}\n        ${e.message.split('\n')[0]}`)
  }
}

await waitForServer()

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('pageerror', (e) => currentErrors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') currentErrors.push(`console: ${m.text()}`)
})

const dialogs = () => page.locator('[role="dialog"]').count()

console.log(`\nbrowser smoke test against ${URL}\n`)

await page.goto(URL, { waitUntil: 'networkidle' })
if (await dialogs()) {
  await page.locator('.sheet-backdrop').click()
  await page.waitForTimeout(300)
}

await check('the add sheet opens from the floating button', async () => {
  await page.getByRole('button', { name: 'Add expense' }).click()
  await page.waitForTimeout(400)
  expect((await dialogs()) === 1, 'no dialog appeared')
})

await check('amount, category and Save logs an expense without navigating away', async () => {
  await page.getByRole('button', { name: '1', exact: true }).click()
  await page.getByRole('button', { name: '2', exact: true }).click()
  await page.getByRole('radio', { name: /Groceries/ }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.waitForTimeout(300)
  expect(await page.getByText('Saved €12').first().isVisible(), 'no inline confirmation')
  expect((await dialogs()) === 1, 'the sheet closed itself')
})

// The close button sits inside the drag zone; capturing the pointer there used to
// swallow its click entirely.
await check('the close icon dismisses the sheet', async () => {
  await page.getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(400)
  expect((await dialogs()) === 0, 'sheet is still open')
})

await check('the expense reaches the Home list', async () => {
  expect(await page.getByText('€12').first().isVisible(), 'no row on Home')
})

await check('a row opens the edit sheet, which offers Delete', async () => {
  await page.locator('.expense-row').first().click()
  await page.waitForTimeout(400)
  expect((await dialogs()) === 1, 'edit sheet did not open')
  expect(await page.getByRole('button', { name: 'Delete expense' }).isVisible(), 'no Delete button')
})

await check('Escape closes the edit sheet', async () => {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  expect((await dialogs()) === 0, 'sheet is still open')
})

// The point of the history integration: back closes the sheet, not the app.
await check('the back gesture closes the sheet and stays in the app', async () => {
  await page.locator('.expense-row').first().click()
  await page.waitForTimeout(400)
  expect((await dialogs()) === 1, 'sheet did not open')
  await page.goBack()
  await page.waitForTimeout(400)
  expect((await dialogs()) === 0, 'back did not close the sheet')
  expect(await page.getByRole('button', { name: 'Add expense' }).isVisible(), 'back left the app')
})

// Tabs are a flat switcher, so they replace the history entry instead of stacking.
// Otherwise Android's back button would have to walk through every tab visited
// before it could leave the app.
await check('switching tabs does not pile up history entries', async () => {
  const before = await page.evaluate(() => history.length)
  for (const tab of ['History', 'Insights', 'Settings', 'Today', 'History']) {
    await page.getByRole('button', { name: tab }).click()
    await page.waitForTimeout(120)
  }
  const after = await page.evaluate(() => history.length)
  expect(after === before, `history grew from ${before} to ${after} across five tab switches`)
})

await page.getByRole('button', { name: 'Settings' }).click()
await page.waitForTimeout(300)

// StrictMode's double-invoked effect used to pop the shared history entry, and the
// popstate that came back closed this in the frame it opened.
await check('a category row opens the editor, and it stays open', async () => {
  await page.locator('.cat-main').first().click()
  await page.waitForTimeout(600)
  expect((await dialogs()) === 1, 'editor did not open, or closed itself')
  expect(await page.getByRole('button', { name: 'Save changes' }).isVisible(), 'editor not usable')
})

await check('the colour swatch is inside the tap target', async () => {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await page.locator('.cat-swatch').first().click()
  await page.waitForTimeout(500)
  expect((await dialogs()) === 1, 'clicking the swatch did nothing')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
})

await check('setting a cap turns on the Home meter with the right figure', async () => {
  await page.locator('.cat-main').first().click()
  await page.waitForTimeout(400)
  await page.getByLabel(/Monthly cap/).fill('100')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Today' }).click()
  await page.waitForTimeout(400)
  expect(await page.getByRole('progressbar').isVisible(), 'no meter')
  expect(await page.getByText('€88 left').isVisible(), 'remaining figure is wrong')
})

await page.getByRole('button', { name: 'Settings' }).click()
await page.waitForTimeout(300)

await check('the delete-everything confirmation opens and stays open', async () => {
  await page.getByRole('button', { name: 'Delete all data' }).click()
  await page.waitForTimeout(600)
  expect((await dialogs()) === 1, 'confirmation did not open')
  await page.getByRole('button', { name: 'Keep my data' }).click()
  await page.waitForTimeout(400)
  expect((await dialogs()) === 0, 'confirmation did not close')
})

await check('Insights draws its charts and switches one to a table', async () => {
  await page.getByRole('button', { name: 'Insights' }).click()
  await page.waitForTimeout(400)
  const frame = page.getByRole('region', { name: 'Where it went' })
  expect(await frame.isVisible(), 'no category breakdown')
  await frame.getByRole('button', { name: 'Table' }).click()
  await page.waitForTimeout(200)
  expect(await frame.getByRole('table').isVisible(), 'table view is empty')
})

await check('data survives a reload', async () => {
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  if (await dialogs()) {
    await page.locator('.sheet-backdrop').click()
    await page.waitForTimeout(300)
  }
  expect(await page.getByText('€12').first().isVisible(), 'the expense did not come back')
})

await check('nothing was logged to the console', () => {
  expect(currentErrors.length === 0, currentErrors.join(' | '))
})

await browser.close()
stopServer()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)

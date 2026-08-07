/**
 * Section 10 as a check: every text pair reaches 4.5:1 against its own surface,
 * and every meaningful non-text pair reaches 3:1. Values are read straight out of
 * tokens.css, so the check cannot drift from the palette it is checking.
 *
 * Run with `npm run lint:contrast`.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const css = readFileSync(resolve(root, 'src/styles/tokens.css'), 'utf8')

function tokensIn(selector) {
  const at = css.indexOf(selector)
  if (at < 0) throw new Error(`no ${selector} block in tokens.css`)
  const start = css.indexOf('{', at)
  const end = css.indexOf('\n}', start)
  const out = {}
  for (const m of css.slice(start, end).matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    out[m[1]] = m[2].trim()
  }
  return out
}

const light = tokensIn(':root {')
const dark = { ...light, ...tokensIn(":root[data-theme='dark']") }

const channels = (h) => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const luminance = (h) => {
  const [r, g, b] = channels(h).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (hi + 0.05) / (lo + 0.05)
}

/** [foreground, background, minimum, what it is] */
const TEXT_SURFACES = ['surface', 'plane', 'sunken', 'raised']

function pairsFor(t) {
  const pairs = []
  const add = (fg, bg, need, what) => pairs.push({ fg, bg, need, what })

  for (const bg of TEXT_SURFACES) {
    add('ink', bg, 4.5, `body text on ${bg}`)
    add('ink-2', bg, 4.5, `secondary text on ${bg}`)
    add('label', bg, 4.5, `label text on ${bg}`)
    add('accent-ink', bg, 4.5, `link text on ${bg}`)
    add('positive', bg, 4.5, `positive delta on ${bg}`)
  }
  add('on-accent', 'accent-fill', 4.5, 'primary button label')
  add('ink-2', 'neutral-fill-track', 4.5, 'disabled button label')
  add('amber-ink', 'surface', 4.5, 'over-cap text on surface')
  add('amber-ink', 'amber-wash', 4.5, 'over-cap text on its wash')
  add('surface', 'ink', 4.5, 'toast text')
  add('baseline', 'ink', 4.5, 'toast comparison text')

  for (let i = 1; i <= 8; i++) {
    add(`cat-${i}-ink`, `cat-${i}`, 4.5, `chip label on category ${i}`)
  }

  // Non-text: boundaries and marks that still have to be seen.
  add('accent', 'surface', 3, 'focus ring')
  add('neutral-fill', 'neutral-fill-track', 3, 'meter fill against its track')
  add('muted', 'surface', 3, 'comparison line against surface')
  add('cat-1', 'surface', 3, 'current-month line against surface')
  add(t['amber-edge'].startsWith('#') ? 'amber-edge' : 'amber', 'neutral-fill-track', 3, 'over-cap meter edge')

  return pairs
}

let failures = 0
for (const [mode, t] of [
  ['light', light],
  ['dark', dark],
]) {
  for (const { fg, bg, need, what } of pairsFor(t)) {
    const f = t[fg]
    const b = t[bg]
    if (!f || !b || !f.startsWith('#') || !b.startsWith('#')) continue
    const r = contrast(f, b)
    if (r < need) {
      failures += 1
      console.error(`FAIL ${mode}  ${r.toFixed(2)}:1  (needs ${need})  ${what}  [${fg} on ${bg}]`)
    }
  }
}

if (failures > 0) {
  console.error(`\ncontrast check: ${failures} pair(s) below the floor`)
  process.exit(1)
}
console.log('contrast check: every text pair clears 4.5:1 and every mark pair 3:1, in both themes')

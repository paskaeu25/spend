/**
 * Renders every icon the app needs — web and Android — from one inline SVG mark.
 * Run with `npm run icons` after changing the mark. Output is committed, so a normal
 * build needs no image tooling.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const webIcons = resolve(here, '../public/icons')
const androidRes = resolve(here, '../android/app/src/main/res')

const BLUE = '#2a78d6'
const PAGE = '#f9f9f7'

/**
 * Three descending bars — the same rank-and-magnitude idea as the category chart.
 * `inset` shrinks the mark for the maskable and adaptive safe zones; `bg` null
 * leaves it transparent, which is what an adaptive foreground layer needs.
 */
function markSvg({ size, bg, inset = 0.18, radius = 0.22, shape = 'squircle', barColor = '#ffffff' }) {
  const s = size
  const pad = s * inset
  const innerW = s - pad * 2
  const barH = innerW * 0.155
  const gap = innerW * 0.115
  const totalH = barH * 3 + gap * 2
  const top = (s - totalH) / 2
  const widths = [1, 0.72, 0.44]

  const bars = widths
    .map((w, i) => {
      const y = top + i * (barH + gap)
      return `<rect x="${pad}" y="${y}" width="${innerW * w}" height="${barH}" rx="${barH / 2}" fill="${barColor}"/>`
    })
    .join('')

  let background = ''
  if (bg) {
    background =
      shape === 'circle'
        ? `<circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}" fill="${bg}"/>`
        : `<rect width="${s}" height="${s}" rx="${s * radius}" fill="${bg}"/>`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  ${background}
  ${bars}
</svg>`
}

async function png(dir, name, svg, size) {
  const buffer = await sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer()
  await writeFile(resolve(dir, name), buffer)
}

/* ---------- Web / PWA ---------- */

await mkdir(webIcons, { recursive: true })
await png(webIcons, 'icon-192.png', markSvg({ size: 192, bg: BLUE }), 192)
await png(webIcons, 'icon-512.png', markSvg({ size: 512, bg: BLUE }), 512)
// Maskable art must survive a circular crop, so the mark sits well inside.
await png(webIcons, 'maskable-512.png', markSvg({ size: 512, bg: BLUE, inset: 0.3, radius: 0 }), 512)
// iOS applies its own rounding and does not composite transparency.
await png(webIcons, 'apple-touch-icon.png', markSvg({ size: 180, bg: BLUE, radius: 0 }), 180)
await png(webIcons, 'favicon-32.png', markSvg({ size: 32, bg: BLUE, inset: 0.16 }), 32)
await writeFile(resolve(webIcons, 'icon.svg'), markSvg({ size: 512, bg: BLUE }))
console.log('web icons written to public/icons')

/* ---------- Android ---------- */

if (!existsSync(androidRes)) {
  console.log('android project not present, skipping its resources')
  process.exit(0)
}

/** Legacy launcher icon, and the pre-masked round variant older launchers use. */
const LAUNCHER = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
/** Adaptive layers are 108dp; only the central 72dp is guaranteed visible. */
const FOREGROUND = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 }

for (const [density, size] of Object.entries(LAUNCHER)) {
  const dir = resolve(androidRes, `mipmap-${density}`)
  await mkdir(dir, { recursive: true })
  await png(dir, 'ic_launcher.png', markSvg({ size: size * 4, bg: BLUE }), size)
  await png(dir, 'ic_launcher_round.png', markSvg({ size: size * 4, bg: BLUE, shape: 'circle' }), size)
}

for (const [density, size] of Object.entries(FOREGROUND)) {
  const dir = resolve(androidRes, `mipmap-${density}`)
  // Transparent: the launcher composites this over the background colour, and the
  // generous inset keeps the bars inside the safe circle whatever mask is applied.
  await png(dir, 'ic_launcher_foreground.png', markSvg({ size: size * 2, bg: null, inset: 0.33 }), size)
}

await writeFile(
  resolve(androidRes, 'values/ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${BLUE}</color>
</resources>
`,
)

/** Splash art: the mark centred on the light page plane. */
const SPLASH = {
  mdpi: [320, 480],
  hdpi: [480, 800],
  xhdpi: [720, 1280],
  xxhdpi: [960, 1600],
  xxxhdpi: [1280, 1920],
}

async function splash(width, height) {
  const mark = Math.round(Math.min(width, height) * 0.32)
  const markPng = await sharp(Buffer.from(markSvg({ size: mark * 3, bg: BLUE })))
    .resize(mark, mark)
    .png()
    .toBuffer()
  return sharp({
    create: { width, height, channels: 4, background: PAGE },
  })
    .composite([{ input: markPng, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

for (const [density, [w, h]] of Object.entries(SPLASH)) {
  for (const [orientation, width, height] of [
    ['port', w, h],
    ['land', h, w],
  ]) {
    const dir = resolve(androidRes, `drawable-${orientation}-${density}`)
    await mkdir(dir, { recursive: true })
    await writeFile(resolve(dir, 'splash.png'), await splash(width, height))
  }
}
await writeFile(resolve(androidRes, 'drawable/splash.png'), await splash(480, 800))

console.log('android launcher, adaptive and splash resources written to android/app/src/main/res')

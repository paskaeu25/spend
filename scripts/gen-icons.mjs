/**
 * Renders the app icon set from one inline SVG. Run with `npm run icons` after
 * changing the mark. Output is committed, so a normal build needs no image tooling.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '../public/icons')

const BLUE = '#2a78d6'

/**
 * Three descending bars — the same rank-and-magnitude idea as the category chart.
 * `inset` shrinks the mark for the maskable variant's safe zone.
 */
function markSvg({ size, bg, inset = 0.18, radius = 0.22 }) {
  const s = size
  const r = bg ? s * radius : 0
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
      return `<rect x="${pad}" y="${y}" width="${innerW * w}" height="${barH}" rx="${barH / 2}" fill="#ffffff"/>`
    })
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  ${bg ? `<rect width="${s}" height="${s}" rx="${r}" fill="${bg}"/>` : ''}
  ${bars}
</svg>`
}

async function png(name, svg, size) {
  const buffer = await sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer()
  await writeFile(resolve(outDir, name), buffer)
  console.log(`wrote icons/${name} (${size}x${size})`)
}

await mkdir(outDir, { recursive: true })

await png('icon-192.png', markSvg({ size: 192, bg: BLUE }), 192)
await png('icon-512.png', markSvg({ size: 512, bg: BLUE }), 512)
// Maskable art must survive a circular crop, so the mark sits well inside.
await png('maskable-512.png', markSvg({ size: 512, bg: BLUE, inset: 0.3, radius: 0 }), 512)
// iOS applies its own rounding and does not composite transparency.
await png('apple-touch-icon.png', markSvg({ size: 180, bg: BLUE, radius: 0 }), 180)
await png('favicon-32.png', markSvg({ size: 32, bg: BLUE, inset: 0.16 }), 32)

await writeFile(resolve(outDir, 'icon.svg'), markSvg({ size: 512, bg: BLUE }))
console.log('wrote icons/icon.svg')

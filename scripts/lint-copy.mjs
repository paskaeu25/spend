/**
 * Acceptance criterion 7 as a check rather than a promise: no copy in this app
 * blames the user. Comments and identifiers are stripped first, so only text that
 * can reach a screen is scanned.
 */
import { readFile, readdir } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const BANNED = [
  { pattern: /\bfailed\b/i, why: 'blames the user for an outcome' },
  { pattern: /\bexceeded\b/i, why: 'frames a cap as a rule that was broken' },
  { pattern: /\byou should\b/i, why: 'instructs rather than offers' },
  { pattern: /\bdon['’]t forget\b/i, why: 'nags' },
  { pattern: /\byou failed\b/i, why: 'shame language' },
  { pattern: /\bover budget\b/i, why: 'verdict framing; use the reallocation wording' },
]

/** Removes comments so that engineering notes are not mistaken for user copy. */
function stripComments(source) {
  let out = ''
  let i = 0
  let quote = null

  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]

    if (quote) {
      if (ch === '\\') {
        out += ch + (next ?? '')
        i += 2
        continue
      }
      if (ch === quote) quote = null
      out += ch
      i += 1
      continue
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      out += ch
      i += 1
      continue
    }
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1
      continue
    }
    if (ch === '/' && next === '*') {
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1
      i += 2
      continue
    }
    out += ch
    i += 1
  }
  return out
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.git'].includes(entry.name)) continue
      yield* walk(path)
    } else {
      yield path
    }
  }
}

const targets = ['.ts', '.tsx', '.html', '.css']
const findings = []

function scan(path, raw) {
  const isCode = extname(path) === '.ts' || extname(path) === '.tsx'
  const text = isCode ? stripComments(raw) : raw
  text.split('\n').forEach((line, n) => {
    for (const rule of BANNED) {
      if (rule.pattern.test(line)) {
        findings.push({ file: relative(root, path), line: n + 1, text: line.trim(), why: rule.why })
      }
    }
  })
}

for await (const path of walk(join(root, 'src'))) {
  if (!targets.includes(extname(path))) continue
  if (path.endsWith('.test.ts') || path.endsWith('.test.tsx')) continue
  scan(path, await readFile(path, 'utf8'))
}

const indexPath = join(root, 'index.html')
scan(indexPath, await readFile(indexPath, 'utf8'))

if (findings.length === 0) {
  console.log('copy check: clean — no blaming or nagging language found')
  process.exit(0)
}

for (const f of findings) {
  console.error(`${f.file}:${f.line}  ${f.why}\n    ${f.text}`)
}
console.error(`\ncopy check: ${findings.length} phrase(s) to reword`)
process.exit(1)

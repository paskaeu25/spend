/** Minimal RFC 4180 CSV, so notes containing commas, quotes or newlines survive. */

export function escapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function toCSV(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')
}

/** Parses a CSV document into rows. Tolerates LF or CRLF and a trailing newline. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  let i = 0

  // A byte-order mark would otherwise become part of the first header name.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  while (i < input.length) {
    const ch = input[i]

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      cell += ch
      i += 1
      continue
    }

    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === ',') {
      row.push(cell)
      cell = ''
      i += 1
      continue
    }
    if (ch === '\r' || ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      i += ch === '\r' && input[i + 1] === '\n' ? 2 : 1
      continue
    }
    cell += ch
    i += 1
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  return rows.filter((r) => r.length > 1 || r[0] !== '')
}

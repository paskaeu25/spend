/**
 * Money is integer minor units (cents) everywhere in the app. Formatting happens
 * only here, at the render boundary.
 */

export interface MoneyFormatOpts {
  symbol: string
  /** Drop ",00" on whole amounts — the common case in a spending list. */
  compact?: boolean
  /** Round to whole units. Used for large figures and axis ticks. */
  whole?: boolean
  /** Always show a leading + or -. */
  signed?: boolean
}

const groupFmt = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
const decimalFmt = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** e.g. 123456 -> "€1,234.56" (locale-dependent separators). */
export function formatMoney(minor: number, opts: MoneyFormatOpts): string {
  const negative = minor < 0
  const abs = Math.abs(Math.round(minor))
  const units = abs / 100

  let body: string
  if (opts.whole) {
    body = groupFmt.format(Math.round(units))
  } else if (opts.compact && abs % 100 === 0) {
    body = groupFmt.format(units)
  } else {
    body = decimalFmt.format(units)
  }

  const sign = negative ? '-' : opts.signed ? '+' : ''
  return `${sign}${opts.symbol}${body}`
}

/** The digits only, for pairing with a separately styled currency symbol. */
export function formatAmountBody(minor: number, opts: Omit<MoneyFormatOpts, 'symbol'> = {}): string {
  return formatMoney(minor, { ...opts, symbol: '' })
}

/* ---------- Keypad entry ---------- */

/**
 * Keypad state is the literal digit string the user typed, so display and value
 * never disagree ("1." stays "1." rather than snapping to "1").
 */
export interface AmountEntry {
  raw: string
}

export const emptyAmount: AmountEntry = { raw: '' }

export type KeypadKey =
  | { type: 'digit'; value: string }
  | { type: 'decimal' }
  | { type: 'backspace' }
  | { type: 'clear' }

const MAX_INT_DIGITS = 7

export function keypadReducer(state: AmountEntry, key: KeypadKey): AmountEntry {
  const raw = state.raw
  switch (key.type) {
    case 'digit': {
      const [int = '', dec] = raw.split('.')
      if (dec !== undefined) {
        if (dec.length >= 2) return state
        return { raw: `${int}.${dec}${key.value}` }
      }
      if (int === '0') return { raw: key.value }
      if (int.length >= MAX_INT_DIGITS) return state
      return { raw: int + key.value }
    }
    case 'decimal': {
      if (raw.includes('.')) return state
      return { raw: (raw === '' ? '0' : raw) + '.' }
    }
    case 'backspace':
      return { raw: raw.slice(0, -1) }
    case 'clear':
      return emptyAmount
  }
}

/** Minor units for the current entry. Partial input like "1." reads as 100. */
export function amountToMinor(state: AmountEntry): number {
  if (state.raw === '' || state.raw === '.') return 0
  const [int = '0', dec = ''] = state.raw.split('.')
  const cents = (dec + '00').slice(0, 2)
  return Number(int || '0') * 100 + Number(cents)
}

/** Seeds the keypad from a stored amount, for edit mode. */
export function minorToAmount(minor: number): AmountEntry {
  if (!minor) return emptyAmount
  const abs = Math.abs(Math.round(minor))
  const int = Math.floor(abs / 100)
  const cents = abs % 100
  return { raw: cents === 0 ? String(int) : `${int}.${String(cents).padStart(2, '0')}` }
}

/** What the amount display shows: "0" when empty, and a visible trailing dot. */
export function displayAmount(state: AmountEntry): string {
  if (state.raw === '') return '0'
  const [int, dec] = state.raw.split('.')
  const intPart = groupFmt.format(Number(int || '0'))
  if (dec === undefined) return intPart
  return `${intPart}.${dec}`
}

/** Parses free text (import, cap fields) into minor units. Null if unparseable. */
export function parseMoneyInput(text: string): number | null {
  const cleaned = text.trim().replace(/\s/g, '').replace(',', '.')
  if (cleaned === '') return null
  if (!/^-?\d*\.?\d*$/.test(cleaned)) return null
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

/**
 * Major units (6.2) to minor units (620), for files that store amounts the other
 * way round. Binary floats make the naive multiply unsafe — 4.975 * 100 comes out
 * as 497.49999999999994, which would round down and lose a cent — so the product
 * is normalised before rounding. Half-cents round up.
 */
export function majorToMinor(major: number): number {
  if (!Number.isFinite(major)) return 0
  return Math.round(Number((major * 100).toFixed(4)))
}

/** Minor units as a plain decimal string for CSV. */
export function minorToDecimalString(minor: number): string {
  const negative = minor < 0
  const abs = Math.abs(Math.round(minor))
  return `${negative ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/* ---------- Splitting a shared payment ---------- */

/**
 * The user's own share of an amount paid from a joint account, in minor units.
 * Half-cents round up, so a 50% split of an odd amount keeps the spare cent on
 * this side — there is no second party in the app for it to disagree with.
 */
export function splitShare(fullMinor: number, sharePct: number): number {
  return Math.round((Math.round(fullMinor) * sharePct) / 100)
}

/** Any input to a whole 1–99, falling back to an even split. */
export function clampSharePct(value: unknown, fallback = 50): number {
  const n = Math.trunc(Number(value))
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(n, 99)
}

/** Rounds up to a tidy figure for suggested caps: nearest 10 units, min 5. */
export function roundCapSuggestion(minor: number): number {
  if (minor <= 0) return 500
  const units = minor / 100
  const step = units >= 200 ? 10 : units >= 50 ? 5 : 1
  return Math.max(Math.round(units / step) * step, 1) * 100
}

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

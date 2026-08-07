/**
 * Date helpers. Everything is local-time and date-only (YYYY-MM-DD) — an expense
 * belongs to a calendar day, not an instant.
 *
 * All month arithmetic goes through monthRange so that monthStartDay is honoured
 * everywhere at once: hero figure, caps, charts and insight rules.
 */

/** A spending month: [start, endExclusive) in ISO date strings. */
export interface MonthRange {
  /** ISO date of the first day. Doubles as the month's stable key. */
  start: string
  /** ISO date of the day after the last day. */
  endExclusive: string
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parses YYYY-MM-DD as local midnight (not UTC, which would shift the day). */
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function todayISO(): string {
  return toISODate(new Date())
}

export function addDays(iso: string, n: number): string {
  const d = fromISODate(iso)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

/** Day count between two ISO dates (b - a). */
export function daysBetween(a: string, b: string): number {
  const ms = fromISODate(b).getTime() - fromISODate(a).getTime()
  return Math.round(ms / 86_400_000)
}

/** Adds calendar months, clamping the day to the target month's length. */
export function addMonthsISO(iso: string, n: number): string {
  const d = fromISODate(iso)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, lastDay))
  return toISODate(d)
}

function startOfMonthOn(year: number, monthIndex: number, monthStartDay: number): Date {
  return new Date(year, monthIndex, monthStartDay)
}

/** The spending month containing `iso`. */
export function monthRange(iso: string, monthStartDay = 1): MonthRange {
  const day = Math.min(Math.max(Math.trunc(monthStartDay) || 1, 1), 28)
  const d = fromISODate(iso)
  const startsThisMonth = d.getDate() >= day
  const start = startOfMonthOn(
    d.getFullYear(),
    startsThisMonth ? d.getMonth() : d.getMonth() - 1,
    day,
  )
  const end = startOfMonthOn(start.getFullYear(), start.getMonth() + 1, day)
  return { start: toISODate(start), endExclusive: toISODate(end) }
}

/** Shifts a spending month by `n` months. */
export function shiftMonth(range: MonthRange, n: number, monthStartDay = 1): MonthRange {
  return monthRange(addMonthsISO(range.start, n), monthStartDay)
}

export function isInRange(iso: string, range: MonthRange): boolean {
  return iso >= range.start && iso < range.endExclusive
}

export function monthLength(range: MonthRange): number {
  return daysBetween(range.start, range.endExclusive)
}

/**
 * How far into its spending month a date sits, 0-based. Used to compare a
 * month-to-date figure against "the same point last month".
 */
export function dayIndexInMonth(iso: string, monthStartDay = 1): number {
  return daysBetween(monthRange(iso, monthStartDay).start, iso)
}

/**
 * The label for a spending month. When months do not start on the 1st the range
 * straddles two calendar months, so both are named.
 */
export function monthLabel(range: MonthRange, opts: { year?: boolean } = {}): string {
  const start = fromISODate(range.start)
  const last = fromISODate(addDays(range.endExclusive, -1))
  const showYear = opts.year ?? start.getFullYear() !== new Date().getFullYear()

  if (start.getDate() === 1) {
    return start.toLocaleDateString(undefined, {
      month: 'long',
      ...(showYear ? { year: 'numeric' } : {}),
    })
  }
  const a = start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  const b = last.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(showYear ? { year: 'numeric' } : {}),
  })
  return `${a} – ${b}`
}

export function shortMonthLabel(range: MonthRange): string {
  const start = fromISODate(range.start)
  return start.toLocaleDateString(undefined, { month: 'short' })
}

/** "Today", "Yesterday", else "Mon 3 Aug". */
export function dayLabel(iso: string, today = todayISO()): string {
  if (iso === today) return 'Today'
  if (iso === addDays(today, -1)) return 'Yesterday'
  const d = fromISODate(iso)
  const sameYear = d.getFullYear() === fromISODate(today).getFullYear()
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

export function weekdayDayLabel(iso: string): string {
  return fromISODate(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

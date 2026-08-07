import type { Category, Expense } from '../types'
import {
  type MonthRange,
  daysBetween,
  isInRange,
  monthLength,
  monthRange,
  shiftMonth,
  todayISO,
} from '../lib/dates'
import { median } from '../lib/money'

/** Pure read helpers over the in-memory record set. */

export function categoryMap(categories: Category[]): Map<string, Category> {
  return new Map(categories.map((c) => [c.id, c]))
}

export function inMonth(expenses: Expense[], range: MonthRange): Expense[] {
  return expenses.filter((e) => isInRange(e.date, range))
}

export function sum(expenses: Expense[]): number {
  let total = 0
  for (const e of expenses) total += e.amount
  return total
}

export function monthTotal(expenses: Expense[], range: MonthRange): number {
  return sum(inMonth(expenses, range))
}

/**
 * Total for the first `days` days of a month. Comparing month-to-date against the
 * *same point* in the previous month is the only fair comparison — comparing
 * against a full previous month would always read as an improvement.
 */
export function totalThroughDay(expenses: Expense[], range: MonthRange, days: number): number {
  let total = 0
  for (const e of expenses) {
    if (!isInRange(e.date, range)) continue
    if (daysBetween(range.start, e.date) < days) total += e.amount
  }
  return total
}

export interface CategoryTotal {
  categoryId: string
  total: number
  count: number
}

/** Totals per category for a month, largest first. */
export function totalsByCategory(expenses: Expense[], range: MonthRange): CategoryTotal[] {
  const acc = new Map<string, CategoryTotal>()
  for (const e of inMonth(expenses, range)) {
    const cur = acc.get(e.categoryId)
    if (cur) {
      cur.total += e.amount
      cur.count += 1
    } else {
      acc.set(e.categoryId, { categoryId: e.categoryId, total: e.amount, count: 1 })
    }
  }
  return [...acc.values()].sort((a, b) => b.total - a.total)
}

/** Running total for each day of a month, including days with no spending. */
export function dailyCumulative(expenses: Expense[], range: MonthRange): number[] {
  const days = monthLength(range)
  const perDay = new Array<number>(days).fill(0)
  for (const e of expenses) {
    if (!isInRange(e.date, range)) continue
    const i = daysBetween(range.start, e.date)
    if (i >= 0 && i < days) perDay[i] += e.amount
  }
  const out = new Array<number>(days)
  let running = 0
  for (let i = 0; i < days; i++) {
    running += perDay[i]
    out[i] = running
  }
  return out
}

/** Per-day (not cumulative) totals for a month. */
export function dailyTotals(expenses: Expense[], range: MonthRange): number[] {
  const days = monthLength(range)
  const perDay = new Array<number>(days).fill(0)
  for (const e of expenses) {
    if (!isInRange(e.date, range)) continue
    const i = daysBetween(range.start, e.date)
    if (i >= 0 && i < days) perDay[i] += e.amount
  }
  return perDay
}

/**
 * Chip order for the add sheet — recency-frequency, not alphabetical:
 *   score = (uses in last 30 days) + (3 if used in last 48h)
 * Ties fall back to the manual order set in Settings.
 */
export function chipOrder(categories: Category[], expenses: Expense[], now = Date.now()): Category[] {
  const thirtyDays = now - 30 * 86_400_000
  const fortyEightHours = now - 2 * 86_400_000

  const uses = new Map<string, number>()
  const recent = new Set<string>()
  for (const e of expenses) {
    const t = Date.parse(e.createdAt)
    if (!Number.isFinite(t)) continue
    if (t >= thirtyDays) uses.set(e.categoryId, (uses.get(e.categoryId) ?? 0) + 1)
    if (t >= fortyEightHours) recent.add(e.categoryId)
  }

  const score = (c: Category) => (uses.get(c.id) ?? 0) + (recent.has(c.id) ? 3 : 0)

  return categories
    .filter((c) => !c.isArchived)
    .map((c) => ({ c, s: score(c) }))
    .sort((a, b) => b.s - a.s || a.c.sortWeight - b.c.sortWeight || a.c.name.localeCompare(b.c.name))
    .map((x) => x.c)
}

/** The spending months that contain at least one expense, oldest first. */
export function monthsWithData(expenses: Expense[], monthStartDay: number): string[] {
  const starts = new Set<string>()
  for (const e of expenses) starts.add(monthRange(e.date, monthStartDay).start)
  return [...starts].sort()
}

/** Monthly totals for one category over the last `count` months, oldest first. */
export function categoryMonthlyTotals(
  expenses: Expense[],
  categoryId: string,
  anchor: MonthRange,
  count: number,
  monthStartDay: number,
): Array<{ range: MonthRange; total: number }> {
  const out: Array<{ range: MonthRange; total: number }> = []
  for (let i = count - 1; i >= 0; i--) {
    const range = shiftMonth(anchor, -i, monthStartDay)
    let total = 0
    for (const e of expenses) {
      if (e.categoryId === categoryId && isInRange(e.date, range)) total += e.amount
    }
    out.push({ range, total })
  }
  return out
}

/**
 * A category's median monthly spend across *completed* months that have data.
 * The current month is excluded — a month in progress would drag the median down
 * and make every suggested cap too tight.
 */
export function categoryMonthlyMedian(
  expenses: Expense[],
  categoryId: string,
  currentMonth: MonthRange,
  monthStartDay: number,
): { medianMinor: number; monthCount: number } {
  const totals = new Map<string, number>()
  for (const e of expenses) {
    if (e.categoryId !== categoryId) continue
    const start = monthRange(e.date, monthStartDay).start
    if (start >= currentMonth.start) continue
    totals.set(start, (totals.get(start) ?? 0) + e.amount)
  }
  const values = [...totals.values()]
  return { medianMinor: median(values), monthCount: values.length }
}

export interface CapProgress {
  category: Category
  cap: number
  spent: number
  /** Positive when spending is under the cap. */
  remaining: number
  ratio: number
  isOver: boolean
}

export function capProgress(
  categories: Category[],
  expenses: Expense[],
  range: MonthRange,
): CapProgress[] {
  const monthExpenses = inMonth(expenses, range)
  return categories
    .filter((c) => c.monthlyCap !== null && c.monthlyCap > 0 && !c.isArchived)
    .map((category) => {
      const cap = category.monthlyCap as number
      let spent = 0
      for (const e of monthExpenses) if (e.categoryId === category.id) spent += e.amount
      return {
        category,
        cap,
        spent,
        remaining: cap - spent,
        ratio: cap > 0 ? spent / cap : 0,
        isOver: spent > cap,
      }
    })
    .sort((a, b) => b.ratio - a.ratio)
}

export interface DayGroup {
  date: string
  total: number
  expenses: Expense[]
}

/** Groups an already-sorted (newest first) list into day buckets. */
export function groupByDay(expenses: Expense[]): DayGroup[] {
  const groups: DayGroup[] = []
  let current: DayGroup | null = null
  for (const e of expenses) {
    if (!current || current.date !== e.date) {
      current = { date: e.date, total: 0, expenses: [] }
      groups.push(current)
    }
    current.total += e.amount
    current.expenses.push(e)
  }
  return groups
}

export function expensesOn(expenses: Expense[], date: string): Expense[] {
  return expenses.filter((e) => e.date === date)
}

export function hasExpenseToday(expenses: Expense[], today = todayISO()): boolean {
  return expenses.some((e) => e.date === today)
}

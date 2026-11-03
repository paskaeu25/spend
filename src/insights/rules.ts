import type { Category, Expense, Settings } from '../types'
import { type MonthRange, dayIndexInMonth, isInRange, shiftMonth } from '../lib/dates'
import { formatMoney } from '../lib/money'
import { categoryMonthlyMedian, monthsWithData, totalThroughDay, totalsByCategory } from '../store/selectors'
import { CATCH_ALL_ID } from '../db/seedCategories'

/**
 * The insight rules — section 8. Deterministic, no model, no network. Each rule
 * returns at most one card carrying exactly one action, and stays silent below its
 * stated data minimum.
 */

export type RuleId = 'spike' | 'drift' | 'quiet-win'

export type InsightAction = { kind: 'split-category'; label: string; categoryId: string }

export interface InsightCardData {
  /** Rule plus subject — dismissing one category's card leaves the others alone. */
  key: string
  rule: RuleId
  text: string
  /** Null means dismiss-only; no action is needed. */
  action: InsightAction | null
}

export interface InsightContext {
  expenses: Expense[]
  categories: Category[]
  settings: Settings
  today: string
  month: MonthRange
}

type Rule = (ctx: InsightContext) => InsightCardData | null

function money(ctx: InsightContext, minor: number): string {
  return formatMoney(minor, { symbol: ctx.settings.currencySymbol, whole: true })
}

function activeCategory(ctx: InsightContext, id: string): Category | null {
  return ctx.categories.find((c) => c.id === id && !c.isArchived) ?? null
}

/** Completed spending months that hold at least one expense. */
function completedMonthsWithData(ctx: InsightContext): number {
  return monthsWithData(ctx.expenses, ctx.settings.monthStartDay).filter(
    (start) => start < ctx.month.start,
  ).length
}

/**
 * A category running well above its own normal. Needs two months of history,
 * because "usual" is not a thing that exists before then.
 */
export const spike: Rule = (ctx) => {
  if (completedMonthsWithData(ctx) < 2) return null

  const monthTotals = totalsByCategory(ctx.expenses, ctx.month)
  let best: { category: Category; excess: number } | null = null

  for (const { categoryId, total } of monthTotals) {
    const category = activeCategory(ctx, categoryId)
    if (!category) continue

    const { medianMinor, monthCount } = categoryMonthlyMedian(
      ctx.expenses,
      categoryId,
      ctx.month,
      ctx.settings.monthStartDay,
    )
    if (monthCount < 2 || medianMinor <= 0) continue
    if (total < medianMinor * 1.3) continue

    const excess = total - medianMinor
    if (!best || excess > best.excess) best = { category, excess }
  }

  if (!best) return null
  return {
    key: `spike:${best.category.id}:${ctx.month.start}`,
    rule: 'spike',
    text: `${best.category.name} is ${money(ctx, best.excess)} above your usual month.`,
    action: null,
  }
}

/** Too much of the month landing in the catch-all to tell the user anything. */
export const drift: Rule = (ctx) => {
  const catchAll =
    activeCategory(ctx, CATCH_ALL_ID) ??
    ctx.categories.find((c) => !c.isArchived && /^(other|misc|miscellaneous|uncategorised|uncategorized)$/i.test(c.name)) ??
    null
  if (!catchAll) return null

  let monthTotal = 0
  let catchAllTotal = 0
  let catchAllCount = 0
  for (const e of ctx.expenses) {
    if (!isInRange(e.date, ctx.month)) continue
    monthTotal += e.amount
    if (e.categoryId === catchAll.id) {
      catchAllTotal += e.amount
      catchAllCount += 1
    }
  }

  if (monthTotal <= 0 || catchAllCount < 3) return null
  if (catchAllTotal / monthTotal <= 0.2) return null

  return {
    key: `drift:${catchAll.id}:${ctx.month.start}`,
    rule: 'drift',
    text: `A lot is landing in ${catchAll.name} — ${money(ctx, catchAllTotal)} this month.`,
    action: { kind: 'split-category', label: 'Split into categories', categoryId: catchAll.id },
  }
}

/**
 * Good news, which is the point: a surface that only ever reports problems is one
 * people stop opening.
 */
export const quietWin: Rule = (ctx) => {
  const previous = shiftMonth(ctx.month, -1, ctx.settings.monthStartDay)
  const daysIn = dayIndexInMonth(ctx.today, ctx.settings.monthStartDay) + 1

  const current = totalThroughDay(ctx.expenses, ctx.month, daysIn)
  const before = totalThroughDay(ctx.expenses, previous, daysIn)
  if (before <= 0) return null

  const under = before - current
  if (under < 500) return null

  return {
    key: `quiet-win:${ctx.month.start}:${daysIn}`,
    rule: 'quiet-win',
    text: `You're ${money(ctx, under)} under last month's pace.`,
    action: null,
  }
}

/** Highest priority first. The first rule that fires is the only card shown. */
export const RULES: Rule[] = [spike, drift, quietWin]

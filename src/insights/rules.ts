import type { Category, Expense, Settings } from '../types'
import { type MonthRange, dayIndexInMonth, isInRange, monthRange, shiftMonth } from '../lib/dates'
import { formatMoney, median, roundCapSuggestion } from '../lib/money'
import { categoryMonthlyMedian, monthsWithData, totalThroughDay, totalsByCategory } from '../store/selectors'
import { CATCH_ALL_ID } from '../db/seedCategories'

/**
 * The insight rules — section 8. Deterministic, no model, no network. Each rule
 * returns at most one card carrying exactly one action, and stays silent below its
 * stated data minimum.
 */

export type RuleId = 'spike' | 'recurring' | 'drift' | 'cap-opportunity' | 'quiet-win'

export type InsightAction =
  | { kind: 'set-cap'; label: string; categoryId: string; suggestedCap: number }
  | { kind: 'mark-recurring'; label: string; expenseIds: string[] }
  | { kind: 'split-category'; label: string; categoryId: string }

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
  let best: { category: Category; excess: number; medianMinor: number } | null = null

  for (const { categoryId, total } of monthTotals) {
    const category = activeCategory(ctx, categoryId)
    if (!category || category.monthlyCap !== null) continue

    const { medianMinor, monthCount } = categoryMonthlyMedian(
      ctx.expenses,
      categoryId,
      ctx.month,
      ctx.settings.monthStartDay,
    )
    if (monthCount < 2 || medianMinor <= 0) continue
    if (total < medianMinor * 1.3) continue

    const excess = total - medianMinor
    if (!best || excess > best.excess) best = { category, excess, medianMinor }
  }

  if (!best) return null
  const suggestedCap = roundCapSuggestion(best.medianMinor)
  return {
    key: `spike:${best.category.id}:${ctx.month.start}`,
    rule: 'spike',
    text: `${best.category.name} is ${money(ctx, best.excess)} above your usual month.`,
    action: {
      kind: 'set-cap',
      label: `Set a ${money(ctx, suggestedCap)} cap`,
      categoryId: best.category.id,
      suggestedCap,
    },
  }
}

/**
 * The same amount, same category, two months running. Offers to label it rather
 * than to act on the user's behalf.
 */
export const recurring: Rule = (ctx) => {
  const byCategory = new Map<string, Expense[]>()
  for (const e of ctx.expenses) {
    if (e.isRecurringHint) continue
    const list = byCategory.get(e.categoryId)
    if (list) list.push(e)
    else byCategory.set(e.categoryId, [e])
  }

  for (const [categoryId, list] of byCategory) {
    const category = activeCategory(ctx, categoryId)
    if (!category) continue

    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date))
    for (let i = 0; i < sorted.length; i++) {
      const anchor = sorted[i]
      const tolerance = anchor.amount * 0.05
      const cluster = sorted.filter((e) => Math.abs(e.amount - anchor.amount) <= tolerance)
      if (cluster.length < 2) continue

      const months = [
        ...new Set(cluster.map((e) => monthRange(e.date, ctx.settings.monthStartDay).start)),
      ].sort()
      if (months.length < 2) continue

      // Consecutive months, not just two hits that happen to share an amount.
      const consecutive = months.some((start, idx) => {
        if (idx === 0) return false
        const previous = shiftMonth(
          monthRange(start, ctx.settings.monthStartDay),
          -1,
          ctx.settings.monthStartDay,
        ).start
        return previous === months[idx - 1]
      })
      if (!consecutive) continue

      const typical = median(cluster.map((e) => e.amount))
      return {
        key: `recurring:${categoryId}:${Math.round(typical / 100)}`,
        rule: 'recurring',
        text: `Looks like a ${money(ctx, typical)} monthly repeat in ${category.name}.`,
        action: {
          kind: 'mark-recurring',
          label: 'Mark as recurring',
          expenseIds: cluster.map((e) => e.id),
        },
      }
    }
  }
  return null
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

/** A top-3 category with no cap yet, once there is a real number to suggest. */
export const capOpportunity: Rule = (ctx) => {
  if (completedMonthsWithData(ctx) < 1) return null

  const top3 = totalsByCategory(ctx.expenses, ctx.month).slice(0, 3)
  for (const { categoryId } of top3) {
    const category = activeCategory(ctx, categoryId)
    if (!category || category.monthlyCap !== null) continue

    const { medianMinor, monthCount } = categoryMonthlyMedian(
      ctx.expenses,
      categoryId,
      ctx.month,
      ctx.settings.monthStartDay,
    )
    if (monthCount < 1 || medianMinor <= 0) continue

    const suggestedCap = roundCapSuggestion(medianMinor)
    return {
      key: `cap:${category.id}`,
      rule: 'cap-opportunity',
      text: `${category.name} is one of your biggest categories, around ${money(ctx, medianMinor)} a month.`,
      action: { kind: 'set-cap', label: 'Set a cap', categoryId: category.id, suggestedCap },
    }
  }
  return null
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
export const RULES: Rule[] = [spike, recurring, drift, capOpportunity, quietWin]

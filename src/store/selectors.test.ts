import { describe, expect, it } from 'vitest'
import type { Category, Expense } from '../types'
import { monthRange } from '../lib/dates'
import {
  capProgress,
  categoryMonthlyMedian,
  chipOrder,
  dailyCumulative,
  groupByDay,
  monthsWithData,
  totalThroughDay,
  totalsByCategory,
} from './selectors'

function expense(partial: Partial<Expense> & { date: string; amount: number }): Expense {
  return {
    id: `${partial.date}-${partial.amount}-${Math.random().toString(36).slice(2, 7)}`,
    currency: 'EUR',
    categoryId: 'a',
    note: '',
    createdAt: `${partial.date}T12:00:00.000Z`,
    isRecurringHint: false,
    ...partial,
  }
}

function category(partial: Partial<Category> & { id: string }): Category {
  return {
    name: partial.id,
    emoji: '🏷️',
    colorSlot: 1,
    monthlyCap: null,
    isArchived: false,
    sortWeight: 0,
    ...partial,
  }
}

const august = monthRange('2026-08-15', 1)

describe('totals', () => {
  const expenses = [
    expense({ date: '2026-08-01', amount: 1000, categoryId: 'a' }),
    expense({ date: '2026-08-05', amount: 2000, categoryId: 'b' }),
    expense({ date: '2026-08-20', amount: 500, categoryId: 'a' }),
    expense({ date: '2026-07-30', amount: 9999, categoryId: 'a' }),
  ]

  it('groups by category, largest first', () => {
    expect(totalsByCategory(expenses, august)).toEqual([
      { categoryId: 'b', total: 2000, count: 1 },
      { categoryId: 'a', total: 1500, count: 2 },
    ])
  })

  it('counts only the first N days for a same-point comparison', () => {
    expect(totalThroughDay(expenses, august, 1)).toBe(1000)
    expect(totalThroughDay(expenses, august, 6)).toBe(3000)
    expect(totalThroughDay(expenses, august, 31)).toBe(3500)
  })

  it('builds a running total with a value for every day', () => {
    const series = dailyCumulative(expenses, august)
    expect(series).toHaveLength(31)
    expect(series[0]).toBe(1000)
    expect(series[3]).toBe(1000)
    expect(series[4]).toBe(3000)
    expect(series[30]).toBe(3500)
  })

  it('lists the months that hold data', () => {
    expect(monthsWithData(expenses, 1)).toEqual(['2026-07-01', '2026-08-01'])
  })

  it('groups a sorted list into days with subtotals', () => {
    const sorted = [
      expense({ date: '2026-08-05', amount: 300 }),
      expense({ date: '2026-08-05', amount: 200 }),
      expense({ date: '2026-08-04', amount: 100 }),
    ]
    const groups = groupByDay(sorted)
    expect(groups.map((g) => [g.date, g.total])).toEqual([
      ['2026-08-05', 500],
      ['2026-08-04', 100],
    ])
  })
})

describe('chipOrder', () => {
  const now = Date.parse('2026-08-15T12:00:00.000Z')
  const categories = [
    category({ id: 'a', sortWeight: 0 }),
    category({ id: 'b', sortWeight: 1 }),
    category({ id: 'c', sortWeight: 2 }),
    category({ id: 'gone', sortWeight: 3, isArchived: true }),
  ]

  it('puts frequency first and adds a bonus for the last 48 hours', () => {
    const expenses = [
      // 'b' used four times this month but not recently.
      ...[1, 2, 3, 4].map(() => expense({ date: '2026-08-01', amount: 100, categoryId: 'b' })),
      // 'c' used twice, one of them yesterday: 2 + 3 beats 4.
      expense({ date: '2026-08-02', amount: 100, categoryId: 'c' }),
      expense({ date: '2026-08-14', amount: 100, categoryId: 'c' }),
    ]
    expect(chipOrder(categories, expenses, now).map((c) => c.id)).toEqual(['c', 'b', 'a'])
  })

  it('ignores usage older than 30 days', () => {
    const expenses = [expense({ date: '2026-05-01', amount: 100, categoryId: 'c' })]
    expect(chipOrder(categories, expenses, now).map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })

  it('leaves archived categories out', () => {
    expect(chipOrder(categories, [], now).map((c) => c.id)).not.toContain('gone')
  })

  it('falls back to the manual order when nothing has been used', () => {
    const shuffled = [category({ id: 'x', sortWeight: 5 }), category({ id: 'y', sortWeight: 2 })]
    expect(chipOrder(shuffled, [], now).map((c) => c.id)).toEqual(['y', 'x'])
  })
})

describe('categoryMonthlyMedian', () => {
  it('takes the median of completed months and ignores the month in progress', () => {
    const expenses = [
      expense({ date: '2026-06-03', amount: 10_000, categoryId: 'a' }),
      expense({ date: '2026-07-03', amount: 20_000, categoryId: 'a' }),
      // The current month is deliberately excluded: a partial month would drag the
      // median down and make every suggested cap too tight.
      expense({ date: '2026-08-03', amount: 100, categoryId: 'a' }),
    ]
    expect(categoryMonthlyMedian(expenses, 'a', august, 1)).toEqual({
      medianMinor: 15_000,
      monthCount: 2,
    })
  })

  it('reports no months when there is no completed history', () => {
    const expenses = [expense({ date: '2026-08-03', amount: 100, categoryId: 'a' })]
    expect(categoryMonthlyMedian(expenses, 'a', august, 1)).toEqual({ medianMinor: 0, monthCount: 0 })
  })
})

describe('capProgress', () => {
  it('reports remaining, ratio and over-cap state', () => {
    const categories = [
      category({ id: 'a', monthlyCap: 10_000 }),
      category({ id: 'b', monthlyCap: 5_000 }),
      category({ id: 'c' }),
    ]
    const expenses = [
      expense({ date: '2026-08-02', amount: 4_000, categoryId: 'a' }),
      expense({ date: '2026-08-02', amount: 6_000, categoryId: 'b' }),
      expense({ date: '2026-08-02', amount: 9_999, categoryId: 'c' }),
    ]
    const progress = capProgress(categories, expenses, august)
    expect(progress).toHaveLength(2)
    // Sorted by how close each is to its cap.
    expect(progress[0].category.id).toBe('b')
    expect(progress[0].isOver).toBe(true)
    expect(progress[0].remaining).toBe(-1_000)
    expect(progress[1].remaining).toBe(6_000)
    expect(progress[1].isOver).toBe(false)
  })
})

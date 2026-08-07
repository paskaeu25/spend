import { beforeEach, describe, expect, it } from 'vitest'
import type { Category, Expense, Settings } from '../types'
import { monthRange } from '../lib/dates'
import { DEFAULT_SETTINGS } from '../store/settings'
import { capOpportunity, drift, quietWin, recurring, spike, type InsightContext } from './rules'
import { dismissInsight, isDismissed, pickInsight } from './engine'

const TODAY = '2026-08-15'
const settings: Settings = { ...DEFAULT_SETTINGS, currencySymbol: '€', monthStartDay: 1 }

const CATEGORIES: Category[] = [
  { id: 'cat-groceries', name: 'Groceries', emoji: '🛒', colorSlot: 1, monthlyCap: null, isArchived: false, sortWeight: 0 },
  { id: 'cat-eating-out', name: 'Eating out', emoji: '🍽️', colorSlot: 2, monthlyCap: null, isArchived: false, sortWeight: 1 },
  { id: 'cat-fun', name: 'Fun', emoji: '🎬', colorSlot: 5, monthlyCap: null, isArchived: false, sortWeight: 2 },
  { id: 'cat-other', name: 'Other', emoji: '📦', colorSlot: 8, monthlyCap: null, isArchived: false, sortWeight: 3 },
]

let seq = 0
function e(date: string, amount: number, categoryId: string, extra: Partial<Expense> = {}): Expense {
  seq += 1
  return {
    id: `e${seq}`,
    amount,
    currency: 'EUR',
    categoryId,
    note: '',
    date,
    createdAt: `${date}T12:00:00.000Z`,
    isRecurringHint: false,
    ...extra,
  }
}

function ctx(expenses: Expense[], categories = CATEGORIES): InsightContext {
  return { expenses, categories, settings, today: TODAY, month: monthRange(TODAY, 1) }
}

beforeEach(() => {
  localStorage.clear()
})

describe('category spike', () => {
  it('stays silent with only one completed month', () => {
    const expenses = [
      e('2026-07-05', 10_000, 'cat-groceries'),
      e('2026-08-05', 40_000, 'cat-groceries'),
    ]
    expect(spike(ctx(expenses))).toBeNull()
  })

  it('fires once two completed months set a usual level', () => {
    const expenses = [
      e('2026-06-05', 10_000, 'cat-groceries'),
      e('2026-07-05', 10_000, 'cat-groceries'),
      e('2026-08-05', 20_000, 'cat-groceries'),
    ]
    const card = spike(ctx(expenses))
    expect(card?.rule).toBe('spike')
    expect(card?.text).toBe('Groceries is €100 above your usual month.')
    expect(card?.action).toMatchObject({ kind: 'set-cap', categoryId: 'cat-groceries' })
  })

  it('says nothing when the month is merely a little above the median', () => {
    const expenses = [
      e('2026-06-05', 10_000, 'cat-groceries'),
      e('2026-07-05', 10_000, 'cat-groceries'),
      e('2026-08-05', 12_000, 'cat-groceries'),
    ]
    expect(spike(ctx(expenses))).toBeNull()
  })

  it('leaves categories that already have a cap alone', () => {
    const capped = CATEGORIES.map((c) =>
      c.id === 'cat-groceries' ? { ...c, monthlyCap: 15_000 } : c,
    )
    const expenses = [
      e('2026-06-05', 10_000, 'cat-groceries'),
      e('2026-07-05', 10_000, 'cat-groceries'),
      e('2026-08-05', 20_000, 'cat-groceries'),
    ]
    expect(spike(ctx(expenses, capped))).toBeNull()
  })
})

describe('cap opportunity', () => {
  it('needs a completed month before it can suggest a number', () => {
    expect(capOpportunity(ctx([e('2026-08-05', 20_000, 'cat-groceries')]))).toBeNull()
  })

  it('offers a cap for a top-three category', () => {
    const expenses = [
      e('2026-07-05', 20_000, 'cat-groceries'),
      e('2026-08-05', 18_000, 'cat-groceries'),
    ]
    const card = capOpportunity(ctx(expenses))
    expect(card?.rule).toBe('cap-opportunity')
    expect(card?.action).toMatchObject({ kind: 'set-cap', suggestedCap: 20_000 })
  })
})

describe('recurring detection', () => {
  it('spots the same amount in two months running', () => {
    const expenses = [
      e('2026-07-03', 1_499, 'cat-fun'),
      e('2026-08-03', 1_499, 'cat-fun'),
    ]
    const card = recurring(ctx(expenses))
    expect(card?.rule).toBe('recurring')
    expect(card?.action).toMatchObject({ kind: 'mark-recurring', expenseIds: expect.any(Array) })
  })

  it('accepts a 5% drift in the amount', () => {
    const card = recurring(ctx([e('2026-07-03', 1_000, 'cat-fun'), e('2026-08-03', 1_040, 'cat-fun')]))
    expect(card?.rule).toBe('recurring')
  })

  it('rejects amounts further apart than 5%', () => {
    expect(recurring(ctx([e('2026-07-03', 1_000, 'cat-fun'), e('2026-08-03', 1_200, 'cat-fun')]))).toBeNull()
  })

  it('needs the months to be consecutive', () => {
    expect(recurring(ctx([e('2026-05-03', 1_499, 'cat-fun'), e('2026-08-03', 1_499, 'cat-fun')]))).toBeNull()
  })

  it('does not re-offer something already marked', () => {
    const expenses = [
      e('2026-07-03', 1_499, 'cat-fun', { isRecurringHint: true }),
      e('2026-08-03', 1_499, 'cat-fun', { isRecurringHint: true }),
    ]
    expect(recurring(ctx(expenses))).toBeNull()
  })
})

describe('uncategorised drift', () => {
  it('fires when more than a fifth of the month lands in the catch-all', () => {
    const expenses = [
      e('2026-08-02', 3_000, 'cat-other'),
      e('2026-08-03', 3_000, 'cat-other'),
      e('2026-08-04', 3_000, 'cat-other'),
      e('2026-08-05', 10_000, 'cat-groceries'),
    ]
    const card = drift(ctx(expenses))
    expect(card?.rule).toBe('drift')
    expect(card?.action).toMatchObject({ kind: 'split-category', categoryId: 'cat-other' })
  })

  it('waits for at least three entries before saying anything', () => {
    const expenses = [e('2026-08-02', 9_000, 'cat-other'), e('2026-08-05', 1_000, 'cat-groceries')]
    expect(drift(ctx(expenses))).toBeNull()
  })

  it('stays quiet when the catch-all is a small share', () => {
    const expenses = [
      e('2026-08-02', 100, 'cat-other'),
      e('2026-08-03', 100, 'cat-other'),
      e('2026-08-04', 100, 'cat-other'),
      e('2026-08-05', 50_000, 'cat-groceries'),
    ]
    expect(drift(ctx(expenses))).toBeNull()
  })
})

describe('quiet win', () => {
  it('reports being under last month at the same point', () => {
    const expenses = [
      e('2026-07-02', 20_000, 'cat-groceries'),
      e('2026-08-02', 5_000, 'cat-groceries'),
    ]
    const card = quietWin(ctx(expenses))
    expect(card?.rule).toBe('quiet-win')
    expect(card?.text).toBe("You're €150 under last month's pace.")
    expect(card?.action).toBeNull()
  })

  it('compares the same point, not a whole previous month', () => {
    const expenses = [
      // Last month's spend all landed after today's day-of-month.
      e('2026-07-28', 40_000, 'cat-groceries'),
      e('2026-08-02', 5_000, 'cat-groceries'),
    ]
    expect(quietWin(ctx(expenses))).toBeNull()
  })

  it('says nothing when spending is higher than last month', () => {
    const expenses = [
      e('2026-07-02', 5_000, 'cat-groceries'),
      e('2026-08-02', 20_000, 'cat-groceries'),
    ]
    expect(quietWin(ctx(expenses))).toBeNull()
  })
})

describe('the engine', () => {
  it('shows nothing at all with no data', () => {
    expect(pickInsight(ctx([]))).toBeNull()
  })

  it('prefers the higher-priority rule when several could fire', () => {
    const expenses = [
      e('2026-06-05', 10_000, 'cat-groceries'),
      e('2026-07-05', 10_000, 'cat-groceries'),
      e('2026-08-05', 20_000, 'cat-groceries'),
    ]
    // Both the spike and the cap-opportunity rules match; spike ranks higher.
    expect(pickInsight(ctx(expenses))?.rule).toBe('spike')
  })

  it('suppresses a dismissed card and moves to the next one', () => {
    const expenses = [
      e('2026-06-05', 10_000, 'cat-groceries'),
      e('2026-07-05', 10_000, 'cat-groceries'),
      e('2026-08-05', 20_000, 'cat-groceries'),
    ]
    const first = pickInsight(ctx(expenses))
    expect(first).not.toBeNull()
    dismissInsight(first!.key, TODAY)
    expect(isDismissed(first!.key, TODAY)).toBe(true)
    expect(pickInsight(ctx(expenses))?.key).not.toBe(first!.key)
  })

  it('brings a dismissed card back after fourteen days, not before', () => {
    dismissInsight('spike:cat-groceries:2026-08-01', '2026-08-01')
    expect(isDismissed('spike:cat-groceries:2026-08-01', '2026-08-14')).toBe(true)
    expect(isDismissed('spike:cat-groceries:2026-08-01', '2026-08-15')).toBe(false)
  })
})

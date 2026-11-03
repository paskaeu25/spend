import type { Expense } from '../types'
import { addDays, monthRange, toISODate, todayISO } from '../lib/dates'
import { uuid } from '../lib/uuid'

/**
 * Development-only sample data. Several insight rules stay silent below two months
 * of history, so exercising them by hand would mean thirty back-dated entries.
 * Deterministic, so a reload gives the same numbers to look at.
 */
function makeRandom(seed: number) {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
}

interface Plan {
  categoryId: string
  /** Entries per month. */
  perMonth: number
  minMinor: number
  maxMinor: number
  notes: string[]
}

const PLANS: Plan[] = [
  {
    categoryId: 'cat-groceries',
    perMonth: 7,
    minMinor: 1200,
    maxMinor: 6400,
    notes: ['Weekly shop', 'Market', 'Corner shop', ''],
  },
  {
    categoryId: 'cat-eating-out',
    perMonth: 5,
    minMinor: 800,
    maxMinor: 4200,
    notes: ['Lunch', 'Coffee', 'Dinner out', ''],
  },
  {
    categoryId: 'cat-transport',
    perMonth: 4,
    minMinor: 200,
    maxMinor: 2800,
    notes: ['Bus pass', 'Taxi', ''],
  },
  {
    categoryId: 'cat-other',
    perMonth: 4,
    minMinor: 1500,
    maxMinor: 7500,
    notes: ['Bits and pieces', '', 'Unsorted'],
  },
]

export function buildSampleExpenses(currency: string, monthStartDay: number): Expense[] {
  const random = makeRandom(20260804)
  const today = todayISO()
  const out: Expense[] = []

  // Three months back to today: two completed months plus the current one, which is
  // the minimum for the spike and cap rules to have anything to say.
  for (let back = 2; back >= 0; back--) {
    const month = monthRange(today, monthStartDay)
    const cursor = new Date(month.start)
    cursor.setMonth(cursor.getMonth() - back)
    const range = monthRange(toISODate(cursor), monthStartDay)
    const lastDay = Math.min(
      Math.round((new Date(range.endExclusive).getTime() - new Date(range.start).getTime()) / 86_400_000) - 1,
      Math.max(0, Math.round((new Date(today).getTime() - new Date(range.start).getTime()) / 86_400_000)),
    )

    for (const plan of PLANS) {
      // The current month runs hot on eating out, so the spike rule has a subject.
      const count = back === 0 && plan.categoryId === 'cat-eating-out' ? plan.perMonth + 4 : plan.perMonth
      for (let n = 0; n < count; n++) {
        const dayOffset = Math.floor(random() * (lastDay + 1))
        const date = addDays(range.start, dayOffset)
        if (date > today) continue
        const amount =
          Math.round((plan.minMinor + random() * (plan.maxMinor - plan.minMinor)) / 10) * 10
        out.push({
          id: uuid(),
          amount,
          currency,
          categoryId: plan.categoryId,
          note: plan.notes[Math.floor(random() * plan.notes.length)] ?? '',
          date,
          createdAt: new Date(`${date}T12:00:00`).toISOString(),
        })
      }
    }

    // A steady monthly charge, for the recurring-detection rule.
    const subscriptionDay = addDays(range.start, Math.min(3, lastDay))
    if (subscriptionDay <= today) {
      out.push({
        id: uuid(),
        amount: 1499,
        currency,
        categoryId: 'cat-fun',
        note: 'Streaming',
        date: subscriptionDay,
        createdAt: new Date(`${subscriptionDay}T12:00:00`).toISOString(),
      })
    }
  }

  return out
}

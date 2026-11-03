import { beforeAll, describe, expect, it } from 'vitest'
import { STORE_CATEGORIES, STORE_EXPENSES, getAll } from '../db/idb'
import type { Category, Expense } from '../types'
import {
  addExpense,
  deleteAllData,
  deleteExpenses,
  getState,
  importData,
  init,
  restoreExpenses,
} from './store'

/** Storage writes are fire-and-forget, so give the transaction a turn to land. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 20))

function expense(id: string, amount: number): Expense {
  return {
    id,
    amount,
    currency: 'EUR',
    categoryId: 'cat-groceries',
    note: '',
    date: '2026-08-04',
    createdAt: '2026-08-04T10:00:00.000Z',
  }
}

describe('the data layer', () => {
  beforeAll(async () => {
    await init()
  })

  it('seeds eight categories on a first run and writes them to storage', async () => {
    expect(getState().categories).toHaveLength(8)
    expect(getState().storageError).toBeNull()
    const stored = await getAll<Category>(STORE_CATEGORIES)
    expect(stored).toHaveLength(8)
    // Colour follows creation order and is a fixed slot, never a generated hue.
    expect([...getState().categories].map((c) => c.colorSlot).sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('persists an expense to IndexedDB, so it survives a close', async () => {
    addExpense(expense('x1', 1250))
    await settled()
    const stored = await getAll<Expense>(STORE_EXPENSES)
    expect(stored.map((e) => e.id)).toContain('x1')
    expect(stored.find((e) => e.id === 'x1')?.amount).toBe(1250)
  })

  it('keeps the list newest first', async () => {
    addExpense({ ...expense('x2', 100), date: '2026-08-06' })
    addExpense({ ...expense('x3', 100), date: '2026-08-05' })
    await settled()
    const dates = getState().expenses.map((e) => e.date)
    expect([...dates]).toEqual([...dates].sort().reverse())
  })

  it('restores a deleted expense exactly, in storage as well as on screen', async () => {
    const original = getState().expenses.find((e) => e.id === 'x1')!
    deleteExpenses(['x1'])
    await settled()
    expect((await getAll<Expense>(STORE_EXPENSES)).map((e) => e.id)).not.toContain('x1')

    restoreExpenses([original])
    await settled()
    const stored = await getAll<Expense>(STORE_EXPENSES)
    expect(stored.find((e) => e.id === 'x1')).toEqual(original)
  })

  it('does not duplicate a restore that arrives twice', async () => {
    const original = getState().expenses.find((e) => e.id === 'x1')!
    restoreExpenses([original])
    await settled()
    expect(getState().expenses.filter((e) => e.id === 'x1')).toHaveLength(1)
  })


  it('replaces everything on import, in one transaction', async () => {
    importData({
      expenses: [expense('imported', 999)],
      categories: [
        {
          id: 'only-one',
          name: 'Solo',
          emoji: '🎯',
          colorSlot: 1,
          isArchived: false,
          sortWeight: 0,
        },
      ],
    })
    await settled()
    expect(await getAll<Expense>(STORE_EXPENSES)).toHaveLength(1)
    expect(await getAll<Category>(STORE_CATEGORIES)).toHaveLength(1)
    expect(getState().expenses[0].id).toBe('imported')
  })

  it('clears the expenses and returns the default categories on a wipe', async () => {
    deleteAllData()
    await settled()
    expect(await getAll<Expense>(STORE_EXPENSES)).toHaveLength(0)
    expect(await getAll<Category>(STORE_CATEGORIES)).toHaveLength(8)
    expect(getState().expenses).toHaveLength(0)
  })
})

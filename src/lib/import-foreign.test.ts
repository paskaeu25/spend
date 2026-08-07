import { describe, expect, it } from 'vitest'
import type { Category } from '../types'
import { fromJSONBackup, toJSONBackup, categoryEmojiFor } from './backup'
import { majorToMinor } from './money'
import { seedCategories } from '../db/seedCategories'
import { DEFAULT_SETTINGS } from '../store/settings'

/**
 * A file in the shape another expense tracker exports: amounts in major units,
 * categories referenced by name, categories carrying a hex colour and no id.
 */
const FOREIGN = {
  version: 1,
  categories: [
    { name: 'Groceries', color: '#ff9500' },
    { name: 'Eating Out', color: '#ff6b35' },
    { name: 'Utilities', color: '#5856d6' },
    { name: 'Other', color: '#8e8e93' },
  ],
  expenses: [
    { id: 'import-a', amount: 6.2, date: '2026-06-01', category: 'Groceries', note: 'Lidl grocery', receipts: [] },
    { id: 'import-b', amount: 0.69, date: '2026-06-01', category: 'Groceries', note: 'Ice cream', receipts: [] },
    // Half a cent: has to round up rather than truncate.
    { id: 'import-c', amount: 4.975, date: '2026-06-02', category: 'Eating Out', note: 'Coffee', receipts: [] },
    // A whole number is still major units.
    { id: 'import-d', amount: 750, date: '2026-07-01', category: 'Utilities', note: 'Rent', receipts: [] },
    { id: 'import-e', amount: 2.815, date: '2026-07-02', category: 'Other', note: '', receipts: [] },
  ],
}

const options = { currency: 'EUR', existingCategories: seedCategories() }

describe('majorToMinor', () => {
  it('survives the binary-float cases that would lose a cent', () => {
    expect(majorToMinor(6.2)).toBe(620)
    expect(majorToMinor(0.69)).toBe(69)
    // 4.975 * 100 is 497.49999999999994 in binary floating point.
    expect(majorToMinor(4.975)).toBe(498)
    expect(majorToMinor(2.815)).toBe(282)
    expect(majorToMinor(750)).toBe(75_000)
    expect(majorToMinor(0.38)).toBe(38)
  })
})

describe('importing another app’s JSON', () => {
  const result = fromJSONBackup(JSON.stringify(FOREIGN), options)

  it('reads amounts as major units instead of cents', () => {
    const byId = new Map(result.expenses.map((e) => [e.id, e]))
    expect(byId.get('import-a')!.amount).toBe(620)
    expect(byId.get('import-b')!.amount).toBe(69)
    expect(byId.get('import-d')!.amount).toBe(75_000)
  })

  it('keeps the total intact to the cent', () => {
    const total = result.expenses.reduce((n, e) => n + e.amount, 0)
    // 6.20 + 0.69 + 4.98 + 750.00 + 2.82
    expect(total).toBe(76_469)
  })

  it('resolves category names instead of collapsing everything into one', () => {
    const names = new Set(
      result.expenses.map((e) => result.categories.find((c) => c.id === e.categoryId)!.name),
    )
    // "Eating out" keeps the spelling already on the device, not the file's.
    expect(names).toEqual(new Set(['Groceries', 'Eating out', 'Utilities', 'Other']))
  })

  it('reuses the categories already on the device, caps and all', () => {
    const groceries = result.categories.find((c) => c.name === 'Groceries')!
    expect(groceries.id).toBe('cat-groceries')
    expect(groceries.emoji).toBe('🛒')
    expect(result.conversion?.matchedCategories).toContain('Groceries')
  })

  it('matches a name whose capitalisation differs', () => {
    // The file says "Eating Out"; the seed says "Eating out".
    const eatingOut = result.categories.find((c) => /eating out/i.test(c.name))!
    expect(eatingOut.id).toBe('cat-eating-out')
  })

  it('creates what is genuinely new, with an icon picked from the name', () => {
    const utilities = result.categories.find((c) => c.name === 'Utilities')!
    expect(utilities.emoji).toBe('💡')
    expect(utilities.monthlyCap).toBeNull()
    expect(result.conversion?.createdCategories).toEqual(['Utilities'])
  })

  it('assigns palette slots in range, never a foreign hex colour', () => {
    for (const c of result.categories) {
      expect(c.colorSlot).toBeGreaterThanOrEqual(1)
      expect(c.colorSlot).toBeLessThanOrEqual(8)
    }
  })

  it('leaves no expense pointing at a category that is not there', () => {
    const ids = new Set(result.categories.map((c) => c.id))
    expect(result.expenses.every((e) => ids.has(e.categoryId))).toBe(true)
  })

  it('fills in the fields the file has no column for', () => {
    for (const e of result.expenses) {
      expect(e.currency).toBe('EUR')
      expect(e.isRecurringHint).toBe(false)
      expect(e.createdAt.startsWith(e.date)).toBe(true)
    }
  })

  it('reports the rounding rather than doing it silently', () => {
    expect(result.conversion?.scaledAmounts).toBe(true)
    expect(result.conversion?.roundedAmounts).toBe(2)
    expect(result.conversion?.ignoredFields).toContain('receipts')
    expect(result.conversion?.ignoredFields).toContain('color')
  })

  it('is converted once — re-importing the result changes nothing', () => {
    const native = toJSONBackup({
      settings: DEFAULT_SETTINGS,
      categories: result.categories,
      expenses: result.expenses,
    })
    const again = fromJSONBackup(native, options)
    expect(again.conversion).toBeUndefined()
    expect(again.expenses).toEqual(result.expenses)
    expect(again.categories).toEqual(result.categories)
  })
})

describe('other shapes from other apps', () => {
  it('accepts a bare array of expenses', () => {
    const text = JSON.stringify([{ amount: 12.5, date: '2026-08-01', category: 'Coffee' }])
    const result = fromJSONBackup(text, options)
    expect(result.expenses[0].amount).toBe(1250)
    expect(result.categories[0].name).toBe('Coffee')
    expect(result.categories[0].emoji).toBe('☕')
  })

  it('takes a date out of an ISO timestamp', () => {
    const text = JSON.stringify([
      { amount: 3, date: '2026-08-01T18:24:00.000Z', category: 'Other', note: 'x' },
    ])
    expect(fromJSONBackup(text, options).expenses[0].date).toBe('2026-08-01')
  })

  it('reads description and value when note and amount are named differently', () => {
    const text = JSON.stringify([{ value: 4.5, date: '2026-08-01', description: 'Bus', category: 'Transport' }])
    const e = fromJSONBackup(text, options).expenses[0]
    expect(e.amount).toBe(450)
    expect(e.note).toBe('Bus')
  })

  it('files a row with no category under Other', () => {
    const text = JSON.stringify([{ amount: 5, date: '2026-08-01' }])
    const result = fromJSONBackup(text, options)
    expect(result.categories.find((c) => c.id === result.expenses[0].categoryId)!.name).toBe('Other')
  })

  it('skips rows with no readable date or a zero amount, and keeps the rest', () => {
    const text = JSON.stringify([
      { amount: 5, date: 'not a date', category: 'Other' },
      { amount: 0, date: '2026-08-01', category: 'Other' },
      { amount: 7.5, date: '2026-08-01', category: 'Other' },
    ])
    const result = fromJSONBackup(text, options)
    expect(result.expenses).toHaveLength(1)
    expect(result.expenses[0].amount).toBe(750)
  })

  it('gives duplicate ids their own identity', () => {
    const text = JSON.stringify([
      { id: 'same', amount: 1, date: '2026-08-01', category: 'Other' },
      { id: 'same', amount: 2, date: '2026-08-01', category: 'Other' },
    ])
    const ids = fromJSONBackup(text, options).expenses.map((e) => e.id)
    expect(new Set(ids).size).toBe(2)
  })

  it('treats an amount as positive spending even if the file signs it', () => {
    const text = JSON.stringify([{ amount: -12.5, date: '2026-08-01', category: 'Other' }])
    expect(fromJSONBackup(text, options).expenses[0].amount).toBe(1250)
  })

  it('says so plainly when there is nothing readable', () => {
    expect(() => fromJSONBackup('{"expenses":[]}', options)).toThrow(/nothing in that file/)
    expect(() => fromJSONBackup('{"hello":true}', options)).toThrow(/no expenses/)
    expect(() =>
      fromJSONBackup('[{"note":"no amount or date"}]', options),
    ).toThrow(/could be read/)
  })
})

describe('category icons', () => {
  it('picks a sensible icon for common names', () => {
    expect(categoryEmojiFor('Groceries')).toBe('🛒')
    expect(categoryEmojiFor('eating out')).toBe('🍽️')
    expect(categoryEmojiFor('Travel')).toBe('✈️')
    expect(categoryEmojiFor('Transport')).toBe('🚌')
    expect(categoryEmojiFor('Entertainment')).toBe('🎬')
    expect(categoryEmojiFor('Health')).toBe('🩺')
    expect(categoryEmojiFor('Shopping')).toBe('🛍️')
    expect(categoryEmojiFor('Other')).toBe('📦')
  })

  it('falls back to a neutral tag rather than guessing wrongly', () => {
    expect(categoryEmojiFor('Zzyzx')).toBe('🏷️')
  })
})

/** Guards the native path against being mistaken for a foreign one. */
describe('native backups still take the native path', () => {
  it('does not convert a file this app wrote', () => {
    const categories: Category[] = seedCategories()
    const native = toJSONBackup({
      settings: DEFAULT_SETTINGS,
      categories,
      expenses: [
        {
          id: 'e1',
          amount: 620,
          currency: 'EUR',
          categoryId: 'cat-groceries',
          note: '',
          date: '2026-08-01',
          createdAt: '2026-08-01T10:00:00.000Z',
          isRecurringHint: false,
        },
      ],
    })
    const result = fromJSONBackup(native, options)
    expect(result.conversion).toBeUndefined()
    expect(result.expenses[0].amount).toBe(620)
  })
})

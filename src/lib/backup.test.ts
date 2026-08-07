import { describe, expect, it } from 'vitest'
import type { Category, Expense, Settings } from '../types'
import { DEFAULT_SETTINGS } from '../store/settings'
import { fromCSVBackup, fromJSONBackup, toCSVBackup, toJSONBackup } from './backup'
import { parseCSV, toCSV } from './csv'

const settings: Settings = { ...DEFAULT_SETTINGS, currency: 'EUR', currencySymbol: '€', monthStartDay: 5 }

const categories: Category[] = [
  { id: 'cat-groceries', name: 'Groceries', emoji: '🛒', colorSlot: 1, monthlyCap: 25_000, isArchived: false, sortWeight: 0 },
  { id: 'cat-fun', name: 'Fun', emoji: '🎬', colorSlot: 5, monthlyCap: null, isArchived: true, sortWeight: 1 },
  // A category with no expenses at all still has to survive the trip.
  { id: 'cat-unused', name: 'Health', emoji: '🩺', colorSlot: 3, monthlyCap: 5_000, isArchived: false, sortWeight: 2 },
]

const expenses: Expense[] = [
  {
    id: 'e1',
    amount: 1_250,
    currency: 'EUR',
    categoryId: 'cat-groceries',
    // Every CSV hazard in one note: a comma, quotes and a newline.
    note: 'Bread, "good" one\nsecond line',
    date: '2026-08-04',
    createdAt: '2026-08-04T09:30:00.000Z',
    isRecurringHint: false,
  },
  {
    id: 'e2',
    amount: 100_000,
    currency: 'EUR',
    categoryId: 'cat-fun',
    note: '',
    date: '2026-07-31',
    createdAt: '2026-07-31T18:00:00.000Z',
    isRecurringHint: true,
  },
]

describe('CSV primitives', () => {
  it('quotes only the cells that need it and reads them back', () => {
    const text = toCSV([
      ['a', 'b,c', 'd"e', 'f\ng'],
      ['1', '2', '3', '4'],
    ])
    expect(text.split('\r\n')[0]).toBe('a,"b,c","d""e","f\ng"')
    expect(parseCSV(text)).toEqual([
      ['a', 'b,c', 'd"e', 'f\ng'],
      ['1', '2', '3', '4'],
    ])
  })

  it('tolerates LF line endings and a trailing newline', () => {
    expect(parseCSV('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('strips a byte-order mark from the first header', () => {
    expect(parseCSV('﻿date,amount\n2026-08-04,1.00')[0][0]).toBe('date')
  })
})

describe('JSON backup', () => {
  it('round-trips expenses, categories and settings without loss', () => {
    const result = fromJSONBackup(toJSONBackup({ settings, categories, expenses }))
    expect(result.expenses).toEqual(expenses)
    expect(result.categories).toEqual(categories)
    expect(result.settings).toEqual(settings)
  })

  it('re-exports byte-identical content on a second pass', () => {
    const first = fromJSONBackup(toJSONBackup({ settings, categories, expenses }))
    const a = toJSONBackup({ settings: first.settings!, categories: first.categories, expenses: first.expenses })
    const b = toJSONBackup({ settings: first.settings!, categories: first.categories, expenses: first.expenses })
    // exportedAt is the only field that moves, and both passes are stamped the same
    // way, so the payloads have to match.
    expect(stripTimestamp(a)).toEqual(stripTimestamp(b))
  })

  it('invents a category for an expense whose category is missing', () => {
    const text = JSON.stringify({ version: 1, categories: [], expenses, settings })
    const result = fromJSONBackup(text)
    expect(result.categories.map((c) => c.id).sort()).toEqual(['cat-fun', 'cat-groceries'])
  })

  it('refuses a file that is not a backup', () => {
    expect(() => fromJSONBackup('{"hello":true}')).toThrow()
    expect(() => fromJSONBackup('not json')).toThrow()
  })
})

describe('CSV backup', () => {
  it('round-trips expenses without loss, notes and all', () => {
    const result = fromCSVBackup(toCSVBackup({ settings, categories, expenses }))
    expect(result.expenses).toEqual(expenses)
  })

  it('round-trips category caps, archive state and order', () => {
    const result = fromCSVBackup(toCSVBackup({ settings, categories, expenses }))
    const byId = new Map(result.categories.map((c) => [c.id, c]))
    expect(byId.get('cat-groceries')).toEqual(categories[0])
    expect(byId.get('cat-fun')).toEqual(categories[1])
    expect(byId.get('cat-unused')).toEqual(categories[2])
  })

  it('re-exports identical CSV after an import', () => {
    const csv = toCSVBackup({ settings, categories, expenses })
    const back = fromCSVBackup(csv)
    expect(toCSVBackup({ settings, categories: back.categories, expenses: back.expenses })).toBe(csv)
  })

  it('reads a hand-made CSV with only the human columns', () => {
    const csv = 'date,amount,category\n2026-08-04,12.50,Groceries\n2026-08-05,3,Coffee'
    const result = fromCSVBackup(csv)
    expect(result.expenses.map((e) => e.amount)).toEqual([1_250, 300])
    expect(result.categories.map((c) => c.name)).toEqual(['Groceries', 'Coffee'])
  })

  it('refuses a CSV with no date or amount column', () => {
    expect(() => fromCSVBackup('name,total\nfoo,1')).toThrow()
  })
})

function stripTimestamp(json: string): unknown {
  const parsed = JSON.parse(json) as Record<string, unknown>
  delete parsed.exportedAt
  return parsed
}

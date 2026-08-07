import { useSyncExternalStore } from 'react'
import type { Category, Expense, Settings } from '../types'
import {
  STORE_CATEGORIES,
  STORE_EXPENSES,
  clearStores,
  deleteMany,
  getAll,
  putMany,
  replaceAll,
} from '../db/idb'
import { CATCH_ALL_ID, seedCategories } from '../db/seedCategories'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings'

/**
 * The whole record set lives in memory and is mirrored to IndexedDB on write.
 * A hand-kept spending log runs to thousands of rows at most, so this keeps every
 * selector a plain synchronous function over an array — and means nothing on
 * screen ever waits on storage.
 */
export interface State {
  /** False until the first read from IndexedDB resolves. */
  ready: boolean
  /** Set when IndexedDB is unavailable (private mode, blocked storage). */
  storageError: string | null
  expenses: Expense[]
  categories: Category[]
  settings: Settings
}

let state: State = {
  ready: false,
  storageError: null,
  expenses: [],
  categories: [],
  settings: DEFAULT_SETTINGS,
}

const listeners = new Set<() => void>()

function setState(patch: Partial<State>) {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function getSnapshot() {
  return state
}

export function useStore(): State {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function getState(): State {
  return state
}

/* ---------- Boot ---------- */

let initPromise: Promise<void> | null = null

export function init(): Promise<void> {
  if (initPromise) return initPromise
  initPromise = (async () => {
    const settings = loadSettings()
    try {
      const [expenses, categories] = await Promise.all([
        getAll<Expense>(STORE_EXPENSES),
        getAll<Category>(STORE_CATEGORIES),
      ])

      if (categories.length === 0) {
        const seeded = seedCategories()
        await putMany(STORE_CATEGORIES, seeded)
        setState({ ready: true, expenses: sortExpenses(expenses), categories: seeded, settings })
        return
      }

      setState({
        ready: true,
        expenses: sortExpenses(expenses),
        categories: sortCategories(categories),
        settings,
      })
    } catch (err) {
      // Still usable this session; nothing will persist. Surfaced in Settings.
      setState({
        ready: true,
        storageError: err instanceof Error ? err.message : 'Storage is unavailable',
        expenses: [],
        categories: seedCategories(),
        settings,
      })
    }
  })()
  return initPromise
}

/** Newest first: date descending, then createdAt descending. */
function sortExpenses(list: Expense[]): Expense[] {
  return [...list].sort((a, b) =>
    a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date),
  )
}

function sortCategories(list: Category[]): Category[] {
  return [...list].sort((a, b) => a.sortWeight - b.sortWeight || a.name.localeCompare(b.name))
}

/** Writes that fail (quota, private mode) must not roll back what is on screen. */
function persist(op: () => Promise<void>) {
  void op().catch((err) => {
    setState({ storageError: err instanceof Error ? err.message : 'Could not save to this device' })
  })
}

/* ---------- Expenses ---------- */

export function addExpense(e: Expense): void {
  setState({ expenses: sortExpenses([e, ...state.expenses]) })
  persist(() => putMany(STORE_EXPENSES, [e]))
}

export function updateExpense(e: Expense): void {
  setState({ expenses: sortExpenses(state.expenses.map((x) => (x.id === e.id ? e : x))) })
  persist(() => putMany(STORE_EXPENSES, [e]))
}

export function updateExpenses(list: Expense[]): void {
  if (list.length === 0) return
  const byId = new Map(list.map((e) => [e.id, e]))
  setState({ expenses: sortExpenses(state.expenses.map((x) => byId.get(x.id) ?? x)) })
  persist(() => putMany(STORE_EXPENSES, list))
}

export function deleteExpenses(ids: string[]): void {
  const set = new Set(ids)
  setState({ expenses: state.expenses.filter((e) => !set.has(e.id)) })
  persist(() => deleteMany(STORE_EXPENSES, ids))
}

/** Undo for a delete: the removed records go back exactly as they were. */
export function restoreExpenses(list: Expense[]): void {
  const existing = new Set(state.expenses.map((e) => e.id))
  const fresh = list.filter((e) => !existing.has(e.id))
  if (fresh.length === 0) return
  setState({ expenses: sortExpenses([...fresh, ...state.expenses]) })
  persist(() => putMany(STORE_EXPENSES, fresh))
}

/* ---------- Categories ---------- */

export function addCategory(c: Category): void {
  setState({ categories: sortCategories([...state.categories, c]) })
  persist(() => putMany(STORE_CATEGORIES, [c]))
}

export function updateCategory(c: Category): void {
  setState({ categories: sortCategories(state.categories.map((x) => (x.id === c.id ? c : x))) })
  persist(() => putMany(STORE_CATEGORIES, [c]))
}

export function updateCategories(list: Category[]): void {
  if (list.length === 0) return
  const byId = new Map(list.map((c) => [c.id, c]))
  setState({ categories: sortCategories(state.categories.map((x) => byId.get(x.id) ?? x)) })
  persist(() => putMany(STORE_CATEGORIES, list))
}

export function setCategoryArchived(id: string, isArchived: boolean): void {
  const cat = state.categories.find((c) => c.id === id)
  if (!cat) return
  updateCategory({ ...cat, isArchived })
}

/**
 * Removes a category outright. The caller has to have moved its expenses first —
 * see reassignAndDeleteCategory, which is the only route the UI offers.
 */
export function deleteCategory(id: string): void {
  setState({ categories: state.categories.filter((c) => c.id !== id) })
  persist(() => deleteMany(STORE_CATEGORIES, [id]))
}

/** Where a deleted category's expenses should land. */
export function reassignTargetFor(id: string): Category | null {
  const others = state.categories.filter((c) => c.id !== id && !c.isArchived)
  return others.find((c) => c.id === CATCH_ALL_ID) ?? others[0] ?? null
}

/**
 * Deletes a category and moves everything filed under it to the catch-all, so no
 * expense is ever orphaned. Returns what is needed to put it all back.
 */
export function reassignAndDeleteCategory(id: string): {
  category: Category
  movedExpenses: Expense[]
  target: Category
} | null {
  const category = state.categories.find((c) => c.id === id)
  const target = reassignTargetFor(id)
  if (!category || !target) return null

  const movedExpenses = state.expenses.filter((e) => e.categoryId === id)
  updateExpenses(movedExpenses.map((e) => ({ ...e, categoryId: target.id })))
  deleteCategory(id)
  return { category, movedExpenses, target }
}

/** The Undo half of the above. */
export function restoreCategory(category: Category, movedExpenses: Expense[]): void {
  addCategory(category)
  updateExpenses(movedExpenses)
}

/* ---------- Settings ---------- */

export function setSettings(patch: Partial<Settings>): void {
  const next = { ...state.settings, ...patch }
  setState({ settings: next })
  saveSettings(next)
}

/* ---------- Bulk data ---------- */

export function importData(payload: {
  expenses: Expense[]
  categories: Category[]
  settings?: Settings
}): void {
  const categories = payload.categories.length ? payload.categories : seedCategories()
  setState({
    expenses: sortExpenses(payload.expenses),
    categories: sortCategories(categories),
    ...(payload.settings ? { settings: payload.settings } : {}),
  })
  if (payload.settings) saveSettings(payload.settings)
  persist(() => replaceAll({ expenses: payload.expenses, categories }))
}

/** Merges imported expenses into what is already there, by id. */
export function mergeExpenses(list: Expense[]): void {
  const byId = new Map(state.expenses.map((e) => [e.id, e]))
  for (const e of list) byId.set(e.id, e)
  const merged = [...byId.values()]
  setState({ expenses: sortExpenses(merged) })
  persist(() => putMany(STORE_EXPENSES, list))
}

export function deleteAllData(): void {
  const seeded = seedCategories()
  setState({ expenses: [], categories: seeded })
  persist(async () => {
    await clearStores([STORE_EXPENSES, STORE_CATEGORIES])
    await putMany(STORE_CATEGORIES, seeded)
  })
}

import type { Category, ColorSlot, Expense, Settings } from '../types'
import { majorToMinor, minorToDecimalString, parseMoneyInput } from './money'
import { parseCSV, toCSV } from './csv'
import { normalizeSettings } from '../store/settings'
import { nextColorSlot } from '../db/seedCategories'

/**
 * Export is the trust guarantee that stands in for having an account, and the only
 * way off this device — so both formats have to come back in without loss.
 */

export const BACKUP_VERSION = 1

export interface BackupPayload {
  version: number
  exportedAt: string
  settings: Settings
  categories: Category[]
  expenses: Expense[]
}

export interface ImportResult {
  expenses: Expense[]
  categories: Category[]
  settings?: Settings
  /** Set when the file came from another app and had to be converted. */
  conversion?: ConversionReport
}

export interface ImportOptions {
  /** Currency to stamp on records that carry none. */
  currency?: string
  /**
   * The categories already on this device. A name that already exists keeps its id,
   * emoji, colour and cap instead of arriving as a duplicate.
   */
  existingCategories?: Category[]
}

/** What a foreign file needed doing to it, so the user can be told. */
export interface ConversionReport {
  /** Amounts were stored in major units and were multiplied up. */
  scaledAmounts: boolean
  /** Amounts carrying fractions of a cent, rounded to the nearest cent. */
  roundedAmounts: number
  /** Categories referenced by name and matched to one already here. */
  matchedCategories: string[]
  /** Categories created for this import. */
  createdCategories: string[]
  /** Fields in the file this app has no use for. */
  ignoredFields: string[]
}

/* ---------- JSON ---------- */

export function toJSONBackup(data: {
  settings: Settings
  categories: Category[]
  expenses: Expense[]
}): string {
  const payload: BackupPayload = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: data.settings,
    categories: data.categories,
    expenses: data.expenses,
  }
  return JSON.stringify(payload, null, 2)
}

export function fromJSONBackup(text: string, opts: ImportOptions = {}): ImportResult {
  const raw = JSON.parse(text) as unknown
  if (!raw || typeof raw !== 'object') throw new Error('That file is not a backup.')

  // Some apps export a bare list of expenses rather than an object.
  const parsed = (Array.isArray(raw) ? { expenses: raw } : raw) as Partial<BackupPayload> & {
    expenses?: unknown[]
    categories?: unknown[]
  }

  if (!Array.isArray(parsed.expenses)) {
    throw new Error('That file has no expenses in it.')
  }
  if (parsed.expenses.length === 0 && !Array.isArray(parsed.categories)) {
    throw new Error('There is nothing in that file.')
  }

  if (!isNativeBackup(parsed)) return fromForeignJSON(parsed, opts)

  if (!Array.isArray(parsed.categories)) {
    throw new Error('That backup is missing its categories.')
  }

  const categories = parsed.categories.map(normalizeCategory)
  const known = new Set(categories.map((c) => c.id))
  const expenses = parsed.expenses.map((e) =>
    normalizeExpense(e, parsed.settings?.currency ?? opts.currency ?? 'EUR'),
  )

  // An expense pointing at a category that is not in the file would be invisible.
  for (const e of expenses) {
    if (!known.has(e.categoryId)) {
      categories.push(placeholderCategory(e.categoryId, categories.length))
      known.add(e.categoryId)
    }
  }

  return {
    expenses,
    categories,
    ...(parsed.settings ? { settings: normalizeSettings(parsed.settings) } : {}),
  }
}

/* ---------- Files from other apps ---------- */

/**
 * A native backup files expenses under a categoryId and gives every category an id
 * and a palette slot. Anything else is another app's export and gets converted,
 * because reading it as native would quietly wreck it: an amount of 6.2 taken as
 * minor units is six cents, and a missing categoryId collapses every row into one
 * nameless category.
 */
function isNativeBackup(payload: { expenses?: unknown[]; categories?: unknown[] }): boolean {
  const expense = payload.expenses?.[0] as Partial<Expense> | undefined
  const category = payload.categories?.[0] as Partial<Category> | undefined

  const expenseIsNative = !expense || typeof expense.categoryId === 'string'
  const categoryIsNative =
    !category || (typeof category.id === 'string' && category.colorSlot !== undefined)

  return expenseIsNative && categoryIsNative
}

/** Category names this app can give a sensible icon to without being asked. */
const EMOJI_BY_NAME: Array<[RegExp, string]> = [
  [/^(groceries|grocery|supermarket|food|food shopping)$/i, '🛒'],
  [/^(eating out|restaurant|restaurants|dining|takeaway|takeout|lunch)$/i, '🍽️'],
  [/^(coffee|cafe|café)$/i, '☕'],
  [/^(drinks|bar|pub|alcohol)$/i, '🍺'],
  [/^(transport|transit|commute|bus|train|public transport)$/i, '🚌'],
  [/^(fuel|petrol|gas|diesel)$/i, '⛽'],
  [/^(car|vehicle|parking)$/i, '🚗'],
  [/^(taxi|rides?|cab)$/i, '🚕'],
  [/^(utilities|bill|bills|energy|electricity|water|heating)$/i, '💡'],
  [/^(rent|mortgage|home|household|housing|house)$/i, '🏠'],
  [/^(internet|phone|mobile|telecom)$/i, '📶'],
  [/^(entertainment|fun|leisure|going out)$/i, '🎬'],
  [/^(subscription|subscriptions|streaming)$/i, '🔁'],
  [/^(health|medical|pharmacy|doctor|dentist)$/i, '🩺'],
  [/^(fitness|gym|sport|sports)$/i, '🏋️'],
  [/^(shopping|clothes|clothing|fashion)$/i, '🛍️'],
  [/^(travel|holiday|holidays|trip|trips|vacation|flights?)$/i, '✈️'],
  [/^(gift|gifts|presents?)$/i, '🎁'],
  [/^(education|book|books|course|courses|school)$/i, '📚'],
  [/^(pet|pets|dog|cat)$/i, '🐾'],
  [/^(kid|kids|children|childcare|baby)$/i, '🧸'],
  [/^(beauty|hair|cosmetics)$/i, '💅'],
  [/^(charity|donations?)$/i, '🤝'],
  [/^(other|misc|miscellaneous|uncategorised|uncategorized|unsorted)$/i, '📦'],
]

/** Best-guess icon for an imported category name. */
export function categoryEmojiFor(name: string): string {
  const trimmed = name.trim()
  for (const [pattern, emoji] of EMOJI_BY_NAME) {
    if (pattern.test(trimmed)) return emoji
  }
  // Fall back to a loose match, so "Food & drink" still finds the groceries icon.
  const lower = trimmed.toLowerCase()
  for (const [pattern, emoji] of EMOJI_BY_NAME) {
    const words = pattern.source.replace(/[$^()]/g, '').split('|')
    if (words.some((w) => w.length > 3 && lower.includes(w))) return emoji
  }
  return '🏷️'
}

const KNOWN_FOREIGN_FIELDS = ['receipts', 'color', 'colour', 'tags', 'account', 'paymentMethod']

/**
 * Converts another app's export. Amounts arrive in major units, categories are
 * referenced by name, and neither carries a currency or a created time.
 */
function fromForeignJSON(
  payload: { expenses?: unknown[]; categories?: unknown[]; settings?: unknown },
  opts: ImportOptions,
): ImportResult {
  const currency = opts.currency ?? 'EUR'
  const existing = opts.existingCategories ?? []
  const byName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c]))

  const report: ConversionReport = {
    scaledAmounts: true,
    roundedAmounts: 0,
    matchedCategories: [],
    createdCategories: [],
    ignoredFields: [],
  }

  const categories: Category[] = []
  const byKey = new Map<string, Category>()

  /** Resolves a category name to a real category, creating one only if needed. */
  const resolve = (rawName: string): Category => {
    const name = rawName.trim() || 'Other'
    const key = name.toLowerCase()
    const already = byKey.get(key)
    if (already) return already

    const match = byName.get(key)
    if (match) {
      // Keep its id, colour and cap: colour follows a category permanently, and a
      // cap the user has already set should survive a restore.
      report.matchedCategories.push(match.name)
      const kept: Category = { ...match, isArchived: false, sortWeight: categories.length }
      categories.push(kept)
      byKey.set(key, kept)
      return kept
    }

    report.createdCategories.push(name)
    const created: Category = {
      id: `${slugFor(name) || 'category'}-${categories.length + 1}`,
      name,
      emoji: categoryEmojiFor(name),
      // Assigned by creation order, per the fixed palette — the file's own hex
      // colours are outside it and are not carried over.
      colorSlot: nextColorSlot(categories),
      monthlyCap: null,
      isArchived: false,
      sortWeight: categories.length,
    }
    categories.push(created)
    byKey.set(key, created)
    return created
  }

  // Declared categories first, so palette slots follow the file's own order rather
  // than the order expenses happen to mention them in.
  for (const raw of payload.categories ?? []) {
    const c = (raw ?? {}) as Record<string, unknown>
    const name = typeof c.name === 'string' ? c.name : typeof c.title === 'string' ? c.title : ''
    if (name.trim()) resolve(name)
    for (const field of KNOWN_FOREIGN_FIELDS) {
      if (field in c && !report.ignoredFields.includes(field)) report.ignoredFields.push(field)
    }
  }

  const expenses: Expense[] = []
  const seenIds = new Set<string>()

  ;(payload.expenses ?? []).forEach((raw, index) => {
    const e = (raw ?? {}) as Record<string, unknown>

    const date = readDate(e)
    if (!date) return

    const major = Number(e.amount ?? e.value ?? e.total)
    if (!Number.isFinite(major) || major === 0) return
    const minor = majorToMinor(Math.abs(major))
    // Half-cents exist in the wild; note how many so the arithmetic is not silent.
    if (Math.abs(Math.abs(major) * 100 - minor) > 0.001) report.roundedAmounts += 1

    const categoryName =
      typeof e.category === 'string'
        ? e.category
        : typeof e.categoryName === 'string'
          ? e.categoryName
          : 'Other'
    const category = resolve(categoryName)

    let id = typeof e.id === 'string' && e.id ? e.id : `imported-${index + 1}`
    while (seenIds.has(id)) id = `${id}-${index + 1}`
    seenIds.add(id)

    for (const field of KNOWN_FOREIGN_FIELDS) {
      if (field in e && !report.ignoredFields.includes(field)) report.ignoredFields.push(field)
    }

    const note = typeof e.note === 'string' ? e.note : typeof e.description === 'string' ? e.description : ''

    expenses.push({
      id,
      amount: minor,
      currency: typeof e.currency === 'string' && e.currency ? e.currency : currency,
      categoryId: category.id,
      note: note.slice(0, 120),
      date,
      createdAt: readCreatedAt(e, date),
      isRecurringHint: e.isRecurringHint === true || e.recurring === true,
    })
  })

  if (expenses.length === 0) {
    throw new Error('No expenses in that file could be read.')
  }

  return { expenses, categories, conversion: report }
}

/** Accepts YYYY-MM-DD, an ISO datetime, or a millisecond timestamp. */
function readDate(e: Record<string, unknown>): string | null {
  const value = e.date ?? e.day ?? e.timestamp ?? e.createdAt
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
    if (match) return match[1]
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return localISODate(parsed)
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return localISODate(parsed)
  }
  return null
}

function readCreatedAt(e: Record<string, unknown>, date: string): string {
  const value = e.createdAt ?? e.created ?? e.timestamp
  if (typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  // Midday keeps the record inside its own day in every timezone.
  return new Date(`${date}T12:00:00`).toISOString()
}

function localISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/* ---------- CSV ---------- */

/**
 * Readable columns first, then the fields needed to reconstruct state exactly.
 * The category attributes repeat per row — the standard denormalised CSV trade —
 * which is what lets a CSV round trip keep caps, order and archive state.
 */
const CSV_COLUMNS = [
  'date',
  'amount',
  'currency',
  'category',
  'emoji',
  'note',
  'recurring',
  'id',
  'createdAt',
  'categoryId',
  'colorSlot',
  'monthlyCap',
  'archived',
  'sortWeight',
  // Appended rather than slotted in beside `amount`, so a spreadsheet or script
  // built against an earlier export still finds every column where it was.
  'fullAmount',
  'sharePct',
] as const

export function toCSVBackup(data: {
  settings: Settings
  categories: Category[]
  expenses: Expense[]
}): string {
  const byId = new Map(data.categories.map((c) => [c.id, c]))
  const rows: string[][] = [[...CSV_COLUMNS]]

  for (const e of data.expenses) {
    const c = byId.get(e.categoryId)
    rows.push([
      e.date,
      minorToDecimalString(e.amount),
      e.currency,
      c?.name ?? '',
      c?.emoji ?? '',
      e.note,
      e.isRecurringHint ? 'yes' : 'no',
      e.id,
      e.createdAt,
      e.categoryId,
      c ? String(c.colorSlot) : '',
      c?.monthlyCap != null ? minorToDecimalString(c.monthlyCap) : '',
      c?.isArchived ? 'yes' : 'no',
      c ? String(c.sortWeight) : '',
      e.fullAmount != null ? minorToDecimalString(e.fullAmount) : '',
      e.sharePct != null ? String(e.sharePct) : '',
    ])
  }

  // Categories with no expenses this export would otherwise vanish.
  for (const c of data.categories) {
    if (data.expenses.some((e) => e.categoryId === c.id)) continue
    rows.push([
      '',
      '',
      '',
      c.name,
      c.emoji,
      '',
      'no',
      '',
      '',
      c.id,
      String(c.colorSlot),
      c.monthlyCap != null ? minorToDecimalString(c.monthlyCap) : '',
      c.isArchived ? 'yes' : 'no',
      String(c.sortWeight),
      '',
      '',
    ])
  }

  return toCSV(rows)
}

export function fromCSVBackup(text: string, fallbackCurrency = 'EUR'): ImportResult {
  const rows = parseCSV(text)
  if (rows.length === 0) throw new Error('That file is empty.')

  const header = rows[0].map((h) => h.trim())
  const index = (name: string) => header.indexOf(name)
  const iDate = index('date')
  const iAmount = index('amount')
  if (iDate < 0 || iAmount < 0) {
    throw new Error('That CSV has no date and amount columns.')
  }

  const iCurrency = index('currency')
  const iCategory = index('category')
  const iEmoji = index('emoji')
  const iNote = index('note')
  const iRecurring = index('recurring')
  const iId = index('id')
  const iCreatedAt = index('createdAt')
  const iCategoryId = index('categoryId')
  const iColorSlot = index('colorSlot')
  const iCap = index('monthlyCap')
  const iArchived = index('archived')
  const iSortWeight = index('sortWeight')
  const iFullAmount = index('fullAmount')
  const iSharePct = index('sharePct')

  const categories = new Map<string, Category>()
  const expenses: Expense[] = []

  const cell = (row: string[], i: number) => (i >= 0 ? (row[i] ?? '').trim() : '')

  rows.slice(1).forEach((row, n) => {
    const name = cell(row, iCategory)
    const categoryId = cell(row, iCategoryId) || slugFor(name) || `imported-${n}`

    if (!categories.has(categoryId)) {
      const capMinor = parseMoneyInput(cell(row, iCap))
      const slot = Number(cell(row, iColorSlot))
      const weight = Number(cell(row, iSortWeight))
      categories.set(categoryId, {
        id: categoryId,
        name: name || 'Imported',
        emoji: cell(row, iEmoji) || '🏷️',
        colorSlot: (slot >= 1 && slot <= 8 ? slot : (categories.size % 8) + 1) as ColorSlot,
        monthlyCap: capMinor != null && capMinor > 0 ? capMinor : null,
        isArchived: cell(row, iArchived).toLowerCase() === 'yes',
        sortWeight: Number.isFinite(weight) ? weight : categories.size,
      })
    }

    const date = cell(row, iDate)
    const amount = parseMoneyInput(cell(row, iAmount))
    // Category-only rows carry no date or amount; they exist to preserve the category.
    if (!date || amount == null || amount === 0) return

    expenses.push({
      id: cell(row, iId) || `${date}-${amount}-${n}`,
      amount: Math.abs(amount),
      currency: cell(row, iCurrency) || fallbackCurrency,
      categoryId,
      note: iNote >= 0 ? (row[iNote] ?? '') : '',
      date,
      // A hand-made CSV will not have this column; midday keeps it inside the day
      // in every timezone.
      createdAt: cell(row, iCreatedAt) || new Date(`${date}T12:00:00`).toISOString(),
      isRecurringHint: cell(row, iRecurring).toLowerCase() === 'yes',
      ...readSplit(parseMoneyInput(cell(row, iFullAmount)), Number(cell(row, iSharePct))),
    })
  })

  if (expenses.length === 0 && categories.size === 0) {
    throw new Error('No rows could be read from that CSV.')
  }

  return { expenses, categories: [...categories.values()] }
}

/* ---------- Normalising ---------- */

function normalizeCategory(input: unknown): Category {
  const c = (input ?? {}) as Partial<Category>
  const slot = Number(c.colorSlot)
  return {
    id: String(c.id ?? ''),
    name: String(c.name ?? 'Imported'),
    emoji: String(c.emoji ?? '🏷️'),
    colorSlot: (slot >= 1 && slot <= 8 ? slot : 1) as ColorSlot,
    monthlyCap:
      typeof c.monthlyCap === 'number' && Number.isFinite(c.monthlyCap) && c.monthlyCap > 0
        ? Math.round(c.monthlyCap)
        : null,
    isArchived: c.isArchived === true,
    sortWeight: Number.isFinite(Number(c.sortWeight)) ? Number(c.sortWeight) : 0,
  }
}

function normalizeExpense(input: unknown, fallbackCurrency: string): Expense {
  const e = (input ?? {}) as Partial<Expense>
  const amount = Math.round(Number(e.amount))
  if (!Number.isFinite(amount)) throw new Error('An expense in that file has no readable amount.')
  const date = String(e.date ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('An expense in that file has no readable date.')

  return {
    id: String(e.id ?? `${date}-${amount}`),
    amount: Math.abs(amount),
    currency: String(e.currency ?? fallbackCurrency),
    categoryId: String(e.categoryId ?? ''),
    note: String(e.note ?? '').slice(0, 120),
    date,
    createdAt: typeof e.createdAt === 'string' ? e.createdAt : new Date(`${date}T12:00:00`).toISOString(),
    isRecurringHint: e.isRecurringHint === true,
    ...readSplit(e.fullAmount, e.sharePct),
  }
}

/**
 * The split pair, or nothing at all. Half a pair is worse than none: a share with
 * no bill behind it cannot be shown, and a bill with no share would let an edit
 * reopen the row at the wrong amount.
 */
function readSplit(
  fullMinor: unknown,
  pct: unknown,
): { fullAmount: number; sharePct: number } | undefined {
  const full = Math.round(Number(fullMinor))
  const share = Math.trunc(Number(pct))
  if (!Number.isFinite(full) || full <= 0) return undefined
  if (!Number.isFinite(share) || share < 1 || share > 99) return undefined
  return { fullAmount: full, sharePct: share }
}

function placeholderCategory(id: string, order: number): Category {
  return {
    id,
    name: 'Imported',
    emoji: '🏷️',
    colorSlot: ((order % 8) + 1) as ColorSlot,
    monthlyCap: null,
    isArchived: false,
    sortWeight: order,
  }
}

function slugFor(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/* ---------- Download helper ---------- */

export function downloadFile(filename: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoking immediately can cancel the download on some engines.
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function backupFilename(extension: string, now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `spend-${y}-${m}-${d}.${extension}`
}

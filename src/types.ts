/** Data model — section 4 of the requirements. */

export type ColorSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export interface Expense {
  id: string
  /** Minor units (cents). Integer, never a float. */
  amount: number
  currency: string
  categoryId: string
  /** Optional, max 120 chars. */
  note: string
  /** ISO date, YYYY-MM-DD. */
  date: string
  /** ISO datetime. */
  createdAt: string
  /** Set by the app when it detects a repeat pattern. */
  isRecurringHint: boolean
}

export interface Category {
  id: string
  name: string
  /** A single emoji as the icon — no icon library needed. */
  emoji: string
  colorSlot: ColorSlot
  /** Minor units; null means untracked. */
  monthlyCap: number | null
  isArchived: boolean
  /**
   * Manual order from Settings. Chip order in the add sheet is recency-frequency
   * first (see selectors.chipOrder) and falls back to this for ties.
   */
  sortWeight: number
}

export type ThemePref = 'system' | 'light' | 'dark'

export interface Settings {
  currency: string
  currencySymbol: string
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn: 0 | 1
  theme: ThemePref
  /** 1..28 — the day a spending month begins. */
  monthStartDay: number
}

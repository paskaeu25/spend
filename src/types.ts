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
  /**
   * Split rows only — something paid from a joint account. `fullAmount` is what
   * was actually paid and `sharePct` the part of it that is the user's; `amount`
   * stays that share, so every total, cap, chart and export sees the same
   * "what I spent" figure it always has. Absent on an ordinary expense.
   */
  fullAmount?: number
  /** 1–99. Present exactly when fullAmount is. */
  sharePct?: number
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
  /** Shows the Split control in the add sheet. Off unless asked for. */
  splitEnabled: boolean
  /** 1..99 — the share applied when Split is switched on. */
  defaultSharePct: number
}

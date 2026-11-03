import type { Category, ColorSlot } from '../types'

/**
 * Default categories, created on first boot so the app is usable immediately —
 * no category setup step before the first expense.
 *
 * Colour follows creation order and then belongs to the category permanently.
 * "Other" is the catch-all the uncategorised-drift insight watches.
 */
const DEFAULTS: Array<Pick<Category, 'id' | 'name' | 'emoji'>> = [
  { id: 'cat-groceries', name: 'Groceries', emoji: '🛒' },
  { id: 'cat-eating-out', name: 'Eating out', emoji: '🍽️' },
  { id: 'cat-transport', name: 'Transport', emoji: '🚌' },
  { id: 'cat-home', name: 'Home', emoji: '🏠' },
  { id: 'cat-fun', name: 'Fun', emoji: '🎬' },
  { id: 'cat-health', name: 'Health', emoji: '🩺' },
  { id: 'cat-shopping', name: 'Shopping', emoji: '🛍️' },
  { id: 'cat-other', name: 'Other', emoji: '📦' },
]

/** The catch-all category id, for the uncategorised-drift rule. */
export const CATCH_ALL_ID = 'cat-other'

export function seedCategories(): Category[] {
  return DEFAULTS.map((d, i) => ({
    ...d,
    colorSlot: ((i % 8) + 1) as ColorSlot,
    isArchived: false,
    sortWeight: i,
  }))
}

/**
 * The colour for a newly created category: the first unused slot, else the slot
 * after the highest in use. A ninth category shares a hue and leans on its emoji
 * for identity — which is why charts cap at six bars.
 */
export function nextColorSlot(existing: Category[]): ColorSlot {
  const used = new Set(existing.map((c) => c.colorSlot))
  for (let slot = 1; slot <= 8; slot++) {
    if (!used.has(slot as ColorSlot)) return slot as ColorSlot
  }
  return ((existing.length % 8) + 1) as ColorSlot
}

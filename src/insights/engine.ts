import { RULES, type InsightCardData, type InsightContext } from './rules'
import { daysBetween, todayISO } from '../lib/dates'

const KEY = 'et.insightDismissals'
const SUPPRESS_DAYS = 14

type Dismissals = Record<string, string>

function read(): Dismissals {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Dismissals) : {}
  } catch {
    return {}
  }
}

function write(value: Dismissals): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(value))
  } catch {
    // Losing a dismissal is a small cost; breaking the screen is not acceptable.
  }
}

export function dismissInsight(key: string, today = todayISO()): void {
  const all = read()
  all[key] = today
  write(prune(all, today))
}

/** Dismissals older than the suppression window are dead weight. */
function prune(all: Dismissals, today: string): Dismissals {
  const out: Dismissals = {}
  for (const [key, date] of Object.entries(all)) {
    if (daysBetween(date, today) < SUPPRESS_DAYS) out[key] = date
  }
  return out
}

export function isDismissed(key: string, today = todayISO()): boolean {
  const date = read()[key]
  if (!date) return false
  return daysBetween(date, today) < SUPPRESS_DAYS
}

/**
 * At most one card, highest priority first. Returns null when nothing useful can
 * be said — an empty slot beats a filler card.
 */
export function pickInsight(ctx: InsightContext): InsightCardData | null {
  for (const rule of RULES) {
    let card: InsightCardData | null = null
    try {
      card = rule(ctx)
    } catch {
      // One misbehaving rule must not take the screen down with it.
      card = null
    }
    if (card && !isDismissed(card.key, ctx.today)) return card
  }
  return null
}

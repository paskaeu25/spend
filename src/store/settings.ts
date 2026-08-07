import type { Settings } from '../types'
import { clampSharePct } from '../lib/money'

const KEY = 'et.settings'

export const DEFAULT_SETTINGS: Settings = {
  currency: 'EUR',
  currencySymbol: '€',
  weekStartsOn: 1,
  theme: 'system',
  monthStartDay: 1,
  splitEnabled: false,
  defaultSharePct: 50,
}

/** A short list of common currencies. No conversion — one currency, app-wide. */
export const CURRENCIES: Array<{ code: string; symbol: string; name: string }> = [
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'USD', symbol: '$', name: 'US dollar' },
  { code: 'GBP', symbol: '£', name: 'Pound sterling' },
  { code: 'CHF', symbol: 'CHF ', name: 'Swiss franc' },
  { code: 'SEK', symbol: 'kr ', name: 'Swedish krona' },
  { code: 'NOK', symbol: 'kr ', name: 'Norwegian krone' },
  { code: 'DKK', symbol: 'kr ', name: 'Danish krone' },
  { code: 'PLN', symbol: 'zł ', name: 'Polish złoty' },
  { code: 'CZK', symbol: 'Kč ', name: 'Czech koruna' },
  { code: 'HUF', symbol: 'Ft ', name: 'Hungarian forint' },
  { code: 'RON', symbol: 'lei ', name: 'Romanian leu' },
  { code: 'BGN', symbol: 'лв ', name: 'Bulgarian lev' },
  { code: 'UAH', symbol: '₴', name: 'Ukrainian hryvnia' },
  { code: 'TRY', symbol: '₺', name: 'Turkish lira' },
  { code: 'CAD', symbol: '$', name: 'Canadian dollar' },
  { code: 'AUD', symbol: '$', name: 'Australian dollar' },
  { code: 'JPY', symbol: '¥', name: 'Japanese yen' },
  { code: 'INR', symbol: '₹', name: 'Indian rupee' },
  { code: 'BRL', symbol: 'R$ ', name: 'Brazilian real' },
  { code: 'ZAR', symbol: 'R ', name: 'South African rand' },
]

export function symbolFor(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code + ' '
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_SETTINGS
    return normalizeSettings(JSON.parse(raw))
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // A full or blocked storage quota must not break the session.
  }
}

/** Accepts partial or foreign-shaped input (import, older versions). */
export function normalizeSettings(input: unknown): Settings {
  const o = (input ?? {}) as Partial<Settings>
  const currency = typeof o.currency === 'string' && o.currency ? o.currency : DEFAULT_SETTINGS.currency
  return {
    currency,
    currencySymbol:
      typeof o.currencySymbol === 'string' && o.currencySymbol ? o.currencySymbol : symbolFor(currency),
    weekStartsOn: o.weekStartsOn === 0 ? 0 : 1,
    theme: o.theme === 'light' || o.theme === 'dark' ? o.theme : 'system',
    monthStartDay: clampMonthStartDay(o.monthStartDay),
    splitEnabled: o.splitEnabled === true,
    defaultSharePct: clampSharePct(o.defaultSharePct),
  }
}

export function clampMonthStartDay(day: unknown): number {
  const n = Math.trunc(Number(day))
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(n, 28)
}

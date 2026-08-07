import { describe, expect, it } from 'vitest'
import {
  amountToMinor,
  clampSharePct,
  displayAmount,
  emptyAmount,
  formatMoney,
  keypadReducer,
  median,
  minorToAmount,
  minorToDecimalString,
  parseMoneyInput,
  roundCapSuggestion,
  splitShare,
  type AmountEntry,
  type KeypadKey,
} from './money'

function type(keys: string): AmountEntry {
  let state = emptyAmount
  for (const ch of keys) {
    const key: KeypadKey =
      ch === '.' ? { type: 'decimal' } : ch === '<' ? { type: 'backspace' } : { type: 'digit', value: ch }
    state = keypadReducer(state, key)
  }
  return state
}

describe('keypad entry', () => {
  it('builds minor units from typed digits', () => {
    expect(amountToMinor(type('1250'))).toBe(125000)
    expect(amountToMinor(type('12.50'))).toBe(1250)
    expect(amountToMinor(type('0.05'))).toBe(5)
  })

  it('treats partial decimals as trailing zeros', () => {
    expect(amountToMinor(type('7.'))).toBe(700)
    expect(amountToMinor(type('7.5'))).toBe(750)
  })

  it('refuses a third decimal place', () => {
    expect(type('1.234').raw).toBe('1.23')
  })

  it('allows only one decimal separator', () => {
    expect(type('1.2.3').raw).toBe('1.23')
  })

  it('does not keep a leading zero once a digit is typed', () => {
    expect(type('05').raw).toBe('5')
  })

  it('starts a bare decimal with zero', () => {
    expect(type('.5').raw).toBe('0.5')
    expect(amountToMinor(type('.5'))).toBe(50)
  })

  it('backspaces one character at a time', () => {
    expect(type('12.5<').raw).toBe('12.')
    expect(type('12<<<<<').raw).toBe('')
  })

  it('caps the integer part', () => {
    expect(type('123456789').raw).toBe('1234567')
  })

  it('reads as zero when empty', () => {
    expect(amountToMinor(emptyAmount)).toBe(0)
    expect(displayAmount(emptyAmount)).toBe('0')
  })

  it('round-trips through minorToAmount for edit mode', () => {
    expect(amountToMinor(minorToAmount(1234))).toBe(1234)
    expect(amountToMinor(minorToAmount(500))).toBe(500)
    expect(minorToAmount(500).raw).toBe('5')
    expect(minorToAmount(507).raw).toBe('5.07')
  })
})

describe('formatting', () => {
  it('shows two decimals by default and drops them when compact', () => {
    expect(formatMoney(1250, { symbol: '€' })).toBe('€12.50')
    expect(formatMoney(1200, { symbol: '€', compact: true })).toBe('€12')
    expect(formatMoney(1250, { symbol: '€', compact: true })).toBe('€12.50')
    expect(formatMoney(1250, { symbol: '€', whole: true })).toBe('€13')
  })

  it('keeps the sign outside the symbol', () => {
    expect(formatMoney(-1250, { symbol: '€' })).toBe('-€12.50')
    expect(formatMoney(1250, { symbol: '€', signed: true })).toBe('+€12.50')
  })
})

describe('parsing and helpers', () => {
  it('parses free text amounts, including a comma separator', () => {
    expect(parseMoneyInput('12.50')).toBe(1250)
    expect(parseMoneyInput('12,50')).toBe(1250)
    expect(parseMoneyInput(' 8 ')).toBe(800)
    expect(parseMoneyInput('')).toBeNull()
    expect(parseMoneyInput('abc')).toBeNull()
  })

  it('writes decimal strings for CSV', () => {
    expect(minorToDecimalString(1250)).toBe('12.50')
    expect(minorToDecimalString(5)).toBe('0.05')
    expect(minorToDecimalString(100000)).toBe('1000.00')
  })

  it('rounds cap suggestions to a nudgeable number', () => {
    // Steps get coarser as the figure grows: whole units, then 5, then 10.
    expect(roundCapSuggestion(4_312)).toBe(4_300)
    expect(roundCapSuggestion(12_312)).toBe(12_500)
    expect(roundCapSuggestion(24_312)).toBe(24_000)
    expect(roundCapSuggestion(31_800)).toBe(32_000)
    expect(roundCapSuggestion(0)).toBe(500)
  })

  it('takes a share of a shared bill and stays on whole cents', () => {
    expect(splitShare(4_000, 50)).toBe(2_000)
    expect(splitShare(1_299, 50)).toBe(650)
    expect(splitShare(999, 33)).toBe(330)
    expect(splitShare(1_000, 99)).toBe(990)
    // A half-cent goes to the person keeping the log; there is no second party here.
    expect(splitShare(5, 50)).toBe(3)
    expect(splitShare(0, 50)).toBe(0)
  })

  it('clamps a share to a whole 1-99', () => {
    expect(clampSharePct(50)).toBe(50)
    expect(clampSharePct('33')).toBe(33)
    expect(clampSharePct(33.7)).toBe(33)
    expect(clampSharePct(0)).toBe(50)
    expect(clampSharePct(140)).toBe(99)
    expect(clampSharePct('')).toBe(50)
    expect(clampSharePct('abc', 40)).toBe(40)
  })

  it('takes the median of an even and an odd list', () => {
    expect(median([100, 300, 200])).toBe(200)
    expect(median([100, 200, 300, 400])).toBe(250)
    expect(median([])).toBe(0)
  })
})

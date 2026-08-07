import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonthsISO,
  dayIndexInMonth,
  dayLabel,
  daysBetween,
  isInRange,
  monthLength,
  monthRange,
  shiftMonth,
} from './dates'

describe('monthRange', () => {
  it('spans a calendar month when months start on the 1st', () => {
    expect(monthRange('2026-08-04', 1)).toEqual({ start: '2026-08-01', endExclusive: '2026-09-01' })
  })

  it('starts the month on monthStartDay', () => {
    expect(monthRange('2026-08-20', 15)).toEqual({ start: '2026-08-15', endExclusive: '2026-09-15' })
  })

  it('puts a date before monthStartDay in the previous month', () => {
    expect(monthRange('2026-08-04', 15)).toEqual({ start: '2026-07-15', endExclusive: '2026-08-15' })
  })

  it('crosses the year boundary in both directions', () => {
    expect(monthRange('2026-01-03', 5)).toEqual({ start: '2025-12-05', endExclusive: '2026-01-05' })
    expect(monthRange('2026-12-31', 1)).toEqual({ start: '2026-12-01', endExclusive: '2027-01-01' })
  })

  it('is idempotent on its own start date', () => {
    const range = monthRange('2026-03-09', 7)
    expect(monthRange(range.start, 7)).toEqual(range)
  })

  it('clamps an out-of-range monthStartDay rather than producing nonsense', () => {
    expect(monthRange('2026-08-04', 0).start).toBe('2026-08-01')
    expect(monthRange('2026-08-04', 99).start).toBe('2026-07-28')
  })
})

describe('month arithmetic', () => {
  it('counts the days in a month, February included', () => {
    expect(monthLength(monthRange('2026-02-10', 1))).toBe(28)
    expect(monthLength(monthRange('2024-02-10', 1))).toBe(29)
    expect(monthLength(monthRange('2026-07-10', 1))).toBe(31)
  })

  it('shifts months forward and back', () => {
    const august = monthRange('2026-08-04', 1)
    expect(shiftMonth(august, -1, 1).start).toBe('2026-07-01')
    expect(shiftMonth(august, 1, 1).start).toBe('2026-09-01')
    expect(shiftMonth(monthRange('2026-01-15', 1), -1, 1).start).toBe('2025-12-01')
  })

  it('clamps the day when a month is too short', () => {
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsISO('2026-03-31', -1)).toBe('2026-02-28')
  })

  it('indexes a date within its spending month from zero', () => {
    expect(dayIndexInMonth('2026-08-01', 1)).toBe(0)
    expect(dayIndexInMonth('2026-08-04', 1)).toBe(3)
    expect(dayIndexInMonth('2026-08-16', 15)).toBe(1)
  })
})

describe('day helpers', () => {
  it('counts days between dates across a DST change', () => {
    // Europe/Vilnius springs forward on 2026-03-29.
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
  })

  it('adds days across a month end', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('names today and yesterday', () => {
    expect(dayLabel('2026-08-04', '2026-08-04')).toBe('Today')
    expect(dayLabel('2026-08-03', '2026-08-04')).toBe('Yesterday')
    expect(dayLabel('2026-07-30', '2026-08-04')).not.toMatch(/Today|Yesterday/)
  })

  it('treats a range as half-open', () => {
    const range = monthRange('2026-08-04', 1)
    expect(isInRange('2026-08-01', range)).toBe(true)
    expect(isInRange('2026-08-31', range)).toBe(true)
    expect(isInRange('2026-09-01', range)).toBe(false)
    expect(isInRange('2026-07-31', range)).toBe(false)
  })
})

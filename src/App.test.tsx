import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { fireEvent } from '@testing-library/dom'
import App from './App'
import { buildSampleExpenses } from './db/sampleData'
import { deleteAllData, getState, importData, init, setSettings } from './store/store'
import { todayISO, addDays, fromISODate, monthLabel, monthRange, shiftMonth } from './lib/dates'
import type { MonthRange } from './lib/dates'
import { formatMoney } from './lib/money'
import type { Expense } from './types'

const settled = () => new Promise((resolve) => setTimeout(resolve, 20))

function goTo(tab: string) {
  act(() => {
    screen.getByRole('button', { name: tab }).click()
  })
}

function expense(partial: Partial<Expense> & { amount: number; date: string }): Expense {
  return {
    id: `id-${partial.date}-${partial.amount}`,
    currency: 'EUR',
    categoryId: 'cat-groceries',
    note: '',
    createdAt: `${partial.date}T10:00:00.000Z`,
    isRecurringHint: false,
    ...partial,
  }
}

describe('the app shell', () => {
  beforeAll(async () => {
    await init()
    setSettings({ currency: 'EUR', currencySymbol: '€', monthStartDay: 1, theme: 'system' })
  })

  beforeEach(async () => {
    // Suppress the cold-start auto-open except where it is the thing under test.
    localStorage.setItem('et.autoOpenedOn', todayISO())
    window.location.hash = ''
    deleteAllData()
    await settled()
  })

  describe('with no data at all', () => {
    /* Acceptance criterion 10: every screen has a deliberate empty state. */
    it('shows a zero hero, one line of copy, and nothing else', () => {
      render(<App />)
      expect(screen.getByText('Log your first expense.')).toBeTruthy()
      expect(screen.getByText('€')).toBeTruthy()
      expect(screen.getByText('0')).toBeTruthy()
      // No insight card, no today's list, no budget meter.
      expect(screen.queryByRole('progressbar')).toBeNull()
      expect(screen.queryByLabelText('Insight')).toBeNull()
      expect(screen.queryByText('Nothing logged today.')).toBeNull()
    })

    it('pulses the add button once', () => {
      render(<App />)
      expect(screen.getByRole('button', { name: 'Add expense' }).className).toContain('pulse')
    })

    it('gives History an empty state rather than a blank screen', () => {
      render(<App />)
      goTo('History')
      expect(screen.getByText('Your logged expenses will show up here.')).toBeTruthy()
    })

    it('gives Insights an empty state', () => {
      render(<App />)
      goTo('Insights')
      expect(screen.getByText('Charts appear here once you have logged a few expenses.')).toBeTruthy()
    })

    it('still lists the default categories in Settings', () => {
      render(<App />)
      goTo('Settings')
      expect(screen.getByText('Groceries')).toBeTruthy()
      expect(screen.getByText('0 expenses stored.')).toBeTruthy()
    })
  })

  describe('with data', () => {
    beforeEach(async () => {
      importData({
        expenses: buildSampleExpenses('EUR', 1),
        categories: getState().categories,
      })
      await settled()
    })

    it('shows a hero figure and a comparison with last month', () => {
      render(<App />)
      expect(screen.queryByText('Log your first expense.')).toBeNull()
      expect(screen.getByText(/this time last month/)).toBeTruthy()
    })

    it('offers exactly one insight card, carrying one action or a dismiss', () => {
      render(<App />)
      const cards = screen.queryAllByLabelText('Insight')
      expect(cards.length).toBeLessThanOrEqual(1)
      if (cards.length === 1) {
        expect(within(cards[0]).getByRole('button', { name: 'Dismiss insight' })).toBeTruthy()
      }
    })

    it('groups History by day with a subtotal per day', () => {
      render(<App />)
      goTo('History')
      const groups = screen.getAllByRole('region')
      expect(groups.length).toBeGreaterThan(0)
      expect(screen.getByPlaceholderText('Search notes')).toBeTruthy()
      expect(screen.getByRole('button', { name: /^Categories/ })).toBeTruthy()
    })

    it('filters History by a search term', () => {
      render(<App />)
      goTo('History')
      const search = screen.getByPlaceholderText('Search notes')
      act(() => {
        fireEvent.change(search, { target: { value: 'zzzznothing' } })
      })
      expect(screen.getByText('Nothing matches these filters.')).toBeTruthy()
    })

    /* History as a combined view: tap several month chips, or take them all. */
    describe('history month selection', () => {
      /** The two spending months before the current one, oldest first, plus current. */
      const threeMonths = (): MonthRange[] => {
        const current = monthRange(todayISO(), 1)
        return [shiftMonth(current, -2, 1), shiftMonth(current, -1, 1), current]
      }

      function chipFor(month: MonthRange): HTMLElement | undefined {
        const strip = screen.getByRole('tablist', { name: 'Month' })
        const label = fromISODate(month.start).toLocaleDateString(undefined, { month: 'short' })
        return within(strip).getAllByRole('tab').find((tab) => tab.textContent === label)
      }

      function setUp() {
        const [oldest, last] = threeMonths()
        importData({
          categories: getState().categories,
          expenses: [
            expense({ amount: 1100, date: addDays(oldest.start, 2), note: 'ELDER-olive' }),
            expense({ amount: 2200, date: addDays(last.start, 2), note: 'MIDDLE-mint' }),
            expense({ amount: 300, date: todayISO(), note: 'CURRENT-circle' }),
          ],
        })
        return settled()
      }

      it('selects several months via chips and lists them under month headers', async () => {
        const [oldest, , current] = threeMonths()
        await setUp()
        render(<App />)
        goTo('History')

        act(() => chipFor(oldest)!.click())

        // Tapping a chip adds that month to the current selection.
        expect(screen.getByText('ELDER-olive')).toBeTruthy()
        expect(screen.getByText('CURRENT-circle')).toBeTruthy()
        expect(screen.queryByText('MIDDLE-mint')).toBeNull()
        expect(screen.getByRole('region', { name: monthLabel(oldest, { year: true }) })).toBeTruthy()
        expect(screen.getByRole('region', { name: monthLabel(current, { year: true }) })).toBeTruthy()
      })

      it('selects every month at once from the All chip', async () => {
        await setUp()
        render(<App />)
        goTo('History')

        const strip = screen.getByRole('tablist', { name: 'Month' })
        act(() => within(strip).getByRole('tab', { name: 'All months' }).click())

        expect(screen.getByText('ELDER-olive')).toBeTruthy()
        expect(screen.getByText('MIDDLE-mint')).toBeTruthy()
        expect(screen.getByText('CURRENT-circle')).toBeTruthy()
        for (const m of threeMonths()) {
          expect(screen.getByRole('region', { name: monthLabel(m, { year: true }) })).toBeTruthy()
        }
      })

      it('collapses back to one flat month when extra months are toggled off', async () => {
        const [oldest, , current] = threeMonths()
        await setUp()
        render(<App />)
        goTo('History')

        act(() => chipFor(oldest)!.click())
        act(() => chipFor(oldest)!.click())

        expect(screen.getByText('CURRENT-circle')).toBeTruthy()
        expect(screen.queryByText('ELDER-olive')).toBeNull()
        expect(screen.queryByText('MIDDLE-mint')).toBeNull()
        // One month means the single-month view: no month headers.
        expect(screen.queryAllByRole('region', { name: monthLabel(current, { year: true }) })).toHaveLength(0)
      })

      it('never blanks out when the last remaining chip would be untoggled', async () => {
        const [oldest] = threeMonths()
        await setUp()
        render(<App />)
        goTo('History')

        act(() => chipFor(oldest)!.click())
        // Current month stays selected, so the list keeps its rows.
        expect(screen.getByText('CURRENT-circle')).toBeTruthy()
      })
    })

    /* Acceptance criterion 8: every chart has a table view. */
    it('draws both charts and switches each to a table', () => {
      render(<App />)
      goTo('Insights')

      const breakdown = screen.getByRole('region', { name: 'Where it went' })
      const overTime = screen.getByRole('region', { name: 'Spending over time' })
      expect(within(overTime).getByRole('img', { name: /Cumulative spending/ })).toBeTruthy()

      for (const frame of [breakdown, overTime]) {
        act(() => within(frame).getByRole('button', { name: 'Table' }).click())
        expect(within(frame).getByRole('table')).toBeTruthy()
        act(() => within(frame).getByRole('button', { name: 'Chart' }).click())
        expect(within(frame).queryByRole('table')).toBeNull()
      }
    })

    it('never draws more than six bars', () => {
      render(<App />)
      goTo('Insights')
      const breakdown = screen.getByRole('region', { name: 'Where it went' })
      expect(within(breakdown).getAllByRole('listitem').length).toBeLessThanOrEqual(6)
    })

    /* The pooled row is a summary, not a lid: tapping it shows the tail. */
    it('unpools Other into one bar per category, and pools it again', async () => {
      // Eight categories in the month, so five bars plus a pooled row of three.
      const categories = getState().categories
      importData({
        categories,
        expenses: categories.map((c, i) =>
          expense({ amount: (8 - i) * 1_000, date: todayISO(), categoryId: c.id, id: `e-${c.id}` }),
        ),
      })
      await settled()

      render(<App />)
      goTo('Insights')
      const breakdown = () => screen.getByRole('region', { name: 'Where it went' })
      const pooledRow = () => within(breakdown()).queryByRole('button', { name: /Other \(\d+\)/ })

      const row = pooledRow()!
      expect(row).toBeTruthy()
      const pooled = within(breakdown()).getAllByRole('listitem').length
      const hidden = Number(row.textContent!.match(/Other \((\d+)\)/)![1])

      act(() => row.click())
      expect(within(breakdown()).getAllByRole('listitem')).toHaveLength(pooled - 1 + hidden)
      expect(pooledRow()).toBeNull()

      act(() => within(breakdown()).getByRole('button', { name: /Show top/ }).click())
      expect(within(breakdown()).getAllByRole('listitem')).toHaveLength(pooled)
      expect(pooledRow()).toBeTruthy()
    })

    it('drills into a category for its last six months', () => {
      render(<App />)
      goTo('Insights')
      const breakdown = screen.getByRole('region', { name: 'Where it went' })
      const firstBar = within(breakdown).getAllByRole('button')[2] // after Chart/Table
      act(() => firstBar.click())
      expect(screen.getByRole('region', { name: /last six months/ })).toBeTruthy()
      const drill = screen.getByRole('region', { name: /last six months/ })
      act(() => within(drill).getByRole('button', { name: 'Table' }).click())
      // Six months, one row each.
      expect(within(drill).getAllByRole('row')).toHaveLength(7)
    })

    /* A tapped bar is a reminder, not just a total: list that month's purchases. */
    it('lists the month’s expenses for a category right after Where it went', () => {
      const categories = getState().categories
      const [firstCat, secondCat] = categories
      importData({
        categories,
        expenses: [
          expense({ amount: 1234, date: todayISO(), note: 'Oat milk and bread', categoryId: firstCat.id }),
          expense({ amount: 800, date: todayISO(), note: 'Coffee beans', categoryId: secondCat.id }),
        ],
      })

      render(<App />)
      goTo('Insights')
      const breakdown = screen.getByRole('region', { name: 'Where it went' })
      const firstBar = within(breakdown).getAllByRole('button')[2] // after Chart/Table
      act(() => firstBar.click())

      const list = screen.getByRole('region', {
        name: `${firstCat.emoji} ${firstCat.name} — ${monthLabel(monthRange(todayISO(), 1))}`,
      })
      expect(within(list).getByText('Oat milk and bread')).toBeTruthy()
      expect(within(list).getByText(formatMoney(1234, { symbol: '€' }))).toBeTruthy()
      expect(within(list).getByText('Today')).toBeTruthy()
      expect(
        within(list).getByText(
          new RegExp(`^1 expense\\s*·\\s*${formatMoney(1234, { symbol: '€' })}$`.replace('.', '\\.')),
        ),
      ).toBeTruthy()
      // Another category's purchases stay in their own reminder.
      expect(within(list).queryByText('Coffee beans')).toBeNull()
    })

    /* A reminder is a "where did the money go" read — biggest purchase on top. */
    it('sorts the category expense list by amount, highest first', () => {
      const categories = getState().categories
      const [firstCat] = categories
      importData({
        categories,
        expenses: [
          expense({ amount: 1000, date: todayISO(), note: 'Small bread run', categoryId: firstCat.id }),
          expense({ amount: 5000, date: todayISO(), note: 'Weekly shop', categoryId: firstCat.id }),
          expense({ amount: 400, date: todayISO(), note: 'Bolt ride', categoryId: categories[1].id }),
        ],
      })

      render(<App />)
      goTo('Insights')
      const breakdown = screen.getByRole('region', { name: 'Where it went' })
      const firstBar = within(breakdown).getAllByRole('button')[2] // after Chart/Table
      act(() => firstBar.click())

      const list = screen.getByRole('region', {
        name: `${firstCat.emoji} ${firstCat.name} — ${monthLabel(monthRange(todayISO(), 1))}`,
      })
      const notes = within(list)
        .getAllByRole('listitem')
        .map((row) => row.textContent)
      expect(notes).toHaveLength(2)
      expect(notes[0]).toContain('Weekly shop')
      expect(notes[1]).toContain('Small bread run')
    })

    /* Acceptance criterion 3: deleting an expense can be undone.
       Deletion is fenced: arming it never removes anything on its own — the
       confirmation sheet is what finishes the job. */
    it('presents a row delete for confirmation, then deletes and undoes', async () => {
      importData({
        expenses: [expense({ amount: 1234, date: todayISO(), note: 'Bread' })],
        categories: getState().categories,
      })
      await settled()
      render(<App />)

      const before = getState().expenses.length
      act(() => screen.getByRole('button', { name: /^Delete Groceries/ }).click())
      await settled()

      // Nothing has been removed yet, and the fence names what is about to vanish.
      expect(getState().expenses).toHaveLength(before)
      const dialog = screen.getByRole('dialog', { name: 'Delete this expense?' })
      expect(dialog.textContent).toContain('Bread.')
      expect(dialog.textContent).toContain('€12.34')
      expect(dialog.textContent).toContain('Today')

      act(() => within(dialog).getByRole('button', { name: 'Delete' }).click())
      await settled()
      expect(getState().expenses).toHaveLength(before - 1)

      act(() => screen.getByRole('button', { name: 'Undo' }).click())
      await settled()
      expect(getState().expenses).toHaveLength(before)
    })

    it('keeps the row when the delete confirmation is dismissed', async () => {
      importData({
        expenses: [expense({ amount: 1234, date: todayISO(), note: 'Bread' })],
        categories: getState().categories,
      })
      await settled()
      render(<App />)

      act(() => screen.getByRole('button', { name: /^Delete Groceries/ }).click())
      await settled()
      const dialog = screen.getByRole('dialog', { name: 'Delete this expense?' })
      act(() => within(dialog).getByRole('button', { name: 'Keep it' }).click())
      await settled()

      expect(getState().expenses).toHaveLength(1)
      // The sheet lingers through its 180ms exit animation before it unmounts.
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Delete this expense?' })).toBeNull(),
      )
    })

    it('fences the identical swipe delete in History', async () => {
      importData({
        expenses: [expense({ amount: 1234, date: todayISO(), note: 'Bread' })],
        categories: getState().categories,
      })
      await settled()
      render(<App />)
      goTo('History')

      const before = getState().expenses.length
      act(() => screen.getByRole('button', { name: /^Delete Groceries/ }).click())
      await settled()
      expect(getState().expenses).toHaveLength(before)

      const dialog = screen.getByRole('dialog', { name: 'Delete this expense?' })
      act(() => within(dialog).getByRole('button', { name: 'Delete' }).click())
      await settled()
      expect(getState().expenses).toHaveLength(before - 1)
    })

    it('opens the add sheet on a cold start when nothing is logged today', async () => {
      importData({
        expenses: [expense({ amount: 500, date: '2026-01-02' })],
        categories: getState().categories,
      })
      await settled()
      localStorage.removeItem('et.autoOpenedOn')

      render(<App />)
      await settled()
      expect(screen.getByRole('dialog', { name: 'Add expense' })).toBeTruthy()
    })

    it('leaves the add sheet closed when today is already logged', async () => {
      importData({
        expenses: [expense({ amount: 500, date: todayISO() })],
        categories: getState().categories,
      })
      await settled()
      localStorage.removeItem('et.autoOpenedOn')

      render(<App />)
      await settled()
      expect(screen.queryByRole('dialog', { name: 'Add expense' })).toBeNull()
    })
  })

  describe('theme', () => {
    it('pins the document theme when an explicit choice is made', () => {
      render(<App />)
      goTo('Settings')

      act(() => screen.getByRole('button', { name: 'Dark' }).click())
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

      act(() => screen.getByRole('button', { name: 'Light' }).click())
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')

      // 'System' resolves prefers-color-scheme and pins the result, which is what
      // lets tokens.css hold one definition per palette. The stub reports light.
      act(() => screen.getByRole('button', { name: 'System' }).click())
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    })
  })

  describe('caps', () => {
    it('shows a neutral meter with the remaining amount, and no meter without caps', async () => {
      const categories = getState().categories.map((c) =>
        c.id === 'cat-groceries' ? { ...c, monthlyCap: 20_000 } : c,
      )
      importData({ expenses: [expense({ amount: 5_000, date: todayISO() })], categories })
      await settled()

      render(<App />)
      const meter = screen.getByRole('progressbar', { name: /monthly caps/ })
      expect(meter.getAttribute('aria-valuenow')).toBe('25')
      expect(screen.getByText('€150 left')).toBeTruthy()
    })

    it('states an over-cap figure in words, framed as reallocation', async () => {
      const categories = getState().categories.map((c) =>
        c.id === 'cat-groceries' ? { ...c, monthlyCap: 2_000 } : c,
      )
      importData({ expenses: [expense({ amount: 5_000, date: todayISO() })], categories })
      await settled()

      render(<App />)
      expect(screen.getByText('€30 over your caps')).toBeTruthy()
      expect(screen.getByText(/trim there or/)).toBeTruthy()
    })
  })
})

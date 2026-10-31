import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { AddExpenseSheet } from './AddExpenseSheet'
import { Announcer } from '../ui/LiveRegion'
import { ToastHost } from '../ui/Toast'
import { deleteAllData, getState, importData, init, setSettings } from '../store/store'
import { todayISO } from '../lib/dates'

const settled = () => new Promise((resolve) => setTimeout(resolve, 20))

function renderSheet() {
  return render(
    <Announcer>
      <ToastHost>
        <AddExpenseSheet open onClose={() => {}} editing={null} />
      </ToastHost>
    </Announcer>,
  )
}

/** One tap on a button. */
function tap(name: string | RegExp) {
  const button = screen.getByRole('button', { name })
  act(() => button.click())
}

/** One tap on a button inside a given container (a dialog over the sheet). */
function tapIn(container: HTMLElement, name: string | RegExp) {
  const button = within(container).getByRole('button', { name })
  act(() => button.click())
}

/** One tap on a category chip. */
function tapChip(name: RegExp) {
  const chip = screen.getByRole('radio', { name })
  act(() => chip.click())
}

function keypad(digits: string) {
  for (const d of digits) tap(d === '.' ? 'Decimal point' : d)
}

/** The digits shown, without the separately styled currency symbol. */
function amountText() {
  return screen.getByRole('spinbutton', { name: 'Amount' }).querySelector('.amount-value')?.textContent
}

describe('the add-expense sheet', () => {
  beforeAll(async () => {
    await init()
  })

  beforeEach(async () => {
    deleteAllData()
    await settled()
  })

  it('opens with the amount focused, so digits need no tap to land', () => {
    renderSheet()
    const amount = screen.getByRole('spinbutton', { name: 'Amount' })
    expect(document.activeElement).toBe(amount)
  })

  it('builds the amount from keypad taps', () => {
    renderSheet()
    keypad('12.50')
    expect(amountText()).toContain('12.50')
    expect(screen.getByRole('spinbutton', { name: 'Amount' }).getAttribute('aria-valuenow')).toBe('12.5')
  })

  /* Acceptance criterion 1: amount, category, Save. */
  it('saves an expense in three taps after the amount', async () => {
    renderSheet()
    keypad('7')
    tapChip(/Groceries/)
    tap('Save')
    await settled()

    const expenses = getState().expenses
    expect(expenses).toHaveLength(1)
    expect(expenses[0].amount).toBe(700)
    expect(expenses[0].categoryId).toBe('cat-groceries')
    expect(expenses[0].date).toBe(todayISO())
  })

  it('keeps Save unavailable until there is both an amount and a category', () => {
    renderSheet()
    const save = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
    expect(save().disabled).toBe(true)
    keypad('5')
    expect(save().disabled).toBe(true)
    tapChip(/Groceries/)
    expect(save().disabled).toBe(false)
  })

  /* Acceptance criterion 2: three expenses, one opening of the sheet. */
  it('logs three expenses in a row without reopening', async () => {
    renderSheet()

    keypad('4')
    tapChip(/Groceries/)
    tap('Save')
    await settled()

    // The amount clears but the category stays selected, so entry two is two taps.
    expect(amountText()).toBe('0')
    keypad('6')
    tap('Save')
    await settled()

    keypad('8')
    tapChip(/Transport/)
    tap('Save')
    await settled()

    const amounts = getState().expenses.map((e) => e.amount).sort((a, b) => a - b)
    expect(amounts).toEqual([400, 600, 800])
    // The dialog was never unmounted in between.
    expect(screen.getByRole('dialog', { name: 'Add expense' })).toBeTruthy()
  })

  /* Acceptance criterion 3: the save confirmation carries a working Undo. */
  it('offers Undo after a save and puts the amount back', async () => {
    renderSheet()
    keypad('9.99')
    tapChip(/Fun/)
    tap('Save')
    await settled()
    expect(getState().expenses).toHaveLength(1)

    tap('Undo')
    await settled()
    expect(getState().expenses).toHaveLength(0)
    expect(amountText()).toContain('9.99')
  })

  it('announces the save to screen readers', async () => {
    renderSheet()
    keypad('12')
    tapChip(/Groceries/)
    tap('Save')
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toMatch(/Saved €12 to Groceries/)
    })
  })

  it('accepts a typed amount from a desktop keyboard', async () => {
    renderSheet()
    const amount = screen.getByRole('spinbutton', { name: 'Amount' })
    const { fireEvent } = await import('@testing-library/dom')
    fireEvent.keyDown(amount, { key: '3' })
    fireEvent.keyDown(amount, { key: '.' })
    fireEvent.keyDown(amount, { key: '5' })
    expect(amountText()).toContain('3.5')
    fireEvent.keyDown(amount, { key: 'ArrowUp' })
    expect(amountText()).toContain('4.50')
    fireEvent.keyDown(amount, { key: 'Backspace' })
    expect(amountText()).toContain('4.5')
  })

  it('clears the whole amount when backspace is held', async () => {
    renderSheet()
    keypad('123')
    const backspace = screen.getByRole('button', { name: /Delete last digit/ })
    act(() => {
      backspace.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    })
    await new Promise((resolve) => setTimeout(resolve, 560))
    expect(amountText()).toBe('0')
  })

  it('creates a category inline and selects it', async () => {
    renderSheet()
    tap('Create a category')
    const nameField = screen.getByLabelText('Category name')
    const { fireEvent } = await import('@testing-library/dom')
    fireEvent.change(nameField, { target: { value: 'Bikes' } })
    tap('Add')
    await settled()

    expect(getState().categories.map((c) => c.name)).toContain('Bikes')
    const chip = screen.getByRole('radio', { name: /Bikes/ })
    expect(chip.getAttribute('aria-checked')).toBe('true')

    // Selected without a second tap, so it is immediately saveable.
    keypad('25')
    tap('Save')
    await settled()
    const created = getState().categories.find((c) => c.name === 'Bikes')!
    expect(getState().expenses[0].categoryId).toBe(created.id)
  })

  it('offers Yesterday without a date picker', async () => {
    renderSheet()
    tap('Today')
    const options = screen.getByRole('button', { name: 'Yesterday' })
    act(() => options.click())
    keypad('3')
    tapChip(/Groceries/)
    tap('Save')
    await settled()
    expect(getState().expenses[0].date).not.toBe(todayISO())
  })

  it('holds the note to 120 characters', async () => {
    renderSheet()
    tap('Add note')
    const note = screen.getByLabelText('Note') as HTMLInputElement
    expect(note.maxLength).toBe(120)
  })

  describe('splitting something paid from a joint account', () => {
    beforeEach(() => {
      setSettings({ splitEnabled: true, defaultSharePct: 50 })
    })

    afterEach(() => {
      setSettings({ splitEnabled: false, defaultSharePct: 50 })
    })

    it('stays out of the sheet until it is switched on in Settings', () => {
      setSettings({ splitEnabled: false })
      renderSheet()
      expect(screen.queryByRole('button', { name: 'Split' })).toBeNull()
    })

    it('logs the share and keeps the whole bill beside it', async () => {
      renderSheet()
      keypad('40')
      tap('Split')
      tapChip(/Groceries/)
      tap('Save')
      await settled()

      const [saved] = getState().expenses
      expect(saved.amount).toBe(2_000)
      expect(saved.fullAmount).toBe(4_000)
      expect(saved.sharePct).toBe(50)
    })

    it('shows what will be logged before it is saved', () => {
      renderSheet()
      keypad('13')
      tap('Split')
      // The typed figure is still the bill; the share is spelled out under it.
      expect(amountText()).toContain('13')
      expect(document.querySelector('.amount-share')?.textContent).toContain('6.50')
    })

    it('takes a different share from the options and can switch back off', async () => {
      renderSheet()
      keypad('30')
      tap('Split')
      tap(/Split, your share 50%/)
      tap(/Your share, 33 percent/)
      tapChip(/Groceries/)
      tap('Save')
      await settled()
      expect(getState().expenses[0].amount).toBe(990)

      tap('Undo')
      await settled()
      tap(/Split, your share 33%/)
      tap('Off')
      tap('Save')
      await settled()
      const [saved] = getState().expenses
      expect(saved.amount).toBe(3_000)
      expect(saved.fullAmount).toBeUndefined()
      expect(saved.sharePct).toBeUndefined()
    })

    it('reopens a split row as the bill, not as the stored share', async () => {
      const split = {
        id: 'split-me',
        amount: 2_000,
        currency: 'EUR',
        categoryId: 'cat-groceries',
        note: '',
        date: todayISO(),
        createdAt: `${todayISO()}T09:00:00.000Z`,
        isRecurringHint: false,
        fullAmount: 4_000,
        sharePct: 50,
      }
      importData({ expenses: [split], categories: getState().categories })
      await settled()

      render(
        <Announcer>
          <ToastHost>
            <AddExpenseSheet open onClose={() => {}} editing={split} />
          </ToastHost>
        </Announcer>,
      )

      // Halving the stored share again on every edit is the bug this guards.
      expect(amountText()).toContain('40')
      tap('Save changes')
      await settled()
      expect(getState().expenses[0].amount).toBe(2_000)
    })
  })

  describe('editing an existing expense', () => {
    const existing = {
      id: 'edit-me',
      amount: 1234,
      currency: 'EUR',
      categoryId: 'cat-groceries',
      note: 'Bread',
      date: todayISO(),
      createdAt: `${todayISO()}T09:00:00.000Z`,
      isRecurringHint: false,
    }

    function renderEdit() {
      return render(
        <Announcer>
          <ToastHost>
            <AddExpenseSheet open onClose={() => {}} editing={existing} />
          </ToastHost>
        </Announcer>,
      )
    }

    beforeEach(async () => {
      importData({ expenses: [existing], categories: getState().categories })
      await settled()
    })

    it('opens with the existing values in place', () => {
      renderEdit()
      expect(amountText()).toContain('12.34')
      expect(screen.getByRole('radio', { name: /Groceries/ }).getAttribute('aria-checked')).toBe('true')
      expect((screen.getByLabelText('Note') as HTMLInputElement).value).toBe('Bread')
    })

    /* Question 2: a mouse user needs a visible way to delete — and the visible
       way still fences the delete behind a confirmation. */
    it('fences Delete expense behind a confirmation, Undo intact', async () => {
      renderEdit()
      tap('Delete expense')
      await settled()
      expect(getState().expenses.some((e) => e.id === 'edit-me')).toBe(true)

      const dialog = screen.getByRole('dialog', { name: 'Delete this expense?' })
      tapIn(dialog, 'Delete')
      await settled()
      expect(getState().expenses.some((e) => e.id === 'edit-me')).toBe(false)

      tap('Undo')
      await settled()
      const restored = getState().expenses.find((e) => e.id === 'edit-me')
      expect(restored).toEqual(existing)
    })

    /* Esc fires for every open sheet; it must act on the confirm on top, never
       also discard the edit sitting underneath it. */
    it('spends Esc on the confirmation first, keeping the edit sheet open', async () => {
      let closed = 0
      const { unmount } = render(
        <Announcer>
          <ToastHost>
            <AddExpenseSheet open onClose={() => (closed += 1)} editing={existing} />
          </ToastHost>
        </Announcer>,
      )

      tap('Delete expense')
      await settled()
      const { fireEvent } = await import('@testing-library/dom')
      act(() => {
        fireEvent.keyDown(document, { key: 'Escape' })
      })
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Delete this expense?' })).toBeNull(),
      )

      expect(closed).toBe(0)
      expect(getState().expenses.some((e) => e.id === 'edit-me')).toBe(true)
      unmount()
    })

    it('does not offer Delete when adding rather than editing', () => {
      renderSheet()
      expect(screen.queryByRole('button', { name: 'Delete expense' })).toBeNull()
    })
  })

  it('offers all ten digits plus a decimal and a backspace', () => {
    renderSheet()
    expect(screen.getAllByRole('button', { name: /^[0-9]$/ })).toHaveLength(10)
    expect(screen.getByRole('button', { name: 'Decimal point' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Delete last digit/ })).toBeTruthy()
  })

  it('puts the category chips in a single-select group', () => {
    renderSheet()
    const group = screen.getByRole('radiogroup', { name: 'Category' })
    const chips = within(group).getAllByRole('radio')
    expect(chips).toHaveLength(8)
    expect(chips.every((c) => c.getAttribute('aria-checked') === 'false')).toBe(true)
  })
})

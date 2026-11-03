import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { fireEvent } from '@testing-library/dom'
import type { Category, Expense } from '../types'
import { CategorySheet } from './CategorySheet'
import { Announcer } from '../ui/LiveRegion'
import { ToastHost } from '../ui/Toast'
import { deleteAllData, getState, importData, init } from '../store/store'

const settled = () => new Promise((resolve) => setTimeout(resolve, 20))

function expense(id: string, categoryId: string): Expense {
  return {
    id,
    amount: 1000,
    currency: 'EUR',
    categoryId,
    note: '',
    date: '2026-08-04',
    createdAt: '2026-08-04T10:00:00.000Z',
  }
}

function renderFor(category: Category) {
  return render(
    <Announcer>
      <ToastHost>
        <CategorySheet open category={category} onClose={() => {}} />
      </ToastHost>
    </Announcer>,
  )
}

const tap = (name: string | RegExp) => act(() => screen.getByRole('button', { name }).click())

/** One tap on a button inside a given container (a dialog over the sheet). */
const tapIn = (container: HTMLElement, name: string | RegExp) =>
  act(() => within(container).getByRole('button', { name }).click())

describe('category management', () => {
  beforeAll(async () => {
    await init()
  })

  beforeEach(async () => {
    deleteAllData()
    await settled()
    importData({
      expenses: [expense('a', 'cat-fun'), expense('b', 'cat-fun'), expense('c', 'cat-groceries')],
      categories: getState().categories,
    })
    await settled()
  })

  const fun = () => getState().categories.find((c) => c.name === 'Fun')!

  it('renames a category', async () => {
    renderFor(fun())
    act(() => {
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Going out' } })
    })
    tap('Save changes')
    await settled()

    const updated = getState().categories.find((c) => c.id === 'cat-fun')!
    expect(updated.name).toBe('Going out')
  })


  it('archives with an Undo that puts it back', async () => {
    renderFor(fun())
    tap('Archive category')
    await settled()
    expect(getState().categories.find((c) => c.id === 'cat-fun')!.isArchived).toBe(true)

    tap('Undo')
    await settled()
    expect(getState().categories.find((c) => c.id === 'cat-fun')!.isArchived).toBe(false)
  })

  /* Acceptance criterion 3: deleting a category is undoable, and never orphans a row.
     The delete itself is fenced: confirming on a second sheet is what removes it. */
  it('deletes a category behind a confirmation, moving its expenses to the catch-all', async () => {
    renderFor(fun())
    expect(screen.getByText(/2 expenses move to Other/)).toBeTruthy()

    tap('Delete category')
    await settled()
    expect(getState().categories.some((c) => c.id === 'cat-fun')).toBe(true)

    const dialog = screen.getByRole('dialog', { name: 'Delete this category?' })
    tapIn(dialog, 'Delete')
    await settled()

    expect(getState().categories.some((c) => c.id === 'cat-fun')).toBe(false)
    // Nothing is left pointing at a category that no longer exists.
    const ids = new Set(getState().categories.map((c) => c.id))
    expect(getState().expenses.every((e) => ids.has(e.categoryId))).toBe(true)
    expect(getState().expenses.filter((e) => e.categoryId === 'cat-other')).toHaveLength(2)
  })

  it('keeps the category when the delete confirmation is dismissed', async () => {
    renderFor(fun())

    tap('Delete category')
    await settled()
    const dialog = screen.getByRole('dialog', { name: 'Delete this category?' })
    tapIn(dialog, 'Keep it')
    await settled()

    expect(getState().categories.some((c) => c.id === 'cat-fun')).toBe(true)
    expect(getState().expenses.filter((e) => e.categoryId === 'cat-fun')).toHaveLength(2)
    // The sheet stays mounted through its 180ms exit animation before unmounting.
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Delete this category?' })).toBeNull(),
    )
  })

  it('restores both the category and its expenses on Undo', async () => {
    renderFor(fun())
    tap('Delete category')
    await settled()
    tapIn(screen.getByRole('dialog', { name: 'Delete this category?' }), 'Delete')
    await settled()

    tap('Undo')
    await settled()

    expect(getState().categories.some((c) => c.id === 'cat-fun')).toBe(true)
    expect(getState().expenses.filter((e) => e.categoryId === 'cat-fun')).toHaveLength(2)
    expect(getState().expenses.filter((e) => e.categoryId === 'cat-other')).toHaveLength(0)
  })

  it('says plainly that nothing moves when the category is empty', () => {
    const health = getState().categories.find((c) => c.name === 'Health')!
    renderFor(health)
    expect(screen.getByText(/Nothing is filed under this one/)).toBeTruthy()
  })
})

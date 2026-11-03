import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import { Settings } from './Settings'
import { Announcer } from '../ui/LiveRegion'
import { ToastHost } from '../ui/Toast'
import { deleteAllData, getState, importData, init } from '../store/store'

const settled = () => new Promise((resolve) => setTimeout(resolve, 20))

function renderSettings() {
  return render(
    <Announcer>
      <ToastHost>
        <Settings />
      </ToastHost>
    </Announcer>,
  )
}

const categoryRow = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('.cat-main')].find((el) =>
    el.textContent?.includes(name),
  )!

describe('Settings', () => {
  beforeAll(async () => {
    await init()
  })

  beforeEach(async () => {
    deleteAllData()
    await settled()
  })

  describe('categories', () => {
    /*
     * An overlay whose onClose is an inline arrow used to pop its own history entry
     * on the parent's next render, and the resulting popstate read as a back
     * gesture — so it closed in the frame it opened. It has to stay open.
     */
    it('opens the editor on a row click and keeps it open', async () => {
      renderSettings()
      act(() => categoryRow('Groceries').click())

      expect(screen.getByRole('dialog', { name: /Edit Groceries/ })).toBeTruthy()

      await act(async () => {
        await settled()
      })
      expect(screen.getByRole('dialog', { name: /Edit Groceries/ })).toBeTruthy()
    })

    it('opens with that category’s own values', () => {
      renderSettings()
      act(() => categoryRow('Transport').click())
      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Transport')
      expect((screen.getByLabelText('Emoji') as HTMLInputElement).value).toBe('🚌')
    })

    it('puts the colour swatch inside the tap target', () => {
      renderSettings()
      const swatch = document.querySelector('.cat-swatch') as HTMLElement
      expect(swatch.closest('button')).not.toBeNull()
    })

    it('reorders a category and keeps the change', async () => {
      renderSettings()
      const before = getState().categories.map((c) => c.name)
      act(() => screen.getByRole('button', { name: `Move ${before[1]} up` }).click())
      await settled()

      const after = getState().categories.map((c) => c.name)
      expect(after[0]).toBe(before[1])
      expect(after[1]).toBe(before[0])
    })

    it('adds a category from the name field', async () => {
      renderSettings()
      const { fireEvent } = await import('@testing-library/dom')
      act(() => {
        fireEvent.change(screen.getByLabelText('New category name'), { target: { value: 'Bikes' } })
      })
      act(() => screen.getByRole('button', { name: 'Add' }).click())
      await settled()
      expect(getState().categories.map((c) => c.name)).toContain('Bikes')
    })
  })

  describe('data', () => {
    it('opens the delete-everything confirmation and keeps it open', async () => {
      renderSettings()
      act(() => screen.getByRole('button', { name: 'Delete all data' }).click())

      const dialog = screen.getByRole('dialog', { name: 'Delete all data' })
      expect(within(dialog).getByRole('button', { name: 'Keep my data' })).toBeTruthy()

      await act(async () => {
        await settled()
      })
      expect(screen.getByRole('dialog', { name: 'Delete all data' })).toBeTruthy()
    })

    it('wipes on confirmation and restores on Undo', async () => {
      importData({
        expenses: [
          {
            id: 'x',
            amount: 500,
            currency: 'EUR',
            categoryId: 'cat-groceries',
            note: '',
            date: '2026-08-01',
            createdAt: '2026-08-01T10:00:00.000Z',
          },
        ],
        categories: getState().categories,
      })
      await settled()

      renderSettings()
      act(() => screen.getByRole('button', { name: 'Delete all data' }).click())
      act(() => screen.getByRole('button', { name: 'Delete everything' }).click())
      await settled()
      expect(getState().expenses).toHaveLength(0)

      act(() => screen.getByRole('button', { name: 'Undo' }).click())
      await settled()
      expect(getState().expenses).toHaveLength(1)
    })

    it('offers both exports and an import', () => {
      renderSettings()
      expect(screen.getByRole('button', { name: 'Export CSV' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Export JSON backup' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Import CSV or JSON' })).toBeTruthy()
    })
  })
})

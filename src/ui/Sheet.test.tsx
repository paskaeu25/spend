import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { Sheet } from './Sheet'

function open(onClose: () => void) {
  return render(
    <Sheet open onClose={onClose} label="Test sheet" title="Test sheet">
      <div className="sheet-body">
        <button type="button">Inside</button>
      </div>
    </Sheet>,
  )
}

/**
 * The close button lives inside the drag zone. Starting a drag there captures the
 * pointer, which retargets the pointerup and means the button never sees a click —
 * so the header must not begin a drag when the press lands on a control.
 */
describe('the bottom sheet', () => {
  it('closes when the close button is pressed through a full pointer sequence', () => {
    const onClose = vi.fn()
    open(onClose)
    const close = screen.getByRole('button', { name: 'Close' })

    act(() => {
      close.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }))
      close.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }))
      close.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not capture the pointer when the press lands on a control', () => {
    const onClose = vi.fn()
    open(onClose)
    const zone = document.querySelector('.sheet-grab-zone') as HTMLElement
    const capture = vi.spyOn(zone, 'setPointerCapture')
    const close = screen.getByRole('button', { name: 'Close' })

    act(() => {
      close.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }))
    })
    expect(capture).not.toHaveBeenCalled()

    // Pressing the bare grabber still starts a drag.
    act(() => {
      zone.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 2 }))
    })
    expect(capture).toHaveBeenCalled()
  })

  it('closes on the backdrop and on Escape', () => {
    const onClose = vi.fn()
    open(onClose)

    act(() => {
      ;(document.querySelector('.sheet-backdrop') as HTMLElement).click()
    })
    expect(onClose).toHaveBeenCalledTimes(1)

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('closes on a real drag but ignores a twitch, however fast', () => {
    const onClose = vi.fn()
    open(onClose)
    const zone = document.querySelector('.sheet-grab-zone') as HTMLElement

    const drag = (from: number, to: number, pointerId: number) => {
      act(() => {
        zone.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId, clientY: from }))
        zone.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId, clientY: to }))
        zone.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId, clientY: to }))
      })
    }

    // A few pixels at any speed is a reach, not a dismissal.
    drag(100, 115, 1)
    expect(onClose).not.toHaveBeenCalled()

    drag(100, 400, 2)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('names itself for assistive technology and traps focus inside', () => {
    open(() => {})
    const dialog = screen.getByRole('dialog', { name: 'Test sheet' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.contains(document.activeElement)).toBe(true)
  })
})

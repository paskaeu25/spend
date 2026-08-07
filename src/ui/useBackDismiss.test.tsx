import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { StrictMode, useState } from 'react'
import { resetBackDismissForTests, useBackDismiss } from './useBackDismiss'

/**
 * The overlay stack shares one history entry. Two things broke it in the browser
 * without ever failing in jsdom, so both are pinned here.
 */
function Overlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  useBackDismiss(open, onClose)
  return <div>{open ? 'overlay-open' : 'overlay-closed'}</div>
}

/** A parent that re-renders, handing the child a new onClose identity each time. */
function Host({ strict }: { strict?: boolean }) {
  const tree = <Inner />
  return strict ? <StrictMode>{tree}</StrictMode> : tree
}

/**
 * The overlay is rendered only while open, which is how the real sheets behave —
 * CategorySheet returns null until it has a category. That means the hook mounts
 * with open already true, and picks up StrictMode's double-invoke on mount. A hook
 * that merely flips an always-mounted prop never sees it.
 */
function Inner() {
  const [open, setOpen] = useState(false)
  const [, setTick] = useState(0)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        show
      </button>
      <button type="button" onClick={() => setTick((n) => n + 1)}>
        rerender
      </button>
      {open && <Overlay open onClose={() => setOpen(false)} />}
    </>
  )
}

let back: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  resetBackDismissForTests()
  // A real browser answers history.back() with a popstate, and does it on a later
  // task — which is the whole reason the bug existed, since by then a remounted
  // effect has re-attached its listener. jsdom fires nothing at all, so the timing
  // has to be modelled here or the test has no teeth.
  back = vi.spyOn(history, 'back').mockImplementation(() => {
    setTimeout(() => window.dispatchEvent(new PopStateEvent('popstate')), 0)
  })
})

afterEach(() => {
  back.mockRestore()
  resetBackDismissForTests()
})

describe('useBackDismiss', () => {
  /*
   * The bug the browser found: StrictMode runs effects mount → cleanup → mount. A
   * cleanup that popped the entry got a popstate back, the re-attached listener
   * read it as the back gesture, and the overlay closed in the frame it opened.
   */
  it('survives a StrictMode double-mount without dismissing itself', async () => {
    const { getByText, queryByText } = render(<Host strict />)

    await act(async () => {
      getByText('show').click()
      // Let a deferred release fire, if one were wrongly scheduled.
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    expect(queryByText('overlay-open')).not.toBeNull()
    expect(back).not.toHaveBeenCalled()
  })

  it('does not give up its entry when the parent re-renders', () => {
    const push = vi.spyOn(history, 'pushState')
    const { getByText, queryByText } = render(<Host />)

    act(() => getByText('show').click())
    expect(push).toHaveBeenCalledTimes(1)

    act(() => getByText('rerender').click())
    expect(back).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledTimes(1)
    expect(queryByText('overlay-open')).not.toBeNull()
    push.mockRestore()
  })

  it('closes the overlay when the back gesture fires', () => {
    const onClose = vi.fn()
    render(<Overlay open onClose={onClose} />)

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close on a popstate it does not own', () => {
    const onClose = vi.fn()
    render(<Overlay open={false} onClose={onClose} />)
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('gives the entry back once the last overlay closes', async () => {
    const { rerender } = render(<Overlay open onClose={() => {}} />)
    rerender(<Overlay open={false} onClose={() => {}} />)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('does not pop twice when the back gesture already took the entry', async () => {
    const onClose = vi.fn()
    const { rerender } = render(<Overlay open onClose={onClose} />)

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    back.mockClear()

    rerender(<Overlay open={false} onClose={onClose} />)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    // Popping again here would navigate the whole app away.
    expect(back).not.toHaveBeenCalled()
  })

  it('keeps one entry for stacked overlays and closes only the top one', async () => {
    const push = vi.spyOn(history, 'pushState')
    const closeOuter = vi.fn()
    const closeInner = vi.fn()

    render(
      <>
        <Overlay open onClose={closeOuter} />
        <Overlay open onClose={closeInner} />
      </>,
    )
    // Two overlays, still a single shared entry.
    expect(push).toHaveBeenCalledTimes(1)

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(closeInner).toHaveBeenCalledTimes(1)
    expect(closeOuter).not.toHaveBeenCalled()
    // A fresh entry now guards the one still open.
    expect(push).toHaveBeenCalledTimes(2)
    push.mockRestore()
  })
})

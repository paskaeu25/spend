/**
 * Test environment shims. jsdom has no IndexedDB and no layout, both of which this
 * app leans on, so they are supplied here rather than worked around in each test.
 */
import 'fake-indexeddb/auto'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

// jsdom reports every element as zero-sized, which would stop the charts from
// drawing at all. A fixed 360px keeps them at the 390px design width.
if (!('__etResizeObserver' in globalThis)) {
  Object.defineProperty(globalThis, '__etResizeObserver', { value: true })

  class TestResizeObserver implements ResizeObserver {
    private cb: ResizeObserverCallback

    constructor(cb: ResizeObserverCallback) {
      this.cb = cb
    }

    observe() {
      this.cb(
        [{ contentRect: { width: 360, height: 200 } } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      )
    }
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver

  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return 360
    },
  })

  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
    root = null
    rootMargin = ''
    thresholds = []
  } as unknown as typeof IntersectionObserver

  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
  }

  Element.prototype.scrollIntoView = () => {}
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  window.scrollTo = () => {}
}

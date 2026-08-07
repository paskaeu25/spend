import { useEffect, useRef } from 'react'

/**
 * Makes the Android/PWA back gesture close the top overlay instead of leaving the
 * app.
 *
 * The whole app shares a single history entry for this, held for as long as any
 * overlay is open, because releasing and re-taking one per overlay is what makes
 * this fragile. Two hazards in particular:
 *
 *  - StrictMode double-invokes effects in development: mount, clean up, mount. A
 *    cleanup that pops the entry immediately gets a popstate back from the browser,
 *    which the re-attached listener reads as a back gesture — the overlay closes in
 *    the same frame it opened. So the release is deferred by a task and cancelled if
 *    an overlay re-registers, which is exactly what the remount does.
 *  - Call sites pass inline arrow functions for onClose, so the callback identity
 *    changes on every parent render. The effect therefore depends on `open` alone
 *    and reads the callback through a ref.
 */

interface Overlay {
  close: () => void
}

const stack: Overlay[] = []
let ownsEntry = false
let releaseTimer: number | undefined
let listening = false

function acquireEntry() {
  if (ownsEntry) return
  history.pushState({ etOverlay: true }, '')
  ownsEntry = true
}

function releaseEntrySoon() {
  window.clearTimeout(releaseTimer)
  releaseTimer = window.setTimeout(() => {
    // Another overlay opened in the meantime, or the entry is already gone.
    if (stack.length > 0 || !ownsEntry) return
    ownsEntry = false
    const state = history.state as { etOverlay?: boolean } | null
    if (state?.etOverlay) history.back()
  }, 0)
}

function onPopState() {
  if (!ownsEntry) return
  // The browser has taken our entry back: this is the back gesture.
  ownsEntry = false
  const top = stack[stack.length - 1]
  if (!top) return
  top.close()
  // Overlays remain underneath, so take a fresh entry to guard those.
  if (stack.length > 1) acquireEntry()
}

function startListening() {
  if (listening) return
  listening = true
  window.addEventListener('popstate', onPopState)
}

export function useBackDismiss(open: boolean, close: () => void) {
  const latestClose = useRef(close)
  latestClose.current = close

  useEffect(() => {
    if (!open) return

    const overlay: Overlay = { close: () => latestClose.current() }
    stack.push(overlay)
    startListening()
    // Cancels a release left pending by a StrictMode remount.
    window.clearTimeout(releaseTimer)
    acquireEntry()

    return () => {
      const at = stack.indexOf(overlay)
      if (at >= 0) stack.splice(at, 1)
      if (stack.length === 0) releaseEntrySoon()
    }
  }, [open])
}

/** Test seam: forgets any shared state between cases. */
export function resetBackDismissForTests() {
  stack.length = 0
  ownsEntry = false
  window.clearTimeout(releaseTimer)
}

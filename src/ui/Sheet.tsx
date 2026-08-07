import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useBackDismiss } from './useBackDismiss'
import './sheet.css'

export interface SheetProps {
  open: boolean
  onClose: () => void
  /** Accessible name for the dialog. */
  label: string
  /** Visible heading. Omit for sheets whose content is self-evident. */
  title?: ReactNode
  children: ReactNode
  /** Element to focus on open. Defaults to the first focusable child. */
  initialFocusRef?: React.RefObject<HTMLElement | null>
  /** Extra class on the panel. */
  className?: string
}

const EXIT_MS = 180
const DISMISS_DISTANCE = 96
const DISMISS_VELOCITY = 0.5 // px per ms
/**
 * A flick has to travel at least this far to count. Velocity alone would let a
 * twitch of a few pixels while reaching for the header throw away an entry.
 */
const MIN_FLICK_DISTANCE = 28

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Bottom sheet: 180ms ease-out entry, drag the grabber down to dismiss, Esc to
 * close, focus trapped while open, and the page behind it locked from scrolling.
 */
export function Sheet({
  open,
  onClose,
  label,
  title,
  children,
  initialFocusRef,
  className = '',
}: SheetProps) {
  const [mounted, setMounted] = useState(open)
  const [entered, setEntered] = useState(false)
  const [drag, setDrag] = useState(0)
  const dragging = useRef<{ startY: number; startTime: number; pointerId: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocusTo = useRef<HTMLElement | null>(null)

  useBackDismiss(open, onClose)

  // Mount on open; keep mounted through the exit transition.
  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    if (!mounted) return
    setEntered(false)
    const t = window.setTimeout(() => {
      setMounted(false)
      setDrag(0)
    }, EXIT_MS)
    return () => window.clearTimeout(t)
  }, [open, mounted])

  useLayoutEffect(() => {
    if (!mounted || !open) return
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [mounted, open])

  // Body scroll lock.
  useEffect(() => {
    if (!mounted) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mounted])

  // Focus management: remember what had focus, move into the sheet, restore after.
  useEffect(() => {
    if (!open || !mounted) return
    restoreFocusTo.current = document.activeElement as HTMLElement | null
    const target =
      initialFocusRef?.current ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? panelRef.current
    target?.focus({ preventScroll: true })

    return () => {
      const el = restoreFocusTo.current
      if (el && document.contains(el)) el.focus({ preventScroll: true })
    }
  }, [open, mounted, initialFocusRef])

  // Esc closes; Tab cycles inside.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open, onClose])

  const onGrabberDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    // Pressing a control in the header is not a drag. Capturing the pointer here
    // would retarget the pointerup to this element, and the button would never see
    // a click at all.
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return

    dragging.current = { startY: e.clientY, startTime: performance.now(), pointerId: e.pointerId }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [])

  const onGrabberMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const d = dragging.current
    if (!d || d.pointerId !== e.pointerId) return
    // Downward only — dragging up should not lift the sheet off its edge.
    setDrag(Math.max(0, e.clientY - d.startY))
  }, [])

  const onGrabberUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const d = dragging.current
      dragging.current = null
      if (!d || d.pointerId !== e.pointerId) return
      const distance = Math.max(0, e.clientY - d.startY)
      const velocity = distance / Math.max(1, performance.now() - d.startTime)
      if (distance > DISMISS_DISTANCE || (distance > MIN_FLICK_DISTANCE && velocity > DISMISS_VELOCITY)) {
        onClose()
      } else {
        setDrag(0)
      }
    },
    [onClose],
  )

  if (!mounted) return null

  const state = entered && open ? 'open' : 'closed'

  return createPortal(
    <div className="sheet-layer" data-state={state}>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`sheet-panel ${className}`}
        style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
      >
        <div
          className="sheet-grab-zone"
          onPointerDown={onGrabberDown}
          onPointerMove={onGrabberMove}
          onPointerUp={onGrabberUp}
          onPointerCancel={onGrabberUp}
        >
          <div className="sheet-grabber" />
          <div className="sheet-header">
            {title ? <h2 className="sheet-title">{title}</h2> : <span />}
            <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

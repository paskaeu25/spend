import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import './swiperow.css'

interface SwipeRowProps {
  children: ReactNode
  onDelete: () => void
  /** Announced on the keyboard-reachable delete button. */
  deleteLabel: string
}

const REVEAL = 84
const COMMIT = 132

/**
 * Swipe a row left to delete. The same action is available to keyboard and screen
 * reader users through a button that is off-canvas until focused — a gesture must
 * never be the only route to a function.
 */
export function SwipeRow({ children, onDelete, deleteLabel }: SwipeRowProps) {
  const [dx, setDx] = useState(0)
  const [animating, setAnimating] = useState(true)
  const gesture = useRef<{ x: number; y: number; id: number; axis: 'none' | 'x' | 'y' } | null>(null)

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return // mouse users get the focus button
    gesture.current = { x: e.clientX, y: e.clientY, id: e.pointerId, axis: 'none' }
  }, [])

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    const deltaX = e.clientX - g.x
    const deltaY = e.clientY - g.y

    if (g.axis === 'none') {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return
      // Vertical intent belongs to the scroller, so bail out for the whole gesture.
      g.axis = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y'
      if (g.axis === 'x') setAnimating(false)
    }
    if (g.axis !== 'x') return

    setDx(Math.min(0, deltaX))
  }, [])

  const finish = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const g = gesture.current
      gesture.current = null
      setAnimating(true)
      if (!g || g.id !== e.pointerId || g.axis !== 'x') return
      const distance = Math.abs(Math.min(0, e.clientX - g.x))
      if (distance > COMMIT) {
        setDx(0)
        onDelete()
      } else if (distance > REVEAL / 2) {
        setDx(-REVEAL)
      } else {
        setDx(0)
      }
    },
    [onDelete],
  )

  const open = dx <= -REVEAL / 2

  return (
    <div className="swiperow">
      <div className="swiperow-under" aria-hidden={!open}>
        <button
          type="button"
          className="swiperow-delete"
          tabIndex={open ? 0 : -1}
          onClick={() => {
            setDx(0)
            onDelete()
          }}
        >
          Delete
        </button>
      </div>
      <div
        className="swiperow-top"
        style={{ transform: `translateX(${dx}px)`, transition: animating ? undefined : 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
      >
        {children}
        {/*
          The description belongs in the accessible name, not on screen. Rendering
          it as visible text made this button as wide as "Delete Groceries €12",
          which reaches across the row and intercepts clicks meant for it.
        */}
        <button
          type="button"
          className="swiperow-a11y-delete"
          aria-label={deleteLabel}
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
    </div>
  )
}

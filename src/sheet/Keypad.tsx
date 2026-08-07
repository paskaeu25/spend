import { useCallback, useRef } from 'react'
import type { KeypadKey } from '../lib/money'

interface KeypadProps {
  onKey: (key: KeypadKey) => void
  /** Long-pressing backspace clears the whole amount. */
  onClear: () => void
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

/**
 * The in-app keypad. Not the OS keyboard: no open latency, no layout jump, and
 * digits get to be real 56px touch targets.
 */
export function Keypad({ onKey, onClear }: KeypadProps) {
  const longPress = useRef<number | undefined>(undefined)
  const cleared = useRef(false)

  const startBackspace = useCallback(() => {
    cleared.current = false
    longPress.current = window.setTimeout(() => {
      cleared.current = true
      onClear()
    }, 500)
  }, [onClear])

  const endBackspace = useCallback(() => {
    window.clearTimeout(longPress.current)
  }, [])

  return (
    <div className="keypad" role="group" aria-label="Amount keypad">
      {DIGITS.map((d) => (
        <button
          key={d}
          type="button"
          className="key"
          onClick={() => onKey({ type: 'digit', value: d })}
        >
          {d}
        </button>
      ))}
      <button type="button" className="key" onClick={() => onKey({ type: 'decimal' })} aria-label="Decimal point">
        .
      </button>
      <button type="button" className="key" onClick={() => onKey({ type: 'digit', value: '0' })}>
        0
      </button>
      <button
        type="button"
        className="key key-backspace"
        aria-label="Delete last digit. Hold to clear."
        onClick={() => {
          if (cleared.current) {
            cleared.current = false
            return
          }
          onKey({ type: 'backspace' })
        }}
        onPointerDown={startBackspace}
        onPointerUp={endBackspace}
        onPointerCancel={endBackspace}
        onPointerLeave={endBackspace}
      >
        <span aria-hidden="true">⌫</span>
      </button>
    </div>
  )
}

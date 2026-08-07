import { forwardRef, type KeyboardEvent } from 'react'
import { type AmountEntry, amountToMinor, displayAmount } from '../lib/money'

interface AmountDisplayProps {
  entry: AmountEntry
  symbol: string
  /** Desktop keyboard entry. The on-screen keypad calls the same reducer. */
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void
}

/**
 * A spinbutton rather than a text input: it takes focus on open so digits land
 * immediately, never summons the OS keyboard, and gives arrow-key entry on
 * desktop for free.
 */
export const AmountDisplay = forwardRef<HTMLDivElement, AmountDisplayProps>(function AmountDisplay(
  { entry, symbol, onKeyDown },
  ref,
) {
  const minor = amountToMinor(entry)
  const body = displayAmount(entry)
  const isZero = minor === 0 && entry.raw === ''

  return (
    <div className="amount-row">
      <div
        ref={ref}
        className="amount"
        role="spinbutton"
        tabIndex={0}
        aria-label="Amount"
        aria-valuenow={minor / 100}
        aria-valuemin={0}
        aria-valuetext={`${symbol}${body}`}
        onKeyDown={onKeyDown}
      >
        <span className="amount-symbol" aria-hidden="true">
          {symbol.trim()}
        </span>
        <span className={`amount-value${isZero ? ' amount-value-empty' : ''}`}>{body}</span>
      </div>
    </div>
  )
})

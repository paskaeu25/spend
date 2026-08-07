import { forwardRef, type KeyboardEvent } from 'react'
import { type AmountEntry, amountToMinor, displayAmount, formatMoney } from '../lib/money'

interface AmountDisplayProps {
  entry: AmountEntry
  symbol: string
  /** Desktop keyboard entry. The on-screen keypad calls the same reducer. */
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void
  /** Set while a split is on: what will actually be logged, and the share. */
  split?: { sharePct: number; shareMinor: number } | null
}

/**
 * A spinbutton rather than a text input: it takes focus on open so digits land
 * immediately, never summons the OS keyboard, and gives arrow-key entry on
 * desktop for free.
 */
export const AmountDisplay = forwardRef<HTMLDivElement, AmountDisplayProps>(function AmountDisplay(
  { entry, symbol, onKeyDown, split },
  ref,
) {
  const minor = amountToMinor(entry)
  const body = displayAmount(entry)
  const isZero = minor === 0 && entry.raw === ''
  const share = split ? formatMoney(split.shareMinor, { symbol, compact: true }) : null

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
        // The typed figure is the whole bill; the share is what gets saved, so a
        // screen reader hears both rather than a number that will not match.
        aria-valuetext={share ? `${symbol}${body}, your share ${share}` : `${symbol}${body}`}
        onKeyDown={onKeyDown}
      >
        <span className="amount-symbol" aria-hidden="true">
          {symbol.trim()}
        </span>
        <span className={`amount-value${isZero ? ' amount-value-empty' : ''}`}>{body}</span>
      </div>

      {split && (
        <p className="amount-share" aria-hidden="true">
          Your {split.sharePct}%: <strong className="tabular">{share}</strong>
        </p>
      )}
    </div>
  )
})

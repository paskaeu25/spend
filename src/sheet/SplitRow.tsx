import { useState } from 'react'

interface SplitRowProps {
  /** Null when the amount is entirely the user's. */
  value: number | null
  /** The share Split switches on with — Settings, "Your usual share". */
  defaultPct: number
  onChange: (pct: number | null) => void
}

const PRESETS = [50, 33, 25]

function label(pct: number): string {
  if (pct === 50) return '½'
  if (pct === 33) return '⅓'
  if (pct === 25) return '¼'
  return `${pct}%`
}

/**
 * Collapsed to one word, like the note beside it: most expenses are not shared.
 *
 * The first tap applies the usual share outright rather than opening anything —
 * that is the whole case this exists for, and it should cost one tap. The options
 * only appear on a second tap, once a split is already on.
 */
export function SplitRow({ value, defaultPct, onChange }: SplitRowProps) {
  const [open, setOpen] = useState(false)
  const active = value != null
  const options = PRESETS.includes(defaultPct) ? PRESETS : [defaultPct, ...PRESETS]

  function pick(pct: number | null) {
    onChange(pct)
    setOpen(false)
  }

  return (
    <div className="split-block">
      <button
        type="button"
        className={active ? 'date-toggle split-toggle is-split' : 'btn-text note-link'}
        aria-pressed={active}
        aria-expanded={active ? open : undefined}
        aria-label={active ? `Split, your share ${value}%` : 'Split'}
        onClick={() => {
          if (!active) {
            onChange(defaultPct)
            return
          }
          setOpen((v) => !v)
        }}
      >
        <span aria-hidden="true">{active ? label(value) : 'Split'}</span>
        {active && (
          <span className="date-toggle-hint" aria-hidden="true">
            {open ? '▲' : '▼'}
          </span>
        )}
      </button>

      {open && (
        <div className="date-options split-options">
          {options.map((pct) => (
            <button
              key={pct}
              type="button"
              className={`date-option${pct === value ? ' is-active' : ''}`}
              aria-label={`Your share, ${pct} percent`}
              onClick={() => pick(pct)}
            >
              <span aria-hidden="true">{label(pct)}</span>
            </button>
          ))}
          <button type="button" className="date-option" onClick={() => pick(null)}>
            Off
          </button>
        </div>
      )}
    </div>
  )
}

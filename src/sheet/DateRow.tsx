import { useState } from 'react'
import { addDays, dayLabel, todayISO } from '../lib/dates'

interface DateRowProps {
  value: string
  onChange: (iso: string) => void
}

/**
 * Collapsed to one line because the default is right the overwhelming majority of
 * the time — so the date costs zero taps in the normal case.
 */
export function DateRow({ value, onChange }: DateRowProps) {
  const [open, setOpen] = useState(false)
  const today = todayISO()
  const yesterday = addDays(today, -1)

  return (
    <div className="date-block">
      <button
        type="button"
        className="date-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="date-toggle-label">{dayLabel(value, today)}</span>
        <span className="date-toggle-hint" aria-hidden="true">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className="date-options">
          <button
            type="button"
            className={`date-option${value === today ? ' is-active' : ''}`}
            onClick={() => {
              onChange(today)
              setOpen(false)
            }}
          >
            Today
          </button>
          <button
            type="button"
            className={`date-option${value === yesterday ? ' is-active' : ''}`}
            onClick={() => {
              onChange(yesterday)
              setOpen(false)
            }}
          >
            Yesterday
          </button>
          <label className="date-pick">
            <span className="sr-only">Pick a date</span>
            <input
              type="date"
              value={value}
              max={today}
              onChange={(e) => {
                if (e.target.value) onChange(e.target.value)
              }}
            />
          </label>
        </div>
      )}
    </div>
  )
}

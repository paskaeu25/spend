import { useEffect, useRef, useState } from 'react'

interface NoteFieldProps {
  value: string
  onChange: (note: string) => void
}

const MAX = 120

/**
 * Collapsed to a text link — most expenses need no note. An expense that already
 * has one opens expanded, which is why the parent remounts this on reset rather
 * than syncing the open state from the value: clearing the text by hand should not
 * collapse the field out from under the cursor.
 */
export function NoteField({ value, onChange }: NoteFieldProps) {
  const [open, setOpen] = useState(value !== '')
  const ref = useRef<HTMLInputElement>(null)
  const firstRender = useRef(true)

  useEffect(() => {
    // Only take focus when the user opens the field, never on mount — the amount
    // keeps focus when the sheet appears.
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    if (open) ref.current?.focus()
  }, [open])

  if (!open) {
    return (
      <button type="button" className="btn-text note-link" onClick={() => setOpen(true)}>
        Add note
      </button>
    )
  }

  return (
    <div className="note-field">
      <label className="sr-only" htmlFor="expense-note">
        Note
      </label>
      <input
        id="expense-note"
        ref={ref}
        type="text"
        value={value}
        maxLength={MAX}
        placeholder="What was it for?"
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="note-count tabular" aria-hidden="true">
        {value.length}/{MAX}
      </span>
    </div>
  )
}

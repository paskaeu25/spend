import { useEffect, useRef, useState } from 'react'
import type { Category } from '../types'
import { Sheet } from '../ui/Sheet'
import { minorToDecimalString, parseMoneyInput } from '../lib/money'
import { updateCategory, useStore } from '../store/store'
import { useAnnounce } from '../ui/LiveRegion'
import './cap-sheet.css'

interface CapSheetProps {
  open: boolean
  category: Category | null
  /** Prefill, in minor units — the user's own median, rounded. */
  suggested: number
  onClose: () => void
}

/**
 * A cap is offered prefilled, never blank: a blank field asks a question the user
 * cannot answer, a prefilled one asks them to nudge a number.
 */
export function CapSheet({ open, category, suggested, onClose }: CapSheetProps) {
  const { settings } = useStore()
  const announce = useAnnounce()
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open || !category) return
    const start = category.monthlyCap ?? suggested
    setText(minorToDecimalString(start).replace(/\.00$/, ''))
  }, [open, category, suggested])

  if (!category) return null

  const parsed = parseMoneyInput(text)
  const valid = parsed !== null && parsed > 0

  function nudge(deltaMinor: number) {
    const current = parseMoneyInput(text) ?? suggested
    const next = Math.max(100, current + deltaMinor)
    setText(minorToDecimalString(next).replace(/\.00$/, ''))
    inputRef.current?.focus()
  }

  function save() {
    if (!valid || !category) return
    updateCategory({ ...category, monthlyCap: parsed })
    announce(`Cap set for ${category.name}.`)
    onClose()
  }

  function remove() {
    if (!category) return
    updateCategory({ ...category, monthlyCap: null })
    announce(`Cap removed for ${category.name}.`)
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      label={`Monthly cap for ${category.name}`}
      title={
        <span>
          <span aria-hidden="true">{category.emoji} </span>
          {category.name} cap
        </span>
      }
      initialFocusRef={inputRef}
    >
      <div className="sheet-body cap-body">
        <p className="cap-note">
          A monthly note to yourself, based on what you usually spend. Change or remove it whenever
          you like.
        </p>

        <div className="cap-input-row">
          <span className="cap-symbol" aria-hidden="true">
            {settings.currencySymbol.trim()}
          </span>
          <label className="sr-only" htmlFor="cap-amount">
            Monthly cap amount
          </label>
          <input
            id="cap-amount"
            ref={inputRef}
            className="cap-input tabular"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && valid) {
                e.preventDefault()
                save()
              }
            }}
          />
        </div>

        <div className="cap-nudges">
          <button type="button" className="btn btn-secondary" onClick={() => nudge(-2000)}>
            −20
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => nudge(-1000)}>
            −10
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => nudge(1000)}>
            +10
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => nudge(2000)}>
            +20
          </button>
        </div>
      </div>

      <div className="sheet-footer cap-footer">
        <button type="button" className="btn btn-primary" disabled={!valid} onClick={save}>
          {category.monthlyCap === null ? 'Set cap' : 'Update cap'}
        </button>
        {category.monthlyCap !== null && (
          <button type="button" className="btn btn-secondary cap-remove" onClick={remove}>
            Remove cap
          </button>
        )}
      </div>
    </Sheet>
  )
}

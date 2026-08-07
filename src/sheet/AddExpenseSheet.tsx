import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Category, Expense } from '../types'
import { Sheet } from '../ui/Sheet'
import { AmountDisplay } from './AmountDisplay'
import { CategoryChips } from './CategoryChips'
import { DateRow } from './DateRow'
import { Keypad } from './Keypad'
import { NoteField } from './NoteField'
import {
  type AmountEntry,
  amountToMinor,
  emptyAmount,
  formatMoney,
  keypadReducer,
  minorToAmount,
  type KeypadKey,
} from '../lib/money'
import { todayISO } from '../lib/dates'
import { uuid } from '../lib/uuid'
import { lightHaptic } from '../lib/haptics'
import {
  addCategory,
  addExpense,
  deleteExpenses,
  restoreExpenses,
  updateExpense,
  useStore,
} from '../store/store'
import { chipOrder } from '../store/selectors'
import { nextColorSlot } from '../db/seedCategories'
import { useAnnounce } from '../ui/LiveRegion'
import { useToast } from '../ui/Toast'
import './add-sheet.css'

interface AddExpenseSheetProps {
  open: boolean
  onClose: () => void
  /** Present when editing an existing row rather than adding. */
  editing: Expense | null
}

const CONFIRM_MS = 1500

interface SavedState {
  expense: Expense
  /** Kept so Undo can put the values back for a quick correction. */
  entry: AmountEntry
  note: string
}

export function AddExpenseSheet({ open, onClose, editing }: AddExpenseSheetProps) {
  const { categories, expenses, settings } = useStore()
  const announce = useAnnounce()
  const toast = useToast()

  const [entry, setEntry] = useState<AmountEntry>(emptyAmount)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [date, setDate] = useState(todayISO)
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState<SavedState | null>(null)
  const [chipIds, setChipIds] = useState<string[]>([])
  /** Bumped after each save so the note field remounts collapsed. */
  const [resetCount, setResetCount] = useState(0)

  const amountRef = useRef<HTMLDivElement>(null)
  const confirmTimer = useRef<number | undefined>(undefined)

  /**
   * One editing session: a fresh add, or one particular row being edited.
   *
   * Seeding happens during render rather than in an effect, so the fields already
   * hold their values on the first paint. An effect would run after the children
   * had mounted, and the note field — which decides whether to be open from the
   * value it is given — would have already decided it was empty.
   */
  const session = open ? `edit:${editing?.id ?? 'new'}` : 'closed'
  const [seededFor, setSeededFor] = useState('closed')

  if (seededFor !== session) {
    setSeededFor(session)
    if (open) {
      // Frozen for the session, so chips never reshuffle under the user's finger
      // between one entry and the next.
      setChipIds(chipOrder(categories, expenses).map((c) => c.id))
      setEntry(editing ? minorToAmount(editing.amount) : emptyAmount)
      setCategoryId(editing?.categoryId ?? null)
      setDate(editing?.date ?? todayISO())
      setNote(editing?.note ?? '')
      setSaved(null)
      setResetCount(0)
    }
  }

  useEffect(() => () => window.clearTimeout(confirmTimer.current), [])

  const chips = useMemo<Category[]>(() => {
    const byId = new Map(categories.map((c) => [c.id, c]))
    const snapshot = chipIds.map((id) => byId.get(id)).filter((c): c is Category => !!c && !c.isArchived)
    const seen = new Set(snapshot.map((c) => c.id))
    // Anything created since the sheet opened joins the end of the row.
    const added = categories.filter((c) => !seen.has(c.id) && !c.isArchived)
    return [...snapshot, ...added]
  }, [categories, chipIds])

  const minor = amountToMinor(entry)
  const canSave = minor > 0 && !!categoryId
  const selectedCategory = categories.find((c) => c.id === categoryId) ?? null

  const dispatchKey = useCallback((key: KeypadKey) => {
    setEntry((prev) => keypadReducer(prev, key))
  }, [])

  const save = useCallback(() => {
    if (!canSave || !categoryId) return
    const trimmedNote = note.trim().slice(0, 120)

    if (editing) {
      updateExpense({ ...editing, amount: minor, categoryId, note: trimmedNote, date })
      lightHaptic()
      announce('Changes saved.')
      onClose()
      return
    }

    const expense: Expense = {
      id: uuid(),
      amount: minor,
      currency: settings.currency,
      categoryId,
      note: trimmedNote,
      date,
      createdAt: new Date().toISOString(),
      isRecurringHint: false,
    }
    addExpense(expense)
    lightHaptic()
    announce(
      `Saved ${formatMoney(minor, { symbol: settings.currencySymbol, compact: true })} to ${
        selectedCategory?.name ?? 'category'
      }.`,
    )

    // Stay put: logging two or three in a sitting should not mean reopening.
    setSaved({ expense, entry, note: trimmedNote })
    setEntry(emptyAmount)
    setNote('')
    setResetCount((n) => n + 1)
    amountRef.current?.focus({ preventScroll: true })

    window.clearTimeout(confirmTimer.current)
    confirmTimer.current = window.setTimeout(() => setSaved(null), CONFIRM_MS)
  }, [
    canSave,
    categoryId,
    date,
    editing,
    entry,
    minor,
    note,
    announce,
    onClose,
    selectedCategory,
    settings.currency,
    settings.currencySymbol,
  ])

  /**
   * The third route to deleting a row, alongside the swipe and the keyboard button
   * on the row itself — and the only one a mouse user is likely to find.
   */
  const removeExpense = useCallback(() => {
    if (!editing) return
    deleteExpenses([editing.id])
    announce('Expense deleted.')
    toast({
      message: 'Expense deleted.',
      actionLabel: 'Undo',
      onAction: () => restoreExpenses([editing]),
    })
    onClose()
  }, [editing, announce, toast, onClose])

  const undoSave = useCallback(() => {
    if (!saved) return
    window.clearTimeout(confirmTimer.current)
    deleteExpenses([saved.expense.id])
    setEntry(saved.entry)
    setNote(saved.note)
    setCategoryId(saved.expense.categoryId)
    setDate(saved.expense.date)
    setSaved(null)
    announce('Undone. The amount is back in the field.')
    amountRef.current?.focus({ preventScroll: true })
  }, [saved, announce])

  /** Digits typed anywhere in the sheet go to the amount, not nowhere. */
  const handleTypedKey = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      const target = e.target as HTMLElement
      const isTextField =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      if (isTextField) return

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault()
        dispatchKey({ type: 'digit', value: e.key })
      } else if (e.key === '.' || e.key === ',') {
        e.preventDefault()
        dispatchKey({ type: 'decimal' })
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        dispatchKey({ type: 'backspace' })
      } else if (e.key === 'Enter' && canSave) {
        e.preventDefault()
        save()
      }
    },
    [canSave, dispatchKey, save],
  )

  /**
   * Only the spinbutton's own arrow-key behaviour lives here. Digits, decimal,
   * backspace and Enter are left to bubble up to handleTypedKey on the body, so a
   * keystroke is never acted on twice.
   */
  const onAmountKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      e.preventDefault()
      const step = e.key === 'ArrowUp' ? 100 : -100
      setEntry(minorToAmount(Math.max(0, amountToMinor(entry) + step)))
    },
    [entry],
  )

  const createCategory = useCallback(
    (name: string, emoji: string) => {
      const category: Category = {
        id: uuid(),
        name,
        emoji,
        colorSlot: nextColorSlot(categories),
        monthlyCap: null,
        isArchived: false,
        sortWeight: categories.length,
      }
      addCategory(category)
      setCategoryId(category.id)
      announce(`${name} created and selected.`)
    },
    [categories, announce],
  )

  return (
    <Sheet
      open={open}
      onClose={onClose}
      label={editing ? 'Edit expense' : 'Add expense'}
      title={editing ? 'Edit expense' : 'Add expense'}
      initialFocusRef={amountRef}
      className="add-sheet"
    >
      <div className="add-sheet-body" onKeyDown={handleTypedKey}>
        <AmountDisplay
          ref={amountRef}
          entry={entry}
          symbol={settings.currencySymbol}
          onKeyDown={onAmountKeyDown}
        />

        <div className="meta-row">
          <DateRow value={date} onChange={setDate} />
          {/* Remounting on reset is what collapses it again after a save. */}
          <NoteField key={`${session}:${resetCount}`} value={note} onChange={setNote} />
        </div>

        <CategoryChips
          categories={chips}
          selectedId={categoryId}
          onSelect={setCategoryId}
          onCreate={createCategory}
        />

        <Keypad onKey={dispatchKey} onClear={() => dispatchKey({ type: 'clear' })} />

        <div className="add-sheet-actions">
          {editing && (
            <button type="button" className="btn btn-secondary delete-expense" onClick={removeExpense}>
              Delete expense
            </button>
          )}
          {saved && (
            <div className="save-confirm">
              <span>
                Saved {formatMoney(saved.expense.amount, { symbol: settings.currencySymbol, compact: true })}
              </span>
              <button type="button" className="save-confirm-undo" onClick={undoSave}>
                Undo
              </button>
            </div>
          )}
          <button type="button" className="btn btn-primary" disabled={!canSave} onClick={save}>
            {editing ? 'Save changes' : 'Save'}
          </button>
        </div>
      </div>
    </Sheet>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Category, Expense } from '../types'
import { Sheet } from '../ui/Sheet'
import { ConfirmDeleteSheet } from '../ui/ConfirmDeleteSheet'
import { AmountDisplay } from './AmountDisplay'
import { CategoryChips } from './CategoryChips'
import { DateRow } from './DateRow'
import { Keypad } from './Keypad'
import { NoteField } from './NoteField'
import { SplitRow } from './SplitRow'
import {
  type AmountEntry,
  amountToMinor,
  emptyAmount,
  formatMoney,
  keypadReducer,
  minorToAmount,
  splitShare,
  type KeypadKey,
} from '../lib/money'
import { todayISO, dayLabel } from '../lib/dates'
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
  sharePct: number | null
}

export function AddExpenseSheet({ open, onClose, editing }: AddExpenseSheetProps) {
  const { categories, expenses, settings } = useStore()
  const announce = useAnnounce()
  const toast = useToast()

  const [entry, setEntry] = useState<AmountEntry>(emptyAmount)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [date, setDate] = useState(todayISO)
  const [note, setNote] = useState('')
  /** Null unless this expense is a share of something paid from a joint account. */
  const [sharePct, setSharePct] = useState<number | null>(null)
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
      // A split row is edited as the bill it came from, not as the stored share —
      // otherwise reopening it would halve the same expense a second time.
      setEntry(editing ? minorToAmount(editing.fullAmount ?? editing.amount) : emptyAmount)
      setCategoryId(editing?.categoryId ?? null)
      setDate(editing?.date ?? todayISO())
      setNote(editing?.note ?? '')
      setSharePct(editing?.sharePct ?? null)
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

  /** What was typed: the whole bill when a split is on, otherwise the expense. */
  const minor = amountToMinor(entry)
  /** What actually gets logged. */
  const shareMinor = sharePct == null ? minor : splitShare(minor, sharePct)
  const canSave = shareMinor > 0 && !!categoryId
  const selectedCategory = categories.find((c) => c.id === categoryId) ?? null
  // Still offered on a row that was split before the setting was switched back off,
  // so an existing split is never stranded with no way to change it.
  const showSplit = settings.splitEnabled || sharePct != null

  const dispatchKey = useCallback((key: KeypadKey) => {
    setEntry((prev) => keypadReducer(prev, key))
  }, [])

  const save = useCallback(() => {
    if (!canSave || !categoryId) return
    const trimmedNote = note.trim().slice(0, 120)
    const split = sharePct == null ? null : { fullAmount: minor, sharePct }

    if (editing) {
      const next: Expense = { ...editing, amount: shareMinor, categoryId, note: trimmedNote, date }
      // Turning the split off has to clear the pair, not leave a stale bill behind.
      delete next.fullAmount
      delete next.sharePct
      updateExpense(split ? { ...next, ...split } : next)
      lightHaptic()
      announce('Changes saved.')
      onClose()
      return
    }

    const expense: Expense = {
      id: uuid(),
      amount: shareMinor,
      currency: settings.currency,
      categoryId,
      note: trimmedNote,
      date,
      createdAt: new Date().toISOString(),
      isRecurringHint: false,
      ...(split ?? {}),
    }
    addExpense(expense)
    lightHaptic()
    const savedAmount = formatMoney(shareMinor, { symbol: settings.currencySymbol, compact: true })
    announce(
      split
        ? `Saved your ${split.sharePct}%, ${savedAmount}, to ${selectedCategory?.name ?? 'category'}.`
        : `Saved ${savedAmount} to ${selectedCategory?.name ?? 'category'}.`,
    )

    // Stay put: logging two or three in a sitting should not mean reopening.
    setSaved({ expense, entry, note: trimmedNote, sharePct })
    // The split stays on for the next entry, as the category and date do: a run of
    // rows from the same joint account is the reason it was switched on. It stays
    // visible in the toggle and under the amount, so it cannot apply unnoticed.
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
    shareMinor,
    sharePct,
    announce,
    onClose,
    selectedCategory,
    settings.currency,
    settings.currencySymbol,
  ])

  /**
   * The third route to deleting a row, alongside the swipe and the keyboard button
   * on the row itself — and the only one a mouse user is likely to find. The
   * button only arms the delete; the confirmation sheet is what removes it.
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

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const closeConfirm = useCallback(() => setConfirmingDelete(false), [])

  const undoSave = useCallback(() => {
    if (!saved) return
    window.clearTimeout(confirmTimer.current)
    deleteExpenses([saved.expense.id])
    setEntry(saved.entry)
    setNote(saved.note)
    setCategoryId(saved.expense.categoryId)
    setDate(saved.expense.date)
    setSharePct(saved.sharePct)
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
    <>
      <Sheet
        open={open}
        onClose={() => {
          // A confirmation sheet sits above this one; close events belong to it
          // first. Esc, back-dismiss and the backdrop all arrive through here.
          if (confirmingDelete) return
          onClose()
        }}
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
          split={sharePct == null ? null : { sharePct, shareMinor }}
        />

        <div className="meta-row">
          <DateRow value={date} onChange={setDate} />
          {showSplit && (
            <SplitRow value={sharePct} defaultPct={settings.defaultSharePct} onChange={setSharePct} />
          )}
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
            <button
              type="button"
              className="btn btn-secondary delete-expense"
              onClick={() => setConfirmingDelete(true)}
            >
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

      {editing && (
        <ConfirmDeleteSheet
          open={confirmingDelete}
          onClose={closeConfirm}
          onConfirm={removeExpense}
          label="Delete this expense?"
          confirmLabel="Delete"
          body={
            <>
              {(editing.note || categories.find((c) => c.id === editing.categoryId)?.name || 'Uncategorised') +
                '. '}
              {formatMoney(editing.amount, { symbol: settings.currencySymbol, compact: true })} ·{' '}
              {dayLabel(editing.date, todayISO())}
            </>
          }
        />
      )}
    </>
  )
}

import { useEffect, useRef, useState } from 'react'
import type { Category } from '../types'
import { Sheet } from '../ui/Sheet'
import { ConfirmDeleteSheet } from '../ui/ConfirmDeleteSheet'
import { minorToDecimalString, parseMoneyInput } from '../lib/money'
import {
  reassignAndDeleteCategory,
  reassignTargetFor,
  restoreCategory,
  updateCategory,
  useStore,
} from '../store/store'
import { useAnnounce } from '../ui/LiveRegion'
import { useToast } from '../ui/Toast'

interface CategorySheetProps {
  open: boolean
  category: Category | null
  onClose: () => void
}

/**
 * Rename, re-emoji, cap and archive in one place. Categories are archived rather
 * than deleted: deleting would orphan the expenses filed under them.
 */
export function CategorySheet({ open, category, onClose }: CategorySheetProps) {
  const { settings, expenses } = useStore()
  const announce = useAnnounce()
  const toast = useToast()

  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('')
  const [capText, setCapText] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open || !category) return
    setName(category.name)
    setEmoji(category.emoji)
    setCapText(category.monthlyCap != null ? minorToDecimalString(category.monthlyCap).replace(/\.00$/, '') : '')
    setConfirmingDelete(false)
  }, [open, category])

  if (!category) return null

  const capMinor = parseMoneyInput(capText)
  const capValid = capText.trim() === '' || (capMinor !== null && capMinor > 0)
  const canSave = name.trim().length > 0 && capValid

  // Deleting is only offered when there is somewhere for the expenses to go.
  const reassignTarget = reassignTargetFor(category.id)
  const affectedCount = expenses.filter((e) => e.categoryId === category.id).length

  function save() {
    if (!canSave || !category) return
    updateCategory({
      ...category,
      name: name.trim(),
      emoji: emoji.trim() || category.emoji,
      monthlyCap: capText.trim() === '' ? null : capMinor,
    })
    announce('Category updated.')
    onClose()
  }

  function remove() {
    if (!category) return
    const result = reassignAndDeleteCategory(category.id)
    if (!result) return
    announce(`${result.category.name} deleted.`)
    toast({
      message:
        result.movedExpenses.length > 0
          ? `${result.category.name} deleted. Its expenses are now in ${result.target.name}.`
          : `${result.category.name} deleted.`,
      actionLabel: 'Undo',
      onAction: () => restoreCategory(result.category, result.movedExpenses),
      durationMs: 8000,
    })
    onClose()
  }

  function toggleArchive() {
    if (!category) return
    const previous = category
    updateCategory({ ...category, isArchived: !category.isArchived })
    toast({
      message: previous.isArchived ? `${previous.name} is back.` : `${previous.name} archived.`,
      actionLabel: 'Undo',
      onAction: () => updateCategory(previous),
    })
    onClose()
  }

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
      label={`Edit ${category.name}`}
      title="Edit category"
      initialFocusRef={nameRef}
    >
      <div className="sheet-body settings-form">
        <div className="field-row">
          <label className="field">
            <span className="field-label">Emoji</span>
            <input
              className="field-input field-input-emoji"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
              autoComplete="off"
            />
          </label>
          <label className="field field-grow">
            <span className="field-label">Name</span>
            <input
              ref={nameRef}
              className="field-input"
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </label>
        </div>

        <label className="field">
          <span className="field-label">Monthly cap ({settings.currencySymbol.trim()})</span>
          <input
            className="field-input tabular"
            type="text"
            inputMode="decimal"
            value={capText}
            placeholder="No cap"
            autoComplete="off"
            onChange={(e) => setCapText(e.target.value)}
          />
          <span className="field-hint">Leave empty for no cap. A cap resets at the start of each month.</span>
        </label>

        <button type="button" className="btn btn-secondary settings-wide" onClick={toggleArchive}>
          {category.isArchived ? 'Restore category' : 'Archive category'}
        </button>
        <p className="field-hint">
          Archiving hides a category from the add sheet. Its past expenses stay exactly where they are.
        </p>

        {reassignTarget && (
          <>
            <button
              type="button"
              className="btn btn-secondary settings-wide cat-delete"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete category
            </button>
            <p className="field-hint">
              {affectedCount > 0
                ? `${affectedCount} ${affectedCount === 1 ? 'expense moves' : 'expenses move'} to ${
                    reassignTarget.name
                  }. One tap undoes the whole thing.`
                : 'Nothing is filed under this one, so nothing else changes.'}
            </p>
          </>
        )}
      </div>

      <div className="sheet-footer">
        <button type="button" className="btn btn-primary" disabled={!canSave} onClick={save}>
          Save changes
        </button>
      </div>

      </Sheet>

      <ConfirmDeleteSheet
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={remove}
        label="Delete this category?"
        confirmLabel="Delete"
        body={
          <>
            {category.name}.
            {affectedCount > 0
              ? ` ${affectedCount} ${affectedCount === 1 ? 'expense' : 'expenses'} will move to ${reassignTarget?.name}.`
              : ' Nothing is filed under it.'}
          </>
        }
      />
    </>
  )
}

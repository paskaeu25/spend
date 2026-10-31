import type { ReactNode } from 'react'
import { Sheet } from './Sheet'
import './confirmsheet.css'

interface ConfirmDeleteSheetProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  /**
   * Accessible name and visible heading, phrased as the question the buttons
   * answer — "Delete this expense?" — so Cancel and Keep it mean the same thing.
   */
  label: string
  /** One plain account of what a confirm removes. */
  body: ReactNode
  confirmLabel: string
}

/**
 * The fence between a delete request and a delete. Every destructive route in
 * the app goes through one of these: the point is that removing something costs
 * a deliberate extra step, not a reflex.
 */
export function ConfirmDeleteSheet({
  open,
  onClose,
  onConfirm,
  label,
  body,
  confirmLabel,
}: ConfirmDeleteSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} label={label} title={label}>
      <div className="sheet-body">
        <p className="confirm-hint">{body}</p>
      </div>
      <div className="sheet-footer sheet-confirm">
        <button type="button" className="btn btn-primary" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Keep it
        </button>
      </div>
    </Sheet>
  )
}

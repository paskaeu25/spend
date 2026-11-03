import type { Category, Expense } from '../types'
import { formatMoney } from '../lib/money'
import { SwipeRow } from './SwipeRow'
import './expense-row.css'

interface ExpenseRowProps {
  expense: Expense
  category: Category | undefined
  symbol: string
  onEdit: (expense: Expense) => void
  onDelete: (expense: Expense) => void
}

export function ExpenseRow({ expense, category, symbol, onEdit, onDelete }: ExpenseRowProps) {
  const name = category?.name ?? 'Uncategorised'
  const amount = formatMoney(expense.amount, { symbol, compact: true })
  // The row shows the share, because that is what was spent. The mark is how the
  // smaller figure explains itself against a receipt for the whole bill.
  const split =
    expense.sharePct != null && expense.fullAmount != null
      ? {
          mark: expense.sharePct === 50 ? '½' : `${expense.sharePct}%`,
          title: `Your ${expense.sharePct}% of ${formatMoney(expense.fullAmount, { symbol, compact: true })}`,
        }
      : null

  return (
    <li className="expense-row-item">
      <SwipeRow onDelete={() => onDelete(expense)} deleteLabel={`Delete ${name} ${amount}`}>
        <button type="button" className="expense-row" onClick={() => onEdit(expense)}>
          <span
            className="expense-emoji"
            aria-hidden="true"
            style={category ? { background: `color-mix(in srgb, var(--cat-${category.colorSlot}) 16%, transparent)` } : undefined}
          >
            {category?.emoji ?? '•'}
          </span>
          <span className="expense-text">
            <span className="expense-category">
              {name}
              {split && (
                <span className="expense-split" title={split.title}>
                  <span aria-hidden="true">{split.mark}</span>
                  <span className="sr-only">{split.title}</span>
                </span>
              )}
            </span>
            {expense.note && <span className="expense-note">{expense.note}</span>}
          </span>
          <span className="expense-amount tabular">{amount}</span>
        </button>
      </SwipeRow>
    </li>
  )
}

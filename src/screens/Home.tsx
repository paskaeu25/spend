import { useMemo, useState } from 'react'
import { dayIndexInMonth, dayLabel, monthLabel, monthRange, shiftMonth, todayISO } from '../lib/dates'
import { formatAmountBody, formatMoney } from '../lib/money'
import { categoryMap, expensesOn, totalThroughDay } from '../store/selectors'
import { deleteExpenses, restoreExpenses, useStore } from '../store/store'
import { ExpenseRow } from '../ui/ExpenseRow'
import { ConfirmDeleteSheet } from '../ui/ConfirmDeleteSheet'
import { useToast } from '../ui/Toast'
import { InsightCard } from '../insights/InsightCard'
import { useNav } from '../App'
import type { Expense } from '../types'
import './home.css'

export function Home() {
  const { ready, expenses, categories, settings } = useStore()
  const nav = useNav()
  const toast = useToast()

  const today = todayISO()
  const symbol = settings.currencySymbol

  const view = useMemo(() => {
    const month = monthRange(today, settings.monthStartDay)
    const previous = shiftMonth(month, -1, settings.monthStartDay)
    const daysIn = dayIndexInMonth(today, settings.monthStartDay) + 1

    const monthToDate = totalThroughDay(expenses, month, daysIn)
    const previousToDate = totalThroughDay(expenses, previous, daysIn)

    return { month, monthToDate, previousToDate }
  }, [expenses, settings.monthStartDay, today])

  const cats = useMemo(() => categoryMap(categories), [categories])
  const todaysExpenses = useMemo(() => expensesOn(expenses, today), [expenses, today])
  /* The row swipe and its keyboard button only arm a delete; this is the record
     waiting for its confirmation, and nothing is removed until it is answered. */
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null)

  function confirmRemove() {
    if (!pendingDelete) return
    const removed = expenses.filter((e) => e.id === pendingDelete.id)
    deleteExpenses([pendingDelete.id])
    setPendingDelete(null)
    toast({
      message: 'Expense deleted.',
      actionLabel: 'Undo',
      onAction: () => restoreExpenses(removed),
    })
  }

  const isFirstRun = ready && expenses.length === 0

  /* Hero comparison line. Spending less is the positive delta; spending more is
     stated plainly in secondary ink, never in red. */
  const delta = view.monthToDate - view.previousToDate
  let comparison: { text: string; positive: boolean } | null = null
  if (view.previousToDate > 0) {
    if (delta < 0) {
      comparison = {
        text: `${formatMoney(-delta, { symbol, whole: true })} less than this time last month`,
        positive: true,
      }
    } else if (delta > 0) {
      comparison = {
        text: `${formatMoney(delta, { symbol, whole: true })} more than this time last month`,
        positive: false,
      }
    } else {
      comparison = { text: 'Exactly level with this time last month', positive: false }
    }
  }

  return (
    <div>
      <h1 className="sr-only">Today</h1>

      <section className="hero" aria-label={`Spent so far in ${monthLabel(view.month)}`}>
        <p className="hero-figure">
          <span className="hero-symbol" aria-hidden="true">
            {symbol.trim()}
          </span>
          <span className="hero-value">{formatAmountBody(view.monthToDate, { compact: true })}</span>
        </p>
        <p className="hero-caption">{monthLabel(view.month)} so far</p>
        {isFirstRun ? (
          <p className="hero-first-run">Log your first expense.</p>
        ) : (
          comparison && (
            <p className={`hero-delta${comparison.positive ? ' is-positive' : ''}`}>{comparison.text}</p>
          )
        )}
      </section>

      {!isFirstRun && <InsightCard />}

      {!isFirstRun && (
        <section aria-labelledby="today-heading" className="home-today">
          <div className="home-today-head">
            <h2 id="today-heading" className="section-heading">
              Today
            </h2>
            {todaysExpenses.length > 0 && (
              <span className="home-today-total tabular">
                {formatMoney(
                  todaysExpenses.reduce((n, e) => n + e.amount, 0),
                  { symbol, compact: true },
                )}
              </span>
            )}
          </div>

          {todaysExpenses.length === 0 ? (
            <p className="empty">Nothing logged today.</p>
          ) : (
            <ul>
              {todaysExpenses.map((e) => (
                <ExpenseRow
                  key={e.id}
                  expense={e}
                  category={cats.get(e.categoryId)}
                  symbol={symbol}
                  onEdit={nav.openEdit}
                  onDelete={setPendingDelete}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      <ConfirmDeleteSheet
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmRemove}
        label="Delete this expense?"
        confirmLabel="Delete"
        body={
          pendingDelete && (
            <>
              {(pendingDelete.note || cats.get(pendingDelete.categoryId)?.name || 'Uncategorised') +
                '. '}
              {formatMoney(pendingDelete.amount, { symbol, compact: true })} ·{' '}
              {dayLabel(pendingDelete.date, today)}
            </>
          )
        }
      />
    </div>
  )
}

import { useMemo } from 'react'
import { dayIndexInMonth, monthLabel, monthRange, shiftMonth, todayISO } from '../lib/dates'
import { formatAmountBody, formatMoney } from '../lib/money'
import { capProgress, categoryMap, expensesOn, totalThroughDay } from '../store/selectors'
import { deleteExpenses, restoreExpenses, useStore } from '../store/store'
import { ExpenseRow } from '../ui/ExpenseRow'
import { Meter } from '../ui/Meter'
import { useToast } from '../ui/Toast'
import { InsightCard } from '../insights/InsightCard'
import { useNav } from '../App'
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
    const caps = capProgress(categories, expenses, month)

    return { month, monthToDate, previousToDate, caps }
  }, [expenses, categories, settings.monthStartDay, today])

  const cats = useMemo(() => categoryMap(categories), [categories])
  const todaysExpenses = useMemo(() => expensesOn(expenses, today), [expenses, today])

  function removeExpense(id: string) {
    const removed = expenses.filter((e) => e.id === id)
    deleteExpenses([id])
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

  /* One pooled meter for every cap that exists, plus the one category most over,
     framed as reallocation rather than as a verdict. */
  const capSummary = useMemo(() => {
    if (view.caps.length === 0) return null
    const cap = view.caps.reduce((n, c) => n + c.cap, 0)
    const spent = view.caps.reduce((n, c) => n + c.spent, 0)
    const over = spent - cap
    const mostOver = view.caps.find((c) => c.isOver) ?? null
    const headroom = [...view.caps]
      .filter((c) => c.remaining > 0 && c.category.id !== mostOver?.category.id)
      .sort((a, b) => b.remaining - a.remaining)[0]

    return { cap, spent, over, ratio: cap > 0 ? spent / cap : 0, mostOver, headroom }
  }, [view.caps])

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

      {capSummary && (
        <section className="card home-caps" aria-label="Monthly caps">
          <Meter
            ratio={capSummary.ratio}
            isOver={capSummary.over > 0}
            ariaLabel="Spending against your monthly caps"
            primaryLabel={
              capSummary.over > 0
                ? `${formatMoney(capSummary.over, { symbol, whole: true })} over your caps`
                : `${formatMoney(capSummary.cap - capSummary.spent, { symbol, whole: true })} left`
            }
            secondaryLabel={`${formatMoney(capSummary.spent, { symbol, whole: true })} of ${formatMoney(
              capSummary.cap,
              { symbol, whole: true },
            )}`}
          />
          {capSummary.mostOver && (
            <p className="home-caps-note">
              {capSummary.mostOver.category.name} is{' '}
              {formatMoney(-capSummary.mostOver.remaining, { symbol, whole: true })} over
              {capSummary.headroom
                ? ` — trim there or take it from ${capSummary.headroom.category.name}.`
                : ' — trim there or move the cap.'}
            </p>
          )}
        </section>
      )}

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
                  onDelete={(x) => removeExpense(x.id)}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

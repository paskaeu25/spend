import { useEffect, useMemo, useRef, useState } from 'react'
import type { HistoryPreset } from '../App'
import { useNav } from '../App'
import {
  type MonthRange,
  dayLabel,
  isInRange,
  monthLabel,
  monthRange,
  shiftMonth,
  shortMonthLabel,
  todayISO,
} from '../lib/dates'
import { formatMoney, parseMoneyInput } from '../lib/money'
import { categoryMap, groupByDay, monthsWithData } from '../store/selectors'
import { deleteExpenses, restoreExpenses, useStore } from '../store/store'
import { ExpenseRow } from '../ui/ExpenseRow'
import { useToast } from '../ui/Toast'
import './history.css'

const PAGE = 30

interface HistoryProps {
  preset: HistoryPreset | null
  onPresetApplied: () => void
}

export function History({ preset, onPresetApplied }: HistoryProps) {
  const { expenses, categories, settings } = useStore()
  const nav = useNav()
  const toast = useToast()

  const today = todayISO()
  const symbol = settings.currencySymbol

  const [monthStart, setMonthStart] = useState(() => monthRange(today, settings.monthStartDay).start)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [minText, setMinText] = useState('')
  const [maxText, setMaxText] = useState('')
  const [search, setSearch] = useState('')
  const [openPanel, setOpenPanel] = useState<'categories' | 'amount' | null>(null)
  const [limit, setLimit] = useState(PAGE)

  const stripRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Arriving from an insight ("Split into categories") lands here pre-filtered.
  useEffect(() => {
    if (!preset) return
    setSelectedCategories(preset.categoryIds)
    setMonthStart(monthRange(today, settings.monthStartDay).start)
    onPresetApplied()
  }, [preset, onPresetApplied, today, settings.monthStartDay])

  /** Every month that holds data, plus the current one, oldest first. */
  const months = useMemo<MonthRange[]>(() => {
    const current = monthRange(today, settings.monthStartDay)
    const starts = new Set(monthsWithData(expenses, settings.monthStartDay))
    starts.add(current.start)
    // Keep the run contiguous so scrolling back does not skip empty months.
    const sorted = [...starts].sort()
    const out: MonthRange[] = []
    let cursor = monthRange(sorted[0], settings.monthStartDay)
    const last = current.start
    let guard = 0
    while (cursor.start <= last && guard++ < 600) {
      out.push(cursor)
      cursor = shiftMonth(cursor, 1, settings.monthStartDay)
    }
    return out
  }, [expenses, settings.monthStartDay, today])

  const activeMonth = useMemo(
    () => months.find((m) => m.start === monthStart) ?? monthRange(today, settings.monthStartDay),
    [months, monthStart, today, settings.monthStartDay],
  )

  // Keep the selected month chip in view, including on first paint.
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-month="${activeMonth.start}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [activeMonth.start])

  useEffect(() => setLimit(PAGE), [monthStart, selectedCategories, minText, maxText, search])

  const cats = useMemo(() => categoryMap(categories), [categories])

  const filtered = useMemo(() => {
    const min = parseMoneyInput(minText)
    const max = parseMoneyInput(maxText)
    const needle = search.trim().toLowerCase()
    const catFilter = new Set(selectedCategories)

    return expenses.filter((e) => {
      if (!isInRange(e.date, activeMonth)) return false
      if (catFilter.size > 0 && !catFilter.has(e.categoryId)) return false
      if (min !== null && e.amount < min) return false
      if (max !== null && e.amount > max) return false
      if (needle) {
        const category = cats.get(e.categoryId)?.name.toLowerCase() ?? ''
        if (!e.note.toLowerCase().includes(needle) && !category.includes(needle)) return false
      }
      return true
    })
  }, [expenses, activeMonth, selectedCategories, minText, maxText, search, cats])

  const monthTotal = useMemo(() => filtered.reduce((n, e) => n + e.amount, 0), [filtered])
  const visible = useMemo(() => filtered.slice(0, limit), [filtered, limit])
  const groups = useMemo(() => groupByDay(visible), [visible])
  const hasMore = filtered.length > visible.length

  // Infinite scroll.
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setLimit((n) => n + PAGE)
      },
      { rootMargin: '240px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore])

  function removeExpense(id: string) {
    const removed = expenses.filter((e) => e.id === id)
    deleteExpenses([id])
    toast({
      message: 'Expense deleted.',
      actionLabel: 'Undo',
      onAction: () => restoreExpenses(removed),
    })
  }

  const filterCount =
    selectedCategories.length + (parseMoneyInput(minText) !== null || parseMoneyInput(maxText) !== null ? 1 : 0)

  return (
    <div>
      <h1 className="screen-title">History</h1>

      <div className="month-strip" ref={stripRef} role="tablist" aria-label="Month">
        {months.map((m) => {
          const active = m.start === activeMonth.start
          return (
            <button
              key={m.start}
              type="button"
              role="tab"
              aria-selected={active}
              data-month={m.start}
              className={`month-chip${active ? ' is-active' : ''}`}
              onClick={() => setMonthStart(m.start)}
            >
              {shortMonthLabel(m)}
            </button>
          )
        })}
      </div>

      <div className="filters">
        <div className="filter-wrap">
          <button
            type="button"
            className={`filter-btn${selectedCategories.length ? ' is-active' : ''}`}
            aria-expanded={openPanel === 'categories'}
            onClick={() => setOpenPanel((p) => (p === 'categories' ? null : 'categories'))}
          >
            Categories{selectedCategories.length ? ` (${selectedCategories.length})` : ''}
          </button>
          {openPanel === 'categories' && (
            <div className="filter-panel" role="group" aria-label="Filter by category">
              {categories.map((c) => {
                const checked = selectedCategories.includes(c.id)
                return (
                  <label key={c.id} className="filter-check">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedCategories((prev) =>
                          checked ? prev.filter((id) => id !== c.id) : [...prev, c.id],
                        )
                      }
                    />
                    <span aria-hidden="true">{c.emoji}</span>
                    <span>{c.name}</span>
                  </label>
                )
              })}
              {selectedCategories.length > 0 && (
                <button type="button" className="btn-text" onClick={() => setSelectedCategories([])}>
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        <div className="filter-wrap">
          <button
            type="button"
            className={`filter-btn${parseMoneyInput(minText) !== null || parseMoneyInput(maxText) !== null ? ' is-active' : ''}`}
            aria-expanded={openPanel === 'amount'}
            onClick={() => setOpenPanel((p) => (p === 'amount' ? null : 'amount'))}
          >
            Amount
          </button>
          {openPanel === 'amount' && (
            <div className="filter-panel filter-panel-amount">
              <label className="filter-amount">
                <span>From</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={minText}
                  onChange={(e) => setMinText(e.target.value)}
                  placeholder="0"
                />
              </label>
              <label className="filter-amount">
                <span>To</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={maxText}
                  onChange={(e) => setMaxText(e.target.value)}
                  placeholder="Any"
                />
              </label>
              {(minText || maxText) && (
                <button
                  type="button"
                  className="btn-text"
                  onClick={() => {
                    setMinText('')
                    setMaxText('')
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        <label className="filter-search">
          <span className="sr-only">Search notes</span>
          <input
            type="search"
            value={search}
            placeholder="Search notes"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      <div className="history-summary">
        <span>{monthLabel(activeMonth, { year: true })}</span>
        <span className="tabular">{formatMoney(monthTotal, { symbol, compact: true })}</span>
      </div>

      {groups.length === 0 ? (
        <p className="empty">
          {expenses.length === 0
            ? 'Your logged expenses will show up here.'
            : filterCount > 0 || search
              ? 'Nothing matches these filters.'
              : 'Nothing logged in this month.'}
        </p>
      ) : (
        <div>
          {groups.map((group) => (
            <section key={group.date} className="day-group" aria-label={dayLabel(group.date, today)}>
              <div className="day-head">
                <h2 className="day-title">{dayLabel(group.date, today)}</h2>
                <span className="day-total tabular">
                  {formatMoney(group.total, { symbol, compact: true })}
                </span>
              </div>
              <ul>
                {group.expenses.map((e) => (
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
            </section>
          ))}
          {hasMore && <div ref={sentinelRef} className="history-sentinel" aria-hidden="true" />}
        </div>
      )}
    </div>
  )
}

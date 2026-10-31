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
import { ConfirmDeleteSheet } from '../ui/ConfirmDeleteSheet'
import { useToast } from '../ui/Toast'
import type { Expense } from '../types'
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

  const [selectedMonths, setSelectedMonths] = useState<string[]>(() => [
    monthRange(today, settings.monthStartDay).start,
  ])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [minText, setMinText] = useState('')
  const [maxText, setMaxText] = useState('')
  const [search, setSearch] = useState('')
  const [openPanel, setOpenPanel] = useState<'categories' | 'amount' | null>(null)
  const [limit, setLimit] = useState(PAGE)

  const stripRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Arriving from an insight ("Split into categories") lands here pre-filtered,
  // on the current month alone — deep links keep the single-month contract.
  useEffect(() => {
    if (!preset) return
    setSelectedCategories(preset.categoryIds)
    setSelectedMonths([monthRange(today, settings.monthStartDay).start])
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

  /** The selected spending months, oldest first. */
  const activeMonths = useMemo(
    () => months.filter((m) => selectedMonths.includes(m.start)),
    [months, selectedMonths],
  )

  /** An "All" chip only makes sense once there is more than one month around. */
  const allMonthsActive = months.length > 1 && activeMonths.length === months.length

  /**
   * One tap does what you meant:
   *  - with one (or no) month selected, a tap jumps to just that month;
   *  - with a stack of two or more, a tap toggles that month in or out.
   */
  function toggleMonth(start: string) {
    setSelectedMonths((prev) => {
      if (prev.length <= 1) return [start]
      return prev.includes(start) ? prev.filter((s) => s !== start) : [...prev, start]
    })
  }

  /** All is a switch: on takes every month, off empties the selection entirely. */
  function selectAllMonths() {
    setSelectedMonths(allMonthsActive ? [] : months.map((m) => m.start))
  }

  const activeMonth = activeMonths[0] ?? monthRange(today, settings.monthStartDay)

  // Keep the left-most selected month chip in view, including on first paint.
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-month="${activeMonth.start}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [activeMonth.start])

  useEffect(
    () => setLimit(PAGE),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selection changes, not its identity
    [selectedMonths.join(), selectedCategories, minText, maxText, search],
  )

  const cats = useMemo(() => categoryMap(categories), [categories])

  const filtered = useMemo(() => {
    const min = parseMoneyInput(minText)
    const max = parseMoneyInput(maxText)
    const needle = search.trim().toLowerCase()
    const catFilter = new Set(selectedCategories)

    return expenses.filter((e) => {
      if (!activeMonths.some((m) => isInRange(e.date, m))) return false
      if (catFilter.size > 0 && !catFilter.has(e.categoryId)) return false
      if (min !== null && e.amount < min) return false
      if (max !== null && e.amount > max) return false
      if (needle) {
        const category = cats.get(e.categoryId)?.name.toLowerCase() ?? ''
        if (!e.note.toLowerCase().includes(needle) && !category.includes(needle)) return false
      }
      return true
    })
  }, [expenses, activeMonths, selectedCategories, minText, maxText, search, cats])

  const monthTotal = useMemo(() => filtered.reduce((n, e) => n + e.amount, 0), [filtered])
  const visible = useMemo(() => filtered.slice(0, limit), [filtered, limit])
  const hasMore = filtered.length > visible.length

  /** With several months on screen, the list is split into headed blocks. */
  const multiMonths = activeMonths.length > 1

  /** One bucket per selected month, each with its own total and day groups. */
  const monthBlocks = useMemo(() => {
    const visibleIds = new Set(visible.map((e) => e.id))
    return activeMonths.map((month) => {
      const all = filtered.filter((e) => isInRange(e.date, month))
      return {
        month,
        total: all.reduce((n, e) => n + e.amount, 0),
        groups: groupByDay(all.filter((e) => visibleIds.has(e.id))),
      }
    })
  }, [activeMonths, filtered, visible])

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

  /** The day-grouped list inside a single (already headed) month bucket. */
  function renderDayGroups(dayGroups: ReturnType<typeof groupByDay>) {
    return (
      <>
        {dayGroups.map((group) => (
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
                  onDelete={setPendingDelete}
                />
              ))}
            </ul>
          </section>
        ))}
      </>
    )
  }

  const filterCount =
    selectedCategories.length + (parseMoneyInput(minText) !== null || parseMoneyInput(maxText) !== null ? 1 : 0)

  return (
    <div>
      <h1 className="screen-title">History</h1>

      <div className="month-strip" ref={stripRef} role="tablist" aria-label="Month">
        {months.length > 1 && (
          <button
            key="all"
            type="button"
            role="tab"
            aria-label="All months"
            aria-selected={allMonthsActive}
            className={`month-chip month-chip-all${allMonthsActive ? ' is-active' : ''}`}
            onClick={selectAllMonths}
          >
            All
          </button>
        )}
        {months.map((m) => {
          const active = activeMonths.some((a) => a.start === m.start)
          return (
            <button
              key={m.start}
              type="button"
              role="tab"
              aria-selected={active}
              data-month={m.start}
              className={`month-chip${active ? ' is-active' : ''}`}
              onClick={() => toggleMonth(m.start)}
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

      {activeMonths.length === 0 ? (
        <p className="empty">No months selected.</p>
      ) : (
        <>
          <div className="history-summary">
            <span>{multiMonths ? `${activeMonths.length} months` : monthLabel(activeMonth, { year: true })}</span>
            <span className="tabular">{formatMoney(monthTotal, { symbol, compact: true })}</span>
          </div>

          {filtered.length === 0 ? (
            <p className="empty">
              {expenses.length === 0
                ? 'Your logged expenses will show up here.'
                : filterCount > 0 || search
                  ? 'Nothing matches these filters.'
                  : 'Nothing logged in this month.'}
            </p>
          ) : multiMonths ? (
            monthBlocks.map(({ month, groups: dayGroups, total }) => (
              <section key={month.start} className="month-block" aria-label={monthLabel(month, { year: true })}>
                <div className="month-head">
                  <h2 className="month-title">{monthLabel(month, { year: true })}</h2>
                  <span className="month-total tabular">{formatMoney(total, { symbol, compact: true })}</span>
                </div>
                {renderDayGroups(dayGroups)}
              </section>
            ))
          ) : (
            renderDayGroups(monthBlocks[0]?.groups ?? [])
          )}
        </>
      )}

      {activeMonths.length === 0 && (
        <div className="empty-actions">
          <button type="button" className="btn-text" onClick={selectAllMonths}>
            Select all
          </button>
        </div>
      )}

      {hasMore && <div ref={sentinelRef} className="history-sentinel" aria-hidden="true" />}

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

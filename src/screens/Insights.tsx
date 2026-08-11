import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type MonthRange,
  dayIndexInMonth,
  monthLabel,
  monthRange,
  shiftMonth,
  shortMonthLabel,
  todayISO,
} from '../lib/dates'
import { formatMoney } from '../lib/money'
import {
  categoryMap,
  categoryMonthlyTotals,
  dailyCumulative,
  monthsWithData,
  totalsByCategory,
} from '../store/selectors'
import { useStore } from '../store/store'
import { ChartFrame, LegendItem } from '../charts/ChartFrame'
import { HBarChart, OTHER_ID, type BarDatum } from '../charts/HBarChart'
import { LineChart } from '../charts/LineChart'
import { MiniBarChart } from '../charts/MiniBarChart'
import './insights.css'

const MAX_BARS = 6

export function Insights() {
  const { expenses, categories, settings } = useStore()
  const today = todayISO()
  const symbol = settings.currencySymbol

  const [monthStart, setMonthStart] = useState(() => monthRange(today, settings.monthStartDay).start)
  const [drillId, setDrillId] = useState<string | null>(null)
  /* The pooled "Other" row is a summary, not a lid: it opens. */
  const [showAllCategories, setShowAllCategories] = useState(false)
  const stripRef = useRef<HTMLDivElement>(null)
  const drillRef = useRef<HTMLDivElement>(null)

  const months = useMemo<MonthRange[]>(() => {
    const current = monthRange(today, settings.monthStartDay)
    const starts = new Set(monthsWithData(expenses, settings.monthStartDay))
    starts.add(current.start)
    const sorted = [...starts].sort()
    const out: MonthRange[] = []
    let cursor = monthRange(sorted[0], settings.monthStartDay)
    let guard = 0
    while (cursor.start <= current.start && guard++ < 600) {
      out.push(cursor)
      cursor = shiftMonth(cursor, 1, settings.monthStartDay)
    }
    return out
  }, [expenses, settings.monthStartDay, today])

  const month = useMemo(
    () => months.find((m) => m.start === monthStart) ?? monthRange(today, settings.monthStartDay),
    [months, monthStart, today, settings.monthStartDay],
  )
  const previous = useMemo(() => shiftMonth(month, -1, settings.monthStartDay), [month, settings.monthStartDay])

  useEffect(() => {
    stripRef.current
      ?.querySelector<HTMLElement>(`[data-month="${month.start}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [month.start])

  const cats = useMemo(() => categoryMap(categories), [categories])

  /*
   * Top five categories plus a pooled "Other" row — six bars is as much rank
   * comparison as a phone screen carries at a glance. Tapping Other unpools it,
   * so the tail is a tap away rather than hidden.
   */
  const allBars = useMemo<BarDatum[]>(() => {
    const totals = totalsByCategory(expenses, month)
    return totals.map((t) => {
      const category = cats.get(t.categoryId)
      return {
        id: t.categoryId,
        label: category?.name ?? 'Uncategorised',
        emoji: category?.emoji ?? '•',
        colorSlot: category?.colorSlot ?? null,
        value: t.total,
      }
    })
  }, [expenses, month, cats])

  const pooledCount = Math.max(0, allBars.length - (MAX_BARS - 1))
  const canPool = allBars.length > MAX_BARS
  const isPooled = canPool && !showAllCategories

  const bars = useMemo<BarDatum[]>(() => {
    if (!isPooled) return allBars
    const head = allBars.slice(0, MAX_BARS - 1)
    const rest = allBars.slice(MAX_BARS - 1)
    return [
      ...head,
      {
        id: OTHER_ID,
        label: `Other (${rest.length})`,
        emoji: '▫️',
        colorSlot: null,
        value: rest.reduce((n, r) => n + r.value, 0),
      },
    ]
  }, [allBars, isPooled])

  /* Pooled or not, the bars cover every category in the month. */
  const monthTotal = useMemo(() => bars.reduce((n, b) => n + b.value, 0), [bars])

  const lines = useMemo(
    () => ({
      current: dailyCumulative(expenses, month),
      previous: dailyCumulative(expenses, previous),
    }),
    [expenses, month, previous],
  )

  /* A past month is shown complete; the current one stops at today. */
  const isCurrentMonth = month.start === monthRange(today, settings.monthStartDay).start
  const daysElapsed = isCurrentMonth
    ? dayIndexInMonth(today, settings.monthStartDay) + 1
    : lines.current.length

  const drillCategory = drillId ? cats.get(drillId) : undefined
  const drillData = useMemo(() => {
    if (!drillCategory) return []
    return categoryMonthlyTotals(expenses, drillCategory.id, month, 6, settings.monthStartDay).map((m) => ({
      label: shortMonthLabel(m.range),
      value: m.total,
    }))
  }, [drillCategory, expenses, month, settings.monthStartDay])

  useEffect(() => {
    if (drillCategory) drillRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [drillCategory])

  return (
    <div>
      <h1 className="screen-title">Insights</h1>

      <div className="month-strip" ref={stripRef} role="tablist" aria-label="Month">
        {months.map((m) => {
          const active = m.start === month.start
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

      {expenses.length === 0 ? (
        <p className="empty">Charts appear here once you have logged a few expenses.</p>
      ) : (
        <>
          <ChartFrame
            title="Where it went"
            caption={`${monthLabel(month, { year: true })} · ${formatMoney(monthTotal, { symbol, compact: true })}`}
            table={{
              columns: ['Category', 'Amount', 'Share'],
              numericColumns: [1, 2],
              rows: bars.map((b) => [
                `${b.emoji} ${b.label}`,
                formatMoney(b.value, { symbol }),
                monthTotal > 0 ? `${Math.round((b.value / monthTotal) * 100)}%` : '—',
              ]),
            }}
          >
            {bars.length === 0 ? (
              <p className="empty">Nothing logged in this month.</p>
            ) : (
              <>
                <HBarChart
                  data={bars}
                  symbol={symbol}
                  onSelect={setDrillId}
                  {...(isPooled ? { onExpandOther: () => setShowAllCategories(true) } : {})}
                />
                <p className="chart-hint">
                  {isPooled
                    ? `Tap a category for its last six months, or Other for the remaining ${pooledCount}.`
                    : 'Tap a category for its last six months.'}
                </p>
                {canPool && !isPooled && (
                  <button
                    type="button"
                    className="btn btn-secondary chart-collapse"
                    onClick={() => setShowAllCategories(false)}
                  >
                    Show top {MAX_BARS - 1} only
                  </button>
                )}
              </>
            )}
          </ChartFrame>

          <ChartFrame
            title="Spending over time"
            caption="Running total, day by day"
            legend={
              <>
                <LegendItem label={monthLabel(month)} color="var(--cat-1)" />
                <LegendItem label={monthLabel(previous)} color="var(--muted)" muted />
              </>
            }
            table={{
              columns: ['Day', monthLabel(month), monthLabel(previous)],
              numericColumns: [1, 2],
              rows: Array.from({ length: Math.max(lines.current.length, lines.previous.length) }, (_, i) => [
                String(i + 1),
                i < daysElapsed && i < lines.current.length
                  ? formatMoney(lines.current[i], { symbol })
                  : '—',
                i < lines.previous.length ? formatMoney(lines.previous[i], { symbol }) : '—',
              ]),
            }}
          >
            <LineChart
              current={lines.current}
              previous={lines.previous}
              currentLabel={monthLabel(month)}
              previousLabel={monthLabel(previous)}
              symbol={symbol}
              daysElapsed={daysElapsed}
            />
          </ChartFrame>

          {drillCategory && (
            <div ref={drillRef}>
              <ChartFrame
                title={`${drillCategory.emoji} ${drillCategory.name} — last six months`}
                caption="Monthly totals"
                table={{
                  columns: ['Month', 'Amount'],
                  numericColumns: [1],
                  rows: drillData.map((d) => [d.label, formatMoney(d.value, { symbol })]),
                }}
              >
                <MiniBarChart data={drillData} symbol={symbol} colorSlot={drillCategory.colorSlot} />
              </ChartFrame>
              <button type="button" className="btn btn-secondary drill-close" onClick={() => setDrillId(null)}>
                Close {drillCategory.name}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

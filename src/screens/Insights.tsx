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
import { HBarChart, type BarDatum } from '../charts/HBarChart'
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

  /* Top five categories plus a pooled "Other" row — never more than six bars. */
  const bars = useMemo<BarDatum[]>(() => {
    const totals = totalsByCategory(expenses, month)
    const named = totals.map((t) => {
      const category = cats.get(t.categoryId)
      return {
        id: t.categoryId,
        label: category?.name ?? 'Uncategorised',
        emoji: category?.emoji ?? '•',
        colorSlot: category?.colorSlot ?? null,
        value: t.total,
      }
    })
    if (named.length <= MAX_BARS) return named
    const head = named.slice(0, MAX_BARS - 1)
    const rest = named.slice(MAX_BARS - 1)
    return [
      ...head,
      {
        id: 'other',
        label: `Other (${rest.length})`,
        emoji: '▫️',
        colorSlot: null,
        value: rest.reduce((n, r) => n + r.value, 0),
      },
    ]
  }, [expenses, month, cats])

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
                <HBarChart data={bars} symbol={symbol} onSelect={setDrillId} />
                <p className="chart-hint">Tap a category for its last six months.</p>
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

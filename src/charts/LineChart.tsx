import { useCallback, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { formatMoney } from '../lib/money'
import { useWidth } from './useSize'
import { yTicks } from './scale'

interface LineChartProps {
  /** Cumulative spend per day of the current month. */
  current: number[]
  /** Cumulative spend per day of the previous month, the muted comparison line. */
  previous: number[]
  currentLabel: string
  previousLabel: string
  symbol: string
  /** The current line stops here rather than flatlining to the month end. */
  daysElapsed: number
}

const PAD = { top: 14, right: 10, bottom: 24, left: 46 }
const HEIGHT = 200

/** Cumulative spend, one y-axis, current month against last month. */
export function LineChart({
  current,
  previous,
  currentLabel,
  previousLabel,
  symbol,
  daysElapsed,
}: LineChartProps) {
  const { ref, width } = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const days = Math.max(current.length, previous.length, 1)
  const currentVisible = current.slice(0, Math.max(1, Math.min(daysElapsed, current.length)))
  const peak = Math.max(0, ...currentVisible, ...previous)
  const { max, ticks } = yTicks(peak)

  const plotW = Math.max(0, width - PAD.left - PAD.right)
  const plotH = HEIGHT - PAD.top - PAD.bottom

  const x = useCallback(
    (i: number) => PAD.left + (days === 1 ? plotW / 2 : (i / (days - 1)) * plotW),
    [days, plotW],
  )
  const y = useCallback((v: number) => PAD.top + plotH - (max > 0 ? (v / max) * plotH : 0), [max, plotH])

  const path = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')

  const onPointer = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const rel = e.clientX - rect.left - PAD.left
    const i = Math.round((rel / Math.max(1, plotW)) * (days - 1))
    setHover(Math.max(0, Math.min(days - 1, i)))
  }

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    setHover((h) => {
      const base = h ?? Math.max(0, currentVisible.length - 1)
      return Math.max(0, Math.min(days - 1, base + (e.key === 'ArrowRight' ? 1 : -1)))
    })
  }

  const hoverCurrent = hover !== null && hover < currentVisible.length ? currentVisible[hover] : null
  const hoverPrevious = hover !== null && hover < previous.length ? previous[hover] : null
  const tooltipLeft = hover !== null && width > 0 ? Math.min(Math.max(x(hover), 70), width - 70) : 0

  return (
    <div className="chart-plot" ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          tabIndex={0}
          aria-label={`Cumulative spending. ${currentLabel} against ${previousLabel}. Use arrow keys to read each day.`}
          className="linechart"
          onPointerMove={onPointer}
          onPointerDown={onPointer}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKeyDown}
          onBlur={() => setHover(null)}
        >
          {/* Recessive hairline grid. */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--gridline)"
                strokeWidth={1}
              />
              <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="chart-tick">
                {formatMoney(t, { symbol, whole: true })}
              </text>
            </g>
          ))}

          <line
            x1={PAD.left}
            x2={width - PAD.right}
            y1={y(0)}
            y2={y(0)}
            stroke="var(--baseline)"
            strokeWidth={1}
          />

          {/* Previous month first, so the current month reads on top. */}
          {previous.length > 1 && (
            <path
              d={path(previous)}
              fill="none"
              stroke="var(--muted)"
              strokeWidth={2}
              strokeDasharray="5 4"
              strokeLinecap="round"
            />
          )}
          {currentVisible.length > 1 && (
            <path
              d={path(currentVisible)}
              fill="none"
              stroke="var(--cat-1)"
              strokeWidth={2}
              strokeLinecap="round"
            />
          )}
          {currentVisible.length === 1 && (
            <circle cx={x(0)} cy={y(currentVisible[0])} r={4} fill="var(--cat-1)" />
          )}

          {/* Day 1, middle and last on the x-axis is enough at this width. */}
          {[0, Math.floor((days - 1) / 2), days - 1].map((i, n, arr) =>
            arr.indexOf(i) === n ? (
              <text key={i} x={x(i)} y={HEIGHT - 6} textAnchor="middle" className="chart-tick">
                {i + 1}
              </text>
            ) : null,
          )}

          {hover !== null && (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="var(--baseline)"
                strokeWidth={1}
              />
              {hoverPrevious !== null && (
                <circle
                  cx={x(hover)}
                  cy={y(hoverPrevious)}
                  r={4}
                  fill="var(--muted)"
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
              )}
              {hoverCurrent !== null && (
                <circle
                  cx={x(hover)}
                  cy={y(hoverCurrent)}
                  r={5}
                  fill="var(--cat-1)"
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
              )}
            </g>
          )}
        </svg>
      )}

      {hover !== null && (
        <div className="chart-tooltip line-tooltip" style={{ left: tooltipLeft }} role="tooltip">
          <div className="line-tooltip-day">Day {hover + 1}</div>
          {hoverCurrent !== null && (
            <div>
              {currentLabel}: <strong>{formatMoney(hoverCurrent, { symbol })}</strong>
            </div>
          )}
          {hoverPrevious !== null && (
            <div className="line-tooltip-muted">
              {previousLabel}: {formatMoney(hoverPrevious, { symbol })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

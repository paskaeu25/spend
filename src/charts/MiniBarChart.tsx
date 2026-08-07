import { useState } from 'react'
import { formatMoney } from '../lib/money'
import { useWidth } from './useSize'
import { yTicks } from './scale'

export interface MiniBarDatum {
  label: string
  value: number
}

interface MiniBarChartProps {
  data: MiniBarDatum[]
  symbol: string
  /** Palette slot of the category being drilled into. */
  colorSlot: number
}

const PAD = { top: 20, right: 6, bottom: 22, left: 6 }
const HEIGHT = 150
const GAP = 2

/** Six months of one category. Bars carry their own value labels. */
export function MiniBarChart({ data, symbol, colorSlot }: MiniBarChartProps) {
  const { ref, width } = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const peak = Math.max(0, ...data.map((d) => d.value))
  const { max } = yTicks(peak, 2)
  const plotW = Math.max(0, width - PAD.left - PAD.right)
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const slot = data.length > 0 ? plotW / data.length : plotW
  const barW = Math.max(6, slot - GAP * 2)
  const baseline = PAD.top + plotH

  return (
    <div className="chart-plot" ref={ref}>
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label="Monthly totals for the last six months">
          <line
            x1={PAD.left}
            x2={width - PAD.right}
            y1={baseline}
            y2={baseline}
            stroke="var(--baseline)"
            strokeWidth={1}
          />
          {data.map((d, i) => {
            const h = max > 0 ? (d.value / max) * plotH : 0
            const cx = PAD.left + slot * i + slot / 2
            const x = cx - barW / 2
            const isHovered = hover === i
            return (
              <g
                key={d.label + i}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover((h2) => (h2 === i ? null : h2))}
                onPointerDown={() => setHover(i)}
              >
                {/* A hit area taller than the bar, so short months stay tappable. */}
                <rect x={x - GAP} y={PAD.top} width={barW + GAP * 2} height={plotH} fill="transparent" />
                <rect
                  x={x}
                  y={baseline - Math.max(h, d.value > 0 ? 2 : 0)}
                  width={barW}
                  height={Math.max(h, d.value > 0 ? 2 : 0)}
                  rx={4}
                  fill={`var(--cat-${colorSlot})`}
                  opacity={isHovered ? 0.85 : 1}
                />
                {/* Square off the baseline end: rounding belongs to the data end only. */}
                {h > 4 && (
                  <rect
                    x={x}
                    y={baseline - 4}
                    width={barW}
                    height={4}
                    fill={`var(--cat-${colorSlot})`}
                    opacity={isHovered ? 0.85 : 1}
                  />
                )}
                <text x={cx} y={baseline - Math.max(h, 2) - 7} textAnchor="middle" className="chart-bar-label">
                  {formatMoney(d.value, { symbol, whole: true })}
                </text>
                <text x={cx} y={HEIGHT - 6} textAnchor="middle" className="chart-tick">
                  {d.label}
                </text>
              </g>
            )
          })}
        </svg>
      )}

      {hover !== null && data[hover] && (
        <div
          className="chart-tooltip minibar-tooltip"
          style={{ left: Math.min(Math.max(PAD.left + slot * hover + slot / 2, 60), Math.max(width - 60, 60)) }}
          role="tooltip"
        >
          {data[hover].label}: <strong>{formatMoney(data[hover].value, { symbol })}</strong>
        </div>
      )}
    </div>
  )
}

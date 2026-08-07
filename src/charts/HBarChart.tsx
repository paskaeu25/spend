import { useState } from 'react'
import { formatMoney } from '../lib/money'

export interface BarDatum {
  id: string
  label: string
  emoji: string
  /** 1..8, or null for the pooled "Other" row. */
  colorSlot: number | null
  value: number
}

interface HBarChartProps {
  data: BarDatum[]
  symbol: string
  /** Tapping a bar drills into that category. Omitted for the "Other" row. */
  onSelect?: (id: string) => void
}

/**
 * Horizontal bars, sorted descending, with the value printed on every row. Bars
 * beat a donut here because the question is "what's biggest, and by how much" —
 * that is a rank-and-magnitude comparison, which lengths answer directly.
 */
export function HBarChart({ data, symbol, onSelect }: HBarChartProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const max = data.reduce((n, d) => Math.max(n, d.value), 0)
  const total = data.reduce((n, d) => n + d.value, 0)

  return (
    <ul className="hbars">
      {data.map((d) => {
        const pct = max > 0 ? (d.value / max) * 100 : 0
        const share = total > 0 ? Math.round((d.value / total) * 100) : 0
        const color = d.colorSlot ? `var(--cat-${d.colorSlot})` : 'var(--neutral-fill)'
        const interactive = !!onSelect && d.id !== 'other'

        return (
          <li key={d.id} className="hbar-row">
            <button
              type="button"
              className="hbar-hit"
              disabled={!interactive}
              onClick={() => interactive && onSelect?.(d.id)}
              onPointerEnter={() => setHovered(d.id)}
              onPointerLeave={() => setHovered((h) => (h === d.id ? null : h))}
              onFocus={() => setHovered(d.id)}
              onBlur={() => setHovered((h) => (h === d.id ? null : h))}
            >
              <span className="hbar-head">
                <span className="hbar-emoji" aria-hidden="true">
                  {d.emoji}
                </span>
                <span className="hbar-label">{d.label}</span>
                <span className="hbar-value tabular">
                  {formatMoney(d.value, { symbol, whole: true })}
                </span>
              </span>
              <span className="hbar-track">
                <span className="hbar-fill" style={{ width: `${pct}%`, background: color }} />
              </span>
              {hovered === d.id && (
                <span className="chart-tooltip hbar-tooltip" role="tooltip">
                  {d.label}: {formatMoney(d.value, { symbol })} · {share}% of the month
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

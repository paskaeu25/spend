import { useId, useState, type ReactNode } from 'react'
import './charts.css'

export interface TableSpec {
  columns: string[]
  rows: string[][]
  /** Column indexes rendered with tabular figures and right-aligned. */
  numericColumns?: number[]
}

interface ChartFrameProps {
  title: string
  /** Required whenever two or more series are drawn. */
  legend?: ReactNode
  table: TableSpec
  children: ReactNode
  /** Shown under the title, e.g. the month being charted. */
  caption?: string
}

/**
 * Every chart is wrapped in this, which is what guarantees the table view exists:
 * no value is ever available only through colour.
 */
export function ChartFrame({ title, legend, table, children, caption }: ChartFrameProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const id = useId()
  const numeric = new Set(table.numericColumns ?? [])

  return (
    <section className="card chart-frame" aria-labelledby={`${id}-title`}>
      <div className="chart-head">
        <div>
          <h2 id={`${id}-title`} className="chart-title">
            {title}
          </h2>
          {caption && <p className="chart-caption">{caption}</p>}
        </div>
        <div className="chart-toggle" role="group" aria-label={`${title} view`}>
          <button
            type="button"
            className={`chart-toggle-btn${view === 'chart' ? ' is-active' : ''}`}
            aria-pressed={view === 'chart'}
            onClick={() => setView('chart')}
          >
            Chart
          </button>
          <button
            type="button"
            className={`chart-toggle-btn${view === 'table' ? ' is-active' : ''}`}
            aria-pressed={view === 'table'}
            onClick={() => setView('table')}
          >
            Table
          </button>
        </div>
      </div>

      {legend && view === 'chart' && <div className="chart-legend">{legend}</div>}

      {view === 'chart' ? (
        children
      ) : (
        <div className="chart-table-wrap">
          <table className="chart-table">
            <thead>
              <tr>
                {table.columns.map((c, i) => (
                  <th key={c} scope="col" className={numeric.has(i) ? 'is-numeric' : undefined}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) =>
                    ci === 0 ? (
                      <th key={ci} scope="row">
                        {cell}
                      </th>
                    ) : (
                      <td key={ci} className={numeric.has(ci) ? 'is-numeric tabular' : undefined}>
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

interface LegendItemProps {
  label: string
  color: string
  /** Dashed swatch for the muted comparison series. */
  muted?: boolean
}

export function LegendItem({ label, color, muted }: LegendItemProps) {
  return (
    <span className="legend-item">
      <span
        className={`legend-swatch${muted ? ' is-muted' : ''}`}
        style={{ background: color }}
        aria-hidden="true"
      />
      {label}
    </span>
  )
}

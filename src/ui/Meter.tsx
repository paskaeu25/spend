import './meter.css'

interface MeterProps {
  /** 0..1+, values over 1 are clamped for the bar and stated in the label. */
  ratio: number
  isOver: boolean
  /** Always present: colour never carries the state on its own. */
  primaryLabel: string
  secondaryLabel?: string
  /** Accessible description of what is being measured. */
  ariaLabel: string
}

/**
 * Neutral fill under the cap, amber over it. Never red, and never colour without
 * words — being over a cap is information, not a verdict.
 */
export function Meter({ ratio, isOver, primaryLabel, secondaryLabel, ariaLabel }: MeterProps) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100

  return (
    <div className="meter">
      <div className="meter-labels">
        <span className={`meter-primary${isOver ? ' is-over' : ''}`}>{primaryLabel}</span>
        {secondaryLabel && <span className="meter-secondary">{secondaryLabel}</span>}
      </div>
      <div
        className="meter-track"
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-valuetext={primaryLabel}
      >
        <div className={`meter-fill${isOver ? ' is-over' : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

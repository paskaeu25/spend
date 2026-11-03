import { useMemo, useState } from 'react'
import { monthRange, todayISO } from '../lib/dates'
import { useStore } from '../store/store'
import { useAnnounce } from '../ui/LiveRegion'
import { useNav } from '../App'
import { dismissInsight, pickInsight } from './engine'

/**
 * The single insight slot. Renders nothing when no rule fires — an empty slot
 * beats a filler card.
 */
export function InsightCard() {
  const { expenses, categories, settings } = useStore()
  const announce = useAnnounce()
  const nav = useNav()
  const [dismissedNow, setDismissedNow] = useState<string[]>([])

  const today = todayISO()
  const card = useMemo(() => {
    const month = monthRange(today, settings.monthStartDay)
    return pickInsight({ expenses, categories, settings, today, month })
  }, [expenses, categories, settings, today])

  if (!card || dismissedNow.includes(card.key)) return null

  function dismiss() {
    if (!card) return
    dismissInsight(card.key, today)
    setDismissedNow((prev) => [...prev, card.key])
    announce('Insight dismissed.')
  }

  function runAction() {
    if (!card?.action) return
    nav.goToHistory({ categoryIds: [card.action.categoryId] })
  }

  return (
    <section className="card insight" aria-label="Insight">
      <div className="insight-main">
        <p className="insight-text">{card.text}</p>
        {card.action && (
          <button type="button" className="insight-action" onClick={runAction}>
            {card.action.label}
          </button>
        )}
      </div>
      <button type="button" className="insight-dismiss" onClick={dismiss} aria-label="Dismiss insight">
        <span aria-hidden="true">✕</span>
      </button>
    </section>
  )
}

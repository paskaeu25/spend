import { useMemo, useState } from 'react'
import type { Category } from '../types'
import { monthRange, todayISO } from '../lib/dates'
import { updateExpenses, useStore } from '../store/store'
import { useAnnounce } from '../ui/LiveRegion'
import { useToast } from '../ui/Toast'
import { useNav } from '../App'
import { dismissInsight, pickInsight } from './engine'
import { CapSheet } from './CapSheet'

/**
 * The single insight slot. Renders nothing when no rule fires — an empty slot
 * beats a filler card.
 */
export function InsightCard() {
  const { expenses, categories, settings } = useStore()
  const announce = useAnnounce()
  const toast = useToast()
  const nav = useNav()
  const [dismissedNow, setDismissedNow] = useState<string[]>([])
  const [capTarget, setCapTarget] = useState<{ category: Category; suggested: number } | null>(null)

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
    const action = card.action

    if (action.kind === 'set-cap') {
      const category = categories.find((c) => c.id === action.categoryId)
      if (category) setCapTarget({ category, suggested: action.suggestedCap })
      return
    }

    if (action.kind === 'mark-recurring') {
      const ids = new Set(action.expenseIds)
      const touched = expenses.filter((e) => ids.has(e.id))
      updateExpenses(touched.map((e) => ({ ...e, isRecurringHint: true })))
      toast({
        message: 'Marked as recurring.',
        actionLabel: 'Undo',
        onAction: () => updateExpenses(touched),
      })
      setDismissedNow((prev) => [...prev, card.key])
      return
    }

    if (action.kind === 'split-category') {
      nav.goToHistory({ categoryIds: [action.categoryId] })
    }
  }

  return (
    <>
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

      <CapSheet
        open={capTarget !== null}
        category={capTarget?.category ?? null}
        suggested={capTarget?.suggested ?? 0}
        onClose={() => {
          setCapTarget(null)
          if (card) {
            // Acted on: this card has served its purpose for now.
            dismissInsight(card.key, today)
            setDismissedNow((prev) => [...prev, card.key])
          }
        }}
      />
    </>
  )
}

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Category } from '../types'

interface CategoryChipsProps {
  /** Already in recency-frequency order. */
  categories: Category[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreate: (name: string, emoji: string) => void
}

const QUICK_EMOJI = ['🛒', '🍽️', '☕', '🚕', '⛽', '🏠', '🎬', '🎁', '💊', '👕', '✈️', '📚']

export function CategoryChips({ categories, selectedId, onSelect, onCreate }: CategoryChipsProps) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🏷️')
  const nameRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (creating) nameRef.current?.focus()
  }, [creating])

  // Keep the selected chip in view when the order changes under it.
  useEffect(() => {
    if (!selectedId) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-cat="${selectedId}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [selectedId])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const index = categories.findIndex((c) => c.id === selectedId)
    const next =
      e.key === 'ArrowRight'
        ? Math.min(categories.length - 1, index + 1)
        : Math.max(0, index < 0 ? 0 : index - 1)
    const target = categories[next]
    if (!target) return
    onSelect(target.id)
    listRef.current?.querySelector<HTMLElement>(`[data-cat="${target.id}"]`)?.focus()
  }

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate(trimmed, emoji.trim() || '🏷️')
    setName('')
    setEmoji('🏷️')
    setCreating(false)
  }

  return (
    <div className="chips-block">
      {creating && (
        <div className="chip-create">
          <div className="chip-create-row">
            <label className="sr-only" htmlFor="new-cat-emoji">
              Emoji
            </label>
            <input
              id="new-cat-emoji"
              className="chip-create-emoji"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
              inputMode="text"
              autoComplete="off"
            />
            <label className="sr-only" htmlFor="new-cat-name">
              Category name
            </label>
            <input
              id="new-cat-name"
              ref={nameRef}
              className="chip-create-name"
              value={name}
              placeholder="Category name"
              maxLength={24}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submit()
                }
              }}
            />
            <button type="button" className="btn btn-secondary chip-create-add" onClick={submit} disabled={!name.trim()}>
              Add
            </button>
          </div>
          <div className="chip-create-emoji-row">
            {QUICK_EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                className={`emoji-pick${emoji === e ? ' is-picked' : ''}`}
                onClick={() => setEmoji(e)}
                aria-label={`Use ${e}`}
                aria-pressed={emoji === e}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="chips-scroll">
        <div
          ref={listRef}
          className="chips"
          role="radiogroup"
          aria-label="Category"
          onKeyDown={onKeyDown}
        >
          {categories.map((c, i) => {
            const selected = c.id === selectedId
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={selected}
                data-cat={c.id}
                tabIndex={selected || (!selectedId && i === 0) ? 0 : -1}
                className={`chip${selected ? ' is-selected' : ''}`}
                style={selected ? { background: `var(--cat-${c.colorSlot})`, color: `var(--cat-${c.colorSlot}-ink)` } : undefined}
                onClick={() => onSelect(c.id)}
              >
                <span className="chip-emoji" aria-hidden="true">
                  {c.emoji}
                </span>
                <span className="chip-label">{c.name}</span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          className="chip chip-add"
          onClick={() => setCreating((v) => !v)}
          aria-expanded={creating}
          aria-label="Create a category"
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
    </div>
  )
}

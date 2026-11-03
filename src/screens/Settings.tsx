import { useEffect, useRef, useState } from 'react'
import type { Category, Expense, ThemePref } from '../types'
import { clampSharePct, formatMoney } from '../lib/money'
import {
  backupFilename,
  fromCSVBackup,
  fromJSONBackup,
  toCSVBackup,
  toJSONBackup,
  type ConversionReport,
} from '../lib/backup'
import { saveFile } from '../lib/saveFile'
import { CURRENCIES, symbolFor } from '../store/settings'
import {
  addCategory,
  deleteAllData,
  importData,
  setSettings,
  updateCategories,
  useStore,
} from '../store/store'
import { nextColorSlot } from '../db/seedCategories'
import { buildSampleExpenses } from '../db/sampleData'
import { uuid } from '../lib/uuid'
import { useToast } from '../ui/Toast'
import { useAnnounce } from '../ui/LiveRegion'
import { Sheet } from '../ui/Sheet'
import { CategorySheet } from './CategorySheet'
import { canInstall, isIOSSafari, isStandalone, promptInstall, subscribeInstall } from '../pwa/install'
import './settings.css'

const THEMES: Array<{ id: ThemePref; label: string }> = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

export function Settings() {
  const { expenses, categories, settings, storageError } = useStore()
  const toast = useToast()
  const announce = useAnnounce()

  const [editing, setEditing] = useState<Category | null>(null)
  const [importReport, setImportReport] = useState<
    (ConversionReport & { count: number; total: number }) | null
  >(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [installable, setInstallable] = useState(canInstall())
  const [newName, setNewName] = useState('')
  // Held as text so the field can be empty mid-edit instead of snapping to a
  // clamped number under the cursor.
  const [shareText, setShareText] = useState(String(settings.defaultSharePct))
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => subscribeInstall(() => setInstallable(canInstall())), [])

  const symbol = settings.currencySymbol

  /**
   * The browser downloads the file; the Android shell opens a share sheet (see
   * saveFile). Either way a failure has to say so — on native the old code
   * simply did nothing visible.
   */
  async function exportBackup(kind: 'json' | 'csv') {
    const bundle = { settings, categories, expenses }
    const filename = backupFilename(kind)
    try {
      const outcome =
        kind === 'json'
          ? await saveFile(filename, toJSONBackup(bundle), 'application/json')
          : await saveFile(filename, toCSVBackup(bundle), 'text/csv')
      if (outcome === 'cancelled') return
      announce(kind === 'json' ? 'Backup file saved.' : 'CSV file saved.')
    } catch {
      // Plugin errors read like stack traces; the file name is the useful part.
      toast({ message: `${filename} could not be saved.`, durationMs: 6000 })
    }
  }

  async function onImportFile(file: File) {
    const text = await file.text()
    const previous = { expenses, categories, settings }
    try {
      const result = file.name.toLowerCase().endsWith('.csv')
        ? fromCSVBackup(text, settings.currency)
        : fromJSONBackup(text, {
            currency: settings.currency,
            existingCategories: categories,
          })

      importData({
        expenses: result.expenses,
        categories: result.categories,
        ...(result.settings ? { settings: result.settings } : {}),
      })

      // A converted file deserves a plain account of what changed, not just a count.
      setImportReport(
        result.conversion
          ? {
              count: result.expenses.length,
              total: result.expenses.reduce((n, e) => n + e.amount, 0),
              ...result.conversion,
            }
          : null,
      )

      toast({
        message: result.conversion
          ? `Imported ${result.expenses.length} expenses from another app.`
          : `Imported ${result.expenses.length} expenses.`,
        actionLabel: 'Undo',
        onAction: () => {
          importData(previous)
          setImportReport(null)
        },
        durationMs: 8000,
      })
    } catch (err) {
      toast({
        message: err instanceof Error ? err.message : 'That file could not be read.',
        durationMs: 6000,
      })
    }
  }

  function reorder(index: number, direction: -1 | 1) {
    const next = [...categories]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    updateCategories(next.map((c, i) => ({ ...c, sortWeight: i })))
    announce(`${moved.name} moved to position ${target + 1}.`)
  }

  function createCategory() {
    const name = newName.trim()
    if (!name) return
    addCategory({
      id: uuid(),
      name,
      emoji: '🏷️',
      colorSlot: nextColorSlot(categories),
      isArchived: false,
      sortWeight: categories.length,
    })
    setNewName('')
    announce(`${name} added.`)
  }

  function loadSample() {
    const sample: Expense[] = buildSampleExpenses(settings.currency, settings.monthStartDay)
    const previous = { expenses, categories, settings }
    importData({ expenses: sample, categories })
    toast({
      message: `Loaded ${sample.length} sample expenses.`,
      actionLabel: 'Undo',
      onAction: () => importData(previous),
    })
  }

  function wipe() {
    const previous = { expenses, categories, settings }
    setConfirmDelete(false)
    deleteAllData()
    toast({
      message: 'All data removed from this device.',
      actionLabel: 'Undo',
      onAction: () => importData(previous),
      durationMs: 8000,
    })
  }

  return (
    <div>
      <h1 className="screen-title">Settings</h1>

      {storageError && (
        <p className="notice">
          This browser is not letting the app store data, so nothing will be kept after you close it.
          Private browsing windows usually cause this.
        </p>
      )}

      <section className="settings-group" aria-labelledby="basics-heading">
        <h2 id="basics-heading" className="section-heading">
          Basics
        </h2>

        <label className="field">
          <span className="field-label">Currency</span>
          <select
            className="field-input"
            value={settings.currency}
            onChange={(e) =>
              setSettings({ currency: e.target.value, currencySymbol: symbolFor(e.target.value) })
            }
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
          <span className="field-hint">One currency for the whole app. Amounts are never converted.</span>
        </label>

        <label className="field">
          <span className="field-label">Symbol</span>
          <input
            className="field-input field-input-emoji"
            value={settings.currencySymbol}
            onChange={(e) => setSettings({ currencySymbol: e.target.value.slice(0, 4) })}
            autoComplete="off"
          />
        </label>

        <label className="field">
          <span className="field-label">Month starts on day</span>
          <select
            className="field-input"
            value={settings.monthStartDay}
            onChange={(e) => setSettings({ monthStartDay: Number(e.target.value) })}
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <span className="field-hint">Set this to your payday if that is how you think about a month.</span>
        </label>

        <div className="field">
          <span className="field-label" id="split-label">
            Shared expenses
          </span>
          <div className="segmented" role="group" aria-labelledby="split-label">
            <button
              type="button"
              className={`segmented-btn${settings.splitEnabled ? '' : ' is-active'}`}
              aria-pressed={!settings.splitEnabled}
              onClick={() => setSettings({ splitEnabled: false })}
            >
              Off
            </button>
            <button
              type="button"
              className={`segmented-btn${settings.splitEnabled ? ' is-active' : ''}`}
              aria-pressed={settings.splitEnabled}
              onClick={() => setSettings({ splitEnabled: true })}
            >
              On
            </button>
          </div>
          <span className="field-hint">
            Adds a Split control to the add sheet, for anything paid from a joint account. You enter
            the whole bill and only your share is logged.
          </span>
        </div>

        {settings.splitEnabled && (
          <label className="field">
            <span className="field-label">Your usual share (%)</span>
            <input
              className="field-input field-input-pct"
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              value={shareText}
              onChange={(e) => {
                setShareText(e.target.value)
                const n = Number(e.target.value)
                if (e.target.value !== '' && n >= 1 && n <= 99) {
                  setSettings({ defaultSharePct: Math.trunc(n) })
                }
              }}
              onBlur={() => {
                const pct = clampSharePct(shareText, settings.defaultSharePct)
                setSettings({ defaultSharePct: pct })
                setShareText(String(pct))
              }}
            />
            <span className="field-hint">
              What one tap on Split applies. Other shares are a tap away in the sheet itself.
            </span>
          </label>
        )}

        <div className="field">
          <span className="field-label" id="theme-label">
            Theme
          </span>
          <div className="segmented" role="group" aria-labelledby="theme-label">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`segmented-btn${settings.theme === t.id ? ' is-active' : ''}`}
                aria-pressed={settings.theme === t.id}
                onClick={() => setSettings({ theme: t.id })}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="settings-group" aria-labelledby="categories-heading">
        <h2 id="categories-heading" className="section-heading">
          Categories
        </h2>
        <p className="field-hint settings-lead">
          Tap one to rename it, change its icon, set a monthly cap, or archive it. The arrows
          reorder the chips in the add sheet.
        </p>

        <ul className="cat-list">
          {categories.map((c, i) => (
            <li key={c.id} className={`cat-item${c.isArchived ? ' is-archived' : ''}`}>
              <button type="button" className="cat-main" onClick={() => setEditing(c)}>
                {/* Inside the button, so the swatch and the row's left edge are
                    part of the tap target rather than a dead strip beside it. */}
                <span className="cat-swatch" aria-hidden="true" style={{ background: `var(--cat-${c.colorSlot})` }} />
                <span className="cat-emoji" aria-hidden="true">
                  {c.emoji}
                </span>
                <span className="cat-name">
                  {c.name}
                  {c.isArchived && <span className="cat-tag">Archived</span>}
                </span>
                <span className="cat-chevron" aria-hidden="true">
                  ›
                </span>
              </button>
              <span className="cat-move">
                <button
                  type="button"
                  className="cat-move-btn"
                  onClick={() => reorder(i, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${c.name} up`}
                >
                  <span aria-hidden="true">↑</span>
                </button>
                <button
                  type="button"
                  className="cat-move-btn"
                  onClick={() => reorder(i, 1)}
                  disabled={i === categories.length - 1}
                  aria-label={`Move ${c.name} down`}
                >
                  <span aria-hidden="true">↓</span>
                </button>
              </span>
            </li>
          ))}
        </ul>

        <div className="cat-add">
          <label className="sr-only" htmlFor="new-category">
            New category name
          </label>
          <input
            id="new-category"
            className="field-input"
            value={newName}
            placeholder="New category"
            maxLength={24}
            autoComplete="off"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                createCategory()
              }
            }}
          />
          <button type="button" className="btn btn-secondary" onClick={createCategory} disabled={!newName.trim()}>
            Add
          </button>
        </div>
      </section>

      <section className="settings-group" aria-labelledby="data-heading">
        <h2 id="data-heading" className="section-heading">
          Your data
        </h2>
        <p className="field-hint settings-lead">
          Everything lives on this device. Exports are your copy and your way onto another one.
        </p>

        <div className="settings-actions">
          <button
            type="button"
            className="btn btn-secondary settings-wide"
            onClick={() => void exportBackup('csv')}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="btn btn-secondary settings-wide"
            onClick={() => void exportBackup('json')}
          >
            Export JSON backup
          </button>
          <button type="button" className="btn btn-secondary settings-wide" onClick={() => fileRef.current?.click()}>
            Import CSV or JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.csv,application/json,text/csv"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void onImportFile(file)
            }}
          />
          <button type="button" className="btn btn-secondary settings-wide" onClick={() => setConfirmDelete(true)}>
            Delete all data
          </button>
        </div>

        <p className="field-hint">
          {expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'} stored.
        </p>

        {importReport && (
          <section className="import-report" aria-label="Import summary">
            <div className="import-report-head">
              <h3 className="import-report-title">Converted from another app</h3>
              <button
                type="button"
                className="import-report-close"
                onClick={() => setImportReport(null)}
                aria-label="Hide import summary"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
            <ul className="import-report-list">
              <li>
                {importReport.count} expenses, {formatMoney(importReport.total, { symbol })} in total.
              </li>
              {importReport.scaledAmounts && (
                <li>Amounts were stored as decimals and are now held to the cent.</li>
              )}
              {importReport.roundedAmounts > 0 && (
                <li>
                  {importReport.roundedAmounts} amounts had fractions of a cent and were rounded to
                  the nearest one.
                </li>
              )}
              {importReport.matchedCategories.length > 0 && (
                <li>
                  Matched to categories already here: {importReport.matchedCategories.join(', ')}.
                  Their colours and any caps are unchanged.
                </li>
              )}
              {importReport.createdCategories.length > 0 && (
                <li>Added: {importReport.createdCategories.join(', ')}, with an icon picked per name.</li>
              )}
              {importReport.ignoredFields.length > 0 && (
                <li>
                  Not carried over: {importReport.ignoredFields.join(', ')} — this app has no use for
                  {importReport.ignoredFields.length === 1 ? ' it' : ' them'}.
                </li>
              )}
            </ul>
            <p className="field-hint">
              Category icons and names are yours to change under Categories above.
            </p>
          </section>
        )}
      </section>

      <section className="settings-group" aria-labelledby="install-heading">
        <h2 id="install-heading" className="section-heading">
          Install
        </h2>
        {isStandalone() ? (
          <p className="field-hint">Running from your home screen. Nothing else to do.</p>
        ) : installable ? (
          <button
            type="button"
            className="btn btn-secondary settings-wide"
            onClick={() => void promptInstall()}
          >
            Add to home screen
          </button>
        ) : isIOSSafari() ? (
          <p className="field-hint">
            Tap Share, then <strong>Add to Home Screen</strong>, to keep this a tap away and open it
            without a browser bar.
          </p>
        ) : (
          <p className="field-hint">
            Use your browser&apos;s install or &ldquo;Add to home screen&rdquo; option to keep this a tap
            away.
          </p>
        )}
      </section>

      {import.meta.env.DEV && (
        <section className="settings-group" aria-labelledby="dev-heading">
          <h2 id="dev-heading" className="section-heading">
            Development
          </h2>
          <button type="button" className="btn btn-secondary settings-wide" onClick={loadSample}>
            Load three months of sample data
          </button>
          <p className="field-hint">
            Replaces the expense list with generated history so the charts and insight rules have
            something to work with. Only visible in development builds.
          </p>
        </section>
      )}

      <CategorySheet open={editing !== null} category={editing} onClose={() => setEditing(null)} />

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        label="Delete all data"
        title="Delete all data?"
      >
        <div className="sheet-body">
          <p className="field-hint">
            This clears every expense from this device and returns the categories to their defaults. You
            will get one chance to undo it, so export a backup first if you want to keep a copy.
          </p>
        </div>
        <div className="sheet-footer settings-confirm">
          <button type="button" className="btn btn-primary" onClick={wipe}>
            Delete everything
          </button>
          <button type="button" className="btn btn-secondary settings-wide" onClick={() => setConfirmDelete(false)}>
            Keep my data
          </button>
        </div>
      </Sheet>
    </div>
  )
}

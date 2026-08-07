import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Expense } from './types'
import { init, useStore } from './store/store'
import { hasExpenseToday } from './store/selectors'
import { todayISO } from './lib/dates'
import { useThemeEffect } from './ui/useTheme'
import { Announcer } from './ui/LiveRegion'
import { ToastHost } from './ui/Toast'
import { AddExpenseSheet } from './sheet/AddExpenseSheet'
import { Home } from './screens/Home'
import { History } from './screens/History'
import { Insights } from './screens/Insights'
import { Settings } from './screens/Settings'

type TabId = 'home' | 'history' | 'insights' | 'settings'

const TABS: Array<{ id: TabId; label: string; glyph: string }> = [
  { id: 'home', label: 'Today', glyph: '●' },
  { id: 'history', label: 'History', glyph: '☰' },
  { id: 'insights', label: 'Insights', glyph: '▤' },
  { id: 'settings', label: 'Settings', glyph: '⚙' },
]

/** Filter to apply when another screen sends the user to History. */
export interface HistoryPreset {
  categoryIds: string[]
}

interface Nav {
  openAdd: () => void
  openEdit: (expense: Expense) => void
  goToHistory: (preset?: HistoryPreset) => void
  goToInsights: () => void
}

const NavContext = createContext<Nav>({
  openAdd: () => {},
  openEdit: () => {},
  goToHistory: () => {},
  goToInsights: () => {},
})

export function useNav() {
  return useContext(NavContext)
}

function readTabFromHash(): TabId {
  const id = window.location.hash.replace(/^#\/?/, '')
  return TABS.some((t) => t.id === id) ? (id as TabId) : 'home'
}

export default function App() {
  const { ready, settings, expenses } = useStore()
  useThemeEffect(settings.theme)

  const [tab, setTab] = useState<TabId>(readTabFromHash)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [historyPreset, setHistoryPreset] = useState<HistoryPreset | null>(null)

  // init() is already running from main.tsx; this covers a remount.
  useEffect(() => {
    void init()
  }, [])

  // Hash routing keeps the browser and Android back button meaningful.
  useEffect(() => {
    const onHashChange = () => setTab(readTabFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  /**
   * Tabs replace the current history entry rather than stacking one up. They are a
   * flat switcher, not a navigation stack, and pushing would mean the Android back
   * button had to walk through every tab visited before it could leave the app —
   * while an open sheet, which genuinely is a layer on top, still owns its own entry
   * and closes on back.
   */
  const goTab = useCallback((id: TabId) => {
    history.replaceState(history.state, '', `#/${id}`)
    setTab(id)
    window.scrollTo({ top: 0 })
  }, [])

  const openAdd = useCallback(() => {
    setEditing(null)
    setSheetOpen(true)
  }, [])

  const openEdit = useCallback((expense: Expense) => {
    setEditing(expense)
    setSheetOpen(true)
  }, [])

  const closeSheet = useCallback(() => {
    setSheetOpen(false)
    setEditing(null)
  }, [])

  const nav = useMemo<Nav>(
    () => ({
      openAdd,
      openEdit,
      goToHistory: (preset) => {
        setHistoryPreset(preset ?? null)
        goTab('history')
      },
      goToInsights: () => goTab('insights'),
    }),
    [openAdd, openEdit, goTab],
  )

  /**
   * Cold start opens straight into the add sheet when nothing has been logged
   * today — once per day, and never on a first run with no data at all, where
   * the empty Home screen and its one line of copy do a better job.
   *
   * The once-per-day flag lives in localStorage, not sessionStorage: Android
   * routinely kills a backgrounded WebView, so a sessionStorage-scoped guard
   * reset on almost every reopen and made the sheet auto-open far more than
   * once a day.
   */
  const autoOpened = useRef(false)
  useEffect(() => {
    if (!ready || autoOpened.current) return
    autoOpened.current = true
    const today = todayISO()
    if (localStorage.getItem('et.autoOpenedOn') === today) return
    localStorage.setItem('et.autoOpenedOn', today)
    if (expenses.length > 0 && !hasExpenseToday(expenses)) openAdd()
  }, [ready, expenses, openAdd])

  return (
    <Announcer>
      <ToastHost>
        <NavContext.Provider value={nav}>
          <div className="app">
            <main className="screen" id="main">
              {tab === 'home' && <Home />}
              {tab === 'history' && (
                <History preset={historyPreset} onPresetApplied={() => setHistoryPreset(null)} />
              )}
              {tab === 'insights' && <Insights />}
              {tab === 'settings' && <Settings />}
            </main>

            <button
              type="button"
              className={`fab${ready && expenses.length === 0 ? ' pulse' : ''}`}
              onClick={openAdd}
              aria-label="Add expense"
            >
              <span aria-hidden="true">+</span>
            </button>

            <nav className="tabbar" aria-label="Main">
              <div className="tabbar-inner">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="tab"
                    aria-current={tab === t.id ? 'page' : undefined}
                    onClick={() => goTab(t.id)}
                  >
                    <span className="tab-glyph" aria-hidden="true">
                      {t.glyph}
                    </span>
                    {t.label}
                  </button>
                ))}
              </div>
            </nav>
          </div>

          <AddExpenseSheet open={sheetOpen} onClose={closeSheet} editing={editing} />
        </NavContext.Provider>
      </ToastHost>
    </Announcer>
  )
}

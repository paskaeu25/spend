import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

/**
 * One polite live region for the whole app, so saves, undos and deletes are
 * announced to screen readers rather than only being visible.
 */
const AnnounceContext = createContext<(message: string) => void>(() => {})

export function useAnnounce() {
  return useContext(AnnounceContext)
}

export function Announcer({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('')
  const timer = useRef<number | undefined>(undefined)

  const announce = useCallback((next: string) => {
    // Re-announcing identical text needs a change of content to register.
    setMessage('')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMessage(next), 60)
  }, [])

  const value = useMemo(() => announce, [announce])

  return (
    <AnnounceContext.Provider value={value}>
      {children}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {message}
      </div>
    </AnnounceContext.Provider>
  )
}

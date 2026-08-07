import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAnnounce } from './LiveRegion'
import './toast.css'

export interface ToastSpec {
  message: string
  /** Every destructive action ships with one of these. */
  actionLabel?: string
  onAction?: () => void
  durationMs?: number
}

const ToastContext = createContext<(spec: ToastSpec) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

interface ActiveToast extends ToastSpec {
  key: number
}

export function ToastHost({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ActiveToast | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const keyRef = useRef(0)
  const announce = useAnnounce()

  const show = useCallback(
    (spec: ToastSpec) => {
      keyRef.current += 1
      setToast({ ...spec, key: keyRef.current })
      announce(spec.actionLabel ? `${spec.message}. ${spec.actionLabel} available.` : spec.message)
    },
    [announce],
  )

  useEffect(() => {
    window.clearTimeout(timer.current)
    if (!toast) return
    // Undo needs long enough to be a real option, not a reflex test.
    timer.current = window.setTimeout(() => setToast(null), toast.durationMs ?? 5000)
    return () => window.clearTimeout(timer.current)
  }, [toast])

  const value = useMemo(() => show, [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div className="toast-layer">
          <div className="toast" key={toast.key}>
            <span className="toast-message">{toast.message}</span>
            {toast.actionLabel && toast.onAction && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  toast.onAction?.()
                  setToast(null)
                }}
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}

import { useEffect, useRef, useState } from 'react'

/**
 * Measured width, so charts can be drawn at real pixel dimensions. Scaling a fixed
 * viewBox instead would stretch the 2px strokes and the tick labels along with it.
 */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? el.clientWidth
      setWidth(Math.round(next))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return { ref, width }
}

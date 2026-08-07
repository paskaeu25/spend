import { useEffect } from 'react'
import type { ThemePref } from '../types'

const DARK_QUERY = '(prefers-color-scheme: dark)'

export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref === 'light' || pref === 'dark') return pref
  return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light'
}

/**
 * Pins the resolved theme on the root element, so tokens.css can hold one
 * definition per palette instead of a copy for the media query. 'system' keeps
 * following the OS for as long as it stays selected.
 */
export function useThemeEffect(pref: ThemePref) {
  useEffect(() => {
    const apply = () => document.documentElement.setAttribute('data-theme', resolveTheme(pref))
    apply()

    if (pref !== 'system') return
    const media = window.matchMedia?.(DARK_QUERY)
    if (!media) return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [pref])
}

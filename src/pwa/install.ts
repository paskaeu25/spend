/**
 * Captures the install prompt so it can be offered from Settings instead of as a
 * banner. There is no upsell surface in this app.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  deferred = event as BeforeInstallPromptEvent
  for (const l of listeners) l()
})

window.addEventListener('appinstalled', () => {
  deferred = null
  for (const l of listeners) l()
})

export function canInstall(): boolean {
  return deferred !== null
}

export function subscribeInstall(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  await deferred.prompt()
  const choice = await deferred.userChoice
  if (choice.outcome === 'accepted') deferred = null
  for (const l of listeners) l()
  return choice.outcome === 'accepted'
}

/** iOS exposes no install API, so Safari gets a one-line instruction instead. */
export function isIOSSafari(): boolean {
  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return iOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  )
}

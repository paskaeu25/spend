/** A light tick on save. Silently absent on iOS, which exposes no vibration API. */
export function lightHaptic(): void {
  try {
    navigator.vibrate?.(10)
  } catch {
    // Never let feedback break the write it accompanies.
  }
}

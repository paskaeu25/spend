import { downloadFile } from './backup'

/**
 * Handing the user a file is the one place the web build and the Android shell
 * genuinely differ.
 *
 * In a browser, clicking a synthetic `<a download>` at a blob: URL is the whole
 * story. Inside the Capacitor WebView it is a silent no-op — there is no
 * download manager behind that WebView, and a blob: URL has nowhere to land, so
 * `a.click()` returns without a trace. That is why Export CSV / Export JSON
 * backup looked dead on Android while working on the web.
 *
 * On native the file is written to the app's cache directory and handed to the
 * system share sheet, which is the Android idiom for "give me this file": from
 * there it goes to Files, Drive, email, or anywhere else. Cache rather than
 * Documents deliberately — no storage permission is involved, and the share
 * sheet is what actually decides where the copy ends up.
 */

interface CapacitorBridge {
  isNativePlatform?: () => boolean
}

/** True only inside the Capacitor shell, whose native bridge injects this global. */
export function isNativeShell(): boolean {
  const cap = (globalThis as { Capacitor?: CapacitorBridge }).Capacitor
  return typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform()
}

export type SaveOutcome = 'downloaded' | 'shared' | 'cancelled'

export async function saveFile(
  filename: string,
  contents: string,
  mime: string,
): Promise<SaveOutcome> {
  if (!isNativeShell()) {
    downloadFile(filename, contents, mime)
    return 'downloaded'
  }

  // Imported lazily so the web bundle never pulls the native plugins in.
  const [{ Directory, Encoding, Filesystem }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ])

  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: contents,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  })

  try {
    await Share.share({ title: filename, files: [uri] })
  } catch (err) {
    // Dismissing the share sheet rejects. That is a choice, not a failure.
    if (isShareCancelled(err)) return 'cancelled'
    throw err
  }
  return 'shared'
}

function isShareCancelled(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /cancel/i.test(message)
}

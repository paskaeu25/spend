import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The native shell bundles the web assets rather than loading the deployed URL, so
 * the app works with no network from its very first launch — which is the app's
 * first principle, not a nicety. Nothing here points at a server.
 */
const config: CapacitorConfig = {
  appId: 'io.github.pavelasb32.spend',
  appName: 'Spend',
  webDir: 'dist',
  android: {
    // Matches the light page plane, so the window behind the WebView does not
    // flash white before the first paint.
    backgroundColor: '#f9f9f7',
  },
}

export default config

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * The native build ships no service worker. Inside a WebView every asset is
 * already local, so precaching buys nothing — and it actively hurts: after an app
 * update the old cache would go on serving the previous build.
 */
const isNative = process.env.VITE_NATIVE === '1'

const pwa = VitePWA({
  // No network calls at runtime, so a new build should simply take over.
  registerType: 'autoUpdate',
  injectRegister: 'auto',
  includeAssets: ['icons/*.png', 'icons/icon.svg'],
  manifest: {
    name: 'Spend — expense tracker',
    short_name: 'Spend',
    description: 'Log what you spend in a few taps. Offline, on your device, no account.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f9f9f7',
    theme_color: '#f9f9f7',
    categories: ['finance', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    // Precache the whole shell: first load after install must work offline.
    globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
    navigateFallback: '/index.html',
    cleanupOutdatedCaches: true,
    clientsClaim: true,
  },
})

export default defineConfig({
  plugins: isNative ? [react()] : [react(), pwa],
  server: { port: 5173 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    restoreMocks: true,
  },
})

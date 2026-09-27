import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // navigations to the API (typed URLs, the OAuth callback redirect) must
        // hit the backend, not the cached SPA shell
        navigateFallbackDenylist: [/^\/api\//],
      },
      manifest: {
        name: 'Personal Finance',
        short_name: 'Finance',
        description: 'Personal finance tracking',
        start_url: '/',
        display: 'standalone',
        theme_color: '#171717',
        background_color: '#ffffff',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    // cookie survives: browser sees same-origin /api, proxy forwards to FastAPI
    proxy: { '/api': 'http://localhost:8000' },
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// En GitHub Pages la app vive bajo /<repo>/; en dev y otros hosts, en la raíz.
const base = process.env.GITHUB_PAGES ? '/Transporte-Publico/' : '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'RutaSegura · Checador Digital',
        short_name: 'RutaSegura',
        description: 'Control de intervalos, monitoreo GPS y respuesta a emergencias para transporte público',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        // Cache app shell; tiles y API se piden en red (network-first) para no mostrar posiciones viejas
        runtimeCaching: [
          { urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\//, handler: 'CacheFirst', options: { cacheName: 'osm-tiles', expiration: { maxEntries: 500, maxAgeSeconds: 7 * 24 * 3600 } } },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // fs.strict off: en entornos con rutas virtualizadas (MSIX/AppData redirigido) el realpath no coincide con fs.allow
  server: { port: 5173, host: true, fs: { strict: false } },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.svg'],
      manifest: {
        name: process.env.VITE_APP_NAME || 'TeamHub',
        short_name: process.env.VITE_APP_NAME || 'TeamHub',
        description: 'Team chat for small businesses',
        theme_color: process.env.VITE_BRAND_COLOR || '#4f46e5',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [{ src: 'logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
    }),
  ],
})

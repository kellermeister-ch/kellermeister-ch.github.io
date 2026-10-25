import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Set base path for GitHub Pages deployment
  // Use '/' for local development, '/repo-name/' for GitHub Pages
  base: process.env.VITE_BASE_PATH || '/',
  build: {
    outDir: './docs'
  },
  plugins: [
    // https://vite-pwa-org.netlify.app/guide/
    VitePWA({
      // A new version waits until the user accepts it in the update banner;
      // registered from main.ts via virtual:pwa-register instead of the
      // injected registerSW.js script, which can neither prompt nor reload.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'Kellermeister',
        short_name: 'Kellermeister',
        description: 'Kellermeister verwaltet deinen Weinkeller',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.+\/.well-known\/solid/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'Kellermeister',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
            },
          },
        ],
      },
    }),
  ]
});

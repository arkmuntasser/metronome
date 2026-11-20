import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the site from /<repo-name>/. Override with BASE_PATH if needed.
const base = process.env.BASE_PATH ?? (process.env.GITHUB_ACTIONS ? '/metronome/' : '/');

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Maestro Frog',
        short_name: 'Maestro Frog',
        description: 'A metronome with a frog conductor who cues you in.',
        theme_color: '#3b2a1a',
        background_color: '#f3e6cc',
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
});

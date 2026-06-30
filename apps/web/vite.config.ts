import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dashboard talks to the Lumixa API (default :8080). In dev we proxy `/api`
// → the backend so the browser sees one origin (no preflight); the API client
// also accepts an absolute `VITE_API_BASE` for deployed builds. CORS is enabled
// server-side too, so a direct cross-origin base works as a fallback.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
});

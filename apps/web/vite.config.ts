import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies REST + WebSocket traffic to the API so the browser only
// ever talks to a single origin (no CORS, cookies flow through).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      // Socket.IO is mounted at path `/ws` on the API (see socket-server.ts).
      '/ws': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});

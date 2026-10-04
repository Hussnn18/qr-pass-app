import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the React app runs on :5173 and forwards /api to Spring Boot on :8080,
// so the refresh-token cookie stays same-origin.
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: { chunkSizeWarningLimit: 2000 },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: process.env.API_URL || 'http://localhost:8080', changeOrigin: false },
    },
  },
});

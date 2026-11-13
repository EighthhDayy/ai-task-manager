import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// All /api calls are proxied to FastAPI during development.
// In production, put a reverse proxy in front of /api or set VITE_API_BASE_URL.
export default defineConfig({
  // The Pages workflow enables the browser-only demo; normal builds keep API support.
  base: process.env.VITE_DEMO_ONLY === 'true' ? '/ai-task-manager/' : '/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.FASTAPI_PROXY_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})

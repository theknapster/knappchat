import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
      // magic-link emails point here directly (not under /api) since the
      // user opens this as a plain browser navigation, not a fetch() call
      '/auth/callback': {
        target: 'http://localhost:8080',
      },
    },
  },
})

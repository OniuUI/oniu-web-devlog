import path from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Keep warnings meaningful now that we intentionally code-split heavy deps (Three.js).
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          // Heavy deps
          if (id.includes('/three/')) return 'three'

          // Routing
          if (id.includes('react-router')) return 'router'

          // React ecosystem
          if (id.includes('/react/') || id.includes('/react-dom/')) return 'react'

          // Everything else
          return 'vendor'
        },
      },
    },
  },
})

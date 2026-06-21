import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 3500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/molstar")) return "molstar";
          if (id.includes("node_modules/react") || id.includes("node_modules/scheduler")) return "react-vendor";
          if (id.includes("node_modules")) return "vendor";
        },
      },
    },
  },
})

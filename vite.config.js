import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/tritonize/',
  build: {
    outDir: 'build'
  },
  server: {
    port: 3000,
    open: true
  },
  define: {
    global: 'globalThis'
  }
})
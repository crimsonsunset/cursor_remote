import { defineConfig } from 'vite'

export default defineConfig({
  root: 'client',
  server: {
    port: 3000,
    open: true,
    host: true
  },
  build: {
    outDir: '../public',
    emptyOutDir: true,
    rollupOptions: {
      input: 'client/index.html'
    }
  },
  // Vite automatically handles VITE_ prefixed environment variables
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      // The register definitions are shared with the server function in /api,
      // so they sit outside this package. The records that go with them are
      // not aliased: they must never reach the browser bundle.
      '@workbook': path.resolve(import.meta.dirname, '../../api/_workbook'),
    },
  },
  server: { port: 5173, host: true },
  preview: { port: 4173 },
})

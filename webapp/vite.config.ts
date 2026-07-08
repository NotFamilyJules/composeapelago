import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Honor an externally assigned port (e.g. from tooling); default 5173.
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
})

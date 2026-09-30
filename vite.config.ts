import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/ai-motion-coach/',
  plugins: [react()],
  // Only scan the coach entry; local companion repositories are not web app entries.
  optimizeDeps: { entries: ['index.html'] },
})

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Tauri watches Rust itself. Watching its Windows build tree can lock binaries
  // and delay renderer modules during native builds and browser acceptance.
  server: { watch: { ignored: ['**/src-tauri/**'] } },
})

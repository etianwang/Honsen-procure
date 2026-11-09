import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'

// PM2 passes this file no arguments. Resolve .env before importing the API.
const root = fileURLToPath(new URL('.', import.meta.url))
try {
  process.chdir(root)
  loadEnvFile(fileURLToPath(new URL('.env', import.meta.url)))
  await import(new URL('./apps/server/dist/index.js', import.meta.url))
  console.info('Honsen Procure API listening on 127.0.0.1:3000')
} catch (error) {
  console.error('STARTUP_FAILED:', error.code || error.name)
  process.exit(1)
}

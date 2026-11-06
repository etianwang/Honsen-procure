// Baota's file-entry mode must load the same .env as the terminal startup.
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const root = path.resolve(__dirname, '../..')
process.chdir(root)
try {
  process.loadEnvFile(path.join(root, '.env'))
} catch (error) {
  console.error('STARTUP_FAILED: .env', error.code || error.name)
  process.exit(1)
}
import(pathToFileURL(path.join(root, 'apps/server/dist/index.js')).href)
  .then(() => console.info('Honsen Procure API listening on 127.0.0.1:3000'))
  .catch((error) => {
    console.error('STARTUP_FAILED:', error.code || error.name)
    process.exit(1)
  })

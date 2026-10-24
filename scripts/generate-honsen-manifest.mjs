import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const [outputDirectory] = process.argv.slice(2)
const version = process.env.HONSEN_RELEASE_VERSION
const updateManifestUrl = process.env.HONSEN_UPDATE_MANIFEST_URL

if (!outputDirectory || !/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version ?? '')) {
  throw new Error(
    'HONSEN_RELEASE_VERSION must be a release version (major.minor.patch[.build])',
  )
}

let updateUrl
try {
  updateUrl = new URL(updateManifestUrl)
} catch {
  throw new Error('HONSEN_UPDATE_MANIFEST_URL must be a trusted HTTPS URL')
}
if (
  updateUrl.protocol !== 'https:' ||
  updateUrl.username ||
  updateUrl.password
) {
  throw new Error('HONSEN_UPDATE_MANIFEST_URL must be a trusted HTTPS URL')
}

mkdirSync(outputDirectory, { recursive: true })
writeFileSync(
  resolve(outputDirectory, 'honsen.app.json'),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      appId: 'honsen.procure',
      displayName: 'Honsen Procure',
      version,
      executable: 'HonsenProcure.exe',
      updateRunner: 'HonsenUpdateRunner.exe',
      publisher: 'Honsen',
      updateManifestUrl: updateUrl.href,
    },
    null,
    2,
  )}\n`,
  'utf8',
)

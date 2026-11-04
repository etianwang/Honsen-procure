import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  canonicalUpdateUrl,
  requireCanonicalUpdateUrl,
} from './github-stable-release.mjs'

const [outputDirectory] = process.argv.slice(2)
const version = process.env.HONSEN_RELEASE_VERSION
const updateManifestUrl =
  process.env.HONSEN_UPDATE_MANIFEST_URL ?? canonicalUpdateUrl

if (!outputDirectory || !/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version ?? '')) {
  throw new Error(
    'HONSEN_RELEASE_VERSION must be a release version (major.minor.patch[.build])',
  )
}

requireCanonicalUpdateUrl(updateManifestUrl)

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
      updateManifestUrl,
    },
    null,
    2,
  )}\n`,
  'utf8',
)

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const script = fileURLToPath(
  new URL('../../scripts/generate-honsen-manifest.mjs', import.meta.url),
)

test('generates the fixed Toolbox manifest only for an HTTPS update source', () => {
  const outputDirectory = mkdtempSync(join(tmpdir(), 'honsen-manifest-'))
  execFileSync(process.execPath, [script, outputDirectory], {
    env: {
      ...process.env,
      HONSEN_UPDATE_MANIFEST_URL:
        'https://updates.example.test/honsen-procure/latest.json',
      HONSEN_RELEASE_VERSION: '1.2.3',
    },
  })

  assert.deepEqual(
    JSON.parse(readFileSync(join(outputDirectory, 'honsen.app.json'))),
    {
      schemaVersion: 1,
      appId: 'honsen.procure',
      displayName: 'Honsen Procure',
      version: '1.2.3',
      executable: 'HonsenProcure.exe',
      updateRunner: 'HonsenUpdateRunner.exe',
      publisher: 'Honsen',
      updateManifestUrl:
        'https://updates.example.test/honsen-procure/latest.json',
    },
  )
})

test('refuses a missing or non-HTTPS update source', () => {
  const outputDirectory = mkdtempSync(join(tmpdir(), 'honsen-manifest-'))
  for (const updateManifestUrl of [
    '',
    'http://updates.example.test/latest.json',
  ]) {
    assert.throws(
      () =>
        execFileSync(process.execPath, [script, outputDirectory], {
          env: {
            ...process.env,
            HONSEN_UPDATE_MANIFEST_URL: updateManifestUrl,
            HONSEN_RELEASE_VERSION: '1.2.3',
          },
          stdio: 'pipe',
        }),
      /trusted HTTPS URL/,
    )
  }
})

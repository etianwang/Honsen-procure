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

test('generates the fixed Toolbox manifest with canonical stable Release API', () => {
  const outputDirectory = mkdtempSync(join(tmpdir(), 'honsen-manifest-'))
  execFileSync(process.execPath, [script, outputDirectory], {
    env: {
      ...process.env,
      HONSEN_UPDATE_MANIFEST_URL:
        'https://api.github.com/repos/etianwang/Honsen-procure/releases/latest',
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
        'https://api.github.com/repos/etianwang/Honsen-procure/releases/latest',
    },
  )
})

test('refuses empty, insecure, foreign and historical custom update sources', () => {
  const outputDirectory = mkdtempSync(join(tmpdir(), 'honsen-manifest-'))
  for (const updateManifestUrl of [
    '',
    'http://updates.example.test/latest.json',
    'https://updates.example.test/latest.json',
    'https://github.com/etianwang/Honsen-procure/releases/latest/download/manifest.json',
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
      /canonical GitHub stable Release API/,
    )
  }
})

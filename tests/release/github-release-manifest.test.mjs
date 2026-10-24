import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(
  new URL(
    '../../scripts/generate-github-release-manifest.mjs',
    import.meta.url,
  ),
)

test('pins a release installer URL, version, and SHA-256 to the approved GitHub repository', () => {
  const directory = mkdtempSync(join(tmpdir(), 'honsen-release-manifest-'))
  const installer = join(directory, 'Honsen-Procure-1.2.3-Setup.exe')
  writeFileSync(installer, 'installer bytes')
  execFileSync(process.execPath, [script, installer, directory], {
    env: { ...process.env, HONSEN_RELEASE_VERSION: '1.2.3' },
  })

  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json')))
  assert.equal(manifest.appId, 'honsen.procure')
  assert.equal(manifest.version, '1.2.3')
  assert.equal(
    manifest.installerUrl,
    'https://github.com/etianwang/Honsen-procure/releases/download/v1.2.3/Honsen-Procure-1.2.3-Setup.exe',
  )
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/)
})

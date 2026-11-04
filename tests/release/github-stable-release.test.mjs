import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

test('installer registration and manifest generator share canonical source', () => {
  const hook = readFileSync(
    new URL(
      '../../apps/desktop/src-tauri/packaging/windows/toolbox-hooks.nsh',
      import.meta.url,
    ),
    'utf8',
  )
  assert.ok(
    hook.includes(`!define HONSEN_UPDATE_MANIFEST_URL "${canonicalUpdateUrl}"`),
  )
  assert.ok(
    hook.includes('"UpdateManifestUrl" "${HONSEN_UPDATE_MANIFEST_URL}"'),
  )
  assert.ok(hook.includes('"UpdateUrl" "${HONSEN_UPDATE_MANIFEST_URL}"'))
})
import {
  canonicalUpdateUrl,
  fetchStableRelease,
  parseStableRelease,
} from '../../scripts/github-stable-release.mjs'

const fixture = () => ({
  draft: false,
  prerelease: false,
  tag_name: 'v1.2.3',
  assets: [
    {
      name: 'Honsen-Procure-1.2.3-Setup.exe',
      browser_download_url:
        'https://github.com/etianwang/Honsen-procure/releases/download/v1.2.3/Honsen-Procure-1.2.3-Setup.exe',
      digest: `sha256:${'a'.repeat(64)}`,
    },
  ],
})
test('consumes canonical GitHub stable schema and digest without downloading installer', async () => {
  let calls = 0
  const result = await fetchStableRelease(
    canonicalUpdateUrl,
    async (url, options) => {
      calls++
      assert.equal(url, canonicalUpdateUrl)
      assert.equal(options.redirect, 'error')
      return { ok: true, json: async () => fixture() }
    },
  )
  assert.equal(calls, 1)
  assert.equal(result.version, '1.2.3')
  assert.equal(result.sha256, 'a'.repeat(64))
})
test('auxiliary EXEs do not count as setup assets', () => {
  const release = fixture()
  release.assets.push(
    { name: 'HonsenUpdateRunner.exe' },
    { name: 'diagnostic.exe' },
  )
  assert.equal(parseStableRelease(release).version, '1.2.3')
})

test('rejects malformed, nonstable, missing digest, foreign URL and ambiguous assets', () => {
  const bad = [
    null,
    {},
    { ...fixture(), draft: true },
    { ...fixture(), prerelease: true },
    { ...fixture(), tag_name: 'nightly' },
  ]
  for (const digest of [
    undefined,
    '',
    'sha1:abc',
    `sha256:${'a'.repeat(63)}`,
  ]) {
    const r = fixture()
    r.assets[0].digest = digest
    bad.push(r)
  }
  const foreign = fixture()
  foreign.assets[0].browser_download_url = 'https://evil.example/setup.exe'
  bad.push(foreign)
  const ambiguous = fixture()
  ambiguous.assets.push({ ...ambiguous.assets[0] })
  bad.push(ambiguous)
  const wrongVersion = fixture()
  wrongVersion.assets[0].name = 'Honsen-Procure-1.2.2-Setup.exe'
  bad.push(wrongVersion)
  const anotherSetup = fixture()
  anotherSetup.assets.push({ name: 'Other-Setup.exe' })
  bad.push(anotherSetup)
  for (const release of bad) assert.throws(() => parseStableRelease(release))
})
test('network, HTTP and JSON failures fail closed; noncanonical source never requested', async () => {
  for (const fetcher of [
    async () => {
      throw new Error('offline')
    },
    async () => ({ ok: false, status: 404 }),
    async () => ({
      ok: true,
      json: async () => {
        throw new Error('malformed JSON')
      },
    }),
  ])
    await assert.rejects(fetchStableRelease(canonicalUpdateUrl, fetcher))
  await assert.rejects(
    fetchStableRelease('https://evil.example', async () => {
      assert.fail('must not request')
    }),
  )
})

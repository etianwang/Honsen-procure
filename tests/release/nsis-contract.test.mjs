import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
const read = (path) =>
  readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
test('NSIS Runner uses silent flags and the final unquoted Unicode target', () => {
  const source = read('apps/desktop/src-tauri/src/update_runner.rs')
  assert.ok(source.includes('/S /D={}'))
  assert.ok(!source.includes('/VERYSILENT'))
})
test('installer and build use the same Toolbox GitHub release API', () => {
  for (const path of [
    'scripts/build-windows-release.mjs',
    'apps/desktop/src-tauri/packaging/windows/toolbox-hooks.nsh',
  ]) {
    const source = read(path)
    assert.ok(
      source.includes(
        'https://api.github.com/repos/etianwang/Honsen-procure/releases/latest',
      ),
      path,
    )
    assert.ok(!source.includes('/releases/latest/download/manifest.json'), path)
  }
})

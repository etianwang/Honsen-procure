import assert from 'node:assert/strict'
import test from 'node:test'
import { selectNsisInstaller } from '../../scripts/select-nsis-installer.mjs'

test('selects current generated version despite stale build and renamed output', () => {
  assert.equal(
    selectNsisInstaller(
      [
        'Honsen Procure_0.0.0_x64-setup.exe',
        'Honsen-Procure-0.1.2-Setup.exe',
        'Honsen Procure_0.1.2_x64-setup.exe',
      ],
      'Honsen Procure',
      '0.1.2',
    ),
    'Honsen Procure_0.1.2_x64-setup.exe',
  )
})
test('fails closed for missing or ambiguous current candidate', () => {
  for (const files of [
    ['Honsen Procure_0.0.0_x64-setup.exe', 'Honsen-Procure-0.1.2-Setup.exe'],
    [
      'Honsen Procure_0.1.2_x64-setup.exe',
      'Honsen Procure_0.1.2_arm64-setup.exe',
    ],
    ['Other_0.1.2_x64-setup.exe'],
  ])
    assert.throws(() => selectNsisInstaller(files, 'Honsen Procure', '0.1.2'))
})

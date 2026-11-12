import assert from 'node:assert/strict'
import test from 'node:test'
import { assertEmployeeExecutables } from '../../scripts/macos-bundle.mjs'

test('employee macOS bundle excludes bootstrap, seed, fixture and updater tools', () => {
  assert.doesNotThrow(() => assertEmployeeExecutables(['HonsenProcure']))
  for (const extra of [
    'HonsenUpdateRunner',
    'honsen-procure-bootstrap-admin',
    'honsen-procure-seed',
    'honsen-procure-test-profile',
    'unknown-helper',
  ]) {
    assert.throws(() => assertEmployeeExecutables(['HonsenProcure', extra]))
  }
  assert.throws(() => assertEmployeeExecutables([]))
  assert.throws(() => assertEmployeeExecutables(['wrong-main']))
})

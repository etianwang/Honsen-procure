import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifyDeclaredSource } from './offline-provenance.mjs'

test('requires the declared application SHA to match the actual harness HEAD', () => {
  const source = 'd'.repeat(40)
  assert.equal(verifyDeclaredSource(source, source), source)
  assert.throws(
    () => verifyDeclaredSource(source, 'e'.repeat(40)),
    /Current HEAD/,
  )
  assert.throws(
    () => verifyDeclaredSource(undefined, source),
    /full source SHA/,
  )
  assert.throws(
    () => verifyDeclaredSource('db2ad11', source),
    /full source SHA/,
  )
})

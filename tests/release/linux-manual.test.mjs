import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) =>
  readFileSync(new URL(`../../deploy/linux/${path}`, import.meta.url), 'utf8')

test('production template keeps optional COS disabled until explicitly configured', () => {
  const environment = read('.env.production.example')
  assert.doesNotMatch(environment, /^COS_[A-Z_]+=/m)
  for (const variable of [
    'COS_REGION',
    'COS_BUCKET',
    'COS_SECRET_ID',
    'COS_SECRET_KEY',
  ]) {
    assert.match(environment, new RegExp(`^# ${variable}=`, 'm'))
  }
})

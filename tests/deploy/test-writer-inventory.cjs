'use strict'

const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')

const dir = fs.mkdtempSync(path.join(process.env.TMPDIR, 'writer-inventory-'))
const file = path.join(dir, 'inventory.json')
const checker = path.resolve('deploy/linux/verify-writer-inventory.cjs')
const inventory = {
  schema: 1,
  host: 'test.invalid',
  apiManager: 'systemd:honsen-procure.service',
  ingress: 'bt-nginx-only',
  oldRole: 'old_app',
  newRole: 'new_app',
  administrationFrozen: true,
  otherWritersReviewed: true,
  otherWriters: [],
}
function check() {
  fs.writeFileSync(file, JSON.stringify(inventory), { mode: 0o600 })
  return spawnSync(process.execPath, [
    checker,
    file,
    'old_app',
    'new_app',
    'test.invalid',
  ])
}
try {
  assert.equal(check().status, 0)
  inventory.otherWriters.push('remote-worker')
  assert.notEqual(check().status, 0)
  inventory.otherWriters = []
  inventory.otherWritersReviewed = false
  assert.notEqual(check().status, 0)
  inventory.otherWritersReviewed = true
  inventory.administrationFrozen = false
  assert.notEqual(check().status, 0)
  console.log('writer inventory attestation checks passed')
} finally {
  fs.rmSync(dir, { recursive: true, force: true })
}

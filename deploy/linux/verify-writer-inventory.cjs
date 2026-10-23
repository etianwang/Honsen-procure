'use strict'

// This is an operator attestation, not automatic fleet discovery. The SQL
// fencing step separately rejects other database login roles and sessions.
const fs = require('node:fs')
const path = require('node:path')

try {
  const [file, oldRole, newRole, host] = process.argv.slice(2)
  if (
    process.argv.length !== 6 ||
    !path.isAbsolute(file) ||
    fs.realpathSync(file) !== file
  ) {
    throw new Error('absolute writer inventory path required')
  }
  const st = fs.statSync(file)
  if (!st.isFile() || st.uid !== 0 || (st.mode & 0o777) !== 0o600)
    throw new Error('inventory must be root-owned mode 600')
  for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
    const parent = fs.statSync(dir)
    if (parent.uid !== 0 || parent.mode & 0o022)
      throw new Error('unprotected inventory parent')
    if (dir === '/') break
  }
  const inventory = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (
    inventory.schema !== 1 ||
    inventory.host !== host ||
    inventory.apiManager !== 'systemd:honsen-procure.service' ||
    inventory.ingress !== 'bt-nginx-only' ||
    inventory.oldRole !== oldRole ||
    inventory.newRole !== newRole ||
    inventory.administrationFrozen !== true ||
    inventory.otherWritersReviewed !== true ||
    !Array.isArray(inventory.otherWriters) ||
    inventory.otherWriters.length !== 0
  )
    throw new Error(
      'writer inventory is incomplete or contains additional writers',
    )
} catch (error) {
  console.error('writer inventory verification failed: ' + error.message)
  process.exitCode = 1
}

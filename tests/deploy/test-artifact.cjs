'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')
const { inventory, verify } = require('../../deploy/linux/verify-artifact.cjs')

const temp = fs.mkdtempSync(path.join(process.env.TMPDIR, 'artifact-test-'))
const root = path.join(temp, 'release')
const manifest = path.join(temp, 'manifest.json')
const sha = 'a'.repeat(40)
try {
  fs.mkdirSync(root, { mode: 0o700 })
  fs.mkdirSync(path.join(root, 'dist'), { mode: 0o700 })
  fs.writeFileSync(path.join(root, 'dist', 'index.js'), 'original', {
    mode: 0o600,
  })
  fs.symlinkSync('dist/index.js', path.join(root, 'entry'))
  const data = JSON.stringify({
    commit: sha,
    entries: inventory(root, process.getuid()),
  })
  fs.writeFileSync(manifest, data, { mode: 0o600 })
  const digest = crypto.createHash('sha256').update(data).digest('hex')
  const check = () => verify(root, sha, manifest, digest, process.getuid())
  check()
  assert.throws(
    () => verify(root, 'b'.repeat(40), manifest, digest, process.getuid()),
    /commit/,
  )
  assert.throws(
    () => verify(root, sha, manifest, '0'.repeat(64), process.getuid()),
    /digest/,
  )
  fs.writeFileSync(path.join(root, 'dist', 'index.js'), 'modified')
  assert.throws(check, /entry mismatch/)
  fs.writeFileSync(path.join(root, 'dist', 'index.js'), 'original')
  fs.writeFileSync(path.join(root, 'extra'), 'unexpected')
  assert.throws(check, /entry list/)
  fs.unlinkSync(path.join(root, 'extra'))
  fs.unlinkSync(path.join(root, 'entry'))
  fs.symlinkSync('/etc/passwd', path.join(root, 'entry'))
  assert.throws(check, /external release symlink/)
  fs.unlinkSync(path.join(root, 'entry'))
  fs.symlinkSync('dist/index.js', path.join(root, 'entry'))
  fs.chmodSync(path.join(root, 'dist'), 0o777)
  assert.throws(check, /unprotected/)
  console.log('artifact identity and tampering checks passed')
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
}

'use strict'

// The manifest digest must be obtained independently from the release bundle.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

function hash(data) {
  return crypto.createHash('sha256').update(data).digest('hex')
}

function protectedParents(file, owner) {
  if (!path.isAbsolute(file) || fs.realpathSync(file) !== path.resolve(file)) {
    throw new Error('protected path must be absolute and contain no symlinks')
  }
  let dir = path.dirname(file)
  for (;;) {
    const stat = fs.statSync(dir)
    if (stat.uid !== owner || stat.mode & 0o022)
      throw new Error('unprotected parent: ' + dir)
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
}

function inventory(root, owner) {
  protectedParents(root, owner)
  const base = fs.realpathSync(root)
  if (base !== path.resolve(root))
    throw new Error('release root must not contain symlinks')
  const actual = Object.create(null)
  function walk(dir, relative) {
    const stat = fs.lstatSync(dir)
    if (stat.uid !== owner || (!stat.isSymbolicLink() && stat.mode & 0o022)) {
      throw new Error('unprotected release entry: ' + relative)
    }
    if (stat.isSymbolicLink()) {
      const target = fs.readlinkSync(dir)
      const resolved = fs.realpathSync(dir)
      if (!resolved.startsWith(base + path.sep))
        throw new Error('external release symlink: ' + relative)
      actual[relative] = 'link:' + target
    } else if (stat.isDirectory()) {
      if (relative) actual[relative] = 'directory'
      for (const name of fs.readdirSync(dir).sort()) {
        if (!relative && name === '.git') continue
        walk(path.join(dir, name), relative ? relative + '/' + name : name)
      }
    } else if (stat.isFile()) {
      actual[relative] = 'sha256:' + hash(fs.readFileSync(dir))
    } else {
      throw new Error('unsupported release entry: ' + relative)
    }
  }
  walk(base, '')
  return actual
}

function verify(root, commit, manifestPath, expectedDigest, owner = 0) {
  if (
    !/^[a-f0-9]{40}$/.test(commit) ||
    !/^[a-f0-9]{64}$/.test(expectedDigest)
  ) {
    throw new Error('invalid commit or manifest digest')
  }
  const manifestStat = fs.lstatSync(manifestPath)
  protectedParents(manifestPath, owner)
  if (
    !manifestStat.isFile() ||
    manifestStat.uid !== owner ||
    manifestStat.mode & 0o022
  ) {
    throw new Error('manifest must be a protected regular file')
  }
  const contents = fs.readFileSync(manifestPath)
  if (hash(contents) !== expectedDigest)
    throw new Error('manifest digest mismatch')
  const manifest = JSON.parse(contents)
  if (
    manifest.commit !== commit ||
    !manifest.entries ||
    Array.isArray(manifest.entries)
  ) {
    throw new Error('manifest commit or entries invalid')
  }
  const actual = inventory(root, owner)
  const expectedKeys = Object.keys(manifest.entries).sort()
  const actualKeys = Object.keys(actual).sort()
  if (JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys))
    throw new Error('release entry list mismatch')
  for (const key of actualKeys) {
    if (manifest.entries[key] !== actual[key])
      throw new Error('release entry mismatch: ' + key)
  }
}

if (require.main === module) {
  try {
    if (process.argv.length !== 6)
      throw new Error('usage: verify-artifact ROOT COMMIT MANIFEST DIGEST')
    verify(...process.argv.slice(2))
  } catch (error) {
    console.error('artifact verification failed: ' + error.message)
    process.exitCode = 1
  }
}
module.exports = { verify, inventory }

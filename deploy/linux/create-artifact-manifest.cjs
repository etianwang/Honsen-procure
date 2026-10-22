'use strict'

// Run on the protected, completed build. Publish the resulting digest separately.
const fs = require('node:fs')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { inventory } = require('./verify-artifact.cjs')

try {
  if (process.argv.length !== 4)
    throw new Error('usage: create-artifact-manifest RELEASE_DIR OUTPUT')
  const [root, output] = process.argv.slice(2)
  const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim()
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('invalid Git commit')
  if (
    execFileSync(
      'git',
      ['-C', root, 'status', '--porcelain', '--untracked-files=no'],
      { encoding: 'utf8' },
    )
  ) {
    throw new Error('tracked source is dirty')
  }
  const entries = inventory(root, process.getuid())
  const data = JSON.stringify({ commit, entries }) + '\n'
  fs.writeFileSync(output, data, { flag: 'wx', mode: 0o600 })
  console.log(crypto.createHash('sha256').update(data).digest('hex'))
} catch (error) {
  console.error('cannot create manifest: ' + error.message)
  process.exitCode = 1
}

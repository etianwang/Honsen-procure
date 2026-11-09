import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export function verifyDeclaredSource(declared, head) {
  assert.match(
    declared ?? '',
    /^[0-9a-f]{40}$/u,
    'A full source SHA is required',
  )
  assert.equal(
    head,
    declared,
    'Current HEAD must equal the declared application source',
  )
  return declared
}

export function fileSha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function frontendTree(root) {
  const files = []
  function visit(directory, prefix = '') {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      assert.ok(
        !entry.isSymbolicLink(),
        'Frontend snapshot must not contain symlinks',
      )
      const name = prefix + entry.name
      if (entry.isDirectory()) visit(join(directory, entry.name), name + '/')
      else if (entry.isFile())
        files.push({ name, sha256: fileSha256(join(directory, entry.name)) })
      else throw new Error('Unexpected frontend snapshot entry')
    }
  }
  visit(root)
  files.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return {
    files,
    sha256: createHash('sha256').update(JSON.stringify(files)).digest('hex'),
  }
}

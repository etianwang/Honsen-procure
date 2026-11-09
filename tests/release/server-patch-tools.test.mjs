import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const python = 'python3'
const guard = fileURLToPath(
  new URL('../../deploy/baota/archive-guard.py', import.meta.url),
)
const exchange = fileURLToPath(
  new URL('../../deploy/baota/exchange-dirs.py', import.meta.url),
)
const linux = {
  skip:
    process.platform === 'linux'
      ? false
      : 'Linux Python3/unzip/renameat2 proof runs on Ubuntu, not this Windows host',
}
const REG = 0o100644,
  DIR = 0o040755,
  LINK = 0o120777
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'honsen-patch-tools-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(join(root, 'sentinel'), 'unrelated data')
  return root
}
function zip(root, entries) {
  const path = join(root, 'candidate.zip')
  const script = `import json,sys,zipfile\nwith zipfile.ZipFile(sys.argv[1],'w') as z:\n for e in json.load(sys.stdin):\n  i=zipfile.ZipInfo(e['name']); i.create_system=3; i.external_attr=e.get('mode',33188)<<16; z.writestr(i,e.get('body',''))\n`
  const result = spawnSync(python, ['-c', script, path], {
    input: JSON.stringify(entries),
    encoding: 'utf8',
    timeout: 10000,
  })
  assert.equal(result.status, 0, result.stderr || String(result.error))
  return path
}
function run(script, args) {
  return spawnSync(python, [script, ...args], {
    encoding: 'utf8',
    timeout: 10000,
  })
}
function unchanged(root) {
  assert.equal(readFileSync(join(root, 'sentinel'), 'utf8'), 'unrelated data')
}

test(
  'archive guard validates and extracts a safe archive without touching sibling data',
  linux,
  (t) => {
    const root = fixture(t),
      source = zip(root, [
        { name: 'app/', mode: DIR },
        { name: 'app/index.js', body: 'synthetic candidate', mode: REG },
      ]),
      destination = join(root, 'extract')
    const result = run(guard, [source, destination])
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /ARCHIVE_VERIFIED/)
    assert.equal(
      readFileSync(join(destination, 'app/index.js'), 'utf8'),
      'synthetic candidate',
    )
    unchanged(root)
  },
)

test(
  'archive guard rejects traversal, duplicate aliases, secrets and symlink parents before extraction',
  linux,
  (t) => {
    const cases = [
      [{ name: '../sentinel', body: 'overwrite' }],
      [{ name: '/absolute', body: 'overwrite' }],
      [{ name: 'C:/escape', body: 'overwrite' }],
      [{ name: 'a\\escape', body: 'overwrite' }],
      [
        { name: 'same', body: 'first' },
        { name: './same', body: 'second' },
      ],
      [{ name: '.env', body: 'SYNTHETIC_ONLY=1' }],
      [
        { name: 'link', mode: LINK, body: 'safe' },
        { name: 'link/child', body: 'bad' },
      ],
      [
        { name: 'file', body: 'not a directory' },
        { name: 'file/child', body: 'bad' },
      ],
    ]
    for (const entries of cases) {
      const root = fixture(t),
        source = zip(root, entries),
        destination = join(root, 'extract')
      const result = run(guard, [source, destination])
      assert.notEqual(result.status, 0)
      assert.equal(
        existsSync(destination),
        false,
        'unsafe archive must fail before extraction directory creation',
      )
      unchanged(root)
    }
  },
)

test(
  'archive guard rejects chained symlink escape whose parent components follow another link',
  linux,
  (t) => {
    const root = fixture(t)
    const source = zip(root, [
      { name: 'sub/', mode: DIR },
      { name: 'dir/', mode: DIR },
      { name: 'outside', body: 'internal' },
      { name: 'dir/up', mode: LINK, body: '../sub' },
      { name: 'dir/escape', mode: LINK, body: 'up/../../outside' },
    ])
    const result = run(guard, [source, join(root, 'extract')])
    assert.notEqual(result.status, 0)
    assert.equal(existsSync(join(root, 'extract')), false)
    unchanged(root)
  },
)

test(
  'atomic helper exchanges only acknowledged real siblings and retains the old tree',
  linux,
  (t) => {
    const root = fixture(t),
      live = join(root, 'live'),
      stage = join(root, 'stage')
    mkdirSync(live)
    mkdirSync(stage)
    writeFileSync(join(live, 'version'), 'old')
    writeFileSync(join(stage, 'version'), 'new')
    assert.notEqual(run(exchange, [live, stage]).status, 0)
    assert.equal(readFileSync(join(live, 'version'), 'utf8'), 'old')
    const result = run(exchange, [
      live,
      stage,
      '--verified-stopped-backed-up-and-migrated',
    ])
    assert.equal(result.status, 0, result.stderr)
    assert.equal(readFileSync(join(live, 'version'), 'utf8'), 'new')
    assert.equal(readFileSync(join(stage, 'version'), 'utf8'), 'old')
    unchanged(root)
  },
)

test(
  'atomic helper rejects mismatched parents and symlink directories without moving data',
  linux,
  (t) => {
    const root = fixture(t),
      live = join(root, 'live'),
      other = join(root, 'other')
    mkdirSync(live)
    mkdirSync(other)
    mkdirSync(join(other, 'stage'))
    writeFileSync(join(live, 'version'), 'old')
    writeFileSync(join(other, 'stage/version'), 'new')
    let result = run(exchange, [
      live,
      join(other, 'stage'),
      '--verified-stopped-backed-up-and-migrated',
    ])
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /SIBLING_DIRECTORIES_REQUIRED/)
    symlinkSync(join(other, 'stage'), join(root, 'stage-link'), 'dir')
    result = run(exchange, [
      live,
      join(root, 'stage-link'),
      '--verified-stopped-backed-up-and-migrated',
    ])
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /REAL_DIRECTORIES_REQUIRED/)
    assert.equal(readFileSync(join(live, 'version'), 'utf8'), 'old')
    assert.equal(readFileSync(join(other, 'stage/version'), 'utf8'), 'new')
    unchanged(root)
  },
)

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import {
  createPatch,
  inventory,
  preparePatch,
  verifyBase,
  verifyPrepared,
} from '../../deploy/baota/server-patch.mjs'

const sha = (value) => createHash('sha256').update(value).digest('hex')
function put(root, path, content) {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), content)
}
function files(root, relative = '') {
  return readdirSync(join(root, relative), { withFileTypes: true })
    .flatMap((entry) => {
      const path = relative ? relative + '/' + entry.name : entry.name
      return entry.isDirectory()
        ? files(root, path)
        : entry.isFile() && path !== 'SHA256SUMS'
          ? [path]
          : []
    })
    .sort()
}
function sums(root) {
  put(
    root,
    'SHA256SUMS',
    files(root)
      .map((path) => `${sha(readFileSync(join(root, path)))}  ${path}`)
      .join('\n') + '\n',
  )
}
function manifest(root, source = 'a'.repeat(40), overrides = {}) {
  const value = {
    schemaVersion: 1,
    sourceSha: source,
    softwareVersion: '0.0.0-development',
    apiVersion: 'v1',
    apiBaseUrl: 'https://api-pr.honsen.africa/v1',
    deploymentDirectory: '/www/wwwroot/api-pr/v1/',
    node: '24.22.1',
    postgres: '16.15',
    platform: 'linux-x64',
    apiContract: {
      sharedBundleSha256: sha(
        readFileSync(join(root, 'packages/shared/dist/index.js')),
      ),
      serverEntrySha256: sha(
        readFileSync(join(root, 'apps/server/dist/index.js')),
      ),
    },
    baotaEntry: {
      path: 'start.mjs',
      sha256: sha(readFileSync(join(root, 'start.mjs'))),
      mode: 'BAOTA_PM2_FORK_SINGLE_INSTANCE_EMPTY_ARGS',
      envFile: '.env',
      listen: '127.0.0.1:3000',
    },
    migrations: readdirSync(join(root, 'apps/server/migrations'))
      .sort()
      .map((name) => ({
        name,
        sha256: sha(readFileSync(join(root, 'apps/server/migrations', name))),
      })),
    ...overrides,
  }
  value.latestMigration = value.migrations.at(-1)?.name
  put(root, 'build-manifest.json', JSON.stringify(value, null, 2) + '\n')
  sums(root)
  return value
}
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'honsen-server-patch-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const base = join(root, 'base'),
    target = join(root, 'target'),
    patch = join(root, 'patch'),
    live = join(root, 'live'),
    stage = join(root, 'stage')
  put(base, 'start.mjs', "import './apps/server/dist/index.js'\n")
  put(base, 'apps/server/dist/index.js', 'export const candidate = 1\n')
  put(base, 'packages/shared/dist/index.js', 'export const contract = 1\n')
  put(base, 'apps/server/migrations/001_schema.sql', 'SELECT 1;\n')
  manifest(base)
  cpSync(base, target, { recursive: true })
  put(target, 'apps/server/dist/index.js', 'export const candidate = 2\n')
  manifest(target, 'b'.repeat(40))
  cpSync(base, live, { recursive: true })
  return { root, base, target, patch, live, stage }
}
function make(f, extra = {}) {
  return createPatch({
    baseDir: f.base,
    targetDir: f.target,
    patchDir: f.patch,
    ...extra,
  })
}
function code(expected) {
  return (error) => error instanceof Error && error.message.includes(expected)
}

test('inventory is sorted and candidate patch stages a complete verified tree without changing live files', async (t) => {
  const f = fixture(t)
  const paths = inventory(f.base).map((entry) => entry.path)
  assert.deepEqual(paths, [...paths].sort())
  const before = readFileSync(join(f.live, 'apps/server/dist/index.js'), 'utf8')
  make(f)
  for (const path of ['patch-manifest.json', 'SHA256SUMS', 'DIFF.json'])
    assert.ok(existsSync(join(f.patch, path)))
  verifyBase({ liveDir: f.live, patchDir: f.patch })
  await preparePatch({
    liveDir: f.live,
    patchDir: f.patch,
    stageDir: f.stage,
    checkStopped: false,
  })
  verifyPrepared({ stageDir: f.stage, patchDir: f.patch })
  assert.equal(
    readFileSync(join(f.stage, 'apps/server/dist/index.js'), 'utf8'),
    'export const candidate = 2\n',
  )
  assert.equal(
    readFileSync(join(f.live, 'apps/server/dist/index.js'), 'utf8'),
    before,
  )
})

test('unrecognized live baseline content fails closed', (t) => {
  const f = fixture(t)
  make(f)
  put(f.live, 'apps/server/dist/index.js', 'unknown deployed bytes')
  assert.throws(
    () => verifyBase({ liveDir: f.live, patchDir: f.patch }),
    code('BASE_MISMATCH'),
  )
})

test('secret files and changed PM2 entry never enter a patch', (t) => {
  for (const [path, error] of [
    ['.env', 'SECRET_FILE'],
    ['start.mjs', 'START_ENTRY_CHANGED'],
  ]) {
    const f = fixture(t)
    put(f.target, path, 'synthetic only')
    manifest(f.target, 'b'.repeat(40))
    assert.throws(() => make(f), code(error))
    assert.equal(existsSync(join(f.patch, 'patch-manifest.json')), false)
  }
})

test('runtime identity and shared contract changes require full deployment', (t) => {
  for (const override of [
    { node: '26.0.0' },
    { postgres: '17.0' },
    { platform: 'win32-x64' },
    { apiBaseUrl: 'https://other.invalid/v1' },
  ]) {
    const f = fixture(t)
    manifest(f.target, 'b'.repeat(40), override)
    assert.throws(() => make(f), code('INCOMPATIBLE_FULL_DEPLOYMENT_REQUIRED'))
  }
  const f = fixture(t)
  put(f.target, 'packages/shared/dist/index.js', 'export const contract = 2\n')
  manifest(f.target, 'b'.repeat(40))
  assert.throws(() => make(f), code('INCOMPATIBLE_FULL_DEPLOYMENT_REQUIRED'))
})

test('historical migration edits and unapproved additions are rejected', (t) => {
  for (const path of [
    'apps/server/migrations/001_schema.sql',
    'apps/server/migrations/002_additive.sql',
  ]) {
    const f = fixture(t)
    put(f.target, path, 'SELECT 2;\n')
    manifest(f.target, 'b'.repeat(40))
    assert.throws(() => make(f), code('INCOMPATIBLE_FULL_DEPLOYMENT_REQUIRED'))
  }
})

test('additive migration approval is bound to exact source manifests and SQL bytes', async (t) => {
  const f = fixture(t)
  const name = '002_additive.sql'
  const sql = 'SELECT 2;\n'
  put(f.target, 'apps/server/migrations/' + name, sql)
  manifest(f.target, 'b'.repeat(40))
  const approval = {
    baseManifestSha256: sha(readFileSync(join(f.base, 'build-manifest.json'))),
    targetManifestSha256: sha(
      readFileSync(join(f.target, 'build-manifest.json')),
    ),
    migrations: [{ name, sha256: sha(sql) }],
    review: 'backward-compatible-additive',
  }
  assert.throws(
    () =>
      make(f, {
        migrationApproval: { ...approval, baseManifestSha256: '0'.repeat(64) },
      }),
    code('INCOMPATIBLE_FULL_DEPLOYMENT_REQUIRED'),
  )
  make(f, { migrationApproval: approval })
  await preparePatch({
    liveDir: f.live,
    patchDir: f.patch,
    stageDir: f.stage,
    checkStopped: false,
  })
  verifyPrepared({ stageDir: f.stage, patchDir: f.patch })
  assert.equal(
    readFileSync(join(f.stage, 'apps/server/migrations/' + name), 'utf8'),
    sql,
  )
  assert.equal(
    existsSync(join(f.live, 'apps/server/migrations/' + name)),
    false,
  )
})

test(
  'known baseline file permissions cannot silently drift',
  { skip: process.platform === 'win32' },
  (t) => {
    const f = fixture(t)
    make(f)
    chmodSync(join(f.live, 'start.mjs'), 0o777)
    assert.throws(
      () => verifyBase({ liveDir: f.live, patchDir: f.patch }),
      code('BASE_MISMATCH'),
    )
  },
)

test('type changes and external symlinks cannot escape artifact roots', (t) => {
  const f = fixture(t)
  rmSync(join(f.target, 'apps/server/dist/index.js'))
  mkdirSync(join(f.target, 'apps/server/dist/index.js'))
  put(f.target, 'apps/server/dist/index.js/nested', 'unexpected')
  sums(f.target)
  assert.throws(() => make(f))
  const g = fixture(t)
  put(g.root, 'outside/sentinel', 'keep')
  symlinkSync(
    join(g.root, 'outside'),
    join(g.target, 'escape'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )
  assert.throws(() => make(g), code('UNSAFE_PATH'))
  assert.equal(readFileSync(join(g.root, 'outside/sentinel'), 'utf8'), 'keep')
})

test('unknown live files are retained but cannot collide with newly deployed files', async (t) => {
  const f = fixture(t)
  make(f)
  put(f.live, 'operator-local.txt', 'retain')
  put(f.live, '.env', 'SYNTHETIC_ONLY=1\n')
  await preparePatch({
    liveDir: f.live,
    patchDir: f.patch,
    stageDir: f.stage,
    checkStopped: false,
  })
  assert.equal(
    readFileSync(join(f.stage, 'operator-local.txt'), 'utf8'),
    'retain',
  )
  assert.equal(
    readFileSync(join(f.stage, '.env'), 'utf8'),
    'SYNTHETIC_ONLY=1\n',
  )
  assert.equal(existsSync(join(f.patch, 'payload/.env')), false)
  const g = fixture(t)
  put(g.target, 'apps/server/dist/new.js', 'candidate')
  manifest(g.target, 'b'.repeat(40))
  make(g)
  put(g.live, 'apps/server/dist/new.js', 'operator-owned')
  assert.throws(
    () => verifyBase({ liveDir: g.live, patchDir: g.patch }),
    code('UNKNOWN_TARGET_COLLISION'),
  )
})

test('patch payload alteration and existing stage directory are rejected', async (t) => {
  const f = fixture(t)
  make(f)
  put(f.patch, 'payload/apps/server/dist/index.js', 'tampered')
  assert.throws(
    () => verifyBase({ liveDir: f.live, patchDir: f.patch }),
    code('PATCH_MISMATCH'),
  )
  const g = fixture(t)
  make(g)
  mkdirSync(g.stage)
  await assert.rejects(
    preparePatch({
      liveDir: g.live,
      patchDir: g.patch,
      stageDir: g.stage,
      checkStopped: false,
    }),
    code('TARGET_EXISTS'),
  )
})

test('default preparation refuses a live API listener without stopping it', async (t) => {
  const f = fixture(t)
  make(f)
  const server = createServer((socket) => socket.end())
  const owned = await new Promise((resolve, reject) => {
    server.once('error', (error) =>
      error.code === 'EADDRINUSE' ? resolve(false) : reject(error),
    )
    server.listen(3000, '127.0.0.1', () => resolve(true))
  })
  try {
    await assert.rejects(
      preparePatch({ liveDir: f.live, patchDir: f.patch, stageDir: f.stage }),
      code(process.platform === 'win32' ? 'LINUX_REQUIRED' : 'API_RUNNING'),
    )
    assert.equal(existsSync(f.stage), false)
  } finally {
    if (owned)
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
  }
})

test(
  'internal relative directory symlinks remain internal after preparation',
  { skip: process.platform === 'win32' },
  async (t) => {
    const f = fixture(t)
    symlinkSync('apps/server/dist', join(f.base, 'code-link'), 'dir')
    symlinkSync('apps/server/dist', join(f.target, 'code-link'), 'dir')
    symlinkSync('apps/server/dist', join(f.live, 'code-link'), 'dir')
    sums(f.base)
    sums(f.target)
    sums(f.live)
    make(f)
    await preparePatch({
      liveDir: f.live,
      patchDir: f.patch,
      stageDir: f.stage,
      checkStopped: false,
    })
    verifyPrepared({ stageDir: f.stage, patchDir: f.patch })
    assert.equal(
      readFileSync(join(f.stage, 'code-link/index.js'), 'utf8'),
      'export const candidate = 2\n',
    )
  },
)

function rewritePatch(f, mutate) {
  const value = JSON.parse(
    readFileSync(join(f.patch, 'patch-manifest.json'), 'utf8'),
  )
  mutate(value)
  put(f.patch, 'patch-manifest.json', JSON.stringify(value, null, 2) + '\n')
  sums(f.patch)
}

test('rehashed manifest cannot claim runtime metadata not present in the actual artifact bytes', (t) => {
  const f = fixture(t)
  make(f)
  rewritePatch(f, (value) => {
    value.baseManifest.node = '26.0.0'
    value.targetManifest.node = '26.0.0'
  })
  assert.throws(
    () => verifyBase({ liveDir: f.live, patchDir: f.patch }),
    code('PATCH_MISMATCH'),
  )
})

test('manifest paths reject traversal, absolute names, drive paths and backslash aliases before staging', async (t) => {
  for (const path of [
    '../outside',
    '/absolute',
    'C:/escape',
    'apps\\escape',
    'apps/../escape',
  ]) {
    const f = fixture(t)
    make(f)
    put(f.root, 'outside', 'sentinel')
    rewritePatch(f, (value) => {
      value.targetInventory.find(
        (entry) => entry.path === 'apps/server/dist/index.js',
      ).path = path
    })
    await assert.rejects(
      preparePatch({
        liveDir: f.live,
        patchDir: f.patch,
        stageDir: f.stage,
        checkStopped: false,
      }),
      code('UNSAFE_PATH'),
    )
    assert.equal(existsSync(f.stage), false)
    assert.equal(readFileSync(join(f.root, 'outside'), 'utf8'), 'sentinel')
  }
})

test('output nesting checks also reject child directory names beginning with two dots', (t) => {
  const f = fixture(t)
  assert.throws(
    () => make(f, { patchDir: join(f.base, '..patch') }),
    code('UNSAFE_PATH'),
  )
  assert.equal(existsSync(join(f.base, '..patch')), false)
})

test('patch root itself cannot be a symlink or junction', (t) => {
  const f = fixture(t)
  make(f)
  const alias = join(f.root, 'patch-alias')
  symlinkSync(f.patch, alias, process.platform === 'win32' ? 'junction' : 'dir')
  assert.throws(
    () => verifyBase({ liveDir: f.live, patchDir: alias }),
    code('UNSAFE_PATH'),
  )
})

test('patch checksums and the reviewable diff are verified instead of ignored', (t) => {
  const f = fixture(t)
  make(f)
  put(f.patch, 'SHA256SUMS', '0'.repeat(64) + '  patch-manifest.json\n')
  assert.throws(
    () => verifyBase({ liveDir: f.live, patchDir: f.patch }),
    code('PATCH_MISMATCH'),
  )
  const g = fixture(t)
  make(g)
  put(
    g.patch,
    'DIFF.json',
    JSON.stringify({ added: [], modified: [], deleted: [], unchanged: [] }) +
      '\n',
  )
  sums(g.patch)
  assert.throws(
    () => verifyBase({ liveDir: g.live, patchDir: g.patch }),
    code('PATCH_MISMATCH'),
  )
})

test('deleting packaged directories preserves operator-owned children in the prepared tree', async (t) => {
  const f = fixture(t)
  for (const root of [f.base, f.live]) {
    put(root, 'legacy/helper.js', 'old packaged file')
    sums(root)
  }
  make(f)
  put(f.live, 'legacy/operator.txt', 'retain this local file')
  await preparePatch({
    liveDir: f.live,
    patchDir: f.patch,
    stageDir: f.stage,
    checkStopped: false,
  })
  verifyPrepared({ stageDir: f.stage, patchDir: f.patch })
  assert.equal(existsSync(join(f.stage, 'legacy/helper.js')), false)
  assert.equal(
    readFileSync(join(f.stage, 'legacy/operator.txt'), 'utf8'),
    'retain this local file',
  )
  assert.equal(
    readFileSync(join(f.live, 'legacy/helper.js'), 'utf8'),
    'old packaged file',
  )
})

test('undeclared symlinks in the patch archive cannot bypass the file checksum inventory', (t) => {
  const f = fixture(t)
  make(f)
  put(f.root, 'outside/sentinel', 'untouched')
  symlinkSync(
    join(f.root, 'outside'),
    join(f.patch, 'undeclared-link'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )
  assert.throws(
    () => verifyBase({ liveDir: f.live, patchDir: f.patch }),
    (error) => code('UNSAFE_PATH')(error) || code('PATCH_MISMATCH')(error),
  )
  assert.equal(
    readFileSync(join(f.root, 'outside/sentinel'), 'utf8'),
    'untouched',
  )
})

test('rehashed extra archive files cannot introduce secrets or undeclared payload', (t) => {
  for (const [path, expected] of [
    ['.env', 'SECRET_FILE'],
    ['payload/undeclared.js', 'PATCH_MISMATCH'],
  ]) {
    const f = fixture(t)
    make(f)
    put(f.patch, path, 'synthetic-only')
    sums(f.patch)
    assert.throws(
      () => verifyBase({ liveDir: f.live, patchDir: f.patch }),
      (error) => code(expected)(error) || code('PATCH_MISMATCH')(error),
    )
  }
})

test('missing mandatory facts on both sides never qualify as compatibility', (t) => {
  for (const field of [
    'node',
    'postgres',
    'apiBaseUrl',
    'deploymentDirectory',
    'platform',
  ]) {
    const f = fixture(t)
    for (const [root, source] of [
      [f.base, 'a'.repeat(40)],
      [f.target, 'b'.repeat(40)],
    ])
      manifest(root, source, { [field]: undefined })
    assert.throws(() => make(f), code('INCOMPATIBLE_FULL_DEPLOYMENT_REQUIRED'))
  }
  for (const field of ['mode', 'listen', 'envFile', 'path']) {
    const f = fixture(t)
    for (const root of [f.base, f.target]) {
      const data = JSON.parse(
        readFileSync(join(root, 'build-manifest.json'), 'utf8'),
      )
      delete data.baotaEntry[field]
      put(root, 'build-manifest.json', JSON.stringify(data, null, 2) + '\n')
      sums(root)
    }
    assert.throws(() => make(f))
  }
})

test(
  'symlink targets resolve parent components after links rather than lexically collapsing them',
  { skip: process.platform === 'win32' },
  (t) => {
    const f = fixture(t)
    put(f.root, 'outside', 'external sentinel')
    put(f.base, 'outside', 'different internal bytes')
    mkdirSync(join(f.base, 'sub'))
    mkdirSync(join(f.base, 'dir'))
    symlinkSync('../sub', join(f.base, 'dir/up'), 'dir')
    symlinkSync('up/../../outside', join(f.base, 'dir/escape'), 'file')
    assert.equal(
      readFileSync(join(f.base, 'dir/escape'), 'utf8'),
      'external sentinel',
    )
    assert.throws(() => inventory(f.base), code('UNSAFE_PATH'))
  },
)

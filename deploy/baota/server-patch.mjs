import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  rmdirSync,
  writeFileSync,
  chmodSync,
} from 'node:fs'
import { dirname, isAbsolute, join, posix, relative, resolve } from 'node:path'
import { createConnection } from 'node:net'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const hash = (data) => createHash('sha256').update(data).digest('hex')
const fail = (code) => {
  throw new Error(code)
}
const json = (root, name) => JSON.parse(readFileSync(join(root, name), 'utf8'))
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const forbidden = (path) =>
  path
    .split('/')
    .some(
      (s) =>
        s === '.env' ||
        /^\.env\.(?!example$)/.test(s) ||
        /^(id_rsa|id_ed25519)$/.test(s) ||
        /\.(pem|key|pfx|p12|sqlite|sqlite3|db|dump|backup|bak)$/i.test(s),
    )
function safePath(path) {
  if (
    typeof path !== 'string' ||
    !path ||
    /[\\\x00-\x1f:]/.test(path) ||
    isAbsolute(path) ||
    path.split('/').some((s) => !s || s === '.' || s === '..')
  )
    fail('UNSAFE_PATH')
  return path
}
function validateEntries(entries) {
  if (!Array.isArray(entries) || entries.length > 100000) fail('PATCH_MISMATCH')
  const paths = new Map()
  for (const e of entries) {
    safePath(e.path)
    if (
      paths.has(e.path) ||
      !['file', 'directory', 'symlink'].includes(e.type) ||
      !Number.isInteger(e.mode) ||
      e.mode < 0 ||
      e.mode > 0o777 ||
      !Number.isSafeInteger(e.size) ||
      e.size < 0
    )
      fail('PATCH_MISMATCH')
    if (e.type !== 'directory' && !/^[a-f0-9]{64}$/.test(e.sha256 ?? ''))
      fail('PATCH_MISMATCH')
    if (e.type === 'symlink') {
      if (
        typeof e.target !== 'string' ||
        /[\\\x00-\x1f:]/.test(e.target) ||
        posix.isAbsolute(e.target)
      )
        fail('UNSAFE_PATH')
      const destination = posix.normalize(
        posix.join(posix.dirname(e.path), e.target),
      )
      if (
        destination === '..' ||
        destination.startsWith('../') ||
        e.sha256 !== hash(e.target) ||
        e.size !== Buffer.byteLength(e.target)
      )
        fail('UNSAFE_PATH')
    }
    paths.set(e.path, e)
  }
  for (const e of entries) {
    let parent = posix.dirname(e.path)
    while (parent !== '.') {
      if (paths.get(parent)?.type !== 'directory') fail('UNSAFE_PATH')
      parent = posix.dirname(parent)
    }
    if (e.type === 'symlink') {
      // Resolve links BEFORE processing subsequent '..', exactly as the filesystem does.
      const queue = [
          ...posix.dirname(e.path).split('/'),
          ...e.target.split('/'),
        ],
        stack = [],
        visited = new Set([e.path])
      while (queue.length) {
        const part = queue.shift()
        if (!part || part === '.') continue
        if (part === '..') {
          if (!stack.length) fail('UNSAFE_PATH')
          stack.pop()
          continue
        }
        const name = [...stack, part].join('/'),
          link = paths.get(name)
        if (link?.type === 'symlink') {
          if (visited.has(name) || visited.size > 64) fail('UNSAFE_PATH')
          visited.add(name)
          queue.unshift(...link.target.split('/'))
        } else {
          if (!link || (queue.length && link.type !== 'directory'))
            fail('UNSAFE_PATH')
          stack.push(part)
        }
      }
      if (!paths.has(stack.join('/'))) fail('UNSAFE_PATH')
    }
  }
  return entries
}
export function inventory(root) {
  if (lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory())
    fail('UNSAFE_PATH')
  const entries = []
  function visit(dir, prefix = '') {
    for (const name of readdirSync(dir).sort()) {
      const path = safePath(prefix ? `${prefix}/${name}` : name),
        full = join(root, path),
        st = lstatSync(full)
      if (st.mode & 0o7000) fail('UNSAFE_PATH')
      if (st.isDirectory()) {
        entries.push({
          path,
          type: 'directory',
          mode: st.mode & 0o777,
          size: 0,
        })
        visit(full, path)
      } else if (st.isSymbolicLink()) {
        const target = readlinkSync(full)
        entries.push({
          path,
          type: 'symlink',
          mode: st.mode & 0o777,
          size: Buffer.byteLength(target),
          sha256: hash(target),
          target,
        })
      } else if (st.isFile())
        entries.push({
          path,
          type: 'file',
          mode: st.mode & 0o777,
          size: st.size,
          sha256: hash(readFileSync(full)),
        })
      else fail('UNSAFE_PATH')
    }
  }
  visit(root)
  return validateEntries(
    entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
  )
}
function packageInfo(root) {
  const entries = inventory(root),
    byPath = new Map(entries.map((e) => [e.path, e]))
  if (entries.some((e) => forbidden(e.path))) fail('SECRET_FILE')
  const sums = new Map()
  for (const line of readFileSync(join(root, 'SHA256SUMS'), 'utf8')
    .split('\n')
    .filter(Boolean)) {
    const match = /^([a-f0-9]{64})  (?:\.\/)?(.+)$/.exec(line)
    if (!match || sums.has(match[2])) fail('PATCH_MISMATCH')
    safePath(match[2])
    sums.set(match[2], match[1])
  }
  for (const e of entries.filter(
    (e) => e.type === 'file' && e.path !== 'SHA256SUMS',
  ))
    if (sums.get(e.path) !== e.sha256) fail('PATCH_MISMATCH')
  if (
    sums.size !==
    entries.filter((e) => e.type === 'file' && e.path !== 'SHA256SUMS').length
  )
    fail('PATCH_MISMATCH')
  const manifest = json(root, 'build-manifest.json')
  if (
    manifest.schemaVersion !== 1 ||
    !/^[a-f0-9]{40}$/.test(manifest.sourceSha ?? '') ||
    manifest.apiVersion !== 'v1' ||
    manifest.platform !== 'linux-x64'
  )
    fail('INCOMPATIBLE_FULL_DEPLOYMENT_REQUIRED')
  if (
    manifest.node !== '24.22.1' ||
    manifest.postgres !== '16.15' ||
    manifest.apiBaseUrl !== 'https://api-pr.honsen.africa/v1' ||
    manifest.deploymentDirectory !== '/www/wwwroot/api-pr/v1/' ||
    manifest.baotaEntry?.mode !== 'BAOTA_PM2_FORK_SINGLE_INSTANCE_EMPTY_ARGS' ||
    manifest.baotaEntry?.listen !== '127.0.0.1:3000'
  )
    fail('INCOMPATIBLE_FULL_DEPLOYMENT_REQUIRED')
  for (const [path, digest] of [
    ['start.mjs', manifest.baotaEntry?.sha256],
    ['apps/server/dist/index.js', manifest.apiContract?.serverEntrySha256],
    ['packages/shared/dist/index.js', manifest.apiContract?.sharedBundleSha256],
  ])
    if (byPath.get(path)?.sha256 !== digest || !digest) fail('PATCH_MISMATCH')
  if (
    manifest.baotaEntry.path !== 'start.mjs' ||
    manifest.baotaEntry.envFile !== '.env'
  )
    fail('PATCH_MISMATCH')
  const migrations = entries
    .filter(
      (e) =>
        e.type === 'file' &&
        /^apps\/server\/migrations\/[^/]+\.sql$/.test(e.path),
    )
    .map((e) => ({ name: posix.basename(e.path), sha256: e.sha256 }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  if (
    !same(migrations, manifest.migrations) ||
    manifest.latestMigration !== migrations.at(-1)?.name
  )
    fail('PATCH_MISMATCH')
  return {
    entries,
    manifest,
    manifestSha256: byPath.get('build-manifest.json').sha256,
  }
}
function changes(base, target) {
  const b = new Map(base.map((e) => [e.path, e])),
    t = new Map(target.map((e) => [e.path, e]))
  return {
    added: target.filter((e) => !b.has(e.path)),
    modified: target.filter((e) => b.has(e.path) && !same(e, b.get(e.path))),
    deleted: base.filter((e) => !t.has(e.path)),
    unchanged: target.filter((e) => same(e, b.get(e.path))),
  }
}
function compatible(base, target, approval) {
  const b = base.manifest,
    t = target.manifest
  for (const key of [
    'apiVersion',
    'node',
    'postgres',
    'platform',
    'apiBaseUrl',
    'deploymentDirectory',
    'postgresRequiredExtensions',
    'migrationChecksumCompatibility',
  ])
    if (!same(b[key], t[key])) fail('INCOMPATIBLE_FULL_DEPLOYMENT_REQUIRED')
  if (!same(b.baotaEntry, t.baotaEntry)) fail('START_ENTRY_CHANGED')
  if (b.apiContract.sharedBundleSha256 !== t.apiContract.sharedBundleSha256)
    fail('INCOMPATIBLE_FULL_DEPLOYMENT_REQUIRED')
  if (!same(b.migrations, t.migrations.slice(0, b.migrations.length)))
    fail('INCOMPATIBLE_FULL_DEPLOYMENT_REQUIRED')
  const migrations = t.migrations.slice(b.migrations.length)
  if (
    migrations.length &&
    (!approval ||
      approval.baseManifestSha256 !== base.manifestSha256 ||
      approval.targetManifestSha256 !== target.manifestSha256 ||
      approval.review !== 'backward-compatible-additive' ||
      !same(approval.migrations, migrations))
  )
    fail('INCOMPATIBLE_FULL_DEPLOYMENT_REQUIRED')
  const types = new Map(base.entries.map((e) => [e.path, e.type]))
  for (const e of target.entries)
    if (types.has(e.path) && types.get(e.path) !== e.type)
      fail('INCOMPATIBLE_FULL_DEPLOYMENT_REQUIRED')
  return migrations
}
function newDestination(path, roots) {
  path = resolve(path)
  if (existsSync(path)) fail('TARGET_EXISTS')
  if (realpathSync(dirname(path)) !== dirname(path)) fail('UNSAFE_PATH')
  const outside = (from, to) => {
    const rel = relative(from, to)
    return (
      rel === '..' ||
      rel.startsWith('../') ||
      rel.startsWith('..\\') ||
      isAbsolute(rel)
    )
  }
  for (const root of roots.map((r) => resolve(r)))
    if (path === root || !outside(root, path) || !outside(path, root))
      fail('UNSAFE_PATH')
}
export function createPatch({
  baseDir,
  targetDir,
  patchDir,
  migrationApproval,
}) {
  const base = packageInfo(baseDir),
    target = packageInfo(targetDir)
  const migrations = compatible(base, target, migrationApproval),
    diff = changes(base.entries, target.entries)
  if (
    diff.modified.some((e) => e.path === 'start.mjs') ||
    diff.added.some((e) => e.path === 'start.mjs')
  )
    fail('START_ENTRY_CHANGED')
  newDestination(patchDir, [baseDir, targetDir])
  const manifest = {
    schemaVersion: 1,
    kind: 'honsen-procure-server-patch',
    baseSha: base.manifest.sourceSha,
    targetSha: target.manifest.sourceSha,
    baseManifestSha256: base.manifestSha256,
    targetManifestSha256: target.manifestSha256,
    baseManifest: base.manifest,
    targetManifest: target.manifest,
    baseInventory: base.entries,
    targetInventory: target.entries,
    changes: diff,
    newMigrations: migrations,
    migrationApproval: migrationApproval ?? null,
    dependencyFiles: target.entries.filter(
      (e) =>
        e.path === 'package-lock.json' ||
        e.path === 'package.json' ||
        /(^|\/)package\.json$/.test(e.path),
    ),
    installOrder: [
      'verify-base',
      'backup-database-and-files',
      'stop-single-baota-pm2-project',
      'prepare-copy',
      'verify-target',
      'controlled-incremental-migration',
      'atomic-directory-exchange',
      'start-same-baota-pm2-project',
      'health-and-authenticated-business-checks',
    ],
    remoteBaselineStatus: 'MUST_VERIFY_REAL_DEPLOYMENT_BEFORE_INSTALL',
  }
  mkdirSync(join(patchDir, 'payload'), { recursive: true, mode: 0o700 })
  for (const e of [...diff.added, ...diff.modified]) {
    if (e.type === 'directory') continue
    const destination = join(patchDir, 'payload', e.path)
    mkdirSync(dirname(destination), { recursive: true })
    cpSync(join(targetDir, e.path), destination, {
      dereference: false,
      verbatimSymlinks: true,
      errorOnExist: true,
      force: false,
    })
  }
  writeFileSync(
    join(patchDir, 'patch-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  )
  writeFileSync(
    join(patchDir, 'DIFF.json'),
    JSON.stringify(diff, null, 2) + '\n',
  )
  const files = [
    'patch-manifest.json',
    'DIFF.json',
    ...[...diff.added, ...diff.modified]
      .filter((e) => e.type === 'file')
      .map((e) => 'payload/' + e.path),
  ]
  writeFileSync(
    join(patchDir, 'SHA256SUMS'),
    files
      .sort()
      .map((name) => `${hash(readFileSync(join(patchDir, name)))}  ${name}\n`)
      .join(''),
  )
  return manifest
}
function readPatch(patchDir) {
  if (
    lstatSync(patchDir).isSymbolicLink() ||
    realpathSync(patchDir) !== resolve(patchDir)
  )
    fail('UNSAFE_PATH')
  const checksums = new Map()
  if (!lstatSync(join(patchDir, 'SHA256SUMS')).isFile()) fail('PATCH_MISMATCH')
  for (const line of readFileSync(join(patchDir, 'SHA256SUMS'), 'utf8')
    .split('\n')
    .filter(Boolean)) {
    const match = /^([a-f0-9]{64})  (?:\.\/)?(.+)$/.exec(line)
    if (!match || checksums.has(match[2])) fail('PATCH_MISMATCH')
    safePath(match[2])
    checksums.set(match[2], match[1])
  }
  let regularCount = 0
  const archiveEntries = []
  function verifyArchiveFiles(directory, prefix = '') {
    for (const name of readdirSync(directory)) {
      const path = safePath(prefix ? `${prefix}/${name}` : name),
        full = join(patchDir, path),
        st = lstatSync(full)
      archiveEntries.push({
        path,
        type: st.isSymbolicLink()
          ? 'symlink'
          : st.isDirectory()
            ? 'directory'
            : 'file',
      })
      if (forbidden(path)) fail('SECRET_FILE')
      if (st.isDirectory()) verifyArchiveFiles(full, path)
      else if (st.isFile() && path !== 'SHA256SUMS') {
        regularCount++
        if (checksums.get(path) !== hash(readFileSync(full)))
          fail('PATCH_MISMATCH')
      } else if (!st.isFile() && !st.isSymbolicLink()) fail('UNSAFE_PATH')
    }
  }
  verifyArchiveFiles(patchDir)
  if (regularCount !== checksums.size) fail('PATCH_MISMATCH')
  const st = lstatSync(join(patchDir, 'patch-manifest.json'))
  if (!st.isFile() || st.size > 32 * 1024 * 1024) fail('PATCH_MISMATCH')
  const m = json(patchDir, 'patch-manifest.json')
  if (m.schemaVersion !== 1 || m.kind !== 'honsen-procure-server-patch')
    fail('PATCH_MISMATCH')
  validateEntries(m.baseInventory)
  validateEntries(m.targetInventory)
  if ([...m.baseInventory, ...m.targetInventory].some((e) => forbidden(e.path)))
    fail('SECRET_FILE')
  if (
    !/^[a-f0-9]{40}$/.test(m.baseSha) ||
    !/^[a-f0-9]{40}$/.test(m.targetSha) ||
    m.baseManifest.sourceSha !== m.baseSha ||
    m.targetManifest.sourceSha !== m.targetSha
  )
    fail('PATCH_MISMATCH')
  for (const [entries, digest] of [
    [m.baseInventory, m.baseManifestSha256],
    [m.targetInventory, m.targetManifestSha256],
  ])
    if (
      entries.find((e) => e.path === 'build-manifest.json')?.sha256 !== digest
    )
      fail('PATCH_MISMATCH')
  if (!same(changes(m.baseInventory, m.targetInventory), m.changes))
    fail('PATCH_MISMATCH')
  if (!same(json(patchDir, 'DIFF.json'), m.changes)) fail('PATCH_MISMATCH')
  const base = {
      manifest: m.baseManifest,
      manifestSha256: m.baseManifestSha256,
      entries: m.baseInventory,
    },
    target = {
      manifest: m.targetManifest,
      manifestSha256: m.targetManifestSha256,
      entries: m.targetInventory,
    }
  if (!same(compatible(base, target, m.migrationApproval), m.newMigrations))
    fail('PATCH_MISMATCH')
  const allowed = new Map([
    ['SHA256SUMS', 'file'],
    ['patch-manifest.json', 'file'],
    ['DIFF.json', 'file'],
    ['README.zh-CN.md', 'file'],
    ['tools/server-patch.mjs', 'file'],
    ['tools/archive-guard.py', 'file'],
    ['tools/exchange-dirs.py', 'file'],
    ['payload', 'directory'],
  ])
  for (const e of [...m.changes.added, ...m.changes.modified])
    if (e.type !== 'directory') allowed.set('payload/' + e.path, e.type)
  for (const name of [...allowed.keys()]) {
    let parent = posix.dirname(name)
    while (parent !== '.') {
      allowed.set(parent, 'directory')
      parent = posix.dirname(parent)
    }
  }
  for (const e of archiveEntries)
    if (allowed.get(e.path) !== e.type)
      fail(e.type === 'symlink' ? 'UNSAFE_PATH' : 'PATCH_MISMATCH')
  // No payload symlink is dereferenced. Compare individual lstat records, not a subtree traversal.
  for (const e of [...m.changes.added, ...m.changes.modified]) {
    if (e.path === 'start.mjs') fail('START_ENTRY_CHANGED')
    if (e.type === 'directory') continue
    const full = join(patchDir, 'payload', e.path)
    let parent = dirname(full)
    while (parent !== resolve(patchDir)) {
      if (lstatSync(parent).isSymbolicLink()) fail('UNSAFE_PATH')
      const next = dirname(parent)
      if (next === parent) fail('UNSAFE_PATH')
      parent = next
    }
    const s = lstatSync(full)
    let actual
    if (s.isSymbolicLink()) {
      const target = readlinkSync(full)
      actual = {
        path: e.path,
        type: 'symlink',
        mode: s.mode & 0o777,
        size: Buffer.byteLength(target),
        sha256: hash(target),
        target,
      }
    } else if (s.isFile())
      actual = {
        path: e.path,
        type: 'file',
        mode: s.mode & 0o777,
        size: s.size,
        sha256: hash(readFileSync(full)),
      }
    else fail('PATCH_MISMATCH')
    if (!same(actual, e)) fail('PATCH_MISMATCH')
  }
  const manifestPayload = join(patchDir, 'payload/build-manifest.json')
  if (
    existsSync(manifestPayload) &&
    !same(JSON.parse(readFileSync(manifestPayload, 'utf8')), m.targetManifest)
  )
    fail('PATCH_MISMATCH')
  return m
}
export function verifyBase({ liveDir, patchDir }) {
  const m = readPatch(resolve(patchDir)),
    live = inventory(liveDir),
    byPath = new Map(live.map((e) => [e.path, e]))
  for (const e of m.baseInventory)
    if (!same(byPath.get(e.path), e)) fail('BASE_MISMATCH')
  if (!same(json(liveDir, 'build-manifest.json'), m.baseManifest))
    fail('BASE_MISMATCH')
  for (const e of m.changes.added)
    if (byPath.has(e.path)) fail('UNKNOWN_TARGET_COLLISION')
  return m
}
export function verifyPrepared({ stageDir, patchDir }) {
  const m = readPatch(resolve(patchDir)),
    actual = inventory(stageDir),
    byPath = new Map(actual.map((e) => [e.path, e]))
  for (const e of m.targetInventory)
    if (!same(byPath.get(e.path), e)) fail('PATCH_MISMATCH')
  for (const e of m.changes.deleted)
    if (e.type !== 'directory' && byPath.has(e.path)) fail('PATCH_MISMATCH')
  if (!same(json(stageDir, 'build-manifest.json'), m.targetManifest))
    fail('PATCH_MISMATCH')
  const packaged = packageInfoFromKnown(stageDir, m.targetInventory)
  if (packaged !== m.targetManifestSha256) fail('PATCH_MISMATCH')
  return m
}
function packageInfoFromKnown(root, entries) {
  // Every TARGET byte is checked above; unknown local data is intentionally outside the artifact set.
  return hash(
    readFileSync(
      join(root, entries.find((e) => e.path === 'build-manifest.json').path),
    ),
  )
}
export async function assertStopped(liveDir) {
  if (process.platform !== 'linux') fail('LINUX_REQUIRED')
  const listening = await new Promise((done) => {
    const socket = createConnection({ host: '127.0.0.1', port: 3000 })
    socket.setTimeout(2000)
    socket.once('connect', () => {
      socket.destroy()
      done(true)
    })
    socket.once('error', (error) => {
      socket.destroy()
      done(error.code !== 'ECONNREFUSED')
    })
    socket.once('timeout', () => {
      socket.destroy()
      done(true)
    })
  })
  if (listening) fail('API_RUNNING')
  const root = realpathSync(liveDir)
  for (const pid of readdirSync('/proc').filter((p) => /^\d+$/.test(p))) {
    let executable
    try {
      executable = readlinkSync(`/proc/${pid}/exe`)
    } catch (e) {
      if (e.code === 'ENOENT') continue
      fail('PROCESS_CHECK_FAILED')
    }
    if (!/\/(node|nodejs)$/.test(executable)) continue
    try {
      const cwd = readlinkSync(`/proc/${pid}/cwd`),
        args = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0')
      if (
        cwd === root ||
        cwd.startsWith(root + '/') ||
        args.some((a) => a === root || a.startsWith(root + '/'))
      )
        fail('API_RUNNING')
    } catch (e) {
      if (e.code === 'ENOENT') continue
      throw e
    }
  }
}
export async function preparePatch({
  liveDir,
  patchDir,
  stageDir,
  checkStopped = true,
}) {
  liveDir = resolve(liveDir)
  patchDir = resolve(patchDir)
  stageDir = resolve(stageDir)
  if (checkStopped) await assertStopped(liveDir)
  const m = verifyBase({ liveDir, patchDir })
  newDestination(stageDir, [liveDir, patchDir])
  if (process.platform === 'linux') {
    if (
      spawnSync('cp', ['-a', '--', liveDir, stageDir], { encoding: 'utf8' })
        .status !== 0
    )
      fail('COPY_FAILED')
  } else
    cpSync(liveDir, stageDir, {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
      preserveTimestamps: true,
      errorOnExist: true,
      force: false,
    })
  // Delete only known BASE paths. Unknown children of a deleted directory are never removed.
  for (const e of [...m.changes.deleted].sort(
    (a, b) => b.path.length - a.path.length,
  )) {
    const full = join(stageDir, e.path)
    if (e.type === 'directory') {
      if (readdirSync(full).length === 0) rmdirSync(full)
    } else rmSync(full)
  }
  for (const e of [...m.changes.added, ...m.changes.modified]
    .filter((e) => e.type === 'directory')
    .sort((a, b) => a.path.length - b.path.length)) {
    mkdirSync(join(stageDir, e.path), { recursive: true })
    chmodSync(join(stageDir, e.path), e.mode)
  }
  for (const e of [...m.changes.added, ...m.changes.modified].filter(
    (e) => e.type !== 'directory',
  )) {
    const full = join(stageDir, e.path)
    if (
      existsSync(full) ||
      (() => {
        try {
          return lstatSync(full).isSymbolicLink()
        } catch {
          return false
        }
      })()
    )
      rmSync(full)
    mkdirSync(dirname(full), { recursive: true })
    cpSync(join(patchDir, 'payload', e.path), full, {
      dereference: false,
      verbatimSymlinks: true,
      errorOnExist: true,
      force: false,
    })
    if (e.type === 'file') chmodSync(full, e.mode)
  }
  verifyPrepared({ stageDir, patchDir })
  // Recheck the source after copying so observed live mutations cannot silently qualify a stage.
  verifyBase({ liveDir, patchDir })
  if (checkStopped) await assertStopped(liveDir)
  return m
}
export async function activatePatch({
  liveDir,
  patchDir,
  stageDir,
  backupDir,
  expectedDatabase = 'honsen_procure',
}) {
  for (const path of [liveDir, stageDir, backupDir])
    if (
      !path ||
      lstatSync(path).isSymbolicLink() ||
      realpathSync(path) !== resolve(path)
    )
      fail('UNSAFE_PATH')
  if (dirname(resolve(liveDir)) !== dirname(resolve(stageDir)))
    fail('SIBLING_DIRECTORIES_REQUIRED')
  await assertStopped(liveDir)
  const m = verifyBase({ liveDir, patchDir })
  verifyPrepared({ stageDir, patchDir })
  // Actual archive readability and file backup equality, not an operator-supplied success boolean.
  if (lstatSync(join(backupDir, 'SHA256SUMS')).isSymbolicLink())
    fail('BACKUP_NOT_VERIFIED')
  const sums = new Map(
    readFileSync(join(backupDir, 'SHA256SUMS'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const match =
          /^([a-f0-9]{64})  (database\.dump|application\.tar)$/.exec(line)
        if (!match) fail('BACKUP_NOT_VERIFIED')
        return [match[2], match[1]]
      }),
  )
  for (const name of ['database.dump', 'application.tar']) {
    const full = join(backupDir, name),
      st = lstatSync(full)
    if (
      !st.isFile() ||
      st.isSymbolicLink() ||
      !st.size ||
      sums.get(name) !== hash(readFileSync(full))
    )
      fail('BACKUP_NOT_VERIFIED')
  }
  if (sums.size !== 2) fail('BACKUP_NOT_VERIFIED')
  const dump = spawnSync(
    'pg_restore',
    ['--list', join(backupDir, 'database.dump')],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  )
  const list = spawnSync(
    'tar',
    ['--list', '--file', join(backupDir, 'application.tar')],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  )
  const compare = spawnSync(
    'tar',
    [
      '--compare',
      '--file',
      join(backupDir, 'application.tar'),
      '--directory',
      resolve(liveDir),
    ],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  )
  if (
    dump.status !== 0 ||
    !dump.stdout.includes('TABLE') ||
    /^;\s+dbname:\s*(.+)$/m.exec(dump.stdout)?.[1]?.trim() !==
      expectedDatabase ||
    list.status !== 0 ||
    !list.stdout.split('\n').includes('./.env') ||
    !list.stdout.split('\n').includes('./start.mjs') ||
    compare.status !== 0
  )
    fail('BACKUP_NOT_VERIFIED')
  let database
  try {
    if (!process.env.POSTGRES_URL) fail('MIGRATION_VERIFICATION_FAILED')
    const pg = await import(
      pathToFileURL(join(resolve(stageDir), 'node_modules/pg/lib/index.js'))
        .href
    )
    const checks = await import(
      pathToFileURL(
        join(resolve(stageDir), 'apps/server/dist/db/migration-checksums.js'),
      ).href
    )
    database = new pg.default.Client({
      connectionString: process.env.POSTGRES_URL,
    })
    await database.connect()
    await database.query('BEGIN READ ONLY')
    const identity = await database.query(
      "SELECT current_database() AS db, current_user=pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='public.users'::regclass",
    )
    if (identity.rows[0]?.db !== expectedDatabase || !identity.rows[0]?.owner)
      fail('MIGRATION_VERIFICATION_FAILED')
    const recorded = await database.query(
      'SELECT name,checksum FROM schema_migrations ORDER BY name',
    )
    if (
      recorded.rows.length !== m.targetManifest.migrations.length ||
      !m.targetManifest.migrations.every(
        (entry, i) =>
          recorded.rows[i].name === entry.name &&
          checks.isCompatibleMigrationChecksum(
            entry.name,
            recorded.rows[i].checksum,
            entry.sha256,
          ),
      )
    )
      fail('MIGRATION_VERIFICATION_FAILED')
    await database.query('COMMIT')
  } catch {
    fail('MIGRATION_VERIFICATION_FAILED')
  } finally {
    if (database) await database.end()
  }
  await assertStopped(liveDir)
  verifyBase({ liveDir, patchDir })
  verifyPrepared({ stageDir, patchDir })
  const switched = spawnSync(
    'python3',
    [
      join(dirname(fileURLToPath(import.meta.url)), 'exchange-dirs.py'),
      resolve(liveDir),
      resolve(stageDir),
      '--verified-stopped-backed-up-and-migrated',
    ],
    { encoding: 'utf8' },
  )
  if (switched.status !== 0)
    fail('ATOMIC_EXCHANGE_FAILED_NO_AUTOMATIC_ROLLBACK')
  verifyPrepared({ stageDir: liveDir, patchDir })
  return m
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const [command, ...args] = process.argv.slice(2)
    const options = Object.fromEntries(
      args
        .map((arg, i) =>
          i % 2 === 0 ? [arg.replace(/^--/, ''), args[i + 1]] : [],
        )
        .filter((p) => p.length),
    )
    let result
    if (command === 'create')
      result = createPatch({
        baseDir: options.base,
        targetDir: options.target,
        patchDir: options.output,
        migrationApproval: options['migration-approval']
          ? JSON.parse(readFileSync(options['migration-approval'], 'utf8'))
          : undefined,
      })
    else if (command === 'prepare')
      result = await preparePatch({
        liveDir: options.live,
        patchDir: options.patch,
        stageDir: options.stage,
      })
    else if (command === 'verify-base')
      result = verifyBase({ liveDir: options.live, patchDir: options.patch })
    else if (command === 'verify-target')
      result = verifyPrepared({
        stageDir: options.stage,
        patchDir: options.patch,
      })
    else if (command === 'activate')
      result = await activatePatch({
        liveDir: options.live,
        patchDir: options.patch,
        stageDir: options.stage,
        backupDir: options.backup,
      })
    else fail('USAGE: create|verify-base|prepare|verify-target --named paths')
    console.log(
      JSON.stringify({
        status: 'PASS',
        baseSha: result.baseSha,
        targetSha: result.targetSha,
        newMigrations: result.newMigrations,
      }),
    )
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

// Run inside the Ubuntu 24.04 proof container. Paths must be extracted, verified
// complete releases; POSTGRES_URL must identify a disposable test cluster owner.
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn, execFileSync } from 'node:child_process'
import http from 'node:http'
import https from 'node:https'
import { once } from 'node:events'
import {
  createPatch,
  preparePatch,
  verifyPrepared,
  activatePatch,
} from '../../deploy/baota/server-patch.mjs'

assert.equal(
  process.env.HONSEN_PATCH_ISOLATED_TEST,
  '1',
  'isolated opt-in required',
)
assert.match(readFileSync('/etc/os-release', 'utf8'), /VERSION_ID="24\.04"/)
assert.equal(process.platform, 'linux')
assert.equal(process.version, 'v24.22.1')
assert.match(
  execFileSync('pg_dump', ['--version'], { encoding: 'utf8' }),
  /\b16\./,
)
assert.match(
  execFileSync('pg_restore', ['--version'], { encoding: 'utf8' }),
  /\b16\./,
)
execFileSync('python3', ['--version'], { stdio: 'pipe' })
execFileSync('tar', ['--version'], { stdio: 'pipe' })
const [baseDir, targetDir, workDir, suppliedPatchDir] = process.argv
  .slice(2)
  .map((p) => resolve(p))
assert.ok(baseDir && targetDir && workDir)
const load = (p) => import(pathToFileURL(join(baseDir, p)).href)
const { default: pg } = await load('node_modules/pg/lib/index.js')
const { formalShortCode } = await load('apps/server/dist/sync/formal-issue.js')
const controlUrl =
  process.env.POSTGRES_URL ??
  (() => {
    const url = new URL('postgresql://postgres-test:5432/postgres')
    url.username = process.env.POSTGRES_TEST_USER
    url.password = process.env.POSTGRES_TEST_PASSWORD
    url.pathname = '/' + process.env.POSTGRES_TEST_DATABASE
    return url.toString()
  })()
const control = new pg.Pool({ connectionString: controlUrl })
const database = 'patch_' + randomUUID().replaceAll('-', '')
const role = 'patchruntime' + randomUUID().replaceAll('-', '')
const ownerUrl = new URL(controlUrl)
ownerUrl.pathname = '/' + database
const runtimeUrl = new URL(ownerUrl)
runtimeUrl.username = role
runtimeUrl.password = randomUUID()
const bootstrapPassword = randomUUID()
const results = []
let owner,
  app,
  proxy,
  stage = 'setup'
const liveDir = join(workDir, 'live'),
  stageDir = join(workDir, 'prepared'),
  patchDir = suppliedPatchDir ?? join(workDir, 'patch')
const digest = (b) => createHash('sha256').update(b).digest('hex')
async function stop() {
  if (!app) return
  const child = app
  app = undefined
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = once(child, 'exit')
  child.kill('SIGTERM')
  await Promise.race([
    exited,
    new Promise((_, reject) =>
      setTimeout(() => reject(Error('API_STOP_TIMEOUT')), 10000).unref(),
    ),
  ])
}
async function start(dir) {
  const env = { ...process.env }
  delete env.POSTGRES_URL
  // No COS secrets inherited into this isolated fixture.
  for (const key of Object.keys(env)) if (/^COS_/.test(key)) delete env[key]
  app = spawn(process.execPath, ['start.mjs'], {
    cwd: dir,
    env,
    stdio: 'ignore',
  })
  for (let attempt = 0; attempt < 100; attempt++) {
    if (app.exitCode !== null) throw Error('API_START_FAILED')
    try {
      const response = await fetch('http://127.0.0.1:3000/api/auth/captcha')
      if (response.ok) return
    } catch {
      /* bounded readiness retry */
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw Error('API_START_TIMEOUT')
}
try {
  mkdirSync(workDir, { recursive: true })
  if (!suppliedPatchDir) createPatch({ baseDir, targetDir, patchDir })
  cpSync(baseDir, liveDir, {
    recursive: true,
    preserveTimestamps: true,
    dereference: false,
    verbatimSymlinks: true,
  })
  await control.query('CREATE DATABASE ' + database)
  owner = new pg.Pool({ connectionString: ownerUrl.toString() })
  const postgresVersion = (await owner.query('SHOW server_version')).rows[0]
    .server_version
  const migrate = (dir) =>
    execFileSync(process.execPath, ['apps/server/dist/db/migrate.js'], {
      cwd: dir,
      env: { ...process.env, POSTGRES_URL: ownerUrl.toString() },
      stdio: 'pipe',
    })
  migrate(liveDir)
  execFileSync(process.execPath, ['apps/server/dist/scripts/bootstrap-v1.js'], {
    cwd: liveDir,
    env: { ...process.env, POSTGRES_URL: ownerUrl.toString() },
    input: bootstrapPassword + '\n',
    stdio: 'pipe',
  })
  await owner.query(
    `CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${runtimeUrl.password}'`,
  )
  await owner.query(
    readFileSync(
      join(liveDir, 'deploy/baota/runtime-grants.sql'),
      'utf8',
    ).replaceAll(':"runtime_role"', `"${role}"`),
  )
  writeFileSync(join(liveDir, '.env'), 'POSTGRES_URL=' + runtimeUrl + '\n', {
    mode: 0o600,
  })
  writeFileSync(
    join(liveDir, 'local-preserved-marker'),
    'isolated local data\n',
  )
  const envHash = digest(readFileSync(join(liveDir, '.env')))
  const cert = join(workDir, 'cert.pem'),
    key = join(workDir, 'key.pem')
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost',
    ],
    { stdio: 'ignore' },
  )
  proxy = https.createServer(
    { key: readFileSync(key), cert: readFileSync(cert) },
    (req, res) => {
      const upstream = http.request(
        {
          hostname: '127.0.0.1',
          port: 3000,
          path: req.url.replace(/^\/v1/, ''),
          method: req.method,
          headers: req.headers,
        },
        (r) => {
          res.writeHead(r.statusCode, r.headers)
          r.pipe(res)
        },
      )
      upstream.on('error', () => {
        res.writeHead(502)
        res.end('{}')
      })
      req.pipe(upstream)
    },
  )
  await new Promise((r) => proxy.listen(3443, '127.0.0.1', r))
  const request = (method, path, session, body) =>
    new Promise((done, reject) => {
      stage = method + ' ' + path.split('?')[0]
      const req = https.request(
        {
          hostname: '127.0.0.1',
          servername: 'localhost',
          port: 3443,
          path: '/v1' + path,
          method,
          ca: readFileSync(cert),
          headers: {
            'content-type': 'application/json',
            'x-installation-id': session?.installation ?? randomUUID(),
            ...(session?.accessToken
              ? { authorization: 'Bearer ' + session.accessToken }
              : {}),
          },
        },
        (res) => {
          let text = ''
          res.on('data', (c) => {
            text += c
          })
          res.on('end', () => {
            try {
              done({ status: res.statusCode, body: JSON.parse(text) })
            } catch {
              reject(Error('INVALID_JSON'))
            }
          })
        },
      )
      req.on('error', reject)
      req.end(body ? JSON.stringify(body) : undefined)
    })
  async function login(username, password, installation = randomUUID()) {
    const captcha = await request('GET', '/api/auth/captcha')
    assert.equal(captcha.status, 200)
    const nums = captcha.body.question.match(/\d+/g).map(Number)
    const response = await request(
      'POST',
      '/api/auth/login',
      { installation },
      {
        username,
        password,
        captchaId: captcha.body.id,
        captchaAnswer: String(nums[0] + nums[1]),
      },
    )
    assert.equal(response.status, 200)
    return { ...response.body, installation }
  }
  async function pull(session) {
    const changes = []
    let cursor = '0'
    for (let page = 0; page < 100; page++) {
      const response = await request(
        'GET',
        '/api/sync/pull?cursor=' + cursor + '&limit=500',
        session,
      )
      assert.equal(response.status, 200)
      changes.push(...response.body.changes)
      if (
        response.body.nextCursor === cursor ||
        response.body.changes.length === 0
      )
        return changes
      cursor = response.body.nextCursor
    }
    throw Error('PULL_PAGE_BOUND')
  }
  const push = async (session, event) => {
    const response = await request('POST', '/api/sync/push', session, {
      deviceId: session.installation,
      events: [event],
    })
    assert.equal(response.status, 200)
    return response.body.results[0]
  }
  await start(liveDir)
  const admin = await login('ADMIN', bootstrapPassword)
  const initial = await pull(admin)
  const project = initial.find(
    (c) =>
      c.entityType === 'project' &&
      (c.payload.business_code ?? c.payload.businessCode) === 'BETHEL2',
  )
  assert.ok(project, 'bootstrap project must be available through Pull')
  const countryId = project.payload.country_id ?? project.payload.countryId
  const country = initial.find(
    (c) => c.entityType === 'country' && c.entityId === countryId,
  )
  assert.ok(country)
  const departmentId = randomUUID(),
    teamId = randomUUID()
  for (const record of [
    {
      id: departmentId,
      kind: 'department',
      businessCode: 'PATCHDEP',
      name: 'Synthetic patch department',
      isActive: true,
    },
    {
      id: teamId,
      kind: 'team',
      departmentId,
      businessCode: 'PATCHTEAM',
      name: 'Synthetic patch team',
      isActive: true,
    },
  ])
    assert.equal(
      (await request('PUT', '/api/master-data/reference', admin, record))
        .status,
      200,
    )
  const scope = { projectId: project.entityId, departmentId, teamId }
  const actors = []
  for (const [username, roles] of [
    ['PatchBuyer', ['purchaser']],
    ['PatchRequester', ['engineer']],
  ]) {
    const temporaryPassword = randomUUID(),
      password = randomUUID()
    const created = await request('POST', '/api/accounts', admin, {
      username,
      displayName: 'Synthetic ' + username,
      roles,
      temporaryPassword,
      uiLocale: 'en-US',
      employeePhotoKey: 'builtin:default-avatar:v1',
      scope,
    })
    assert.equal(created.status, 201)
    const temporary = await login(username, temporaryPassword)
    assert.equal(
      (
        await request('POST', '/api/auth/change-password', temporary, {
          currentPassword: temporaryPassword,
          newPassword: password,
        })
      ).status,
      200,
    )
    actors.push({ ...(await login(username, password)), password })
  }
  let [buyer, requester] = actors
  const orderId = randomUUID(),
    now = Math.floor(Date.now() / 1000),
    date = new Date().toISOString().slice(0, 10)
  const approved = {
    countryId,
    ...scope,
    applicantId: requester.user.id,
    parentOrderId: null,
    procurementMode: 'honsen_self_purchase',
    workflowStatus: 'approved',
    confirmedBy: buyer.user.id,
    confirmedAt: now,
    selfApproved: false,
    primaryCurrency: 'XOF',
    orderDate: date,
    lines: [
      {
        id: randomUUID(),
        currency: 'XOF',
        quantity: '2',
        unit: 'pcs',
        unitPriceMinor: '1250',
        lineTotalMinor: '2500',
        priceSource: 'manual',
      },
    ],
  }
  const event = (payload, baseVersion) => ({
    eventId: randomUUID(),
    entityType: 'purchase_order',
    entityId: orderId,
    operation: 'upsert',
    baseVersion,
    payload,
  })
  assert.equal(
    (
      await push(
        requester,
        event(
          {
            ...approved,
            workflowStatus: 'pending_confirmation',
            confirmedBy: null,
            confirmedAt: null,
          },
          0,
        ),
      )
    ).status,
    'accepted',
  )
  assert.equal((await push(buyer, event(approved, 1))).status, 'accepted')
  const issued = {
    ...approved,
    workflowStatus: 'executing',
    documentType: 'HPA',
    formalDocumentNo: `${country.payload.business_code ?? country.payload.businessCode}-BETHEL2-${date.replaceAll('-', '')}-HPA-${formalShortCode(buyer.installation)}-1`,
    formalInstallationId: buyer.installation,
    formalSequence: '1',
    formallyIssuedAt: now,
    formalSnapshotJson: JSON.stringify(approved),
  }
  const issueEvent = event(issued, 2)
  const acknowledgement = await push(buyer, issueEvent)
  assert.equal(acknowledgement.status, 'accepted')
  const before = (await pull(requester)).filter((c) => c.entityId === orderId)
  assert.ok(
    before.some(
      (c) => c.payload.formalSnapshotJson === issued.formalSnapshotJson,
    ),
  )
  assert.equal(
    (await request('POST', '/api/attachments/prepare', buyer, {})).status,
    503,
  )
  results.push('BASE_BOOTSTRAP_ONCE_AND_HTTPS_TWO_ACTOR_FORMAL_HPA_PASS')
  const migrationBefore = (
    await owner.query(
      'SELECT name,checksum FROM schema_migrations ORDER BY name',
    )
  ).rows
  await assert.rejects(
    preparePatch({ liveDir, patchDir, stageDir, checkStopped: true }),
    { message: 'API_RUNNING' },
  )
  await stop()
  stage = 'prepare-patch-stopped'
  await preparePatch({ liveDir, patchDir, stageDir, checkStopped: true })
  verifyPrepared({ stageDir, patchDir })
  assert.equal(digest(readFileSync(join(stageDir, '.env'))), envHash)
  assert.equal(
    readFileSync(join(stageDir, 'local-preserved-marker'), 'utf8'),
    'isolated local data\n',
  )
  migrate(stageDir) // Incremental only. Never seed TARGET.
  assert.deepEqual(
    (
      await owner.query(
        'SELECT name,checksum FROM schema_migrations ORDER BY name',
      )
    ).rows,
    migrationBefore,
  )
  stage = 'backup-and-atomic-activate'
  const backupDir = join(workDir, 'backup')
  mkdirSync(backupDir)
  const dumpEnv = {
    ...process.env,
    PGHOST: ownerUrl.hostname,
    PGPORT: ownerUrl.port || '5432',
    PGUSER: decodeURIComponent(ownerUrl.username),
    PGPASSWORD: decodeURIComponent(ownerUrl.password),
    PGDATABASE: database,
  }
  execFileSync(
    'pg_dump',
    ['--format=custom', '--file', join(backupDir, 'database.dump')],
    { env: dumpEnv, stdio: 'pipe' },
  )
  execFileSync(
    'tar',
    [
      '--create',
      '--file',
      join(backupDir, 'application.tar'),
      '--directory',
      liveDir,
      '.',
    ],
    { stdio: 'pipe' },
  )
  const backupSums = ['database.dump', 'application.tar']
    .map((name) => `${digest(readFileSync(join(backupDir, name)))}  ${name}\n`)
    .join('')
  writeFileSync(join(backupDir, 'SHA256SUMS'), backupSums)
  const oldPostgresUrl = process.env.POSTGRES_URL
  try {
    process.env.POSTGRES_URL = ownerUrl.toString()
    await activatePatch({
      liveDir,
      stageDir,
      patchDir,
      backupDir,
      expectedDatabase: database,
    })
  } finally {
    if (oldPostgresUrl === undefined) delete process.env.POSTGRES_URL
    else process.env.POSTGRES_URL = oldPostgresUrl
  }
  assert.equal(
    JSON.parse(readFileSync(join(liveDir, 'build-manifest.json'))).sourceSha,
    JSON.parse(readFileSync(join(targetDir, 'build-manifest.json'))).sourceSha,
  )
  assert.equal(
    JSON.parse(readFileSync(join(stageDir, 'build-manifest.json'))).sourceSha,
    JSON.parse(readFileSync(join(baseDir, 'build-manifest.json'))).sourceSha,
  )
  assert.equal(digest(readFileSync(join(liveDir, '.env'))), envHash)
  await start(liveDir)
  assert.deepEqual(
    (await pull(requester)).filter((c) => c.entityId === orderId),
    before,
  )
  assert.deepEqual(await push(buyer, issueEvent), acknowledgement)
  const replacement = await login(
    buyer.user.username.toLowerCase(),
    buyer.password,
    buyer.installation,
  )
  assert.equal(replacement.user.id, buyer.user.id)
  buyer = { ...replacement, password: buyer.password }
  const tamper = event(
    { ...issued, lines: [{ ...issued.lines[0], unitPriceMinor: '999' }] },
    acknowledgement.serverVersion,
  )
  assert.notEqual((await push(buyer, tamper)).status, 'accepted')
  assert.deepEqual(
    (await pull(requester)).filter((c) => c.entityId === orderId),
    before,
  )
  assert.equal(
    (await request('POST', '/api/attachments/prepare', buyer, {})).status,
    503,
  )
  const receiving = event(
    { ...issued, workflowStatus: 'receiving' },
    acknowledgement.serverVersion,
  )
  assert.equal((await push(requester, receiving)).status === 'accepted', false)
  const receiveAck = await push(buyer, { ...receiving, eventId: randomUUID() })
  assert.equal(receiveAck.status, 'accepted')
  assert.ok(
    (await pull(requester)).some(
      (c) =>
        c.entityId === orderId &&
        c.payload.workflowStatus === 'receiving' &&
        c.payload.formalSnapshotJson === issued.formalSnapshotJson,
    ),
  )
  results.push(
    'STOPPED_PREPARE_TARGET_INVENTORY_ENV_LOCAL_DATA_PASS',
    'INCREMENTAL_MIGRATION_NO_RESEED_PASS',
    'REAL_DUMP_TAR_VERIFICATION_AND_LINUX_ATOMIC_ACTIVATE_PASS',
    'PERSISTED_SESSION_ORDER_HISTORY_RELOGIN_IDEMPOTENCY_AND_IMMUTABILITY_PASS',
    'COS_UPLOAD_DOWNLOAD_SHA256_NOT_RUN_NO_DEDICATED_CONFIGURATION',
    'NATIVE_SQLITE_CLIENTS_PDF_PAYMENTS_NOT_RUN_OUTSIDE_PATCH_SLICE',
  )
  console.log(
    JSON.stringify({
      scope: 'ISOLATED_UBUNTU24_PACKAGED_RUNTIME_NOT_STAGING',
      node: process.version,
      postgres: postgresVersion,
      patchSource: suppliedPatchDir
        ? 'EXTRACTED_PATCH_ZIP'
        : 'DIRECT_CORE_API_NOT_ARCHIVE_ACCEPTANCE',
      baseSha: JSON.parse(readFileSync(join(baseDir, 'build-manifest.json')))
        .sourceSha,
      targetSha: JSON.parse(
        readFileSync(join(targetDir, 'build-manifest.json')),
      ).sourceSha,
      results,
      credentialsLogged: false,
    }),
  )
} catch (error) {
  // Never print subprocess output, URL, request payload, token, or assertion data.
  console.error(
    JSON.stringify({
      scope: 'ISOLATED_UBUNTU24_PACKAGED_RUNTIME_NOT_STAGING',
      stage,
      results,
      failure:
        error instanceof assert.AssertionError
          ? 'ASSERTION_FAILED'
          : /^[A-Z_]+$/.test(error.message)
            ? error.message
            : error.name,
    }),
  )
  process.exitCode = 1
} finally {
  await stop()
  if (proxy) await new Promise((r) => proxy.close(r))
  if (owner) await owner.end()
  await control.query('DROP DATABASE IF EXISTS ' + database + ' WITH (FORCE)')
  await control.query('DROP ROLE IF EXISTS ' + role)
  await control.end()
  // Remove only files this run created. Retain packages and test evidence.
  for (const file of [
    join(liveDir, '.env'),
    join(stageDir, '.env'),
    join(workDir, 'key.pem'),
    join(workDir, 'cert.pem'),
    join(workDir, 'backup/database.dump'),
    join(workDir, 'backup/application.tar'),
  ])
    rmSync(file, { force: true })
}

// Run inside the Ubuntu 24.04 proof container. Paths must be extracted, verified
// complete releases; POSTGRES_URL must identify a disposable test cluster owner.
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import {
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  symlinkSync,
} from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn, execFileSync } from 'node:child_process'
import http from 'node:http'
import https from 'node:https'
import { once } from 'node:events'

assert.equal(
  process.env.HONSEN_UPGRADE_ISOLATED_TEST,
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
const args = process.argv.slice(2)
assert.equal(args.length, 4, 'BASE TARGET NEW_WORKDIR FIELD_START required')
const [baseDir, targetDir, workDir, fieldStart] = args.map((p) => resolve(p))
for (const a of [baseDir, targetDir])
  assert.ok(
    workDir !== a &&
      !workDir.startsWith(a + '/') &&
      !a.startsWith(workDir + '/'),
    'work must not overlap releases',
  )
assert.ok(!existsSync(workDir), 'work directory must be new')
const fieldStartHash =
  'dd3c4406fdc456f565529ff6640a99c17756c17c16630b503df2666f695e469b'
assert.equal(
  createHash('sha256').update(readFileSync(fieldStart)).digest('hex'),
  fieldStartHash,
)
const fieldEnvDir = '/www/wwwroot/api-pr/v1'
assert.ok(!existsSync(fieldEnvDir), 'isolated field env path must be absent')
mkdirSync(fieldEnvDir, { recursive: true })
const fieldEnv = join(fieldEnvDir, '.env')
const load = (p) => import(pathToFileURL(join(baseDir, p)).href)
assert.equal(
  JSON.parse(readFileSync(join(baseDir, 'build-manifest.json'), 'utf8'))
    .sourceSha,
  '6b18850ee2e426fb68ac138fef866c4e4c718954',
)
for (const dir of [baseDir, targetDir])
  execFileSync('sha256sum', ['--check', 'SHA256SUMS'], {
    cwd: dir,
    stdio: 'pipe',
  })
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
// The CLI intentionally fixes the production database name. This fixture uses
// that name ONLY in the shell's fresh private Compose network/cluster.
assert.equal(new URL(controlUrl).hostname, 'postgres-test')
assert.equal(new URL(controlUrl).port || '5432', '5432')
const database = 'honsen_procure'
assert.notEqual(new URL(controlUrl).pathname, '/' + database)
const role = 'upgraderuntime' + randomUUID().replaceAll('-', '')
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
  databaseCreated = false,
  roleCreated = false,
  stage = 'setup'
const liveDir = join(workDir, 'live'),
  stageDir = join(workDir, 'complete-target')
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
  rmSync(fieldEnv, { force: true })
  symlinkSync(join(dir, '.env'), fieldEnv)
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
  cpSync(baseDir, liveDir, {
    recursive: true,
    preserveTimestamps: true,
    dereference: false,
    verbatimSymlinks: true,
  })
  cpSync(fieldStart, join(liveDir, 'start.mjs'))
  await control.query('CREATE DATABASE ' + database)
  databaseCreated = true
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
  roleCreated = true
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
      req.setTimeout(10000, () => req.destroy(Error('HTTPS_REQUEST_TIMEOUT')))
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
  const admin = await login('admin', bootstrapPassword)
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
      businessCode: 'UPGRADEDEP',
      name: 'Synthetic upgrade department',
      isActive: true,
    },
    {
      id: teamId,
      kind: 'team',
      departmentId,
      businessCode: 'UPGRADETEAM',
      name: 'Synthetic upgrade team',
      isActive: true,
    },
  ])
    assert.equal(
      (await request('PUT', '/api/master-data/reference', admin, record))
        .status,
      200,
    )
  const scope = { projectId: project.entityId, departmentId, teamId }
  // BASE has no account creation API: this scaffold is owner-only and exists
  // solely in this freshly CREATED disposable database, never a remote database.
  assert.equal(
    (await request('GET', '/api/accounts?username=LegacyBuyer', admin)).status,
    404,
  )
  const { default: argon2 } = await load('node_modules/argon2/argon2.cjs')
  const actors = []
  stage = 'BASE_OWNER_AUTH_FIXTURE'
  for (const [username, roles] of [
    ['LegacyBuyer', ['purchaser']],
    ['历史申请人', ['engineer']],
  ]) {
    const id = randomUUID(),
      password = randomUUID()
    await owner.query(
      "INSERT INTO users(id,business_code,username,password_hash,ui_locale,requires_password_change) VALUES($1::uuid,$1::text,$2,$3,'en-US',FALSE)",
      [id, username, await argon2.hash(password, { type: argon2.argon2id })],
    )
    for (const role of roles)
      await owner.query('INSERT INTO user_roles(user_id,role) VALUES($1,$2)', [
        id,
        role,
      ])
    await owner.query(
      'INSERT INTO user_project_bindings(user_id,project_id) VALUES($1,$2)',
      [id, scope.projectId],
    )
    await owner.query(
      'INSERT INTO user_project_scope_bindings(user_id,project_id,department_id,team_id) VALUES($1,$2,$3,$4)',
      [id, scope.projectId, departmentId, teamId],
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
  const identityBefore = (
    await owner.query(
      'SELECT id,username,password_hash,employee_photo_key,ui_locale,is_enabled FROM users ORDER BY id',
    )
  ).rows
  const rolesBefore = (
    await owner.query(
      'SELECT user_id,role FROM user_roles ORDER BY user_id,role',
    )
  ).rows
  const auditBefore = (
    await owner.query('SELECT * FROM audit_entries ORDER BY id')
  ).rows
  const preservedTables = [
    'user_project_bindings',
    'user_project_scope_bindings',
    'sync_entities',
    'sync_events',
    'server_change_log',
    'formal_issue_registry',
  ]
  const historySnapshot = async () =>
    Object.fromEntries(
      await Promise.all(
        preservedTables.map(async (table) => [
          table,
          (
            await owner.query(
              `SELECT to_jsonb(t)::text AS row FROM ${table} t ORDER BY to_jsonb(t)::text`,
            )
          ).rows,
        ]),
      ),
    )
  const historyBefore = await historySnapshot()
  await stop()
  stage = 'backup-before-full-upgrade'
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
  assert.match(
    execFileSync('pg_restore', ['--list', join(backupDir, 'database.dump')], {
      encoding: 'utf8',
    }),
    /TABLE DATA/,
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
  execFileSync(
    'tar',
    [
      '--compare',
      '--file',
      join(backupDir, 'application.tar'),
      '--directory',
      liveDir,
    ],
    { stdio: 'pipe' },
  )
  writeFileSync(
    join(backupDir, 'SHA256SUMS'),
    ['database.dump', 'application.tar']
      .map(
        (name) =>
          digest(readFileSync(join(backupDir, name))) + '  ' + name + '\n',
      )
      .join(''),
  )
  stage = 'complete-target-copy-incremental-migrate-no-seed'
  cpSync(targetDir, stageDir, {
    recursive: true,
    preserveTimestamps: true,
    dereference: false,
    verbatimSymlinks: true,
  })
  stage = 'TARGET_FULL_CHECKSUM_BEFORE_FIELD_START'
  execFileSync('sha256sum', ['--check', 'SHA256SUMS'], {
    cwd: stageDir,
    stdio: 'pipe',
  })
  cpSync(fieldStart, join(stageDir, 'start.mjs'))
  assert.equal(
    digest(readFileSync(join(stageDir, 'start.mjs'))),
    fieldStartHash,
  )
  cpSync(join(liveDir, '.env'), join(stageDir, '.env'))
  cpSync(
    join(liveDir, 'local-preserved-marker'),
    join(stageDir, 'local-preserved-marker'),
  )
  const grantEnv = {
    ...process.env,
    POSTGRES_URL: ownerUrl.toString(),
    NEW_ROLE: role,
    MIGRATION_OBJECT_SNAPSHOT: join(workDir, 'migration-object-snapshot.json'),
  }
  const grant = (args) =>
    execFileSync(process.execPath, ['deploy/linux/grant-api.cjs', ...args], {
      cwd: stageDir,
      env: grantEnv,
      stdio: 'pipe',
    })
  stage = 'GRANT_OBJECT_SNAPSHOT'
  // Match the documented controlled upgrade: stopped API and runtime NOLOGIN
  // are required fences. Preserve the role identity and password throughout.
  await owner.query(`ALTER ROLE "${role}" NOLOGIN`)
  grant(['--snapshot'])
  stage = 'TARGET_INCREMENTAL_MIGRATION'
  migrate(stageDir) // TARGET is NEVER bootstrapped or seeded.
  stage = 'GRANT_POLICY_APPLY'
  grant([])
  stage = 'GRANT_POLICY_CHECK'
  grant(['--check'])
  await owner.query(`ALTER ROLE "${role}" LOGIN`)
  stage = 'UPGRADE_HISTORY_COMPARISON'
  const migrationAfter = (
    await owner.query(
      'SELECT name,checksum FROM schema_migrations ORDER BY name',
    )
  ).rows
  assert.deepEqual(
    migrationAfter.slice(0, migrationBefore.length),
    migrationBefore,
  )
  assert.deepEqual(
    migrationAfter.slice(migrationBefore.length).map((x) => x.name),
    ['015_protected_admin.sql', '016_account_identity.sql'],
  )
  assert.deepEqual(
    (
      await owner.query(
        'SELECT id,username,password_hash,employee_photo_key,ui_locale,is_enabled FROM users ORDER BY id',
      )
    ).rows,
    identityBefore,
  )
  assert.deepEqual(
    (
      await owner.query(
        'SELECT user_id,role FROM user_roles ORDER BY user_id,role',
      )
    ).rows,
    rolesBefore,
  )
  for (const entry of auditBefore)
    assert.deepEqual(
      (await owner.query('SELECT * FROM audit_entries WHERE id=$1', [entry.id]))
        .rows[0],
      entry,
    )
  assert.deepEqual(await historySnapshot(), historyBefore)
  assert.equal(digest(readFileSync(join(stageDir, '.env'))), envHash)
  for (const entry of readFileSync(join(targetDir, 'SHA256SUMS'), 'utf8')
    .trim()
    .split('\n')) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(entry)
    assert.ok(match)
    const name = match[2].replace(/^\.\//, '')
    assert.ok(!name.startsWith('/') && !name.split('/').includes('..'))
    if (name === 'start.mjs') continue // Explicit user-owned protected field entry.
    assert.equal(digest(readFileSync(join(stageDir, name))), match[1])
  }
  assert.equal(
    digest(readFileSync(join(stageDir, 'start.mjs'))),
    fieldStartHash,
  )

  assert.equal(
    readFileSync(join(stageDir, 'local-preserved-marker'), 'utf8'),
    'isolated local data\n',
  )
  await start(stageDir)
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
  stage = 'target-accounts-created-through-https-only'
  const targetAdmin = await login('ADMIN', bootstrapPassword)
  for (const [username, displayName, roles] of [
    ['Zhanghekai', '张和凯', ['administrator', 'purchaser']],
    ['ceshi1', '测试1', ['engineer']],
  ]) {
    const temporaryPassword = randomUUID(),
      password = randomUUID()
    const created = await request('POST', '/api/accounts', targetAdmin, {
      username,
      displayName,
      roles,
      temporaryPassword,
      uiLocale: 'zh-CN',
      employeePhotoKey: 'builtin:default-avatar:v1',
      scope,
    })
    assert.equal(created.status, 201)
    const first = await login(username, temporaryPassword)
    assert.equal(
      (await request('GET', '/api/sync/pull?cursor=0&limit=100', first)).status,
      403,
    )
    assert.equal(
      (
        await request('POST', '/api/auth/change-password', first, {
          currentPassword: temporaryPassword,
          newPassword: password,
        })
      ).status,
      200,
    )
    const signed = await login(username.toLowerCase(), password)
    assert.equal(signed.user.id, created.body.id)
    assert.equal(signed.user.displayName, displayName)
    assert.ok(
      (await pull(signed)).some((change) => change.entityId === orderId),
    )
  }
  results.push(
    'FULL_TARGET_CHECKSUM_AND_EXACT_START_ENV_PRESERVATION_PASS',
    'BASE_MIGRATE_BOOTSTRAP_ONCE_TARGET_015_016_NO_SEED_PASS',
    'PG_DUMP_LIST_TAR_COMPARE_PASS',
    'ALL_LEGACY_ID_PASSWORD_HASH_ROLES_AUDIT_UNCHANGED_PASS',
    'HTTPS_NEW_ACCOUNTS_FORCE_PASSWORD_CHANGE_AND_CASEFOLD_PASS',
    'FORMAL_HISTORY_IMMUTABILITY_IDEMPOTENCY_TWO_ACTOR_HTTPS_PASS',
    'COS_NATIVE_SQLITE_PDF_PAYMENTS_NOT_RUN',
  )
  console.log(
    JSON.stringify({
      scope: 'ISOLATED_UBUNTU24_PACKAGED_RUNTIME_NOT_STAGING',
      node: process.version,
      postgres: postgresVersion,
      deploymentMode: 'COMPLETE_TARGET_COPY_NOT_PATCH',
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
      databaseCode: /^[A-Z0-9]{5}$/.test(error.code ?? '')
        ? error.code
        : undefined,
      subprocessExit: Number.isInteger(error.status) ? error.status : undefined,
    }),
  )
  process.exitCode = 1
} finally {
  try {
    await stop()
    if (proxy) await new Promise((r) => proxy.close(r))
    if (owner) await owner.end()
    if (databaseCreated) {
      const deadline = Date.now() + 5000
      while (true) {
        const { rows } = await control.query(
          'SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1',
          [database],
        )
        if (rows[0].count === 0) break
        if (Date.now() > deadline)
          throw Error('DATABASE_CONNECTIONS_NOT_DRAINED')
        await new Promise((r) => setTimeout(r, 50))
      }
      await control.query('DROP DATABASE ' + database)
    }
    if (roleCreated) await control.query('DROP ROLE ' + role)
    await control.end()
  } finally {
    rmSync(fieldEnv, { force: true })
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
}

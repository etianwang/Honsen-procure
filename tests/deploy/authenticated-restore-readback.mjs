import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

if (process.env.HONSEN_DEPLOY_TEST !== '1')
  throw new Error('Disposable test only')
if (!existsSync('/.dockerenv'))
  throw new Error('Isolated Docker container required')
const expectedSource = process.env.TEST_SOURCE_CLUSTER_ID
const expectedRestore = process.env.TEST_RESTORE_CLUSTER_ID
if (
  !/^\d+$/.test(expectedSource ?? '') ||
  !/^\d+$/.test(expectedRestore ?? '') ||
  expectedSource === expectedRestore
)
  throw new Error('Explicit distinct expected test cluster identities required')
const root = process.env.RUNTIME_ROOT
const output = process.env.TEST_EVIDENCE_DIR
if (!root || !output)
  throw new Error('Explicit isolated runtime and evidence paths required')
const require = createRequire(join(root, 'apps/server/package.json'))
const { Pool } = require('pg')
const argon2 = require('argon2')
const { runMigrations } = await import(
  pathToFileURL(join(root, 'apps/server/src/db/migration-runner.ts'))
)
const shared = await import(
  pathToFileURL(join(root, 'packages/shared/src/index.ts'))
)
const source = new Pool({
  connectionString: 'postgresql://postgres@127.0.0.1:5432/postgres',
})
let server
let db
async function waitForOwnedChild(child, milliseconds) {
  if (child.exitCode !== null || child.signalCode !== null) return true
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      resolve(true)
    }
    const timer = setTimeout(() => {
      child.removeListener('exit', finish)
      resolve(false)
    }, milliseconds)
    child.once('exit', finish)
  })
}
try {
  const targetIdentity = new Pool({
    connectionString: 'postgresql://postgres@127.0.0.1:5433/postgres',
  })
  try {
    assert.equal(
      (
        await source.query(
          'SELECT system_identifier::text AS id FROM pg_control_system()',
        )
      ).rows[0].id,
      expectedSource,
      'Source cluster identity mismatch',
    )
    assert.equal(
      (
        await targetIdentity.query(
          'SELECT system_identifier::text AS id FROM pg_control_system()',
        )
      ).rows[0].id,
      expectedRestore,
      'Restore cluster identity mismatch',
    )
  } finally {
    await targetIdentity.end()
  }
  await source.query('CREATE DATABASE honsen_authenticated_restore_source')
  db = new Pool({
    connectionString:
      'postgresql://postgres@127.0.0.1:5432/honsen_authenticated_restore_source',
  })
  await runMigrations(db)
  const client = await db.connect()
  let order
  try {
    const modelSql = execFileSync(
      process.execPath,
      ['--import=tsx', join(root, 'tests/deploy/business-restore-model.mjs')],
      { cwd: root, encoding: 'utf8' },
    )
    await client.query(modelSql)
    order = (await client.query('SELECT payload FROM restore_payload')).rows[0]
      .payload
  } finally {
    client.release()
  }
  const actor = order.applicantId
  // Never printed or written: only a one-run password hash enters the archive.
  const password = randomBytes(32).toString('base64url')
  const passwordHash = await argon2.hash(password)
  const username = 'synthetic-restored-purchaser'
  await db.query(
    "INSERT INTO users(id,business_code,username,password_hash,ui_locale,is_enabled,requires_password_change) VALUES($1,'RESTORE-ACTOR',$2,$3,'fr-FR',TRUE,FALSE)",
    [actor, username, passwordHash],
  )
  await db.query(
    "INSERT INTO user_roles(user_id,role) VALUES($1,'purchaser')",
    [actor],
  )
  await db.query(
    "INSERT INTO countries(id,business_code,name,time_zone) VALUES($1,'RESTORE-COUNTRY','Synthetic country','UTC')",
    [order.countryId],
  )
  await db.query(
    "INSERT INTO projects(id,country_id,business_code,name,site,department_name,default_currency,default_language_pair) VALUES($1,$2,'RESTORE-PROJECT','Synthetic project','site','department','XOF','zh_fr')",
    [order.projectId, order.countryId],
  )
  await db.query(
    "INSERT INTO departments(id,business_code,name) VALUES($1,'RESTORE-DEPARTMENT','Synthetic department')",
    [order.departmentId],
  )
  await db.query(
    "INSERT INTO teams(id,department_id,business_code,name) VALUES($1,$2,'RESTORE-TEAM','Synthetic team')",
    [order.teamId, order.departmentId],
  )
  await db.query(
    'INSERT INTO user_project_bindings(user_id,project_id) VALUES($1,$2)',
    [actor, order.projectId],
  )
  await db.query(
    'INSERT INTO user_project_scope_bindings(user_id,project_id,department_id,team_id) VALUES($1,$2,$3,$4)',
    [actor, order.projectId, order.departmentId, order.teamId],
  )
  const log = async (type, id, payload) => {
    await db.query(
      'INSERT INTO sync_entities(entity_type,entity_id,version,payload_json,updated_by) VALUES($1,$2,1,$3,$4)',
      [type, id, payload, actor],
    )
    await db.query(
      "INSERT INTO server_change_log(entity_type,entity_id,operation,version,payload_json,actor_id) VALUES($1,$2,'upsert',1,$3,$4)",
      [type, id, payload, actor],
    )
  }
  await log('purchase_order', order.parentOrderId, {
    ...JSON.parse(order.formalSnapshotJson),
    id: order.parentOrderId,
    parentOrderId: null,
    workflowStatus: 'approved',
    procurementMode: 'honsen_self_purchase',
  })
  await log('supplier', order.supplierId, {
    countryId: order.countryId,
    name: 'Synthetic supplier',
  })
  await log('purchase_order', order.id, order)
  await db.query(
    "INSERT INTO formal_issue_registry(order_id,document_type,formal_document_no,formal_installation_id,formal_sequence,formal_snapshot_json) VALUES($1,'SPO',$2,$3,1,$4)",
    [
      order.id,
      order.formalDocumentNo,
      order.formalInstallationId,
      JSON.parse(order.formalSnapshotJson),
    ],
  )
  const originalId = randomUUID(),
    reversalId = randomUUID()
  const payment = shared.procurementExpenditureSchema.parse({
    id: originalId,
    orderId: order.id,
    projectId: order.projectId,
    countryId: order.countryId,
    payeeName: 'Synthetic payee',
    currency: 'XOF',
    amountMinor: '300',
    paymentDate: '2026-11-04',
    paymentType: 'other',
    paymentMethod: 'cash',
    paymentHandlerId: actor,
    status: 'recorded',
    createdBy: actor,
    createdAt: 1,
  })
  const reversal = shared.procurementExpenditureSchema.parse({
    ...payment,
    id: reversalId,
    amountMinor: '50',
    status: 'reversed',
    correctsExpenditureId: originalId,
    correctionReason: 'Synthetic partial reversal',
    createdAt: 2,
  })
  for (const p of [payment, reversal]) {
    await db.query(
      'INSERT INTO procurement_expenditures(id,order_id,project_id,country_id,currency,amount_minor,status,corrects_expenditure_id,correction_reason,created_by,created_at,payload_json) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
      [
        p.id,
        p.orderId,
        p.projectId,
        p.countryId,
        p.currency,
        p.amountMinor,
        p.status,
        p.correctsExpenditureId ?? null,
        p.correctionReason ?? null,
        actor,
        p.createdAt,
        p,
      ],
    )
    await log('procurement_expenditure', p.id, p)
  }
  const attachment = shared.attachmentMetadataSchema.parse({
    id: randomUUID(),
    orderId: order.id,
    ownerType: 'procurement_expenditure',
    ownerId: originalId,
    originalName: 'synthetic-proof.pdf',
    contentType: 'application/pdf',
    byteLength: 10,
    checksum: 'a'.repeat(64),
    projectId: order.projectId,
    countryId: order.countryId,
    objectKey: 'synthetic-restore-reference/not-uploaded',
    versionId: null,
    status: 'uploaded',
    uploadedBy: actor,
    createdAt: 3,
  })
  await db.query(
    'INSERT INTO attachments(id,order_id,owner_type,owner_id,project_id,country_id,original_name,content_type,byte_length,checksum,object_key,status,uploaded_by,created_at,payload_json) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',
    [
      attachment.id,
      order.id,
      attachment.ownerType,
      attachment.ownerId,
      order.projectId,
      order.countryId,
      attachment.originalName,
      attachment.contentType,
      10,
      attachment.checksum,
      attachment.objectKey,
      'uploaded',
      actor,
      3,
      attachment,
    ],
  )
  await log('attachment', attachment.id, attachment)
  await db.end()
  db = undefined
  writeFileSync(join(output, 'authenticated-seed-ready'), 'ready\n')
  const deadline = Date.now() + 120000
  while (!existsSync(join(output, 'authenticated-restore-ready'))) {
    if (Date.now() > deadline) throw new Error('Restore controller timeout')
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  server = spawn(
    process.execPath,
    ['--import=tsx', 'apps/server/dist/index.js'],
    {
      cwd: root,
      env: {
        ...process.env,
        POSTGRES_URL:
          'postgresql://postgres@127.0.0.1:5433/honsen_authenticated_restored',
      },
      stdio: 'ignore',
    },
  )
  let captcha
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch('http://127.0.0.1:3000/api/auth/captcha')
      if (r.ok) {
        captcha = await r.json()
        break
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert(captcha, 'API startup failed')
  const numbers = captcha.question.match(/\d+/g).map(Number)
  const login = await fetch('http://127.0.0.1:3000/api/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-installation-id': randomUUID(),
    },
    body: JSON.stringify({
      username,
      password,
      captchaId: captcha.id,
      captchaAnswer: String(numbers[0] + numbers[1]),
    }),
  })
  assert.equal(login.status, 200, 'Restored password/CAPTCHA login failed')
  const session = await login.json()
  const response = await fetch(
    'http://127.0.0.1:3000/api/sync/pull?cursor=0&limit=100',
    { headers: { authorization: `Bearer ${session.accessToken}` } },
  )
  assert.equal(response.status, 200)
  const pulled = shared.syncPullResponseSchema.parse(await response.json())
  const found = pulled.changes.find((c) => c.entityId === order.id)
  assert.deepEqual(found?.payload, order)
  for (const p of [payment, reversal])
    assert.deepEqual(
      shared.procurementExpenditureSchema.parse(
        pulled.changes.find((c) => c.entityId === p.id)?.payload,
      ),
      p,
    )
  assert.deepEqual(
    shared.attachmentMetadataSchema.parse(
      pulled.changes.find((c) => c.entityId === attachment.id)?.payload,
    ),
    attachment,
  )
  const proof = {
    status: 'PASS',
    scope:
      'actual restored API password/CAPTCHA login and scoped SPO/payment/reversal/attachment-reference Pull; no object bytes, TLS or Windows native acceptance',
    loginStatus: login.status,
    pullStatus: response.status,
    formalNumberPreserved: true,
    frozenSnapshotPreserved: true,
    originalPaymentPreserved: true,
    reversalPreserved: true,
    netMinor: '250',
    attachmentReferencePreserved: true,
    secretsLogged: false,
    isolatedContainerVerified: true,
    expectedClusterIdsMatched: true,
  }
  writeFileSync(
    join(output, 'authenticated-restore-result.json'),
    JSON.stringify(proof, null, 2) + '\n',
  )
  console.log(JSON.stringify(proof))
} finally {
  if (server) {
    if (server.exitCode === null && server.signalCode === null)
      server.kill('SIGTERM')
    if (!(await waitForOwnedChild(server, 5000))) {
      server.kill('SIGKILL')
      if (!(await waitForOwnedChild(server, 3000)))
        throw new Error('Owned API child cleanup timed out')
    }
  }
  if (db) await db.end()
  await source.end()
}

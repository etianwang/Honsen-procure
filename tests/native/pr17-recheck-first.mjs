import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID, createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { chromium, expect } from '@playwright/test'
import { Pool } from 'pg'

const root = process.env.HONSEN_QA_ROOT
const exe = process.env.HONSEN_QA_EXE
const profiles = ['producer3', 'receiver3'].map((s) =>
  join(root, `followup-${s}.test.sqlite`),
)
const ids = Array.from(
  { length: 14 },
  (_, i) => `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
)
const countryB = '20000000-0000-4000-8000-000000000001'
const projectB = '20000000-0000-4000-8000-000000000002'
const userB = '20000000-0000-4000-8000-000000000013'
const supplierId = randomUUID(),
  priceId = randomUUID()
const pool = new Pool({
  connectionString: process.env.HONSEN_PROCURE_TEST_DATABASE_URL,
})
const report = {
  candidate: '20da0985fdb18b1e4a6571c54de8a0a4af40282c',
  exeSha256: createHash('sha256').update(readFileSync(exe)).digest('hex'),
  supplierId,
  checks: [],
  calls: [],
  errors: [],
}
const children = [],
  browsers = []
let phase = 'fixture'
function rows(path, sql, ...args) {
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    db.exec('PRAGMA busy_timeout=5000')
    return db.prepare(sql).all(...args)
  } finally {
    db.close()
  }
}
async function call(app, command, args) {
  const result = await app.page.evaluate(
    async ({ command, args }) => {
      try {
        return {
          ok: true,
          value: await window.__TAURI__.core.invoke(command, args),
        }
      } catch (error) {
        return { ok: false, error }
      }
    },
    { command, args },
  )
  report.calls.push({ phase, command, ...result })
  assert.ok(result.ok, `${phase}/${command}: ${JSON.stringify(result.error)}`)
  return result.value
}
function answer(question) {
  const m = /^(\d+) \+ (\d+) = \?$/.exec(question)
  assert.ok(m)
  return Number(m[1]) + Number(m[2])
}
async function login(app, username, password) {
  const local = await call(app, 'issue_local_captcha'),
    cloud = await call(app, 'issue_cloud_captcha')
  await call(app, 'online_login', {
    request: {
      username,
      password,
      localCaptchaId: local.id,
      localCaptchaAnswer: answer(local.question),
      cloudCaptchaId: cloud.id,
      cloudCaptchaAnswer: String(answer(cloud.question)),
    },
  })
}
async function launch(index, port) {
  const child = spawn(exe, [], {
    windowsHide: true,
    env: {
      ...process.env,
      HONSEN_PROCURE_TEST_DB_PATH: profiles[index],
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`,
      WEBVIEW2_USER_DATA_FOLDER: `${profiles[index]}.webview`,
    },
  })
  children.push(child)
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok
        } catch {
          return false
        }
      },
      { timeout: 60000 },
    )
    .toBe(true)
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  browsers.push(browser)
  await expect
    .poll(() => browser.contexts()[0]?.pages().length ?? 0)
    .toBeGreaterThan(0)
  const page = browser.contexts()[0].pages()[0]
  page.on('pageerror', (e) => report.errors.push(e.message))
  await expect(
    page.getByRole('heading', { name: '登录 HONSEN Procure' }),
  ).toBeVisible({ timeout: 60000 })
  assert.equal(
    await page.evaluate(() => typeof window.__TAURI_INTERNALS__?.invoke),
    'function',
  )
  return { page }
}
async function api(path, options = {}) {
  const response = await fetch(`https://localhost:3443${path}`, options)
  const body = await response.json()
  return { status: response.status, body }
}
try {
  await pool.query('UPDATE countries SET business_code=$2 WHERE id=$1', [
    ids[1],
    'TEST-CI',
  ])
  await pool.query('UPDATE projects SET business_code=$2 WHERE id=$1', [
    ids[2],
    'TEST-OPA',
  ])
  await pool.query(
    'INSERT INTO user_project_bindings (user_id,project_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
    [ids[13], ids[2]],
  )
  await pool.query(
    'INSERT INTO user_project_scope_bindings (user_id,project_id,department_id,team_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
    [ids[13], ids[2], ids[3], ids[4]],
  )
  await pool.query(
    "INSERT INTO countries (id,business_code,name,time_zone) VALUES ($1,'QA-B','QA B','UTC')",
    [countryB],
  )
  await pool.query(
    "INSERT INTO projects (id,country_id,business_code,name,site,department_name,default_currency,default_language_pair) VALUES ($1,$2,'QA-B-P','QA B','B','B','XOF','zh_fr')",
    [projectB, countryB],
  )
  await pool.query(
    "INSERT INTO users (id,business_code,username,password_hash,ui_locale,requires_password_change) SELECT $1,'QA-B-PURCHASER','qa-b-purchaser',password_hash,'zh-CN',FALSE FROM users WHERE id=$2",
    [userB, ids[13]],
  )
  await pool.query(
    "INSERT INTO user_roles (user_id,role) VALUES ($1,'purchaser')",
    [userB],
  )
  await pool.query(
    'INSERT INTO user_project_bindings (user_id,project_id) VALUES ($1,$2)',
    [userB, projectB],
  )
  await pool.query(
    'INSERT INTO user_project_scope_bindings (user_id,project_id,department_id,team_id) VALUES ($1,$2,$3,$4)',
    [userB, projectB, ids[3], ids[4]],
  )
  await pool.query("INSERT INTO sync_entities (entity_type,entity_id,version,payload_json,updated_by) VALUES ('material',$1,1,'{}'::jsonb,$2) ON CONFLICT DO NOTHING", [ids[5], ids[13]])
  report.installations = profiles.map(
    (p) =>
      rows(p, 'SELECT installation_id FROM local_sync_state')[0]
        .installation_id,
  )
  assert.notEqual(...report.installations)
  phase = 'launch-and-login'
  const producer = await launch(0, 9261),
    receiver = await launch(1, 9262)
  await login(producer, 'purchaser', process.env.HONSEN_TEST_PURCHASER_PASSWORD)
  await login(
    receiver,
    'engineer-a',
    process.env.HONSEN_TEST_ENGINEER_A_PASSWORD,
  )
  report.checks.push('two real EXEs, WebView2 and online Rust IPC login')
  const supplier = {
    id: supplierId,
    businessCode: 'QA-SYNC-SUP',
    name: 'QA sync initial',
    countryId: ids[1],
    contactName: null,
    address: null,
    city: null,
    country: null,
    phone: null,
    whatsapp: null,
    email: null,
    paymentTerms: null,
    deliveryLeadTime: null,
    isPreferred: false,
    isBlacklisted: false,
    isActive: true,
    version: 1,
  }
  phase = 'create-push'
  await call(producer, 'save_supplier', { supplier })
  let result = await call(producer, 'push_pending_sync')
  assert.equal(result.acceptedCount, 1)
  assert.equal(result.pendingCount, 0)
  let server = (
    await pool.query(
      "SELECT version,payload_json FROM sync_entities WHERE entity_type='supplier' AND entity_id=$1",
      [supplierId],
    )
  ).rows[0]
  assert.equal(server.payload_json.countryId, ids[1])
  assert.equal(server.payload_json.name, supplier.name)
  report.checks.push('supplier create accepted by PostgreSQL with country A')
  phase = 'price-push'
  await call(producer, 'add_material_price', {
    price: {
      id: priceId,
      materialId: ids[5],
      supplierId,
      currency: 'CNY',
      unitPriceMinor: '1500',
      unit: '米',
      effectiveAt: '2026-10-20',
      sourceNote: 'QA synthetic',
      version: 1,
    },
  })
  result = await call(producer, 'push_pending_sync')
  assert.equal(result.acceptedCount, 1)
  assert.equal(result.pendingCount, 0)
  phase = 'edit-push'
  await call(producer, 'save_supplier', {
    supplier: { ...supplier, name: 'QA sync edited', version: 2 },
  })
  result = await call(producer, 'push_pending_sync')
  assert.equal(result.acceptedCount, 1)
  assert.equal(result.pendingCount, 0)
  server = (
    await pool.query(
      "SELECT version,payload_json FROM sync_entities WHERE entity_type='supplier' AND entity_id=$1",
      [supplierId],
    )
  ).rows[0]
  assert.equal(server.payload_json.countryId, ids[1])
  assert.equal(server.payload_json.name, 'QA sync edited')
  report.checks.push('supplier edit accepted with country retained')
  phase = 'authorized-pull'
  report.pull = await call(receiver, 'pull_sync')
  const visible = await call(receiver, 'list_suppliers')
  assert.ok(
    visible.some(
      (s) =>
        s.id === supplierId &&
        s.name === 'QA sync edited' &&
        s.countryId === ids[1],
    ),
  )
  const quote = rows(
    profiles[1],
    'SELECT material_id,supplier_id,unit_price_minor FROM local_material_prices WHERE id=?',
    priceId,
  )[0]
  assert.equal(quote.material_id, ids[5])
  assert.equal(quote.supplier_id, supplierId)
  assert.equal(quote.unit_price_minor, 1500)
  report.checks.push(
    'authorized second device pulls edited supplier and linked quote',
  )
  phase = 'unauthorized-country-api'
  const captcha = await api('/api/auth/captcha')
  const installation = randomUUID()
  const auth = await api('/api/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-installation-id': installation,
    },
    body: JSON.stringify({
      username: 'qa-b-purchaser',
      password: process.env.HONSEN_TEST_PURCHASER_PASSWORD,
      captchaId: captcha.body.id,
      captchaAnswer: String(answer(captcha.body.question)),
    }),
  })
  assert.equal(auth.status, 200)
  const headers = {
    authorization: `Bearer ${auth.body.accessToken}`,
    'content-type': 'application/json',
  }
  const supplierB = randomUUID()
  const ownCreate = await api('/api/sync/push', {method:'POST', headers, body:JSON.stringify({deviceId:installation,events:[{eventId:randomUUID(), entityType:'supplier', entityId:supplierB, operation:'upsert', baseVersion:0, payload:{...supplier,id:supplierB,businessCode:'QA-B-OWN',name:'B supplier',countryId:countryB}}]})})
  report.authorizedBCreate = ownCreate
  assert.equal(ownCreate.body.results?.[0]?.status, 'accepted')
  const pull = await api('/api/sync/pull?cursor=0&limit=500', { headers })
  const leaked = pull.body.changes.filter(
    (c) => c.entityId === supplierId || c.entityId === priceId,
  )
  report.unauthorizedPull = {
    status: pull.status,
    entityTypes: leaked.map((c) => c.entityType),
    count: leaked.length,
  }
  const attack = await api('/api/sync/push', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      deviceId: installation,
      events: [
        {
          eventId: randomUUID(),
          entityType: 'supplier',
          entityId: supplierId,
          operation: 'upsert',
          baseVersion: Number(server.version),
          payload: {
            ...server.payload_json,
            name: 'QA unauthorized modification',
            countryId: countryB,
          },
        },
      ],
    }),
  })
  report.unauthorizedPush = attack
  const after = (
    await pool.query(
      "SELECT version,payload_json FROM sync_entities WHERE entity_type='supplier' AND entity_id=$1",
      [supplierId],
    )
  ).rows[0]
  report.serverAfterAttack = {
    version: after.version,
    name: after.payload_json.name,
    countryId: after.payload_json.countryId,
  }
  phase = 'cursor-and-order'
  let cursor = '0', seen = [], cursors = []
  for (let i = 0; i < 100; i++) {
    const page = await api(`/api/sync/pull?cursor=${cursor}&limit=1`, { headers })
    assert.equal(page.status, 200)
    seen.push(...page.body.changes)
    const next = page.body.nextCursor
    cursors.push(next)
    if (next === cursor) break
    assert.ok(BigInt(next) > BigInt(cursor))
    cursor = next
  }
  assert.ok(!seen.some((c) => c.entityId === supplierId || c.entityId === priceId))
  report.cursor = { cursors, count: seen.length, ownSupplierSeen: seen.some(c=>c.entityId===supplierB) }
  assert.equal(report.cursor.ownSupplierSeen, true)
  const orderId = randomUUID()
  const order = await api('/api/sync/push', {
    method: 'POST', headers,
    body: JSON.stringify({deviceId: installation, events: [{eventId: randomUUID(), entityType: 'purchase_order', entityId: orderId, operation: 'upsert', baseVersion: 0, payload: {projectId: ids[2], countryId: ids[1], applicantId: userB, workflowStatus: 'draft'}}]})
  })
  report.unauthorizedOrder = order
  assert.notEqual(order.body.results?.[0]?.status, 'accepted')
  assert.equal(Number((await pool.query("SELECT count(*) FROM sync_entities WHERE entity_id=$1", [orderId])).rows[0].count), 0)
  assert.equal(leaked.length, 0)
  assert.notEqual(attack.body.results?.[0]?.status, 'accepted')
  assert.deepEqual(after, server)
  report.checks.push('cross-country supplier and price pull blocked; supplier and order push rejected without entity change')
  phase = 'revocation-desktop'
  const beforeCatalog = await call(receiver, 'search_catalog', {query: '', projectId: null})
  report.beforeRevokeQuote = beforeCatalog.flatMap(x => x.prices).some(x => x.priceId === priceId)
  assert.equal(report.beforeRevokeQuote, true)
  await pool.query('UPDATE user_project_scope_bindings SET deleted_at=NOW() WHERE user_id=$1 AND project_id=$2', [ids[11], ids[2]])
  const visibleBeforeRefresh = await call(receiver, 'list_suppliers')
  report.beforeRefreshVisible = visibleBeforeRefresh.some(s => s.id === supplierId)
  await call(receiver, 'refresh_authorization')
  const afterList = await call(receiver, 'list_suppliers')
  const afterCatalog = await call(receiver, 'search_catalog', {query: '', projectId: null})
  report.revocation = {supplierVisible: afterList.some(s => s.id === supplierId), quoteVisible: afterCatalog.flatMap(x => x.prices).some(x => x.priceId === priceId), retainedSupplier: rows(profiles[1], 'SELECT id FROM local_suppliers WHERE id=?', supplierId).length, retainedPrice: rows(profiles[1], 'SELECT id FROM local_material_prices WHERE id=?', priceId).length}
  assert.equal(report.revocation.supplierVisible, false)
  assert.equal(report.revocation.quoteVisible, false)
  assert.equal(report.revocation.retainedSupplier, 1)
  assert.equal(report.revocation.retainedPrice, 1)
  report.checks.push('desktop authorization refresh hides cached supplier and quote without deleting data')
  phase = 'revocation-server'
  await pool.query('UPDATE user_project_scope_bindings SET deleted_at=NOW() WHERE user_id=$1 AND project_id=$2', [userB, projectB])
  const revokedPull = await api('/api/sync/pull?cursor=0&limit=500', {headers})
  const revokedPush = await api('/api/sync/push', {method:'POST', headers, body:JSON.stringify({deviceId:installation,events:[{eventId:randomUUID(), entityType:'supplier', entityId:randomUUID(), operation:'upsert', baseVersion:0, payload:{...supplier, id:randomUUID(), countryId:countryB}}]})})
  report.revokedServer = {pull:revokedPull, push:revokedPush}
  assert.ok(!revokedPull.body.changes?.some(c=>c.entityId===supplierB || c.entityId===supplierId || c.entityId===priceId))
  assert.notEqual(revokedPush.body.results?.[0]?.status, 'accepted')
  report.checks.push('revoked server scope refuses scoped read and write')
  report.result =
    leaked.length || attack.body.results?.[0]?.status === 'accepted'
      ? 'QA_FAIL'
      : 'PASS'
  if (report.result === 'QA_FAIL') process.exitCode = 1
} catch (error) {
  report.result = 'INCOMPLETE'
  report.failure = String(error.stack ?? error)
  report.failedPhase = phase
  process.exitCode = 1
} finally {
  writeFileSync(
    join(root, 'recheck-result.json'),
    JSON.stringify(report, null, 2),
  )
  for (const browser of browsers) await browser.close().catch(() => {})
  for (const child of children) if (child.exitCode === null) child.kill()
  await pool.end()
}

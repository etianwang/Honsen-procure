// Targeted Windows IPC -> trusted HTTPS -> disposable PostgreSQL/COS proof.
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { createServer } from 'node:http'
import { chromium, expect } from '@playwright/test'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const root = resolve(process.env.HONSEN_NATIVE_EVIDENCE_ROOT)
const guest = process.env.HONSEN_NATIVE_GUEST === '1'
const resultRoot = guest ? resolve(process.env.HONSEN_NATIVE_RESULT_ROOT) : root
assert.ok(
  root.startsWith(resolve(process.env.HONSEN_NATIVE_RESOURCE_ROOT) + sep),
)
const profiles = ['a', 'b'].map((n) => join(root, `${n}.test.sqlite`))
const exePaths = ['a', 'b'].map((n) => join(root, n, 'HonsenProcure.exe'))
const children = [],
  browsers = [],
  calls = [],
  exePids = []
const ids = Array.from(
  { length: 15 },
  (_, n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
)
const orderId = randomUUID(),
  lineId = randomUUID(),
  receiptId = randomUUID()
const paymentIds = [randomUUID(), randomUUID()],
  reversalId = randomUUID()
let pool
if (!guest) {
  const databaseUrl = new URL(process.env.HONSEN_PROCURE_TEST_DATABASE_URL)
  assert.equal(databaseUrl.hostname, '127.0.0.1')
  assert.ok(databaseUrl.pathname.includes('test'))
  const { Pool } = await import('pg')
  pool = new Pool({ connectionString: databaseUrl.toString() })
}
const report = {
  mode: 't09-t11-native-chain',
  baseSha: guest
    ? process.env.HONSEN_NATIVE_BASE_SHA
    : execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repo,
        encoding: 'utf8',
      }).trim(),
  workingTreeDirty: guest
    ? process.env.HONSEN_NATIVE_SOURCE_DIRTY === '1'
    : Boolean(
        execFileSync('git', ['status', '--porcelain'], {
          cwd: repo,
          encoding: 'utf8',
        }).trim(),
      ),
  artifactBoundary:
    'exeHash identifies the exact tested executable; baseSha does not identify uncommitted source changes',
  orderId,
  profiles,
  exePids,
  calls,
  seedErrors: [],
}
let phase = 'fixture'
let staticServer
async function hostObserver(operation, request) {
  writeFileSync(
    join(resultRoot, `${operation}-request.test.json`),
    JSON.stringify(request),
  )
  const response = join(resultRoot, `${operation}-ready.test.json`)
  await expect.poll(() => existsSync(response), { timeout: 30_000 }).toBe(true)
  const result = JSON.parse(readFileSync(response, 'utf8'))
  assert.equal(result.ok, true, result.error)
  return result
}
function readDb(index, sql, ...args) {
  const db = new DatabaseSync(profiles[index], { readOnly: true })
  try {
    return db
      .prepare(sql)
      .all(...args)
      .map((row) => ({ ...row }))
  } finally {
    db.close()
  }
}
async function ready(url) {
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(url)).ok
        } catch {
          return false
        }
      },
      { timeout: 45_000 },
    )
    .toBe(true)
}
function nativeEnvironment(overrides) {
  const environment = { ...process.env, ...overrides }
  for (const key of Object.keys(environment))
    if (
      key.startsWith('COS_') ||
      key.startsWith('POSTGRES_') ||
      key.includes('DATABASE_URL') ||
      key.includes('PFX_PASSWORD')
    )
      delete environment[key]
  assert.ok(
    !Object.keys(environment).some(
      (key) =>
        key.startsWith('COS_') ||
        key.startsWith('POSTGRES_') ||
        key.includes('DATABASE_URL'),
    ),
  )
  return environment
}
async function launch(index) {
  const port = 9251 + index
  const environment = nativeEnvironment({
    HONSEN_PROCURE_PROFILE: 'test',
    HONSEN_PROCURE_TEST_DB_PATH: profiles[index],
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`,
    WEBVIEW2_USER_DATA_FOLDER: `${profiles[index]}.webview`,
  })
  const child = spawn(exePaths[index], [], {
    cwd: dirname(exePaths[index]),
    env: environment,
    windowsHide: true,
  })
  children.push(child)
  exePids.push(child.pid)
  await ready(`http://127.0.0.1:${port}/json/version`)
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  browsers.push(browser)
  await expect
    .poll(() => browser.contexts()[0]?.pages().length ?? 0)
    .toBeGreaterThan(0)
  const page = browser.contexts()[0].pages()[0]
  await expect(
    page.getByRole('heading', { name: '登录 HONSEN Procure' }),
  ).toBeVisible({ timeout: 30_000 })
  assert.equal(
    await page.evaluate(() => typeof window.__TAURI_INTERNALS__?.invoke),
    'function',
  )
  return { child, browser, page }
}
async function stop(app) {
  await app.browser.close()
  if (app.child.exitCode === null) {
    const exited = once(app.child, 'exit')
    app.child.kill()
    await exited
  }
}
async function raw(app, command, args) {
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
  calls.push({
    phase,
    command,
    ok: result.ok,
    ...(result.ok ? {} : { error: result.error }),
  })
  return result
}
async function call(app, command, args) {
  const result = await raw(app, command, args)
  assert.ok(result.ok, `${phase}/${command}: ${JSON.stringify(result.error)}`)
  return result.value
}
function answer(question) {
  const m = /^(\d+) \+ (\d+) = \?$/u.exec(question)
  assert.ok(m)
  return +m[1] + +m[2]
}
async function login(app, username, offline = false) {
  const local = await call(app, 'issue_local_captcha')
  const password =
    process.env[
      `HONSEN_TEST_${username.replace('-', '_').toUpperCase()}_PASSWORD`
    ]
  if (offline)
    return call(app, 'offline_login', {
      request: {
        username,
        password,
        captchaId: local.id,
        captchaAnswer: answer(local.question),
      },
    })
  const cloud = await call(app, 'issue_cloud_captcha')
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
async function uiLogin(app, username) {
  await app.page.getByLabel('账号', { exact: true }).fill(username)
  await app.page
    .getByLabel('密码', { exact: true })
    .fill(
      process.env[
        `HONSEN_TEST_${username.replace('-', '_').toUpperCase()}_PASSWORD`
      ],
    )
  await app.page
    .getByRole('button', { name: '获取验证码', exact: true })
    .click()
  await expect(app.page.locator('label[for="cloud-captcha"]')).toBeVisible()
  for (const field of ['captcha', 'cloud-captcha']) {
    const question = (
      await app.page.locator(`label[for="${field}"]`).innerText()
    )
      .split('：')
      .at(-1)
    await app.page.locator(`#${field}`).fill(String(answer(question)))
  }
  await app.page.getByRole('button', { name: '在线登录', exact: true }).click()
  await expect(
    app.page.getByRole('button', { name: '采购执行', exact: true }),
  ).toBeVisible()
}
async function network(connected, cycle) {
  writeFileSync(
    join(
      resultRoot,
      `${cycle}${connected ? 'reconnect' : 'disconnect'}.signal`,
    ),
    '',
  )
  await expect
    .poll(
      () =>
        existsSync(
          join(
            resultRoot,
            `${cycle}${connected ? 'reconnected' : 'disconnected'}.signal`,
          ),
        ),
      { timeout: 30_000 },
    )
    .toBe(true)
}
async function push(app) {
  const result = await call(app, 'push_pending_sync')
  assert.equal(result.pendingCount, 0)
  return result
}
function unchanged() {
  return {
    order: readDb(
      0,
      'SELECT formal_snapshot_json,supplier_snapshot_json,total_minor,currency FROM local_purchase_orders WHERE id=?',
      orderId,
    ),
    orderItems: readDb(
      0,
      'SELECT material_snapshot_json,supplier_snapshot_json,quantity_decimal,unit_price_minor,currency FROM local_purchase_order_items WHERE order_id=? ORDER BY id',
      orderId,
    ),
    receipt: readDb(
      0,
      'SELECT * FROM local_receipts WHERE order_id=? ORDER BY id',
      orderId,
    ),
    items: readDb(
      0,
      'SELECT i.* FROM local_receipt_items i JOIN local_receipts r ON r.id=i.receipt_id WHERE r.order_id=? ORDER BY i.id',
      orderId,
    ),
  }
}
try {
  mkdirSync(root, { recursive: true })
  for (const [index, exe] of exePaths.entries()) {
    mkdirSync(dirname(exe), { recursive: true })
    copyFileSync(process.env.HONSEN_NATIVE_EXE, exe)
    try {
      execFileSync(
        join(
          dirname(process.env.HONSEN_NATIVE_EXE),
          'honsen-procure-test-profile.exe',
        ),
        ['seed'],
        {
          env: nativeEnvironment({
            HONSEN_PROCURE_TEST_DB_PATH: profiles[index],
          }),
          stdio: 'pipe',
        },
      )
    } catch (error) {
      report.seedErrors.push({
        index,
        error: error.stderr?.toString().trim() ?? 'SEED_FAILED',
      })
    }
  }
  report.exeHash = createHash('sha256')
    .update(readFileSync(exePaths[0]))
    .digest('hex')
  report.installations = profiles.map(
    (_, i) =>
      readDb(i, 'SELECT installation_id FROM local_sync_state')[0]
        .installation_id,
  )
  assert.notEqual(...report.installations)
  if (guest && !report.seedErrors.length) {
    await hostObserver('fixture', {
      countryCode: readDb(
        0,
        'SELECT business_code FROM local_countries WHERE id=?',
        ids[1],
      )[0].business_code,
      projectCode: readDb(
        0,
        'SELECT business_code FROM local_projects WHERE id=?',
        ids[2],
      )[0].business_code,
    })
  }
  for (const [table, id] of report.seedErrors.length || guest
    ? []
    : [
        ['countries', ids[1]],
        ['projects', ids[2]],
      ]) {
    const code = readDb(
      0,
      `SELECT business_code FROM local_${table} WHERE id=?`,
      id,
    )[0].business_code
    await pool.query(`UPDATE ${table} SET business_code=$2 WHERE id=$1`, [
      id,
      code,
    ])
  }
  for (const user of guest ? [] : [ids[11], ids[13], ids[14]]) {
    await pool.query(
      'INSERT INTO user_project_bindings (user_id,project_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [user, ids[2]],
    )
    await pool.query(
      'INSERT INTO user_project_scope_bindings (user_id,project_id,department_id,team_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [user, ids[2], ids[3], ids[4]],
    )
  }
  if (guest) {
    const dist = resolve(process.env.HONSEN_NATIVE_FRONTEND_DIST)
    staticServer = createServer((request, response) => {
      const file = resolve(
        dist,
        '.' + new URL(request.url, 'http://localhost').pathname,
      )
      if (!file.startsWith(dist + sep) && file !== dist) {
        response.writeHead(403)
        response.end()
        return
      }
      const target =
        file !== dist && existsSync(file) ? file : join(dist, 'index.html')
      const contentType = target.endsWith('.js')
        ? 'text/javascript'
        : target.endsWith('.css')
          ? 'text/css'
          : target.endsWith('.svg')
            ? 'image/svg+xml'
            : 'text/html'
      response.setHeader('Content-Type', contentType)
      response.end(readFileSync(target))
    })
    await new Promise((resolve, reject) => {
      staticServer.once('error', reject)
      staticServer.listen(1420, '127.0.0.1', resolve)
    })
  } else {
    const vite = spawn(
      process.execPath,
      [
        join(repo, 'node_modules/vite/bin/vite.js'),
        '--host',
        '127.0.0.1',
        '--port',
        '1420',
        '--strictPort',
      ],
      { cwd: join(repo, 'apps/desktop'), windowsHide: true, stdio: 'ignore' },
    )
    children.push(vite)
  }
  await ready('http://127.0.0.1:1420')
  let a = await launch(0),
    b = await launch(1)
  phase = 'login-and-order'
  if (report.seedErrors.length) {
    const failures = []
    for (const [index, app] of [a, b].entries()) {
      try {
        await login(app, 'purchaser')
      } catch (error) {
        failures.push({ index, error: error.message })
      }
      await app.page.screenshot({
        path: join(resultRoot, `blocked-device-${index}.png`),
      })
    }
    report.nativeLoginFailures = failures
    throw new Error(
      'BLOCKED_ENV: Windows secure credential storage failed during test-profile seeding and native online login',
    )
  }
  await login(a, 'engineer-a')
  await login(b, 'purchaser')
  const zero = { kind: 'fixed_minor', minor: '0' }
  await call(a, 'save_requisition_draft', {
    draft: {
      id: orderId,
      displayNo: `NATIVE-T09-${Date.now()}`,
      countryId: ids[1],
      projectId: ids[2],
      site: 'Test site',
      departmentId: ids[3],
      teamId: ids[4],
      applicantId: ids[11],
      currency: 'XOF',
      primaryCurrency: 'XOF',
      languagePair: 'zh_fr',
      urgency: 'normal',
      urgencyReason: null,
      orderDate: '2026-10-24',
      deliveryAddress: 'Synthetic delivery',
      expectedDeliveryDate: null,
      notes: 'Native T09 T11 proof',
      orderDiscount: zero,
      orderFreight: zero,
      taxRateBasisPoints: 0,
      lines: [
        {
          id: lineId,
          materialId: ids[5],
          materialSnapshot: {
            nameZh: '合成测试',
            nameFr: 'Test synthétique',
            model: 'T09',
            specification: 'Native fixture',
          },
          supplierId: null,
          currency: 'XOF',
          quantity: '10',
          unit: '米',
          unitPriceMinor: '100',
          lineDiscount: zero,
          lineFreight: zero,
          freightIncluded: false,
          sortOrder: 0,
        },
      ],
    },
  })
  await call(a, 'set_procurement_mode', {
    orderId,
    mode: 'honsen_self_purchase',
  })
  await call(a, 'submit_requisition_draft', { orderId })
  await push(a)
  await call(b, 'pull_sync')
  await call(b, 'confirm_requisition', { orderId })
  await call(b, 'start_honsen_market_execution', { orderId })
  await push(b)
  await call(a, 'pull_sync')
  phase = 'receipt-and-payments'
  await call(b, 'record_receipt', {
    input: {
      id: receiptId,
      orderId,
      receivedAt: '2026-10-24',
      receiverId: ids[13],
      overReceiptReason: null,
      attachmentIds: [],
      items: [{ orderItemId: lineId, quantity: '2', unit: '米' }],
    },
  })
  await call(b, 'record_receipt', {
    input: {
      id: randomUUID(),
      orderId,
      receivedAt: '2026-10-24',
      receiverId: ids[13],
      overReceiptReason: null,
      attachmentIds: [],
      items: [{ orderItemId: lineId, quantity: '3', unit: '米' }],
    },
  })
  await login(a, 'purchaser-b')
  for (const [index, id] of paymentIds.entries())
    await call(a, 'record_procurement_expenditure', {
      input: {
        id,
        orderId,
        payeeName: 'Synthetic market payee',
        currency: 'XOF',
        amountMinor: String(100 + index * 100),
        paymentDate: '2026-10-24',
        paymentType: index ? 'progress' : 'advance',
        paymentMethod: 'cash',
        voucherReference: null,
        notes: 'Native IPC synthetic payment',
      },
    })
  await push(a)
  await push(a)
  await push(b)
  await call(b, 'pull_sync')
  await call(a, 'pull_sync')
  const stable = unchanged()
  const summary = (await call(b, 'list_confirmed_procurement_orders')).find(
    (o) => o.id === orderId,
  ).paymentSummary
  assert.equal(summary.paidMinor, '300')
  assert.equal(summary.records.length, 2)
  const receivedLine = (
    await call(b, 'list_confirmed_procurement_orders')
  ).find((o) => o.id === orderId).lines[0]
  assert.equal(receivedLine.receivedQuantity, '5')
  assert.equal(receivedLine.remainingQuantity, '5')
  phase = 'reversal'
  await call(a, 'reverse_procurement_expenditure', {
    input: {
      id: reversalId,
      expenditureId: paymentIds[0],
      reason: 'Native correction proof',
    },
  })
  assert.equal((await raw(a, 'push_pending_sync')).ok, false)
  assert.equal(
    readDb(
      0,
      'SELECT entity_id FROM local_sync_outbox WHERE entity_id=?',
      reversalId,
    ).length,
    1,
  )
  await push(a)
  report.reversalPostCommitRetry = true
  await call(b, 'pull_sync')
  const reversed = (await call(b, 'list_confirmed_procurement_orders')).find(
    (o) => o.id === orderId,
  ).paymentSummary
  assert.equal(reversed.paidMinor, '200')
  assert.equal(reversed.records.length, 3)
  phase = 'offline-restart'
  writeFileSync(join(resultRoot, 'disconnect.signal'), '')
  await expect
    .poll(() => existsSync(join(resultRoot, 'disconnected.signal')), {
      timeout: 30_000,
    })
    .toBe(true)
  assert.equal((await raw(a, 'issue_cloud_captcha')).ok, false)
  await stop(a)
  a = await launch(0)
  const locked = await raw(a, 'list_confirmed_procurement_orders')
  assert.equal(locked.ok, false)
  await login(a, 'purchaser-b', true)
  const offlineId = randomUUID()
  await call(a, 'record_procurement_expenditure', {
    input: {
      id: offlineId,
      orderId,
      payeeName: 'Offline synthetic payee',
      currency: 'XOF',
      amountMinor: '50',
      paymentDate: '2026-10-24',
      paymentType: 'other',
      paymentMethod: 'cash',
      voucherReference: null,
      notes: null,
    },
  })
  await stop(a)
  a = await launch(0)
  assert.ok(
    readDb(
      0,
      'SELECT id FROM local_procurement_expenditures WHERE id=?',
      offlineId,
    ).length,
  )
  writeFileSync(join(resultRoot, 'reconnect.signal'), '')
  await expect
    .poll(() => existsSync(join(resultRoot, 'reconnected.signal')), {
      timeout: 30_000,
    })
    .toBe(true)
  await login(a, 'purchaser-b')
  await push(a)
  await call(b, 'pull_sync')
  phase = 'competing-reversal-resolution'
  const competingPayment = randomUUID(),
    winner = randomUUID(),
    loser = randomUUID()
  await call(a, 'record_procurement_expenditure', {
    input: {
      id: competingPayment,
      orderId,
      payeeName: 'Synthetic reconciliation payee',
      currency: 'XOF',
      amountMinor: '100',
      paymentDate: '2026-10-24',
      paymentType: 'other',
      paymentMethod: 'cash',
      voucherReference: null,
      notes: 'Native competing correction',
    },
  })
  await push(a)
  await call(b, 'pull_sync')
  await network(false, 'conflict-')
  await call(a, 'reverse_procurement_expenditure', {
    input: {
      id: winner,
      expenditureId: competingPayment,
      reason: 'Synthetic A offline reversal',
    },
  })
  await call(b, 'reverse_procurement_expenditure', {
    input: {
      id: loser,
      expenditureId: competingPayment,
      reason: 'Synthetic B offline reversal',
    },
  })
  await network(true, 'conflict-')
  await push(a)
  await call(b, 'push_pending_sync')
  const conflict = (await call(a, 'list_payment_sync_conflicts')).find(
    (item) => item.entityId === loser,
  )
  assert.ok(conflict?.eventId)
  assert.equal(conflict.entityType, 'procurement_expenditure')
  const originals = [conflict.localPayloadJson, conflict.serverPayloadJson]
  await uiLogin(a, 'purchaser-b')
  await a.page.getByRole('button', { name: '同步冲突', exact: true }).click()
  await expect(
    a.page.getByRole('button', {
      name: '确认云端付款并保留冲突原件',
      exact: true,
    }),
  ).toBeVisible()
  await network(false, 'resolution-')
  await a.page
    .getByLabel('处理原因', { exact: true })
    .fill('Synthetic verified reconciliation')
  await a.page
    .getByRole('button', { name: '确认云端付款并保留冲突原件', exact: true })
    .click()
  await expect(
    a.page.getByText('处置待同步，尚未获得服务器确认。', { exact: true }),
  ).toBeVisible()
  await a.page.screenshot({
    path: join(resultRoot, 'native-resolution-pending.png'),
    fullPage: true,
  })
  await network(true, 'resolution-')
  await push(a)
  await call(a, 'pull_sync')
  await call(b, 'pull_sync')
  for (const app of [a, b]) {
    const resolved = (await call(app, 'list_payment_sync_conflicts')).find(
      (item) => item.id === conflict.id,
    )
    assert.equal(resolved?.paymentResolutionState, 'confirmed')
    assert.deepEqual(
      [resolved.localPayloadJson, resolved.serverPayloadJson],
      originals,
    )
    const payment = (await call(app, 'list_confirmed_procurement_orders')).find(
      (item) => item.id === orderId,
    ).paymentSummary
    assert.equal(payment.paidMinor, '250')
  }
  await a.page
    .getByRole('button', { name: '刷新付款处置状态', exact: true })
    .click()
  await expect(
    a.page.getByText('服务器已确认付款对账处置。', { exact: true }),
  ).toBeVisible()
  await a.page.screenshot({
    path: join(resultRoot, 'native-resolution-confirmed.png'),
    fullPage: true,
  })
  report.paymentConflict = {
    id: conflict.id,
    eventId: conflict.eventId,
    winner,
    loser,
    originalsPreserved: true,
    acknowledged: true,
    bothPaidMinor: '250',
  }
  await stop(a)
  a = await launch(0)
  await login(a, 'purchaser-b')
  phase = 'files'
  const fixtures = [
    {
      name: 'synthetic-voucher.pdf',
      type: 'application/pdf',
      ownerType: 'procurement_expenditure',
      ownerId: paymentIds[1],
      bytes: Buffer.from('%PDF-1.4\n% synthetic native voucher\n%%EOF\n'),
    },
    {
      name: 'synthetic-photo.png',
      type: 'image/png',
      ownerType: 'receipt',
      ownerId: receiptId,
      bytes: await a.page.screenshot({
        clip: { x: 0, y: 0, width: 32, height: 32 },
      }),
    },
  ]
  if (process.env.HONSEN_NATIVE_HEIC_FIXTURE)
    fixtures.push({
      name: 'synthetic-photo.heic',
      type: 'image/heic',
      ownerType: 'receipt',
      ownerId: receiptId,
      bytes: readFileSync(process.env.HONSEN_NATIVE_HEIC_FIXTURE),
    })
  report.files = []
  for (const fixture of fixtures) {
    const id = randomUUID()
    await call(a, 'import_attachment', {
      input: {
        id,
        orderId,
        ownerType: fixture.ownerType,
        ownerId: fixture.ownerId,
        originalName: fixture.name,
        contentType: fixture.type,
        dataBase64: fixture.bytes.toString('base64'),
      },
    })
    await call(a, 'sync_attachments')
    await call(b, 'pull_sync')
    const local = await call(a, 'read_attachment', { id }),
      remote = await call(b, 'read_attachment', { id })
    assert.equal(remote, local)
    const bytes = Buffer.from(remote.split(',')[1], 'base64')
    report.files.push({
      id,
      ownerType: fixture.ownerType,
      byteLength: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      sourceType: fixture.type,
    })
    if (fixture.type === 'image/heic') {
      assert.ok(remote.startsWith('data:image/jpeg;base64,'))
      const view = (await call(b, 'list_attachments', { orderId })).find(
        (file) => file.id === id,
      )
      assert.ok(view.sourceAttachmentId)
      const original = await call(b, 'read_attachment', {
        id: view.sourceAttachmentId,
      })
      assert.deepEqual(
        Buffer.from(original.split(',')[1], 'base64'),
        fixture.bytes,
      )
      report.files.at(-1).originalPreserved = true
      report.files.at(-1).sourceAttachmentId = view.sourceAttachmentId
    }
  }
  phase = 'forbidden-scope'
  await login(b, 'engineer-b')
  assert.equal((await raw(b, 'list_attachments', { orderId })).ok, false)
  assert.equal(
    (await raw(b, 'read_attachment', { id: report.files[0].id })).ok,
    false,
  )
  phase = 'immutability'
  assert.deepEqual(unchanged(), stable)
  const ledger = guest
    ? { rows: [await hostObserver('ledger', { orderId })] }
    : await pool.query(
        "SELECT count(*)::int AS count FROM sync_entities WHERE entity_type='procurement_expenditure' AND payload_json->>'orderId'=$1",
        [orderId],
      )
  assert.equal(ledger.rows[0].count, 6)
  phase = 'native-production-ui'
  await uiLogin(b, 'purchaser')
  await b.page.getByRole('button', { name: '采购执行', exact: true }).click()
  await expect(
    b.page.getByRole('heading', { name: '采购执行', exact: true }),
  ).toBeVisible()
  await expect(
    b.page.getByText('Synthetic market payee', { exact: true }).first(),
  ).toBeVisible()
  await b.page.screenshot({
    path: join(resultRoot, 'native-device-b.png'),
    fullPage: true,
  })
  report.nativeDomVerified = true
  report.result = 'PASS'
  report.snapshotReceiptUnchanged = true
  report.serverLedgerCount = 6
} catch (error) {
  report.result = report.seedErrors.length ? 'BLOCKED_ENV' : 'FAIL'
  report.phase = phase
  report.failure = error.message
  throw error
} finally {
  writeFileSync(
    join(resultRoot, 'evidence.test.json'),
    JSON.stringify(report, null, 2),
  )
  for (const browser of browsers) await browser.close().catch(() => {})
  for (const child of children) if (child.exitCode === null) child.kill()
  if (staticServer) await new Promise((resolve) => staticServer.close(resolve))
  await pool?.end()
}

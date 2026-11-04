// HPA native proof: production IPC/HTTPS, read-only SQLite evidence, no fabricated order events.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createConnection } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { chromium, expect } from '@playwright/test'
import { Pool } from 'pg'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const root = join(repo, '.honsen-native-qa')
const resultPath = process.env.HONSEN_PROCURE_NATIVE_SMOKE_RESULT_PATH
const profiles = [
  process.env.HONSEN_PROCURE_TEST_DB_PATH,
  process.env.HONSEN_PROCURE_NATIVE_AB_SECOND_DB_PATH,
]
assert.equal(process.env.HONSEN_PROCURE_PROFILE, 'test')
for (const file of [...profiles, resultPath]) {
  assert.ok(file?.startsWith(root + '\\') && resolve(file) === file)
}
for (const file of profiles) assert.ok(file.endsWith('.test.sqlite'))
assert.notEqual(profiles[0], profiles[1])
assert.ok(resultPath.endsWith('.test.json'))
const runId = process.env.HONSEN_PROCURE_TEST_RUN_ID
assert.match(runId, /^native-smoke-\d{14}$/u)
const databaseUrl = new URL(process.env.HONSEN_PROCURE_TEST_DATABASE_URL)
assert.equal(databaseUrl.hostname, '127.0.0.1')
assert.ok(databaseUrl.pathname.includes('test'))
const pool = new Pool({ connectionString: databaseUrl.toString() })
const children = [],
  browsers = [],
  calls = [],
  consoleErrors = [],
  exePids = []
const ids = Array.from(
  { length: 14 },
  (_, n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
)
const orderId = randomUUID(),
  catalogLine = randomUUID(),
  manualLine = randomUUID()
const exePaths = ['device-a', 'device-b'].map((device) =>
  join(root, `${runId}-${device}`, 'HonsenProcure.exe'),
)
const report = {
  mode: 'hpa-formal-pull',
  runId,
  testedSha: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repo,
    encoding: 'utf8',
  }).trim(),
  sourceDirty: execFileSync('git', ['status', '--porcelain'], {
    cwd: repo,
    encoding: 'utf8',
  }).trim(),
  orderId,
  profiles,
  exePaths,
  exePids,
  calls,
  launches: [],
  consoleErrors,
}
let phase = 'fixture'

function readDb(profile, query, ...parameters) {
  const db = new DatabaseSync(profile, { readOnly: true })
  try {
    return db
      .prepare(query)
      .all(...parameters)
      .map((row) => ({ ...row }))
  } finally {
    db.close()
  }
}
function persisted(profile) {
  return {
    header: readDb(
      profile,
      `SELECT document_type AS documentType, formal_document_no AS formalDocumentNo,
      formal_installation_id AS formalInstallationId, CAST(formal_sequence AS TEXT) AS formalSequence,
      formally_issued_at AS formallyIssuedAt, formal_snapshot_json AS formalSnapshotJson
      FROM local_purchase_orders WHERE id = ?`,
      orderId,
    )[0],
    lines: readDb(
      profile,
      `SELECT id, currency, quantity_decimal AS quantity, unit, CAST(unit_price_minor AS TEXT) AS unitPriceMinor, CAST(line_total_minor AS TEXT) AS lineTotalMinor FROM local_purchase_order_items WHERE order_id = ? ORDER BY sort_order, id`,
      orderId,
    ),
  }
}
function durable(profile) {
  return {
    header: readDb(
      profile,
      'SELECT * FROM local_purchase_orders WHERE id = ?',
      orderId,
    ),
    lines: readDb(
      profile,
      'SELECT * FROM local_purchase_order_items WHERE order_id = ? ORDER BY sort_order,id',
      orderId,
    ),
    outbox: readDb(profile, 'SELECT * FROM local_sync_outbox ORDER BY rowid'),
    conflicts: readDb(
      profile,
      'SELECT * FROM local_sync_conflicts ORDER BY rowid',
    ),
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
      { timeout: 30_000 },
    )
    .toBe(true)
}
async function launch(index, port) {
  const environment = {
    ...process.env,
    HONSEN_PROCURE_TEST_DB_PATH: profiles[index],
    ...(process.env.HONSEN_NATIVE_WEBVIEW_TEST
      ? { HONSEN_NATIVE_WEBVIEW_TEST_PORT: String(port) }
      : {}),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`,
    WEBVIEW2_USER_DATA_FOLDER: `${profiles[index]}.webview`,
  }
  delete environment.HONSEN_PROCURE_NATIVE_SMOKE
  const child = spawn(exePaths[index], [], {
    cwd: dirname(exePaths[index]),
    windowsHide: true,
    env: environment,
  })
  const diagnostic = {
    index,
    port,
    pid: child.pid,
    stdout: '',
    stderr: '',
    exitCode: null,
    signal: null,
  }
  report.launches.push(diagnostic)
  child.stdout.on('data', (chunk) => {
    diagnostic.stdout = (diagnostic.stdout + chunk.toString()).slice(-12000)
  })
  child.stderr.on('data', (chunk) => {
    diagnostic.stderr = (diagnostic.stderr + chunk.toString()).slice(-12000)
  })
  child.on('error', (error) => {
    diagnostic.spawnError = String(error)
  })
  child.on('exit', (code, signal) => {
    diagnostic.exitCode = code
    diagnostic.signal = signal
  })
  children.push(child)
  exePids.push(child.pid)
  await ready(`http://127.0.0.1:${port}/json/version`)
  let browser
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, {
        timeout: 5000,
      })
      break
    } catch (error) {
      if (
        attempt === 3 ||
        child.exitCode !== null ||
        !/ECONNRESET|ECONNREFUSED|socket hang up/u.test(String(error.message))
      )
        throw error
      await delay(250)
    }
  }
  browsers.push(browser)
  await expect
    .poll(() => browser.contexts()[0]?.pages().length ?? 0)
    .toBeGreaterThan(0)
  const page = browser.contexts()[0].pages()[0]
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  await expect(
    page.getByRole('heading', { name: '登录 HONSEN Procure' }),
  ).toBeVisible({ timeout: 30_000 })
  assert.equal(
    await page.evaluate(() => typeof window.__TAURI_INTERNALS__?.invoke),
    'function',
  )
  return { child, browser, page, port }
}
async function stop(app) {
  await app.browser.close()
  if (app.child.exitCode === null) {
    const exited = once(app.child, 'exit')
    app.child.kill()
    await Promise.race([
      exited,
      delay(10000).then(() => {
        throw new Error('Native process did not exit before restart')
      }),
    ])
  }
  // The WebView child can outlive the host briefly. Never connect the restarted
  // profile to that previous instance's debugging endpoint.
  await expect
    .poll(
      () =>
        new Promise((resolve) => {
          const socket = createConnection({ host: '127.0.0.1', port: app.port })
          socket.setTimeout(1000)
          socket.once('connect', () => {
            socket.destroy()
            resolve(false)
          })
          socket.once('error', (error) => {
            socket.destroy()
            resolve(error.code === 'ECONNREFUSED')
          })
          socket.once('timeout', () => {
            socket.destroy()
            resolve(false)
          })
        }),
      { timeout: 15000 },
    )
    .toBe(true)
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
  calls.push({
    phase,
    command,
    ok: result.ok,
    ...(result.ok ? {} : { error: result.error }),
    at: new Date().toISOString(),
  })
  assert.ok(result.ok, `${phase}/${command}: ${JSON.stringify(result.error)}`)
  return result.value
}
function answer(question) {
  const match = /^(\d+) \+ (\d+) = \?$/u.exec(question)
  assert.ok(match)
  return Number(match[1]) + Number(match[2])
}
async function login(app, username, password) {
  const local = await call(app, 'issue_local_captcha'),
    cloud = await call(app, 'issue_cloud_captcha')
  // Leave renderer logged out so only explicit production Push/Pull commands run.
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
async function push(app) {
  const result = await call(app, 'push_pending_sync')
  assert.equal(result.acceptedCount, 1)
  assert.equal(result.pendingCount, 0)
  return result
}
function responseFor(installationId) {
  const records = readFileSync(
    process.env.HONSEN_PROCURE_TEST_DIAGNOSTICS_PATH,
    'utf8',
  )
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  return records
    .filter(
      (record) =>
        record.runId === runId &&
        record.serverStatus === 200 &&
        record.session?.installation_id === installationId,
    )
    .flatMap((record) =>
      (record.responsePage?.changes ?? [])
        .filter(
          (change) =>
            change.entityId === orderId &&
            change.payload?.documentType === 'HPA',
        )
        .map((change) => ({
          requestId: record.requestId,
          session: record.session,
          requestedCursor: record.requestedCursor,
          nextCursor: record.responseNextCursor,
          change,
        })),
    )
    .at(-1)
}
function matchWire(profile, wire) {
  const actual = persisted(profile)
  assert.ok(actual.header)
  for (const [key, value] of Object.entries(actual.header))
    assert.deepEqual(value, wire[key], key)
  assert.equal(actual.lines.length, 2)
  for (const line of actual.lines) {
    const expected = wire.lines.find((item) => item.id === line.id)
    assert.ok(expected)
    for (const [key, value] of Object.entries(line))
      assert.deepEqual(value, expected[key], `${line.id}/${key}`)
  }
  return actual
}

try {
  // Initial synthetic scope/code alignment only. No cloud orders/events or either SQLite are written here.
  assert.equal(
    (await pool.query('SELECT COUNT(*)::int AS count FROM sync_entities'))
      .rows[0].count,
    0,
  )
  for (const profile of profiles)
    assert.equal(
      readDb(profile, 'SELECT COUNT(*) AS count FROM local_purchase_orders')[0]
        .count,
      0,
    )
  const country = readDb(
    profiles[0],
    'SELECT business_code FROM local_countries WHERE id = ?',
    ids[1],
  )[0].business_code
  const project = readDb(
    profiles[0],
    'SELECT business_code FROM local_projects WHERE id = ?',
    ids[2],
  )[0].business_code
  await pool.query('UPDATE countries SET business_code = $2 WHERE id = $1', [
    ids[1],
    country,
  ])
  await pool.query('UPDATE projects SET business_code = $2 WHERE id = $1', [
    ids[2],
    project,
  ])
  for (const user of [ids[11], ids[13]]) {
    await pool.query(
      'INSERT INTO user_project_bindings (user_id,project_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [user, ids[2]],
    )
    await pool.query(
      'INSERT INTO user_project_scope_bindings (user_id,project_id,department_id,team_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [user, ids[2], ids[3], ids[4]],
    )
  }
  report.fixtureCodes = { country, project }
  const sourceExe =
    process.env.HONSEN_PROCURE_NATIVE_EXE ??
    join(repo, 'apps/desktop/src-tauri/target/debug/HonsenProcure.exe')
  for (const exe of exePaths) {
    mkdirSync(dirname(exe), { recursive: true })
    copyFileSync(sourceExe, exe)
  }
  report.exeHashes = exePaths.map((exe) =>
    createHash('sha256').update(readFileSync(exe)).digest('hex'),
  )
  assert.equal(report.exeHashes[0], report.exeHashes[1])
  report.installations = profiles.map(
    (profile) =>
      readDb(profile, 'SELECT installation_id FROM local_sync_state')[0]
        .installation_id,
  )
  assert.notEqual(...report.installations)
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
  await ready('http://127.0.0.1:1420')
  phase = 'login'
  let receiver = await launch(0, 9241)
  const issuer = await launch(1, 9242)
  await login(
    receiver,
    'engineer-a',
    process.env.HONSEN_TEST_ENGINEER_A_PASSWORD,
  )
  await login(issuer, 'purchaser', process.env.HONSEN_TEST_PURCHASER_PASSWORD)
  phase = 'draft'
  const zero = { kind: 'fixed_minor', minor: '0' }
  await call(receiver, 'save_requisition_draft', {
    draft: {
      id: orderId,
      displayNo: `G2-${runId}`,
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
      orderDate: '2026-10-19',
      deliveryAddress: 'Synthetic HPA delivery',
      expectedDeliveryDate: null,
      notes: 'HPA independent acceptance only',
      orderDiscount: zero,
      orderFreight: zero,
      taxRateBasisPoints: 0,
      lines: [catalogLine, manualLine].map((id, index) => ({
        id,
        materialId: ids[5],
        materialSnapshot: {
          nameZh: '合成冻结材料',
          nameFr: 'Synthétique figé',
          model: 'HPA',
          specification: 'Synthetic snapshot',
        },
        supplierId: null,
        currency: 'XOF',
        quantity: '1',
        unit: '米',
        unitPriceMinor: '100',
        lineDiscount: zero,
        lineFreight: zero,
        freightIncluded: false,
        sortOrder: index,
      })),
    },
  })
  await push(receiver)
  phase = 'mode'
  await call(receiver, 'set_procurement_mode', {
    orderId,
    mode: 'honsen_self_purchase',
  })
  await push(receiver)
  phase = 'submit'
  await call(receiver, 'submit_requisition_draft', { orderId })
  await push(receiver)
  await call(issuer, 'pull_sync')
  phase = 'confirm'
  await call(issuer, 'confirm_requisition', { orderId })
  await push(issuer)
  await call(receiver, 'pull_sync')
  assert.equal(
    (await call(receiver, 'get_requisition_detail', { orderId }))
      .workflowStatus,
    'confirmed',
  )
  phase = 'issue'
  const approvedSnapshot = (
    await pool.query(
      'SELECT payload_json FROM sync_entities WHERE entity_id=$1',
      [orderId],
    )
  ).rows[0].payload_json
  const issue = await call(issuer, 'issue_honsen_formal_order', { orderId })
  report.issue = issue
  report.pendingBeforePush = readDb(
    profiles[1],
    'SELECT count(*) AS count FROM local_sync_outbox WHERE acknowledged_at IS NULL AND superseded_at IS NULL',
  )[0].count
  assert.equal(report.pendingBeforePush, 1)
  await push(issuer)
  const replayPush = await call(issuer, 'push_pending_sync')
  assert.equal(replayPush.acceptedCount, 0)
  assert.equal(replayPush.pendingCount, 0)
  report.pushReplayPreserved = true
  phase = 'formal-pull'
  report.formalPull = await call(receiver, 'pull_sync')
  report.serverResponse = responseFor(report.installations[0])
  assert.ok(report.serverResponse, 'actual consumer HTTP response not recorded')
  const wire = report.serverResponse.change.payload
  assert.equal(wire.formalDocumentNo, issue.formalDocumentNo)
  assert.equal(wire.formalInstallationId, report.installations[1])
  assert.ok(wire.formalSnapshotJson.length > 100)
  assert.ok(wire.formallyIssuedAt > 0)
  assert.deepEqual(JSON.parse(wire.formalSnapshotJson), approvedSnapshot)
  assert.equal(wire.documentType, 'HPA')
  assert.equal(wire.workflowStatus, 'executing')
  for (const line of wire.lines) {
    assert.equal(line.unitPriceMinor, '100')
    assert.equal(line.lineTotalMinor, '100')
    assert.ok(
      Object.entries(line).every(
        ([key, value]) => !key.startsWith('owner') || value == null,
      ),
    )
  }
  assert.deepEqual(persisted(profiles[1]), persisted(profiles[0]))
  report.fields = matchWire(profiles[0], wire)
  assert.equal(
    (await call(receiver, 'get_requisition_detail', { orderId }))
      .formalDocumentNo,
    issue.formalDocumentNo,
  )
  assert.equal(
    (
      await pool.query(
        'SELECT COUNT(*)::int AS count FROM formal_issue_registry WHERE order_id=$1',
        [orderId],
      )
    ).rows[0].count,
    1,
  )
  phase = 'publish-material'
  // The profile seed is local-only; publish its real catalog dependency before
  // the later quote. Server-side reference validation must remain enabled.
  const material = readDb(
    profiles[1],
    'SELECT * FROM local_materials WHERE id=?',
    ids[5],
  )[0]
  await call(issuer, 'save_material', {
    material: {
      id: material.id,
      sku: material.sku,
      categoryId: material.category_id,
      nameZh: material.name_zh,
      nameFr: material.name_fr,
      aliases: JSON.parse(material.aliases_json),
      brand: material.brand,
      model: material.model,
      specification: material.specification,
      unit: material.unit,
      notes: material.notes,
      isActive: material.is_active === 1,
      version: material.version,
    },
  })
  await push(issuer)
  phase = 'publish-supplier'
  await call(issuer, 'save_supplier', {
    supplier: {
      id: ids[6],
      businessCode: 'TEST-SUPPLIER',
      name: 'Synthetic catalog supplier',
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
      isPreferred: true,
      isBlacklisted: false,
      isActive: true,
      version: 1,
    },
  })
  await push(issuer)
  phase = 'new-current-price'
  await call(issuer, 'add_material_price', {
    price: {
      id: randomUUID(),
      materialId: ids[5],
      supplierId: ids[6],
      currency: 'CNY',
      unitPriceMinor: '9999',
      unit: '米',
      effectiveAt: '2026-10-19',
      sourceNote: 'Synthetic later quote',
      version: 1,
    },
  })
  await push(issuer)
  await call(receiver, 'pull_sync')
  assert.equal(
    readDb(
      profiles[0],
      'SELECT unit_price_minor FROM local_material_prices WHERE material_id=? AND is_active=1 AND deleted_at IS NULL',
      ids[5],
    )[0].unit_price_minor,
    9999,
  )
  assert.deepEqual(matchWire(profiles[0], wire), report.fields)
  const before = durable(profiles[0])
  report.cursorBeforeRestart = readDb(
    profiles[0],
    'SELECT last_pull_cursor FROM local_sync_account_pull_state WHERE account_id=?',
    ids[11],
  )[0].last_pull_cursor
  await receiver.page.screenshot({ path: `${resultPath}-receiver.png` })
  phase = 'restart'
  await call(receiver, 'lock_session')
  await stop(receiver)
  receiver = await launch(0, 9243)
  assert.deepEqual(durable(profiles[0]), before)
  report.restartPreserved = true
  await login(
    receiver,
    'engineer-a',
    process.env.HONSEN_TEST_ENGINEER_A_PASSWORD,
  )
  assert.equal(
    (await call(receiver, 'get_requisition_detail', { orderId }))
      .formalDocumentNo,
    issue.formalDocumentNo,
  )
  assert.deepEqual(matchWire(profiles[0], wire), report.fields)
  phase = 'replay'
  report.replayPull = await call(receiver, 'pull_sync')
  assert.equal(report.replayPull.appliedCount, 0)
  assert.equal(report.replayPull.nextCursor, report.cursorBeforeRestart)
  assert.deepEqual(durable(profiles[0]), before)
  report.replayPreserved = true
  report.fieldsMatched = 12
  report.currentPriceDidNotOverwrite = true
  report.outboxRowsRetained = before.outbox.length
  report.conflictRowsRetained = before.conflicts.length
  assert.deepEqual(consoleErrors, [])
  await call(receiver, 'lock_session')
  await call(issuer, 'lock_session')
  report.result = 'PASS'
  report.completedAt = new Date().toISOString()
} catch (error) {
  report.result = 'FAIL'
  report.failedPhase = phase
  report.error = String(error.stack ?? error)
  throw error
} finally {
  for (const browser of browsers) await browser.close().catch(() => {})
  for (const child of children.reverse()) {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit')
      child.kill()
      await exited
    }
  }
  await pool.end()
  writeFileSync(resultPath, JSON.stringify(report, null, 2))
}

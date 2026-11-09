// G2-only native proof: production IPC/HTTPS, read-only SQLite evidence, no fabricated order events.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
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
  mode: 'g2-formal-pull',
  runId,
  testedSha: '6e0a2a61fdf0967d75dc5edec3eed5e350056ef5',
  orderId,
  profiles,
  exePaths,
  exePids,
  calls,
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
      `SELECT id, owner_quote_source AS ownerQuoteSource, owner_catalog_price_id AS ownerCatalogPriceId,
      owner_manual_reference_reason AS ownerManualReferenceReason, owner_manual_reference_actor_id AS ownerManualReferenceActorId,
      owner_manual_reference_at AS ownerManualReferenceAt, CAST(owner_source_unit_price_minor AS TEXT) AS ownerSourceUnitPriceMinor,
      owner_locked_exchange_rate_decimal AS ownerLockedExchangeRateDecimal,
      CAST(owner_converted_reference_unit_minor AS TEXT) AS ownerConvertedReferenceUnitMinor, owner_markup_json AS ownerMarkupJson,
      CAST(owner_final_unit_price_minor AS TEXT) AS ownerFinalUnitPriceMinor FROM local_purchase_order_items WHERE order_id = ? ORDER BY sort_order, id`,
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
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`,
    WEBVIEW2_USER_DATA_FOLDER: `${profiles[index]}.webview`,
  }
  delete environment.HONSEN_PROCURE_NATIVE_SMOKE
  const child = spawn(exePaths[index], [], {
    cwd: dirname(exePaths[index]),
    windowsHide: true,
    env: environment,
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
  return { child, browser, page }
}
async function stop(app) {
  await app.browser.close()
  if (app.child.exitCode === null && app.child.signalCode === null) {
    const exited = once(app.child, 'exit')
    app.child.kill()
    await exited
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
            change.payload?.documentType === 'OPA',
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
  const sourceExe = join(
    repo,
    'apps/desktop/src-tauri/target/debug/HonsenProcure.exe',
  )
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
      deliveryAddress: 'Synthetic G2 delivery',
      expectedDeliveryDate: null,
      notes: 'G2 independent acceptance only',
      orderDiscount: zero,
      orderFreight: zero,
      taxRateBasisPoints: 0,
      lines: [catalogLine, manualLine].map((id, index) => ({
        id,
        materialId: ids[5],
        materialSnapshot: {
          nameZh: '合成冻结材料',
          nameFr: 'Synthétique figé',
          model: 'G2',
          specification: 'Synthetic snapshot',
        },
        supplierId: null,
        currency: index ? 'XOF' : 'CNY',
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
  phase = 'pricing'
  await call(receiver, 'save_owner_purchase_pricing', {
    input: {
      orderId,
      revisionReason: null,
      lines: [
        {
          orderItemId: catalogLine,
          quoteSource: { kind: 'catalog_price', material_price_id: ids[7] },
          lockedExchangeRateDecimal: '76.5',
          markup: { kind: 'fixed_minor', minor: '20' },
        },
        {
          orderItemId: manualLine,
          quoteSource: {
            kind: 'manual_reference',
            unit_price_minor: '1000',
            reason: 'Synthetic manual reference for independent G2 proof',
          },
          lockedExchangeRateDecimal: '1',
          markup: { kind: 'percent_basis_points', basisPoints: 1000 },
        },
      ],
    },
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
  const issue = await call(issuer, 'issue_owner_formal_order', { orderId })
  report.issue = issue
  await push(issuer)
  phase = 'formal-pull'
  report.formalPull = await call(receiver, 'pull_sync')
  report.serverResponse = responseFor(report.installations[0])
  assert.ok(report.serverResponse, 'actual consumer HTTP response not recorded')
  const wire = report.serverResponse.change.payload
  assert.equal(wire.formalDocumentNo, issue.formalDocumentNo)
  assert.equal(wire.formalInstallationId, report.installations[1])
  assert.ok(wire.formalSnapshotJson.length > 100)
  assert.ok(wire.formallyIssuedAt > 0)
  const catalog = wire.lines.find((line) => line.id === catalogLine),
    manual = wire.lines.find((line) => line.id === manualLine)
  assert.equal(catalog.ownerQuoteSource, 'catalog_price')
  assert.equal(catalog.ownerCatalogPriceId, ids[7])
  assert.deepEqual(
    [
      catalog.ownerManualReferenceReason,
      catalog.ownerManualReferenceActorId,
      catalog.ownerManualReferenceAt,
    ],
    [null, null, null],
  )
  assert.deepEqual(
    [
      catalog.ownerSourceUnitPriceMinor,
      catalog.ownerLockedExchangeRateDecimal,
      catalog.ownerConvertedReferenceUnitMinor,
      catalog.ownerFinalUnitPriceMinor,
    ],
    ['1234', '76.5', '944', '964'],
  )
  assert.equal(manual.ownerQuoteSource, 'manual_reference')
  assert.equal(manual.ownerCatalogPriceId, null)
  assert.equal(
    manual.ownerManualReferenceReason,
    'Synthetic manual reference for independent G2 proof',
  )
  assert.equal(manual.ownerManualReferenceActorId, ids[11])
  assert.ok(manual.ownerManualReferenceAt > 0)
  assert.deepEqual(
    [
      manual.ownerSourceUnitPriceMinor,
      manual.ownerLockedExchangeRateDecimal,
      manual.ownerConvertedReferenceUnitMinor,
      manual.ownerFinalUnitPriceMinor,
    ],
    ['1000', '1', '1000', '1100'],
  )
  assert.deepEqual(JSON.parse(catalog.ownerMarkupJson), {
    kind: 'fixed_minor',
    minor: '20',
  })
  assert.deepEqual(JSON.parse(manual.ownerMarkupJson), {
    kind: 'percent_basis_points',
    basisPoints: 1000,
  })
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
  report.fieldsMatched = 16
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
  writeFileSync(resultPath, JSON.stringify(report, null, 2))
  for (const browser of browsers) await browser.close().catch(() => {})
  for (const child of children.reverse()) {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit')
      child.kill()
      await exited
    }
  }
  await pool.end()
}

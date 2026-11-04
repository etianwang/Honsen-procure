import {
  verifyDeclaredSource,
  fileSha256,
  frontendTree,
} from './offline-provenance.mjs'
// SPO offline native proof: real IPC and read-only SQLite evidence; no HTTPS acceptance.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createConnection } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { chromium, expect } from '@playwright/test'

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
const children = [],
  browsers = [],
  calls = [],
  consoleErrors = [],
  exePids = []
const ids = Array.from(
  { length: 14 },
  (_, n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
)
const ownerPrint = process.env.HONSEN_PROCURE_NATIVE_PRINT_KIND === 'OPA'
const documentPair = process.env.HONSEN_PROCURE_NATIVE_PRINT_PAIR ?? 'zh_fr'
assert.ok(['zh_fr', 'zh_en'].includes(documentPair))
const lineCount = Number(
  process.env.HONSEN_PROCURE_NATIVE_PRINT_LINES ?? (ownerPrint ? '1' : '2'),
)
assert.ok(Number.isInteger(lineCount) && lineCount >= 1 && lineCount <= 100)
const lineIds = Array.from({ length: lineCount }, () => randomUUID())
const expectedTotal = ownerPrint ? '2594' : String(lineCount * 100)
if (ownerPrint)
  assert.equal(lineCount, 1, 'OPA arithmetic fixture has one line')
let orderId = randomUUID()
const exePaths = ['device-a', 'device-b'].map((device) =>
  join(root, `${runId}-${device}`, 'HonsenProcure.exe'),
)
const harnessHead = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repo,
  encoding: 'utf8',
}).trim()
const declaredSourceSha = verifyDeclaredSource(
  process.env.HONSEN_PROCURE_OFFLINE_SOURCE_SHA,
  harnessHead,
)
const nativeExe = process.env.HONSEN_PROCURE_NATIVE_EXE
const profileExe = process.env.HONSEN_PROCURE_OFFLINE_PROFILE_EXE
assert.ok(
  nativeExe && profileExe && process.env.HONSEN_PROCURE_OFFLINE_FRONTEND,
)
const report = {
  mode: 'spo-offline',
  runId,
  testedSha: declaredSourceSha,
  harnessHead,
  sourceExeSha256: fileSha256(nativeExe),
  profileHelperSha256: fileSha256(profileExe),
  frontend: frontendTree(process.env.HONSEN_PROCURE_OFFLINE_FRONTEND),
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
  const local = await call(app, 'issue_local_captcha')
  // Leave renderer logged out so only explicit production Push/Pull commands run.
  await call(app, 'offline_login', {
    request: {
      username,
      password,
      captchaId: local.id,
      captchaAnswer: answer(local.question),
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
  assert.equal(actual.lines.length, lineCount)
  for (const line of actual.lines) {
    const expected = wire.lines.find((item) => item.id === line.id)
    assert.ok(expected)
    for (const [key, value] of Object.entries(line))
      assert.deepEqual(value, expected[key], `${line.id}/${key}`)
  }
  return actual
}

try {
  const sourceExe = process.env.HONSEN_PROCURE_NATIVE_EXE
  assert.ok(sourceExe)
  for (const exe of exePaths) {
    mkdirSync(dirname(exe), { recursive: true })
    copyFileSync(sourceExe, exe)
  }
  report.exeHashes = exePaths.map((exe) =>
    createHash('sha256').update(readFileSync(exe)).digest('hex'),
  )
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
      'preview',
      '--outDir',
      process.env.HONSEN_PROCURE_OFFLINE_FRONTEND,
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
  report.devices = []
  for (let index = 0; index < 2; index++) {
    orderId = randomUUID()
    const receiver = await launch(index, index === 0 ? 9241 : 9242),
      issuer = receiver
    const fixtureMaterialId = ownerPrint ? randomUUID() : ids[5]
    if (ownerPrint) {
      await login(
        receiver,
        'purchaser',
        process.env.HONSEN_TEST_PURCHASER_PASSWORD,
      )
      await call(receiver, 'save_material', {
        material: {
          id: fixtureMaterialId,
          sku: null,
          categoryId: null,
          nameZh: '合成冻结材料',
          nameFr: 'Synthétique figé',
          nameEn: 'Frozen synthetic material',
          aliases: [],
          brand: null,
          model: 'OPA',
          specification: 'Synthetic snapshot',
          unit: '米',
          notes: null,
          isActive: true,
          version: 1,
        },
      })
      await call(receiver, 'lock_session')
    }
    await login(
      receiver,
      'engineer-a',
      process.env.HONSEN_TEST_ENGINEER_A_PASSWORD,
    )
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
        currency: ownerPrint ? 'EUR' : 'XOF',
        primaryCurrency: ownerPrint ? 'EUR' : 'XOF',
        languagePair: documentPair,
        urgency: 'normal',
        urgencyReason: null,
        orderDate: '2026-10-19',
        deliveryAddress: 'Synthetic HPA delivery',
        expectedDeliveryDate: null,
        notes: 'HPA independent acceptance only',
        orderDiscount: ownerPrint
          ? { kind: 'percent_basis_points', basisPoints: 1000 }
          : zero,
        orderFreight: ownerPrint ? { kind: 'fixed_minor', minor: '20' } : zero,
        taxRateBasisPoints: ownerPrint ? 500 : 0,
        lines: lineIds.map((id, index) => ({
          id,
          materialId: fixtureMaterialId,
          materialSnapshot: {
            nameZh: '合成冻结材料',
            nameFr: 'Synthétique figé',
            nameEn: 'Frozen synthetic material',
            model: 'HPA',
            specification: 'Synthetic snapshot',
          },
          supplierId: null,
          currency: ownerPrint ? 'USD' : 'XOF',
          quantity: ownerPrint ? '2.5' : '1',
          unit: '米',
          unitPriceMinor: '100',
          lineDiscount: ownerPrint
            ? { kind: 'fixed_minor', minor: '100' }
            : zero,
          lineFreight: ownerPrint
            ? { kind: 'percent_basis_points', basisPoints: 1000 }
            : zero,
          freightIncluded: false,
          sortOrder: index,
        })),
      },
    })
    if (ownerPrint) {
      await call(receiver, 'save_owner_purchase_pricing', {
        input: {
          orderId,
          revisionReason: null,
          lines: lineIds.map((orderItemId) => ({
            orderItemId,
            quoteSource: {
              kind: 'manual_reference',
              unit_price_minor: '2000',
              reason: 'Synthetic native OPA reference',
            },
            lockedExchangeRateDecimal: '0.5',
            markup: zero,
          })),
        },
      })
    } else {
      phase = 'mode'
      await call(receiver, 'set_procurement_mode', {
        orderId,
        mode: 'honsen_self_purchase',
      })
    }
    phase = 'submit'
    await call(receiver, 'submit_requisition_draft', { orderId })
    await call(receiver, 'lock_session')
    await login(
      receiver,
      'purchaser',
      process.env.HONSEN_TEST_PURCHASER_PASSWORD,
    )
    phase = 'confirm'
    await call(issuer, 'confirm_requisition', { orderId })
    assert.equal(
      (await call(receiver, 'get_requisition_detail', { orderId }))
        .workflowStatus,
      'confirmed',
    )

    let childId = orderId
    let row = () =>
      readDb(
        profiles[index],
        'SELECT * FROM local_purchase_orders WHERE id=?',
        childId,
      )[0]
    let issue
    if (ownerPrint) {
      issue = await call(issuer, 'issue_owner_formal_order', { orderId })
    } else {
      await call(issuer, 'save_supplier', {
        supplier: {
          id: ids[6],
          businessCode: readDb(
            profiles[index],
            'SELECT business_code FROM local_suppliers WHERE id=?',
            ids[6],
          )[0].business_code,
          name: 'Synthetic offline supplier',
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
      const allocated = await call(issuer, 'allocate_supplier_child_orders', {
        parentOrderId: orderId,
        allocations: lineIds.map((parentItemId) => ({
          parentItemId,
          supplierId: ids[6],
          currency: 'XOF',
          childDisplayNo: 'OFFLINE-SPO-' + runId,
          lockedExchangeRateDecimal: '1',
        })),
      })
      assert.equal(allocated.length, 1)
      childId = allocated[0].childOrderId
      row = () =>
        readDb(
          profiles[index],
          'SELECT * FROM local_purchase_orders WHERE id=?',
          childId,
        )[0]
      assert.equal(row().formal_document_no, null)
      const childLines = readDb(
        profiles[index],
        'SELECT id FROM local_purchase_order_items WHERE order_id=?',
        childId,
      )
      await call(issuer, 'save_supplier_child_terms', {
        input: {
          orderId: childId,
          lines: childLines.map((line) => ({
            orderItemId: line.id,
            lineDiscount: zero,
            lineFreight: zero,
            freightIncluded: false,
          })),
          orderDiscount: zero,
          orderFreight: zero,
          taxRateBasisPoints: 0,
        },
      })
      issue = await call(issuer, 'send_supplier_order', {
        orderId: childId,
      })
      assert.equal(issue.documentType, 'SPO')
      assert.equal(row().workflow_status, 'sent')
      assert.equal(row().formal_document_no, issue.formalDocumentNo)
    }
    const printDocument = await call(issuer, 'get_formal_print_document', {
      orderId: childId,
    })
    assert.equal(printDocument.formalDocumentNo, issue.formalDocumentNo)
    assert.equal(printDocument.documentType, ownerPrint ? 'OPA' : 'SPO')
    assert.equal(printDocument.totalMinor, expectedTotal)
    assert.equal(printDocument.lines.length, lineCount)
    if (ownerPrint) {
      assert.equal(printDocument.currency, 'EUR')
      assert.equal(printDocument.subtotalMinor, '2500')
      assert.equal(printDocument.lineDiscountMinor, '50')
      assert.equal(printDocument.orderDiscountMinor, '245')
      assert.equal(printDocument.freightMinor, '265')
      assert.equal(printDocument.taxMinor, '124')
      assert.equal(printDocument.lines[0].unitPriceMinor, '1000')
      assert.equal(printDocument.lines[0].lineTotalMinor, '2695')
    }
    assert.ok(
      printDocument.lines.every(
        (line) =>
          line.nameZh && (documentPair === 'zh_en' ? line.nameEn : line.nameFr),
      ),
    )
    const before = readDb(
      profiles[index],
      'SELECT * FROM local_sync_outbox WHERE acknowledged_at IS NULL AND superseded_at IS NULL ORDER BY rowid',
    )
    assert.ok(before.length > 0)
    const failedPush = await issuer.page.evaluate(async () => {
      try {
        return {
          ok: true,
          result: await window.__TAURI__.core.invoke('push_pending_sync'),
        }
      } catch (error) {
        return { ok: false, error }
      }
    })
    const after = readDb(
      profiles[index],
      'SELECT * FROM local_sync_outbox WHERE acknowledged_at IS NULL AND superseded_at IS NULL ORDER BY rowid',
    )
    assert.equal(after.length, before.length)
    assert.ok(after.every((event) => event.acknowledged_at === null))
    assert.equal(row().formal_document_no, issue.formalDocumentNo)
    await call(issuer, 'lock_session')
    await issuer.page.getByLabel('账号', { exact: true }).fill('purchaser')
    await issuer.page
      .getByLabel('密码', { exact: true })
      .fill(process.env.HONSEN_TEST_PURCHASER_PASSWORD)
    await issuer.page
      .getByRole('button', { name: '获取验证码', exact: true })
      .click()
    const localQuestion = (
      await issuer.page.locator('label[for="captcha"]').innerText()
    )
      .split('：')
      .at(-1)
    await issuer.page.locator('#captcha').fill(String(answer(localQuestion)))
    await issuer.page
      .getByRole('button', { name: '离线登录', exact: true })
      .click()
    if (ownerPrint) {
      await issuer.page
        .getByRole('button', { name: '采购申请单', exact: true })
        .click()
      await issuer.page
        .getByRole('button', { name: '查看详情：G2-' + runId, exact: true })
        .click()
    } else {
      await issuer.page
        .getByRole('button', { name: '采购执行', exact: true })
        .click()
      await issuer.page
        .getByRole('button', { name: 'G2-' + runId, exact: true })
        .click()
    }
    const childUi = issuer.page.getByRole('region', {
      name: ownerPrint ? '请购详情' : '供应商子订单 OFFLINE-SPO-' + runId,
      exact: true,
    })
    await childUi
      .getByRole('button', { name: '正式单据预览 / Aperçu', exact: true })
      .click()
    const preview = childUi.locator('.formal-print-sheet')
    await expect(preview).toContainText(issue.formalDocumentNo)
    await expect(preview).toContainText(
      documentPair === 'zh_en'
        ? printDocument.lines[0].nameEn
        : printDocument.lines[0].nameFr,
    )
    await expect(preview).toContainText(
      ownerPrint ? '25.94 EUR' : `${expectedTotal} XOF`,
    )
    await issuer.page.screenshot({
      path: resultPath + '-device-' + index + '-preview.png',
      fullPage: true,
    })
    report.devices.push({
      index,
      orderId,
      childId,
      issue,
      pending: after.length,
      failedPush,
      printDocument,
      ordinaryNativePreview: true,
      previewScreenshot: resultPath + '-device-' + index + '-preview.png',
      snapshotHash: createHash('sha256')
        .update(row().formal_snapshot_json)
        .digest('hex'),
    })
    if (process.env.HONSEN_PROCURE_NATIVE_PRINT_HOLD === '1') {
      const releaseSignal = join(root, runId + '-print-release.signal')
      const ready = {
        mode: 'native-print-observation-only',
        sourceSha: report.testedSha,
        executableSha256: report.sourceExeSha256,
        frontend: report.frontend,
        processId: issuer.child.pid,
        profile: profiles[index],
        orderId,
        childId,
        formalDocumentNo: issue.formalDocumentNo,
        releaseSignal,
        screenshot: resultPath + '-device-' + index + '-preview.png',
      }
      writeFileSync(
        join(root, runId + '-print-ready.test.json'),
        JSON.stringify(ready, null, 2),
      )
      const deadline = Date.now() + 20 * 60 * 1000
      while (!existsSync(releaseSignal) && Date.now() < deadline)
        await delay(500)
      assert.ok(
        existsSync(releaseSignal),
        'Native print observation hold expired',
      )
      report.printObservationHandedBack = true
      await call(issuer, 'lock_session')
      await stop(issuer)
      break
    }
    await call(issuer, 'lock_session')
    await stop(issuer)
  }
  if (process.env.HONSEN_PROCURE_NATIVE_PRINT_HOLD !== '1')
    assert.notEqual(
      report.devices[0].issue.formalDocumentNo,
      report.devices[1].issue.formalDocumentNo,
    )
  report.result = 'PASS'
  report.scope =
    process.env.HONSEN_PROCURE_NATIVE_PRINT_HOLD === '1'
      ? 'One fresh synthetic native preview fixture; print/PDF outcome must be independently observed, no print PASS inferred'
      : 'Offline native IPC/independent SQLite only; no HTTPS PostgreSQL or cross-client convergence acceptance'
} catch (error) {
  report.result = 'FAIL'
  report.failedPhase = phase
  report.error = String(error.stack ?? error)
  throw error
} finally {
  for (const browser of browsers) await browser.close().catch(() => {})
  for (const child of children.reverse())
    if (child.exitCode === null) child.kill()
  writeFileSync(resultPath, JSON.stringify(report, null, 2))
}

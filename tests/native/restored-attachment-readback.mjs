// Bounded real-EXE readback of HTTP-created, archived/restored synthetic history.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  createWriteStream,
} from 'node:fs'
import { resolve, join, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { chromium, expect } from '@playwright/test'
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const privatePath = resolve(process.env.HONSEN_NATIVE_RESTORE_PRIVATE_CONFIG)
assert.ok(privatePath.startsWith(join(repo, '.cache') + sep))
const config = JSON.parse(readFileSync(privatePath, 'utf8'))
const readbackScope =
  process.env.HONSEN_NATIVE_READBACK_SCOPE ?? 'all-configured'
assert.ok(['baseline', 'all-configured'].includes(readbackScope))
const api = new URL(config.apiBaseUrl)
assert.equal(api.protocol, 'https:')
assert.ok(['localhost', '127.0.0.1'].includes(api.hostname))
assert.equal(config.accounts.length, 2)
assert.notEqual(config.accounts[0].userId, config.accounts[1].userId)
const root = join(repo, '.cache', 'native-restored-readback-' + randomUUID())
assert.ok(!existsSync(root))
mkdirSync(root, { recursive: true })
const exe = resolve(process.env.HONSEN_NATIVE_RESTORE_EXE)
assert.ok(exe.startsWith(join(repo, '.cache') + sep))
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const exeHash = hash(readFileSync(exe))
assert.equal(exeHash, config.exeHash)
const profiles = [0, 1].map((i) => join(root, `client-${i}.test.sqlite`))
const children = [],
  browsers = [],
  calls = [],
  apps = []
const report = {
  scope:
    'HOST_NATIVE restored readback only; fixture creation was HTTP, not native',
  exeHash,
  applicationSource: config.applicationSource,
  clientImplementationSource:
    config.clientImplementationSource ?? config.applicationSource,
  clientBuildObservedHead: config.clientBuildObservedHead ?? null,
  backendSource: config.backendSource ?? null,
  profiles,
  calls,
  clients: [],
  result: 'NOT_RUN',
  readbackScope,
}
let phase = 'launch'
const json = (value) =>
  JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
function rows(profile, sql, ...args) {
  const db = new DatabaseSync(profile, { readOnly: true })
  try {
    const statement = db.prepare(sql)
    statement.setReadBigInts(true)
    return statement.all(...args)
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
      { timeout: 45000 },
    )
    .toBe(true)
}
async function invoke(page, command, args) {
  const result = await page.evaluate(
    async ({ command, args }) => {
      try {
        return {
          ok: true,
          value: await window.__TAURI__.core.invoke(command, args),
        }
      } catch (error) {
        return {
          ok: false,
          code: typeof error === 'object' ? error?.code : 'IPC_REJECTED',
        }
      }
    },
    { command, args },
  )
  calls.push({
    command,
    ok: result.ok,
    ...(!result.ok ? { code: result.code } : {}),
  })
  assert.equal(
    result.ok,
    true,
    `${phase}/${command}: ${result.code ?? 'IPC_REJECTED'}`,
  )
  return result.value
}
async function expectDenied(page, command, args, code) {
  const result = await page.evaluate(
    async ({ command, args }) => {
      try {
        await window.__TAURI__.core.invoke(command, args)
        return { ok: true }
      } catch (error) {
        return { ok: false, code: error?.code }
      }
    },
    { command, args },
  )
  calls.push({
    command,
    ok: result.ok,
    expectedDenial: true,
    code: result.code,
  })
  assert.equal(result.ok, false, `${command} unexpectedly allowed`)
  assert.equal(result.code, code)
}
function answer(question) {
  const m = /^(\d+) \+ (\d+) = \?$/.exec(question)
  assert.ok(m)
  return +m[1] + +m[2]
}
async function login(page, account) {
  const local = await invoke(page, 'issue_local_captcha'),
    cloud = await invoke(page, 'issue_cloud_captcha')
  const session = await invoke(page, 'online_login', {
    request: {
      username: account.username,
      password: account.password,
      localCaptchaId: local.id,
      localCaptchaAnswer: answer(local.question),
      cloudCaptchaId: cloud.id,
      cloudCaptchaAnswer: String(answer(cloud.question)),
    },
  })
  assert.equal(session.user_id, account.userId)
  await invoke(page, 'refresh_authorization')
  return session
}
async function drainPull(page) {
  let prior
  let appliedCount = 0
  for (let round = 1; round <= 128; round++) {
    const pageResult = await invoke(page, 'pull_sync')
    appliedCount += pageResult.appliedCount
    if (pageResult.nextCursor === prior)
      return { ...pageResult, appliedCount, rounds: round }
    prior = pageResult.nextCursor
  }
  throw new Error(
    'isolated Pull did not converge within its bounded fixture limit',
  )
}
async function launch(index) {
  const directory = join(root, `client-${index}`)
  mkdirSync(directory, { recursive: true })
  const target = join(directory, 'HonsenProcure.exe')
  copyFileSync(exe, target)
  assert.equal(hash(readFileSync(target)), exeHash)
  const environment = {
    ...process.env,
    HONSEN_PROCURE_PROFILE: 'test',
    HONSEN_PROCURE_TEST_DB_PATH: profiles[index],
    HONSEN_PROCURE_TEST_TLS_CA_PEM: config.caPemPath,
    HONSEN_SYNC_API_BASE_URL: config.apiBaseUrl,
    HONSEN_NATIVE_WEBVIEW_TEST: 'config',
    HONSEN_NATIVE_WEBVIEW_TEST_PORT: String(9251 + index),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-address=127.0.0.1 --remote-debugging-port=${9251 + index}`,
    WEBVIEW2_USER_DATA_FOLDER: profiles[index] + '.webview',
  }
  for (const key of Object.keys(environment))
    if (
      key.startsWith('COS_') ||
      key.startsWith('POSTGRES_') ||
      key.includes('DATABASE_URL') ||
      key.includes('PASSWORD') ||
      key === 'HONSEN_NATIVE_RESTORE_PRIVATE_CONFIG' ||
      key === 'HONSEN_PROCURE_NATIVE_SMOKE'
    )
      delete environment[key]
  const child = spawn(target, [], {
    cwd: directory,
    env: environment,
    windowsHide: true,
  })
  children.push(child)
  child.stdout.pipe(createWriteStream(join(root, `client-${index}-stdout.log`)))
  child.stderr.pipe(createWriteStream(join(root, `client-${index}-stderr.log`)))
  await ready(`http://127.0.0.1:${9251 + index}/json/version`)
  const browser = await chromium.connectOverCDP(
    `http://127.0.0.1:${9251 + index}`,
  )
  browsers.push(browser)
  await expect
    .poll(() => browser.contexts()[0]?.pages().length ?? 0)
    .toBeGreaterThan(0)
  const page = browser.contexts()[0].pages()[0]
  await expect(page.locator('#account')).toBeVisible({ timeout: 30000 })
  return { page, pid: child.pid }
}
try {
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
  for (let index = 0; index < 2; index++) {
    const app = await launch(index)
    apps.push(app)
    phase = `client-${index}-authenticated-restored-pull`
    await login(app.page, config.accounts[index])
    const pull = await drainPull(app.page)
    const client = {
      index,
      pid: app.pid,
      userId: config.accounts[index].userId,
      pull,
      orders: [],
      attachments: [],
    }
    for (const expected of config.orders) {
      const saved = rows(
        profiles[index],
        'SELECT * FROM local_purchase_orders WHERE id=?',
        expected.id,
      )
      assert.equal(saved.length, 1)
      for (const [key, value] of Object.entries(expected.fields ?? {}))
        assert.equal(String(saved[0][key]), String(value), `restored ${key}`)
      for (const item of expected.items ?? []) {
        const local = rows(
          profiles[index],
          'SELECT * FROM local_purchase_order_items WHERE id=? AND order_id=?',
          item.id,
          expected.id,
        )
        assert.equal(local.length, 1)
        for (const [key, value] of Object.entries(item.fields ?? {})) {
          // The HTTP DTO calls this quantity; SQLite preserves its decimal text explicitly.
          const column = key === 'quantity' ? 'quantity_decimal' : key
          assert.ok(
            Object.hasOwn(local[0], column),
            `unknown fixture column ${column}`,
          )
          assert.equal(
            String(local[0][column]),
            String(value),
            `restored line ${key}`,
          )
        }
      }
      if (expected.paidMinor !== undefined) {
        const order = (
          await invoke(app.page, 'list_confirmed_procurement_orders')
        ).find((o) => o.id === expected.id)
        assert.ok(order)
        assert.equal(order.paymentSummary.paidMinor, expected.paidMinor)
      }
      if (saved[0].workflow_status !== 'draft' && saved[0].formal_document_no) {
        const before = json(saved[0])
        await expectDenied(
          app.page,
          'set_procurement_mode',
          {
            orderId: expected.id,
            mode:
              saved[0].procurement_mode === 'owner_self_purchase'
                ? 'honsen_self_purchase'
                : 'owner_self_purchase',
          },
          'forbidden',
        )
        assert.equal(
          json(
            rows(
              profiles[index],
              'SELECT * FROM local_purchase_orders WHERE id=?',
              expected.id,
            )[0],
          ),
          before,
        )
        assert.equal(
          rows(
            profiles[index],
            'SELECT count(*) AS count FROM local_sync_outbox WHERE entity_id=?',
            expected.id,
          )[0].count,
          0n,
        )
      }
      client.orders.push({
        id: expected.id,
        verifiedFields: Object.keys(expected.fields ?? {}),
        rowHash: hash(Buffer.from(json(saved[0]))),
        paidMinor: expected.paidMinor ?? null,
      })
    }
    client.payments = []
    for (const expected of config.payments ?? []) {
      const saved = rows(
        profiles[index],
        'SELECT * FROM local_procurement_expenditures WHERE id=?',
        expected.id,
      )
      assert.equal(saved.length, 1)
      assert.equal(saved[0].order_id, expected.orderId)
      assert.equal(String(saved[0].amount_minor), expected.amountMinor)
      assert.equal(saved[0].status, expected.status)
      assert.equal(
        saved[0].corrects_expenditure_id,
        expected.correctsExpenditureId ?? null,
      )
      client.payments.push({
        id: expected.id,
        amountMinor: expected.amountMinor,
        status: expected.status,
        correctsExpenditureId: expected.correctsExpenditureId ?? null,
      })
    }
    phase = `client-${index}-restored-object-bytes`
    for (const expected of config.attachments) {
      const metadata = rows(
        profiles[index],
        'SELECT a.*,t.source_attachment_id FROM local_order_attachments a JOIN local_attachment_transfers t ON t.id=a.id WHERE a.id=?',
        expected.id,
      )
      assert.equal(metadata.length, 1)
      assert.equal(
        metadata[0].local_path,
        '',
        'fresh restored client must download bytes rather than reuse a cache',
      )
      assert.equal(metadata[0].checksum, expected.checksum)
      assert.equal(String(metadata[0].byte_length), String(expected.byteLength))
      assert.equal(
        metadata[0].source_attachment_id,
        expected.sourceAttachmentId ?? null,
      )
    }
    for (const expected of config.attachments) {
      const value = await invoke(app.page, 'read_attachment', {
        id: expected.id,
      })
      assert.equal(typeof value, 'string')
      const bytes = Buffer.from(value.split(',')[1], 'base64')
      assert.equal(bytes.length, expected.byteLength)
      assert.equal(hash(bytes), expected.checksum)
      client.attachments.push({
        id: expected.id,
        byteLength: bytes.length,
        sha256: hash(bytes),
        sourceAttachmentId: expected.sourceAttachmentId ?? null,
      })
    }
    assert.equal(
      rows(profiles[index], 'PRAGMA integrity_check')[0].integrity_check,
      'ok',
    )
    client.accountCursor = rows(
      profiles[index],
      'SELECT * FROM local_sync_account_pull_state WHERE account_id=?',
      config.accounts[index].userId,
    )
    report.clients.push(client)
  }
  assert.notEqual(report.clients[0].pid, report.clients[1].pid)
  assert.deepEqual(report.clients[0].attachments, report.clients[1].attachments)
  writeFileSync(
    join(root, 'baseline-readback.test.json'),
    json({ ...report, result: 'PASS' }),
    { mode: 0o600 },
  )
  if (process.env.HONSEN_NATIVE_MARKET_CLOSE === '1') {
    phase = 'native-created-market-conditional-close'
    const orderId = randomUUID(),
      lineId = randomUUID(),
      receiptId = randomUUID()
    await login(apps[0].page, config.accounts[0])
    await login(apps[1].page, config.accounts[1])
    const context = await invoke(apps[0].page, 'get_authorization_context')
    const zero = { kind: 'fixed_minor', minor: '0' }
    const draft = {
      id: orderId,
      displayNo: `NATIVE-CLOSED-${orderId}`,
      countryId: context.countryId,
      projectId: context.projectId,
      site: context.site,
      departmentId: context.departmentId,
      teamId: context.teamId,
      applicantId: config.accounts[0].userId,
      currency: 'XOF',
      primaryCurrency: 'XOF',
      languagePair: 'zh_fr',
      urgency: 'normal',
      urgencyReason: null,
      orderDate: '2026-11-06',
      deliveryAddress: 'Synthetic native closed-order acceptance',
      expectedDeliveryDate: null,
      notes: null,
      orderDiscount: zero,
      orderFreight: zero,
      taxRateBasisPoints: 0,
      manualStampDutyMinor: '7',
      lines: [
        {
          id: lineId,
          materialId: null,
          catalogPriceId: null,
          priceSource: null,
          materialSnapshot: {
            nameZh: '合成关闭测试',
            nameFr: 'Test synthétique',
            model: 'NATIVE-CLOSED',
            specification: 'Synthetic only',
          },
          supplierId: null,
          currency: 'XOF',
          quantity: '2',
          unit: 'pcs',
          unitPriceMinor: '100',
          lineDiscount: zero,
          lineFreight: zero,
          freightIncluded: false,
          sortOrder: 0,
        },
      ],
    }
    const archived = config.orders.map(
      (order) =>
        rows(
          profiles[0],
          'SELECT * FROM local_purchase_orders WHERE id=?',
          order.id,
        )[0],
    )
    await invoke(apps[0].page, 'save_requisition_draft', { draft })
    await invoke(apps[0].page, 'set_procurement_mode', {
      orderId,
      mode: 'honsen_self_purchase',
    })
    await invoke(apps[0].page, 'submit_requisition_draft', { orderId })
    const applicantPush = await invoke(apps[0].page, 'push_pending_sync')
    assert.equal(applicantPush.acceptedCount, 3)
    assert.equal(applicantPush.pendingCount, 0)
    await drainPull(apps[1].page)
    await invoke(apps[1].page, 'confirm_requisition', { orderId })
    await invoke(apps[1].page, 'start_honsen_market_execution', { orderId })
    const approvalPush = await invoke(apps[1].page, 'push_pending_sync')
    assert.equal(approvalPush.acceptedCount, 2)
    assert.equal(approvalPush.pendingCount, 0)
    await drainPull(apps[0].page)
    const stable = rows(
      profiles[1],
      'SELECT material_snapshot_json,quantity_decimal,unit_price_minor,line_total_minor FROM local_purchase_order_items WHERE id=?',
      lineId,
    )[0]
    await invoke(apps[1].page, 'record_receipt', {
      input: {
        id: receiptId,
        orderId,
        receivedAt: '2026-11-06',
        receiverId: config.accounts[1].userId,
        overReceiptReason: null,
        attachmentIds: [],
        items: [{ orderItemId: lineId, quantity: '1', unit: 'pcs' }],
      },
    })
    assert.equal(
      rows(
        profiles[1],
        'SELECT workflow_status FROM local_purchase_orders WHERE id=?',
        orderId,
      )[0].workflow_status,
      'receiving',
    )
    await invoke(apps[1].page, 'close_supplier_order_with_conditions', {
      orderId,
      reason:
        'Synthetic market partial delivery; remaining item intentionally not delivered',
    })
    const closurePush = await invoke(apps[1].page, 'push_pending_sync')
    assert.equal(closurePush.acceptedCount, 3)
    assert.equal(closurePush.pendingCount, 0)
    await drainPull(apps[0].page)
    for (let index = 0; index < 2; index++) {
      const closed = rows(
        profiles[index],
        'SELECT * FROM local_purchase_orders WHERE id=?',
        orderId,
      )[0]
      assert.equal(closed.workflow_status, 'completed_with_conditions')
      assert.equal(closed.total_minor, 207n)
      assert.equal(closed.manual_stamp_duty_minor, 7n)
      assert.equal(
        json(
          rows(
            profiles[index],
            'SELECT material_snapshot_json,quantity_decimal,unit_price_minor,line_total_minor FROM local_purchase_order_items WHERE id=?',
            lineId,
          )[0],
        ),
        json(stable),
      )
      const before = json(closed)
      await invoke(apps[index].page, 'get_requisition_detail', { orderId })
      await expectDenied(
        apps[index].page,
        'save_requisition_draft',
        { draft },
        'invalid_input',
      )
      await expectDenied(
        apps[index].page,
        'set_procurement_mode',
        { orderId, mode: 'owner_self_purchase' },
        'forbidden',
      )
      await expectDenied(
        apps[index].page,
        'close_supplier_order_with_conditions',
        { orderId, reason: 'Synthetic repeat close must be denied' },
        'forbidden',
      )
      assert.equal(
        json(
          rows(
            profiles[index],
            'SELECT * FROM local_purchase_orders WHERE id=?',
            orderId,
          )[0],
        ),
        before,
      )
      assert.equal(
        rows(
          profiles[index],
          'SELECT count(*) AS count FROM local_sync_outbox WHERE entity_id=? AND acknowledged_at IS NULL AND superseded_at IS NULL',
          orderId,
        )[0].count,
        0n,
      )
    }
    assert.equal(
      json(
        config.orders.map(
          (order) =>
            rows(
              profiles[0],
              'SELECT * FROM local_purchase_orders WHERE id=?',
              order.id,
            )[0],
        ),
      ),
      json(archived),
    )
    report.nativeMarketClose = {
      orderId,
      lineId,
      receiptId,
      status: 'completed_with_conditions',
      totalMinor: '207',
      manualStampDutyMinor: '7',
      pushAcknowledged: true,
      twoAccountsReadonly: true,
      originalFormalHistoryUnchanged: true,
    }
    writeFileSync(
      join(root, 'native-market-closed.test.json'),
      json({ ...report, result: 'PASS' }),
      { mode: 0o600 },
    )
  }
  if (config.exerciseConditionalClose && readbackScope === 'all-configured') {
    phase = 'native-conditional-close'
    const target = config.orders.find(
      (order) =>
        rows(
          profiles[0],
          'SELECT document_type FROM local_purchase_orders WHERE id=?',
          order.id,
        )[0]?.document_type === 'SPO',
    )
    assert.ok(target, 'SPO prerequisite must exist')
    const before = rows(
      profiles[0],
      'SELECT * FROM local_purchase_orders WHERE id=?',
      target.id,
    )[0]
    assert.equal(before.workflow_status, 'sent')
    const linesBefore = rows(
      profiles[0],
      'SELECT * FROM local_purchase_order_items WHERE order_id=? ORDER BY id',
      target.id,
    )
    await invoke(apps[0].page, 'close_supplier_order_with_conditions', {
      orderId: target.id,
      reason: 'Synthetic restored-history conditional close acceptance',
    })
    const push = await invoke(apps[0].page, 'push_pending_sync')
    assert.equal(push.acceptedCount, 1)
    assert.equal(push.pendingCount, 0)
    await drainPull(apps[1].page)
    for (let index = 0; index < 2; index++) {
      const closed = rows(
        profiles[index],
        'SELECT * FROM local_purchase_orders WHERE id=?',
        target.id,
      )[0]
      assert.equal(closed.workflow_status, 'completed_with_conditions')
      for (const key of [
        'formal_document_no',
        'formal_snapshot_json',
        'total_minor',
        'subtotal_minor',
        'tax_minor',
        'manual_stamp_duty_minor',
      ])
        assert.equal(closed[key], before[key])
      assert.equal(
        json(
          rows(
            profiles[index],
            'SELECT * FROM local_purchase_order_items WHERE order_id=? ORDER BY id',
            target.id,
          ),
        ),
        json(linesBefore),
      )
      const stable = json(closed)
      await expectDenied(
        apps[index].page,
        'set_procurement_mode',
        { orderId: target.id, mode: 'owner_self_purchase' },
        'forbidden',
      )
      await expectDenied(
        apps[index].page,
        'close_supplier_order_with_conditions',
        {
          orderId: target.id,
          reason: 'Synthetic duplicate close must be denied',
        },
        'forbidden',
      )
      assert.equal(
        json(
          rows(
            profiles[index],
            'SELECT * FROM local_purchase_orders WHERE id=?',
            target.id,
          )[0],
        ),
        stable,
      )
    }
    assert.equal(
      rows(
        profiles[0],
        'SELECT count(*) AS count FROM local_sync_outbox WHERE entity_id=? AND owner_account_id=? AND acknowledged_at IS NOT NULL',
        target.id,
        config.accounts[0].userId,
      )[0].count,
      1n,
    )
    report.conditionalClose = {
      orderId: target.id,
      status: 'completed_with_conditions',
      pushAcknowledged: true,
      immutableSnapshotAndMoneyPreserved: true,
      bothClientsReadonly: true,
    }
  }
  report.roleHistory = []
  for (const account of config.roleAccounts ?? []) {
    phase = `restored-history-role-${account.role}`
    const page = apps[1].page
    await login(page, account)
    const pull = await drainPull(page)
    const parent = report.nativeMarketClose
      ? { id: report.nativeMarketClose.orderId }
      : config.orders.find(
          (order) =>
            !rows(
              profiles[1],
              'SELECT parent_order_id FROM local_purchase_orders WHERE id=?',
              order.id,
            )[0]?.parent_order_id,
        )
    assert.ok(parent)
    if (account.canReadHistory) {
      const detail = await invoke(page, 'get_requisition_detail', {
        orderId: parent.id,
      })
      assert.equal(detail.id, parent.id)
      const attachment = config.attachments[0]
      const value = await invoke(page, 'read_attachment', { id: attachment.id })
      assert.equal(
        hash(Buffer.from(value.split(',')[1], 'base64')),
        attachment.checksum,
      )
    } else {
      await expectDenied(
        page,
        'get_requisition_detail',
        { orderId: parent.id },
        'forbidden',
      )
      await expectDenied(
        page,
        'read_attachment',
        { id: config.attachments[0].id },
        'forbidden',
      )
    }
    await expectDenied(
      page,
      'set_procurement_mode',
      { orderId: parent.id, mode: 'owner_self_purchase' },
      'forbidden',
    )
    report.roleHistory.push({
      userId: account.userId,
      role: account.role,
      canReadHistory: account.canReadHistory,
      pull,
      writeDenied: true,
    })
  }
  report.result = 'PASS'
} catch (error) {
  report.result = 'FAIL'
  report.phase = phase
  report.failure = error.stack ?? String(error)
  throw error
} finally {
  writeFileSync(join(root, 'evidence.test.json'), json(report), { mode: 0o600 })
  for (const browser of browsers) await browser.close().catch(() => {})
  for (const child of children) if (child.exitCode === null) child.kill()
  console.log(
    JSON.stringify({
      result: report.result,
      evidence: join(root, 'evidence.test.json'),
      exeHash,
    }),
  )
}

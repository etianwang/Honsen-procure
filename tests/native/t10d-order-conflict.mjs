// Test-only: real debug EXE/WebView IPC against the disposable HTTPS/PostgreSQL stack.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { chromium, expect } from '@playwright/test'
import { Pool } from 'pg'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const resultPath = process.env.HONSEN_PROCURE_NATIVE_SMOKE_RESULT_PATH
const profileA = process.env.HONSEN_PROCURE_TEST_DB_PATH
const profileB = process.env.HONSEN_PROCURE_NATIVE_AB_SECOND_DB_PATH
const purchaser = '10000000-0000-4000-8000-000000000013'
const scope = {
  countryId: '10000000-0000-4000-8000-000000000001',
  projectId: '10000000-0000-4000-8000-000000000002',
  departmentId: '10000000-0000-4000-8000-000000000003',
  teamId: '10000000-0000-4000-8000-000000000004',
}
assert.equal(process.env.HONSEN_PROCURE_PROFILE, 'test')
for (const path of [profileA, profileB]) {
  assert.ok(path && resolve(path) === path && path.endsWith('.test.sqlite'))
  assert.ok(path.startsWith(join(repo, '.honsen-native-qa') + '\\'))
}
assert.ok(resultPath?.startsWith(join(repo, '.honsen-native-qa') + '\\'))
const databaseUrl = new URL(process.env.HONSEN_PROCURE_TEST_DATABASE_URL)
assert.equal(databaseUrl.hostname, '127.0.0.1')
assert.ok(databaseUrl.pathname.includes('test'))

const pool = new Pool({ connectionString: databaseUrl.toString() })
const children = []
const browsers = []
const consoleErrors = []
const snapshots = []

async function stopChild(child) {
  if (child.exitCode !== null) return
  try {
    execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
    })
  } catch {}
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ])
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
async function launch(profile, port, extraEnv = {}) {
  const env = {
    ...process.env,
    ...extraEnv,
    HONSEN_PROCURE_TEST_DB_PATH: profile,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`,
    WEBVIEW2_USER_DATA_FOLDER: `${profile}.webview`,
  }
  delete env.HONSEN_PROCURE_NATIVE_SMOKE
  const child = spawn(
    join(repo, 'apps/desktop/src-tauri/target/debug/HonsenProcure.exe'),
    [],
    { cwd: repo, windowsHide: true, env },
  )
  children.push(child)
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
  return page
}
async function invoke(page, command, args) {
  return page.evaluate(
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
}
async function call(page, command, args) {
  const result = await invoke(page, command, args)
  assert.equal(result.ok, true, `${command}: ${JSON.stringify(result.error)}`)
  return result.value
}
async function denied(page, command, args, code) {
  const result = await invoke(page, command, args)
  assert.equal(result.ok, false, `${command} unexpectedly allowed`)
  if (code) assert.deepEqual(result.error, { code })
}
function answer(question) {
  const match = /^(\d+) \+ (\d+) = \?$/.exec(question)
  assert.ok(match, `unexpected CAPTCHA ${question}`)
  return Number(match[1]) + Number(match[2])
}
async function loginCore(page, username, password) {
  const local = await call(page, 'issue_local_captcha')
  const cloud = await call(page, 'issue_cloud_captcha')
  const session = await call(page, 'online_login', {
    request: {
      username,
      password,
      localCaptchaId: local.id,
      localCaptchaAnswer: answer(local.question),
      cloudCaptchaId: cloud.id,
      cloudCaptchaAnswer: String(answer(cloud.question)),
    },
  })
  await call(page, 'refresh_authorization')
  return session
}
function draft(id, label, notes) {
  return {
    id,
    displayNo: label,
    ...scope,
    site: 'Native QA',
    applicantId: purchaser,
    currency: 'XOF',
    primaryCurrency: 'XOF',
    languagePair: 'zh_fr',
    urgency: 'normal',
    urgencyReason: null,
    orderDate: '2026-10-20',
    deliveryAddress: 'Native QA',
    expectedDeliveryDate: null,
    notes,
    orderDiscount: { kind: 'fixed_minor', minor: '0' },
    orderFreight: { kind: 'fixed_minor', minor: '0' },
    taxRateBasisPoints: 0,
    lines: [
      {
        id: randomUUID(),
        materialId: null,
        materialSnapshot: {
          nameZh: `Native ${label}`,
          nameFr: null,
          model: 'QA',
          specification: 'Real EXE resolver test',
        },
        supplierId: null,
        currency: 'XOF',
        quantity: '1',
        unit: 'pcs',
        unitPriceMinor: '100',
        lineDiscount: { kind: 'fixed_minor', minor: '0' },
        lineFreight: { kind: 'fixed_minor', minor: '0' },
        freightIncluded: false,
        sortOrder: 0,
      },
    ],
  }
}
function sqliteSnapshot(name, path, orderId, conflictId) {
  const db = new DatabaseSync(path, { readOnly: true })
  const row = db
    .prepare(
      'SELECT workflow_status, version, notes FROM local_purchase_orders WHERE id = ?',
    )
    .get(orderId)
  const outbox = db
    .prepare(
      "SELECT event_id, base_version, acknowledged_at, superseded_at, last_error FROM local_sync_outbox WHERE entity_type = 'purchase_order' AND entity_id = ? ORDER BY created_at, rowid",
    )
    .all(orderId)
  const conflict = conflictId
    ? db
        .prepare(
          'SELECT server_version, server_operation, resolved_at, resolved_by, resolution_reason, length(local_payload_json) AS local_bytes, length(server_payload_json) AS server_bytes FROM local_sync_conflicts WHERE id = ?',
        )
        .get(conflictId)
    : null
  const cursor = db
    .prepare(
      'SELECT account_id, last_pull_cursor FROM local_sync_account_pull_state',
    )
    .all()
  db.close()
  snapshots.push({ name, path, order: row, outbox, conflict, cursor })
  return { row, outbox, conflict, cursor }
}

try {
  // Test-server authorization fixture only; all order, Outbox and conflict mutations go through real IPC.
  await pool.query(
    'INSERT INTO user_project_bindings (user_id, project_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [purchaser, scope.projectId],
  )
  await pool.query(
    'INSERT INTO user_project_scope_bindings (user_id, project_id, department_id, team_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
    [purchaser, scope.projectId, scope.departmentId, scope.teamId],
  )
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
  const a = await launch(profileA, 9241)
  const b = await launch(profileB, 9242)
  const password = process.env.HONSEN_TEST_PURCHASER_PASSWORD
  const resolverFault = process.env.HONSEN_PROCURE_TEST_RESOLVER_FAIL_AT

  async function createConflict(label) {
    const id = randomUUID()
    await loginCore(b, 'purchaser', password)
    await call(b, 'save_requisition_draft', {
      draft: draft(id, label, `${label}-base`),
    })
    assert.equal((await call(b, 'push_pending_sync')).acceptedCount, 1)
    await loginCore(a, 'purchaser', password)
    await call(a, 'pull_sync')
    await loginCore(b, 'purchaser', password)
    await call(b, 'save_requisition_draft', {
      draft: draft(id, label, `${label}-local`),
    })
    await loginCore(a, 'purchaser', password)
    await call(a, 'save_requisition_draft', {
      draft: draft(id, label, `${label}-server`),
    })
    assert.equal((await call(a, 'push_pending_sync')).acceptedCount, 1)
    await loginCore(b, 'purchaser', password)
    const push = await call(b, 'push_pending_sync')
    assert.deepEqual(push, { acceptedCount: 0, pendingCount: 0 })
    const conflicts = await call(b, 'list_sync_conflicts')
    assert.equal(conflicts.length, 1)
    const conflict = conflicts[0]
    assert.equal(conflict.entityId, id)
    assert.equal(conflict.serverVersion, 2)
    assert.equal(conflict.serverOperation, 'upsert')
    assert.ok(conflict.localPayloadJson.includes(`${label}-local`))
    assert.ok(conflict.serverPayloadJson.includes(`${label}-server`))
    const pre = sqliteSnapshot(`${label}-conflict`, profileB, id, conflict.id)
    assert.equal(pre.outbox.length, 2)
    assert.ok(
      pre.outbox.some(
        (row) => row.superseded_at && row.last_error === 'VERSION_CONFLICT',
      ),
    )
    return { id, conflict }
  }

  const use = await createConflict('USE-SERVER')
  await loginCore(a, 'engineer-a', process.env.HONSEN_TEST_ENGINEER_A_PASSWORD)
  await denied(
    a,
    'resolve_purchase_order_conflict',
    {
      input: {
        conflictId: use.conflict.id,
        resolution: 'use_server',
        reason: 'ordinary user must not resolve',
      },
    },
    'forbidden',
  )
  await loginCore(b, 'purchaser', password)
  await call(b, 'resolve_purchase_order_conflict', {
    input: {
      conflictId: use.conflict.id,
      resolution: 'use_server',
      reason: 'QA adopted authoritative draft',
    },
  })
  const adopted = await call(b, 'get_requisition_detail', { orderId: use.id })
  assert.equal(adopted.notes, 'USE-SERVER-server')
  assert.equal((await call(b, 'push_pending_sync')).pendingCount, 0)
  const useSnapshot = sqliteSnapshot(
    'use-server-resolved',
    profileB,
    use.id,
    use.conflict.id,
  )
  assert.equal(
    useSnapshot.conflict.resolution_reason,
    'QA adopted authoritative draft',
  )
  assert.ok(useSnapshot.conflict.resolved_at)
  const useOutboxCount = useSnapshot.outbox.length
  await denied(
    b,
    'resolve_purchase_order_conflict',
    {
      input: {
        conflictId: use.conflict.id,
        resolution: 'use_server',
        reason: 'duplicate',
      },
    },
    'sync_account_boundary',
  )
  assert.equal(
    sqliteSnapshot('use-server-replay', profileB, use.id, use.conflict.id)
      .outbox.length,
    useOutboxCount,
  )

  await pool.query(
    "INSERT INTO user_roles (user_id, role) VALUES ($1, 'super_administrator') ON CONFLICT DO NOTHING",
    [purchaser],
  )
  const replace = await createConflict('REPLACE-DRAFT')
  if (resolverFault) {
    const before = sqliteSnapshot(
      `rollback-${resolverFault}-before`,
      profileB,
      replace.id,
      replace.conflict.id,
    )
    await denied(
      b,
      'resolve_purchase_order_conflict',
      {
        input: {
          conflictId: replace.conflict.id,
          resolution: 'replace_draft',
          reason: `QA injected ${resolverFault}`,
        },
      },
      'local_storage_error',
    )
    const after = sqliteSnapshot(
      `rollback-${resolverFault}-after`,
      profileB,
      replace.id,
      replace.conflict.id,
    )
    assert.deepEqual({ ...after, name: null }, { ...before, name: null })
    for (const child of children.filter((child) =>
      child.spawnfile.endsWith('HonsenProcure.exe'),
    )) await stopChild(child)
    const retry = await launch(profileB, 9243, {
      HONSEN_PROCURE_TEST_RESOLVER_FAIL_AT: '',
    })
    await loginCore(retry, 'purchaser', password)
    await call(retry, 'resolve_purchase_order_conflict', {
      input: {
        conflictId: replace.conflict.id,
        resolution: 'replace_draft',
        reason: `QA retry ${resolverFault}`,
      },
    })
    const retried = sqliteSnapshot(
      `rollback-${resolverFault}-retry`,
      profileB,
      replace.id,
      replace.conflict.id,
    )
    assert.equal(retried.outbox.length, before.outbox.length + 1)
    writeFileSync(resultPath, JSON.stringify({ mode: 't10d-order-conflict', transactionRollback: 'PASS', resolverFault, snapshots, exePids: children.filter((child) => child.spawnfile.endsWith('HonsenProcure.exe')).map((child) => child.pid), ipc: 'real WebView2 -> Tauri commands', completedAt: new Date().toISOString() }, null, 2))
  } else {
    await call(b, 'resolve_purchase_order_conflict', {
    input: {
      conflictId: replace.conflict.id,
      resolution: 'replace_draft',
      reason: 'QA creates a replacement from server base',
    },
  })
  const replacement = sqliteSnapshot(
    'replace-before-push',
    profileB,
    replace.id,
    replace.conflict.id,
  )
  assert.equal(replacement.outbox.length, 3)
  const pending = replacement.outbox.filter(
    (row) => !row.acknowledged_at && !row.superseded_at,
  )
  assert.equal(pending.length, 1)
  assert.equal(pending[0].base_version, 2)
  assert.equal(
    replacement.conflict.resolution_reason,
    'QA creates a replacement from server base',
  )
  const replacementCount = replacement.outbox.length
  await denied(
    b,
    'resolve_purchase_order_conflict',
    {
      input: {
        conflictId: replace.conflict.id,
        resolution: 'replace_draft',
        reason: 'duplicate',
      },
    },
    'sync_account_boundary',
  )
  assert.equal(
    sqliteSnapshot('replace-replay', profileB, replace.id, replace.conflict.id)
      .outbox.length,
    replacementCount,
  )
  assert.equal((await call(b, 'push_pending_sync')).acceptedCount, 1)
  await loginCore(a, 'purchaser', password)
  await call(a, 'pull_sync')
  assert.equal(
    (await call(a, 'get_requisition_detail', { orderId: replace.id })).notes,
    'REPLACE-DRAFT-local',
  )
  const pullAgain = await call(a, 'pull_sync')
  assert.equal(pullAgain.appliedCount, 0)
  sqliteSnapshot('replace-after-convergence-A', profileA, replace.id)
  sqliteSnapshot(
    'replace-after-convergence-B',
    profileB,
    replace.id,
    replace.conflict.id,
  )

  // A revoked online session becomes locally invalid only after a real authenticated request returns 401.
  const authTarget = await createConflict('AUTH-REVOKED')
  await loginCore(a, 'purchaser', password)
  await denied(b, 'pull_sync', undefined, 'reauthentication_required')
  await denied(
    b,
    'resolve_purchase_order_conflict',
    {
      input: {
        conflictId: authTarget.conflict.id,
        resolution: 'use_server',
        reason: 'revoked session must not resolve',
      },
    },
    'reauthentication_required',
  )
  await loginCore(b, 'purchaser', password)
  await denied(
    b,
    'resolve_purchase_order_conflict',
    {
      input: {
        conflictId: authTarget.conflict.id,
        resolution: 'use_server',
        reason: '   ',
      },
    },
    'invalid_input',
  )
  await call(b, 'resolve_purchase_order_conflict', {
    input: {
      conflictId: authTarget.conflict.id,
      resolution: 'use_server',
      reason: 'QA resolves after refreshed administrator session',
    },
  })

  for (const browser of browsers.splice(0)) await browser.close()
  // CDP disconnect alone leaves the debug EXE alive and holding the profile database.
  // Stop only children launched by this driver before exercising a real profile restart.
  for (const child of children.filter((child) =>
    child.spawnfile.endsWith('HonsenProcure.exe'),
  )) {
    await stopChild(child)
  }
  const reopened = await launch(profileB, 9243)
  await loginCore(reopened, 'purchaser', password)
  assert.deepEqual(await call(reopened, 'list_sync_conflicts'), [])
  sqliteSnapshot('restart', profileB, replace.id, replace.conflict.id)
  assert.deepEqual(consoleErrors, [])
  writeFileSync(
    resultPath,
    JSON.stringify(
      {
        mode: 't10d-order-conflict',
        candidate: process.env.HONSEN_PROCURE_CANDIDATE_SHA ?? null,
        exePath: join(
          repo,
          'apps/desktop/src-tauri/target/debug/HonsenProcure.exe',
        ),
        useServer: 'PASS',
        replaceDraft: 'PASS',
        authorization: 'PASS',
        restartAndReplay: 'PASS',
        snapshots,
        exePids: children
          .filter((child) => child.spawnfile.endsWith('HonsenProcure.exe'))
          .map((child) => child.pid),
        ipc: 'real WebView2 -> Tauri commands',
        completedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  )
  }
} catch (error) {
  writeFileSync(
    resultPath,
    JSON.stringify(
      {
        mode: 't10d-order-conflict',
        result: 'FAIL',
        error: String(error),
        snapshots,
        consoleErrors,
      },
      null,
      2,
    ),
  )
  throw error
} finally {
  for (const browser of browsers) await browser.close().catch(() => {})
  for (const child of children.reverse()) await stopChild(child)
  await pool.end()
}
